import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/platform/sign-in",
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
const { default: MeraSignIn } = await import("../src/mera/MeraSignIn");

test("operator sign-in uses existing session login and prevents concurrent duplicate submits", async () => {
  const calls: any[] = [];
  let finish!: (response: Response) => void;
  let signedIn: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url, ...init });
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  }) as any;
  try {
    render(
      <MeraSignIn
        mode="operator"
        onSignedIn={(user) => {
          signedIn = user;
        }}
      />,
    );
    assert.ok(screen.getByRole("heading", { name: "Sign in as an operator" }));
    assert.equal(
      screen.queryByRole("link", { name: /Create an owner account/ }),
      null,
    );
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "qa_operator" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Synthetic-only-password" },
    });
    const form = screen
      .getByRole("button", { name: "Continue to verification" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/login");
    assert.equal(calls[0].credentials, "same-origin");
    assert.equal(calls[0].headers["X-POS-Request"], "1");
    assert.deepEqual(JSON.parse(calls[0].body), {
      username: "qa_operator",
      password: "Synthetic-only-password",
    });
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
    await act(async () => {
      finish(Response.json({ id: "qa", username: "qa_operator" }));
    });
    await waitFor(() => assert.equal(signedIn?.id, "qa"));
    assert.equal(
      (screen.getByLabelText("Password") as HTMLInputElement).value,
      "",
    );
    assert.equal(
      calls.length,
      1,
      "Password login must not submit an MFA code or bypass platform authorization.",
    );
  } finally {
    cleanup();
  }
});

test("sign-in failure retains input, focuses its alert and allows explicit retry", async () => {
  let attempts = 0;
  let signedIn = false;
  globalThis.fetch = (async () => {
    attempts++;
    return attempts === 1
      ? Response.json(
          { error: "Username or password is incorrect." },
          { status: 401 },
        )
      : Response.json({ id: "owner" });
  }) as any;
  try {
    render(
      <MeraSignIn
        onSignedIn={() => {
          signedIn = true;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Synthetic-only-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    assert.equal(
      screen.getByLabelText("Password").getAttribute("type"),
      "text",
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    assert.equal(
      screen.getByLabelText("Password").getAttribute("type"),
      "password",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => assert.equal(document.activeElement, alert));
    assert.match(alert.textContent || "", /incorrect/);
    assert.equal(
      (screen.getByLabelText("Username") as HTMLInputElement).value,
      "owner",
    );
    assert.equal(
      (screen.getByLabelText("Password") as HTMLInputElement).value,
      "Synthetic-only-password",
    );
    assert.equal(attempts, 1);
    assert.equal(signedIn, false);
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    await waitFor(() => assert.equal(signedIn, true));
    assert.equal(attempts, 2);
  } finally {
    cleanup();
  }
});

test("organization entry links real registration and separate operator entry with genuine branding", () => {
  try {
    render(<MeraSignIn />);
    assert.equal(
      screen.getByRole("link", { name: /New business/ }).getAttribute("href"),
      "/mera/signup",
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Mera platform operator sign-in" })
        .getAttribute("href"),
      "/mera/platform/sign-in",
    );
    assert.equal(
      screen.getByRole("img", { name: "Mera" }).getAttribute("src"),
      "/mera/brand/mera-mark-dark.png",
    );
    assert.equal(screen.queryByLabelText(/demo/i), null);
  } finally {
    cleanup();
  }
});
