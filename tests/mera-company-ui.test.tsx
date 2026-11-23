import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/travel",
});
for (const key of ["window", "document", "HTMLElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "requestAnimationFrame", {
  value: (fn: Function) => fn(),
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: TravelInterest } =
  await import("../src/mera/company/TravelInterest");
const { default: ProjectBrief } =
  await import("../src/mera/company/ProjectBrief");
const journal = await import("../src/mera/company/submissionRecovery");
const receipt = {
  kind: "travel_interest",
  reference: "TRV-123456ABCDEF",
  status: "received",
  externalDelivery: false,
  emailDelivery: "not_sent",
  receivedAt: "2026-11-20T12:00:00.000Z",
};
const body = {
  requestKey: "10000000-0000-4000-8000-000000000099",
  name: "QA Contact",
  email: "qa@example.invalid",
  privacyAcknowledged: true,
  company: "QA Company",
  role: "Owner",
  interest: "",
};
function reset() {
  cleanup();
  window.sessionStorage.clear();
}
function fill() {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "QA Contact" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "qa@example.invalid" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}
test("Travel validates contact and consent before sending, confirms real receipt and removes private recovery details", async () => {
  reset();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify(receipt), { status: 201 });
  };
  render(<TravelInterest />);
  fireEvent.click(screen.getByRole("button", { name: "Register interest" }));
  assert.equal(calls, 0);
  assert.equal(document.activeElement, screen.getByLabelText("Your name"));
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Register interest" }));
  await screen.findByText(receipt.reference);
  assert.equal(calls, 1);
  const saved = window.sessionStorage.getItem(
    journal.companyJournalKey("travel_interest"),
  )!;
  assert.ok(!saved.includes("qa@example.invalid"));
  assert.ok(!saved.includes("QA Contact"));
  assert.match(
    screen.getByText(/No confirmation email/).textContent!,
    /No confirmation email/,
  );
  cleanup();
  render(<TravelInterest />);
  assert.ok(screen.getByText(receipt.reference));
  assert.equal(calls, 1);
});
test("unknown response survives reload, never auto posts and explicitly retries identical request", async () => {
  reset();
  const sent: string[] = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(String(options?.body));
    throw Error("offline");
  };
  render(<TravelInterest />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Register interest" }));
  await screen.findByText(/We could not confirm whether/);
  cleanup();
  render(<TravelInterest />);
  assert.equal(sent.length, 1);
  globalThis.fetch = async (_url, options) => {
    sent.push(String(options?.body));
    return new Response(JSON.stringify(receipt), { status: 200 });
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original submission" }),
  );
  await screen.findByText(receipt.reference);
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
});
test("rejected first attempt is editable but rejection after uncertainty stays locked", async () => {
  reset();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "Review email",
        issues: [{ path: ["email"], message: "Check email" }],
      }),
      { status: 400 },
    );
  render(<TravelInterest />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Register interest" }));
  await screen.findByText("Check email");
  assert.equal(journal.readCompanyJournal("travel_interest"), null);
  cleanup();
  journal.saveCompanyPending("travel_interest", body);
  render(<TravelInterest />);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original submission" }),
  );
  await screen.findByText(/We could not confirm whether/);
  assert.equal(journal.readCompanyJournal("travel_interest")?.state, "pending");
  assert.equal(screen.queryByLabelText("Your name"), null);
});
test("wrong kind or invented email-delivery acknowledgement is not success", async () => {
  reset();
  journal.saveCompanyPending("travel_interest", body);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ...receipt, emailDelivery: "sent" }), {
      status: 201,
    });
  render(<TravelInterest />);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original submission" }),
  );
  await screen.findByText(/We could not confirm whether/);
  assert.equal(journal.readCompanyJournal("travel_interest")?.state, "pending");
  assert.equal(screen.queryByText("Your interest is registered."), null);
  assert.equal(journal.validCompanyReceipt("consultancy", receipt), false);
});
test("corrupt saved journal blocks new submissions without making requests", () => {
  reset();
  window.sessionStorage.setItem(
    journal.companyJournalKey("travel_interest"),
    "{broken",
  );
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error();
  };
  render(<TravelInterest />);
  assert.ok(screen.getByText("Check this tab before continuing"));
  assert.equal(
    screen.queryByRole("button", { name: "Register interest" }),
    null,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check saved submission" }),
  );
  assert.equal(calls, 0);
});
test("consultancy steps retain entered details and require complete project before review", async () => {
  reset();
  render(<ProjectBrief />);
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "QA Contact" },
  });
  fireEvent.change(screen.getByLabelText("Company or organization"), {
    target: { value: "QA Company" },
  });
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "qa@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  assert.ok(screen.getByLabelText("What problem are you trying to solve?"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  assert.equal(
    screen.queryByText("Check the details, then add any useful context."),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  assert.equal(
    (screen.getByLabelText("Your name") as HTMLInputElement).value,
    "QA Contact",
  );
});
test("journal refuses changed payload and combined documents beyond limit", () => {
  reset();
  const pending = journal.saveCompanyPending("travel_interest", body);
  assert.equal(
    journal.sameCompanyPending("travel_interest", {
      ...pending,
      body: { ...pending.body, name: "Changed" },
    }),
    false,
  );
  assert.throws(() => journal.saveCompanyPending("travel_interest", body));
  const base = {
    ...body,
    problem: "A valid problem description",
    intendedUsers: "Operations team",
    capabilities: "A system that tracks requests",
    projectType: "new_build",
    budgetRange: "not_sure",
    timeline: "This year",
    documents: [
      { filename: "a.txt", mime: "text/plain", data: "YWFh".repeat(100000) },
      { filename: "b.txt", mime: "text/plain", data: "YWFh".repeat(100000) },
    ],
  };
  delete (base as any).role;
  delete (base as any).interest;
  assert.equal(journal.validCompanyBody("consultancy", base), null);
});
test("storage quota failure prevents network dispatch", () => {
  reset();
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function () {
    throw Error("quota");
  };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error();
  };
  try {
    render(<TravelInterest />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register interest" }));
    assert.ok(screen.getByText("Check this tab before continuing"));
    assert.equal(calls, 0);
  } finally {
    dom.window.Storage.prototype.setItem = original;
  }
});
test("consultancy completes review and submits selected scope once while waiting", async () => {
  reset();
  let resolve: (response: Response) => void = () => {};
  let calls = 0;
  let captured: any;
  globalThis.fetch = async (_url, options) => {
    calls++;
    captured = JSON.parse(String(options?.body));
    return await new Promise<Response>((done) => {
      resolve = done;
    });
  };
  render(<ProjectBrief />);
  for (const [label, value] of [
    ["Your name", "QA Contact"],
    ["Company or organization", "QA Company"],
    ["Work email", "qa@example.invalid"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const [label, value] of [
    [
      "What problem are you trying to solve?",
      "We need one place to manage customer requests.",
    ],
    ["Who will use it?", "Our service and operations teams"],
    [
      "What should the system be able to do?",
      "Receive requests, assign owners and track progress.",
    ],
    ["Your preferred timeline", "Within six months"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Send project brief" }));
  assert.equal(calls, 1);
  assert.equal(captured.budgetRange, "not_sure");
  assert.equal(captured.projectType, "new_build");
  assert.deepEqual(captured.documents, []);
  const waiting = screen.getByRole("button", {
    name: "Waiting for confirmation…",
  });
  assert.equal((waiting as HTMLButtonElement).disabled, true);
  fireEvent.click(waiting);
  assert.equal(calls, 1);
  resolve(
    new Response(
      JSON.stringify({
        ...receipt,
        kind: "consultancy",
        reference: "ENQ-123456ABCDEF",
      }),
      { status: 201 },
    ),
  );
  await screen.findByText("ENQ-123456ABCDEF");
  assert.ok(screen.getByText(/not project acceptance or a quotation/));
});

test("Travel keeps optional context disclosed without discarding entered details", () => {
  render(<TravelInterest />);
  const field = screen.getByLabelText(/Company or organization/);
  const disclosure = field.closest("details")!;
  assert(disclosure, "optional company context belongs to a disclosure");
  assert.equal(disclosure.open, false);
  fireEvent.click(screen.getByText("Add more about your interest (optional)"));
  fireEvent.change(field, { target: { value: "Synthetic travel team" } });
  disclosure.open = false;
  assert.equal(
    (screen.getByLabelText(/Company or organization/) as HTMLInputElement)
      .value,
    "Synthetic travel team",
  );
  assert.equal(screen.getByLabelText("Email address").closest("details"), null);
  cleanup();
});
