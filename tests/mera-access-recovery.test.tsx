import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
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
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { AccessOperationProvider, useAccessOperations } =
  await import("../src/mera/workspace/AccessOperationRecovery");
const { readAccessOperationMarker, saveAccessOperationMarker } =
  await import("../src/mera/workspace/accessOperationJournal");
const actorId = "actor",
  organizationId = "org",
  base = "/organizations/org",
  original = globalThis.fetch;
const config = {
  actorId,
  organizationId,
  canManage: true,
  disabled: false,
  authorityKey: "owner",
};
function Sibling({ kind = "member" }: { kind?: "member" | "role" | "invite" }) {
  const access = useAccessOperations();
  const invoke = () =>
    access
      .execute(
        kind === "member"
          ? base + "/members/member-one"
          : kind === "role"
            ? base + "/roles"
            : base + "/invitations",
        kind === "member" ? "PATCH" : "POST",
        kind === "member"
          ? { active: false }
          : kind === "role"
            ? { name: "PRIVATE ROLE NAME", permissions: ["orders.view"] }
            : {
                email: "PRIVATE_EMAIL@example.invalid",
                role: "cashier",
                branchIds: ["branch"],
              },
        "Updating access",
      )
      .catch(() => {});
  return (
    <button onClick={() => void invoke()}>
      {kind === "member"
        ? "Suspend member"
        : kind === "role"
          ? "Create sibling role"
          : "Create invitation"}
    </button>
  );
}
function Harness({ save, ...overrides }: any) {
  return (
    <AccessOperationProvider {...config} {...overrides} save={save}>
      <Sibling />
      <Sibling kind="role" />
      <Sibling kind="invite" />
    </AccessOperationProvider>
  );
}
const proof = (status = "not_found", extra: any = {}) => {
  const marker = readAccessOperationMarker(actorId, organizationId)!;
  return {
    actorId,
    organizationId,
    requestKey: marker.requestKey,
    operation: marker.operation,
    targetId: marker.targetId,
    status,
    ...extra,
  };
};
const acknowledged = (intent: any = { active: false }) => {
  const marker = readAccessOperationMarker(actorId, organizationId)!;
  return proof("recorded", {
    resultBasis: "recorded_operation_snapshot",
    result: { active: intent.active },
    operationRecord: {
      id: "operation-record",
      actorId,
      operation: marker.operation,
      targetId: marker.targetId,
      requestKey: marker.requestKey,
      intent,
    },
  });
};
test.afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  globalThis.fetch = original;
});
test("uncertain membership marker blocks sibling role/invitation writes across organization and persists no private intent", async () => {
  const writes: any[] = [];
  let reject: any;
  render(
    <Harness
      save={async (...args: any[]) => {
        writes.push(args);
        return await new Promise((_r, r) => (reject = r));
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
  fireEvent.click(screen.getByRole("button", { name: "Create sibling role" }));
  assert.equal(writes.length, 1);
  await act(async () => reject(Error("Unknown")));
  await screen.findByRole("button", { name: "Retry original access change" });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  assert.equal(writes.length, 1);
  const marker = readAccessOperationMarker(actorId, organizationId)!;
  assert.equal(marker.operation, "membership_update");
  assert.equal(marker.targetId, "member-one");
  assert.ok(!JSON.stringify(marker).includes("active"));
  assert.ok(!JSON.stringify(marker).includes("PRIVATE"));
  assert.ok(!JSON.stringify(marker).includes("token"));
});
test("not-found proof never unlocks, explicit retry uses the same frozen key/body and matching recorded proof clears", async () => {
  let recorded = false;
  const writes: any[] = [];
  globalThis.fetch = async () =>
    Response.json(recorded ? acknowledged() : proof());
  render(
    <Harness
      save={async (...args: any[]) => {
        writes.push(args);
        if (writes.length === 1) throw Error("Unknown");
        return {};
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
  await screen.findByRole("button", { name: "Check access change outcome" });
  fireEvent.click(
    screen.getByRole("button", { name: "Check access change outcome" }),
  );
  await screen.findByText(/No completed access change was found/);
  assert.ok(readAccessOperationMarker(actorId, organizationId));
  recorded = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original access change" }),
  );
  await screen.findByText(/original access change was recorded/);
  assert.deepEqual(writes[0][2], writes[1][2]);
  assert.equal(readAccessOperationMarker(actorId, organizationId), null);
});
test("remount retains only reference with no body retry or autosubmit and explicit stop fences absent operation", async () => {
  let writes = 0,
    stopped = false;
  const checks: any[] = [];
  globalThis.fetch = async (input, options) => {
    checks.push([String(input), options]);
    if (String(input).endsWith("/abandon")) stopped = true;
    return Response.json(
      stopped ? proof("abandoned", { resolutionId: "resolution" }) : proof(),
    );
  };
  const save = async () => {
    writes++;
    throw Error("Unknown");
  };
  const view = render(<Harness save={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Create sibling role" }));
  await screen.findByRole("button", { name: "Retry original access change" });
  view.unmount();
  render(<Harness save={save} />);
  assert.ok(
    screen.getByRole("button", { name: "Check access change outcome" }),
  );
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original access change" }),
  );
  assert.equal(writes, 1);
  fireEvent.click(
    screen.getByRole("button", { name: "Stop original access change" }),
  );
  await screen.findByText(/original access change is stopped/);
  assert.equal(readAccessOperationMarker(actorId, organizationId), null);
  assert.equal(writes, 1);
  for (const [, options] of checks)
    assert.equal(options.headers["X-Mera-Actor-Id"], actorId);
});
test("wrong actor organization key target and original normalized intent proofs remain paused", async () => {
  let change: any = {};
  globalThis.fetch = async () =>
    Response.json({ ...acknowledged(), ...change });
  render(
    <Harness
      save={async () => {
        throw Error("Unknown");
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
  await screen.findByRole("button", { name: "Check access change outcome" });
  for (const altered of [
    { actorId: "other" },
    { organizationId: "other" },
    { requestKey: "wrong" },
    { targetId: "other" },
  ]) {
    change = altered;
    fireEvent.click(
      screen.getByRole("button", { name: "Check access change outcome" }),
    );
    await screen.findByText(/access-change outcome could not be verified/);
    assert.ok(readAccessOperationMarker(actorId, organizationId));
  }
  change = {
    operationRecord: {
      ...acknowledged().operationRecord,
      intent: { active: true },
    },
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Check access change outcome" }),
  );
  await screen.findByText(/differs from the original request/);
  assert.ok(readAccessOperationMarker(actorId, organizationId));
});
test("operation lookup containing invitation secrets is rejected and no token is persisted", async () => {
  globalThis.fetch = async () => {
    const m = readAccessOperationMarker(actorId, organizationId)!;
    return Response.json(
      proof("recorded", {
        resultBasis: "recorded_operation_snapshot",
        result: {
          id: "invitation",
          email: "PRIVATE_EMAIL@example.invalid",
          role: "cashier",
          branchIds: ["branch"],
          delivery: "not_sent",
          developmentTokenRecoverable: false,
          developmentToken: "PRIVATE_SECRET",
        },
        operationRecord: {
          id: "operation",
          actorId,
          requestKey: m.requestKey,
          operation: m.operation,
          targetId: null,
          intent: {
            email: "PRIVATE_EMAIL@example.invalid",
            role: "cashier",
            branchIds: ["branch"],
          },
        },
      }),
    );
  };
  render(
    <Harness
      save={async () => ({
        id: "invitation",
        developmentToken: "a".repeat(64),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  await screen.findByText(/access-change outcome could not be verified/);
  const marker = readAccessOperationMarker(actorId, organizationId)!;
  assert.ok(marker);
  assert.ok(!JSON.stringify(marker).includes("PRIVATE"));
  assert.ok(!screen.queryByText("PRIVATE_SECRET"));
});
test("storage failure prevents dispatch and legacy uncorrelated reference remains untouched without retry or stop", async () => {
  let writes = 0;
  render(
    <Harness
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  const proto = Object.getPrototypeOf(window.sessionStorage),
    old = proto.setItem;
  proto.setItem = () => {
    throw Error("Blocked");
  };
  try {
    fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
    await screen.findByText(/No access change was sent/);
    assert.equal(writes, 0);
  } finally {
    proto.setItem = old;
  }
  cleanup();
  const key =
      "mera:access-write:" +
      encodeURIComponent(actorId) +
      ":" +
      encodeURIComponent(organizationId),
    raw = JSON.stringify({
      kind: "membership",
      startedAt: "2026-11-19T10:00:00Z",
    });
  window.sessionStorage.setItem(key, raw);
  render(
    <Harness
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  await screen.findByText(
    /older access-change reference without a request key/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
  assert.equal(writes, 0);
  assert.ok(
    !screen.queryByRole("button", { name: "Stop original access change" }),
  );
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original access change" }),
  );
  assert.equal(window.sessionStorage.getItem(key), raw);
});
test("role result must match its original permission intent before clearing recovery", async () => {
  let valid = false;
  globalThis.fetch = async () => {
    const m = readAccessOperationMarker(actorId, organizationId)!;
    return Response.json(
      proof("recorded", {
        resultBasis: "recorded_operation_snapshot",
        result: {
          id: "created-role",
          name: "PRIVATE ROLE NAME",
          permissions: valid ? ["orders.view"] : ["members.manage"],
          active: true,
          version: 1,
        },
        operationRecord: {
          id: "operation",
          actorId,
          requestKey: m.requestKey,
          operation: "role_create",
          targetId: null,
          intent: { name: "PRIVATE ROLE NAME", permissions: ["orders.view"] },
        },
      }),
    );
  };
  render(<Harness save={async () => ({})} />);
  fireEvent.click(screen.getByRole("button", { name: "Create sibling role" }));
  await screen.findByRole("alert");
  assert.ok(readAccessOperationMarker(actorId, organizationId));
  valid = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Check access change outcome" }),
  );
  await screen.findByText(/original access change was recorded/);
  assert.equal(readAccessOperationMarker(actorId, organizationId), null);
});
test("authority change while an authoritative GET is in flight cannot accept its result or clear the original marker", async () => {
  let resolve: any,
    writes = 0;
  globalThis.fetch = async () => await new Promise((r) => (resolve = r));
  const p = {
    save: async () => {
      writes++;
      return {};
    },
  };
  const view = render(<Harness {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Suspend member" }));
  await waitFor(() => assert.equal(typeof resolve, "function"));
  assert.ok(readAccessOperationMarker(actorId, organizationId));
  view.rerender(<Harness {...p} authorityKey="changed-permissions" />);
  await act(async () => resolve(Response.json(acknowledged())));
  await screen.findByRole("alert");
  assert.ok(readAccessOperationMarker(actorId, organizationId));
  assert.ok(!screen.queryByText(/original access change was recorded/));
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original access change" }),
  );
  assert.equal(writes, 1);
});
