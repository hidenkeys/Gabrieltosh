import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/signup",
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
const { default: Signup } = await import("../src/mera/Signup");
const { SIGNUP_RECOVERY_KEY, readSignupRecovery } =
  await import("../src/mera/signupRecovery");
const ack = {
  status: "verification_required",
  simulation: true,
  emailSent: false,
  verificationToken: "a".repeat(64),
  expiresInSeconds: 3600,
};
async function fill() {
  await screen.findByLabelText("Your name");
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Private Name" },
  });
  fireEvent.change(screen.getByLabelText("Demonstration email"), {
    target: { value: "private@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "private-password-12345" },
  });
  return screen
    .getByRole("button", { name: "Create demonstration account" })
    .closest("form")!;
}
const reset = () => {
  cleanup();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/mera/signup");
};
test("single-flight registration persists no secrets and valid acknowledgments alone complete verification", async () => {
  let finish!: (v: Response) => void;
  let registerWrites = 0,
    verifyWrites = 0;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const p = String(input);
    if (p.endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    if (p.endsWith("register")) {
      registerWrites++;
      return new Promise<Response>((r) => (finish = r));
    }
    verifyWrites++;
    return Response.json({
      verifiedInDemo: true,
      realEmailVerified: false,
      simulation: true,
    });
  }) as any;
  try {
    render(<Signup />);
    const form = await fill();
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(registerWrites, 1);
    const raw = window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY)!;
    assert.deepEqual(JSON.parse(raw), {
      version: 1,
      phase: "registration",
      status: "pending",
    });
    for (const secret of [
      "Private Name",
      "private@example.test",
      "private-password",
      "verificationToken",
    ])
      assert.ok(!raw.includes(secret));
    await act(async () => finish(Response.json(ack)));
    await screen.findByRole("heading", { name: "Try the verification step" });
    assert.equal(verifyWrites, 0);
    assert.ok(
      !window.sessionStorage
        .getItem(SIGNUP_RECOVERY_KEY)!
        .includes(ack.verificationToken),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Verify in this demonstration" }),
    );
    await screen.findByRole("heading", {
      name: "Your demonstration account is ready",
    });
    assert.equal(verifyWrites, 1);
    assert.equal(readSignupRecovery().state, "clear");
  } finally {
    reset();
  }
});
test("unknown registration freezes edits and survives remount without automatically resending", async () => {
  let posts = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    posts++;
    throw Error("Network lost after possible commit");
  }) as any;
  try {
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(screen.queryByLabelText("Password"), null);
    assert.equal(posts, 1);
    cleanup();
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    await waitFor(() =>
      assert.equal(
        screen.queryByText("Checking registration readiness…"),
        null,
      ),
    );
    assert.equal(
      screen.queryByRole("button", { name: "Create demonstration account" }),
      null,
    );
    assert.equal(posts, 1);
    assert.equal(readSignupRecovery().state, "recorded");
  } finally {
    reset();
  }
});
test("malformed successful registration cannot advance to verification and malformed verify cannot claim ready", async () => {
  let response: any = {};
  globalThis.fetch = (async (input: any) =>
    String(input).endsWith("capabilities")
      ? Response.json({ registration: "simulator" })
      : Response.json(response)) as any;
  try {
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(
      screen.queryByRole("button", { name: "Verify in this demonstration" }),
      null,
    );
    reset();
    response = ack;
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByRole("heading", { name: "Try the verification step" });
    response = { verifiedInDemo: true, realEmailVerified: false };
    fireEvent.click(
      screen.getByRole("button", { name: "Verify in this demonstration" }),
    );
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(
      screen.queryByRole("heading", {
        name: "Your demonstration account is ready",
      }),
      null,
    );
    assert.equal(readSignupRecovery().state, "recorded");
  } finally {
    reset();
  }
});
test("storage readback failure blocks dispatch; corrupt recovery remains paused", async () => {
  let posts = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    posts++;
    return Response.json(ack);
  }) as any;
  const proto = Object.getPrototypeOf(window.sessionStorage),
    original = proto.setItem;
  try {
    render(<Signup />);
    const form = await fill();
    proto.setItem = () => {
      throw Error("Storage blocked");
    };
    fireEvent.submit(form);
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(posts, 0);
    proto.setItem = original;
    reset();
    window.sessionStorage.setItem(SIGNUP_RECOVERY_KEY, '{"unknown":true}');
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(posts, 0);
    assert.equal(readSignupRecovery().state, "corrupt");
  } finally {
    proto.setItem = original;
    reset();
  }
});
test("late registration acknowledgment after unmount cannot display success or allow a fresh registration after reload", async () => {
  let finish!: (v: Response) => void;
  let posts = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    posts++;
    return new Promise<Response>((r) => (finish = r));
  }) as any;
  try {
    render(<Signup />);
    fireEvent.submit(await fill());
    cleanup();
    await act(async () => finish(Response.json(ack)));
    assert.equal(
      screen.queryByRole("heading", { name: "Try the verification step" }),
      null,
    );
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(posts, 1);
    assert.equal(screen.queryByLabelText("Password"), null);
  } finally {
    reset();
  }
});
test("rolled-back registration rejection permits correction but rejected verification retains created-account marker", async () => {
  let mode = "reject-registration",
    posts = 0;
  globalThis.fetch = (async (input: any) => {
    const p = String(input);
    if (p.endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    posts++;
    if (mode === "reject-registration")
      return Response.json(
        { error: "Invalid demonstration details" },
        { status: 400 },
      );
    if (p.endsWith("register")) return Response.json(ack);
    return Response.json(
      { error: "Token expired or already consumed" },
      { status: 401 },
    );
  }) as any;
  try {
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByText("Invalid demonstration details");
    assert.equal(readSignupRecovery().state, "clear");
    assert.equal(
      (screen.getByLabelText("Password") as HTMLInputElement).value,
      "",
    );
    mode = "verify-rejection";
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "private-password-12345" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create demonstration account" })
        .closest("form")!,
    );
    await screen.findByRole("heading", { name: "Try the verification step" });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify in this demonstration" }),
    );
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(readSignupRecovery().state, "recorded");
    assert.equal(posts, 3);
  } finally {
    reset();
  }
});
test("skip link moves focus to main heading without submitting or resetting recovery", async () => {
  globalThis.fetch = (async () =>
    Response.json({ registration: "blocked" })) as any;
  try {
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Registration is awaiting verification setup",
    });
    fireEvent.click(screen.getByRole("link", { name: "Skip to owner setup" }));
    assert.equal(
      document.activeElement,
      screen.getByRole("heading", { name: "Set up your organization." }),
    );
    assert.equal(window.location.hash, "#mera-signup-main");
  } finally {
    reset();
  }
});
test("server failure stays paused and unknown verification survives reload without persisting a token", async () => {
  let mode = "server-failure",
    posts = 0;
  globalThis.fetch = (async (input: any) => {
    const p = String(input);
    if (p.endsWith("capabilities"))
      return Response.json({ registration: "simulator" });
    posts++;
    if (mode === "server-failure")
      return Response.json(
        { error: "Server failed after uncertain transaction" },
        { status: 500 },
      );
    if (p.endsWith("register")) return Response.json(ack);
    throw Error("Verification acknowledgment lost");
  }) as any;
  try {
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(readSignupRecovery().state, "recorded");
    reset();
    mode = "unknown-verification";
    render(<Signup />);
    fireEvent.submit(await fill());
    await screen.findByRole("heading", { name: "Try the verification step" });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify in this demonstration" }),
    );
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    const raw = window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY)!;
    assert.deepEqual(JSON.parse(raw), {
      version: 1,
      phase: "verification",
      status: "pending",
    });
    assert.ok(!raw.includes(ack.verificationToken));
    cleanup();
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Signup status needs checking",
    });
    assert.equal(
      screen.queryByRole("button", { name: "Verify in this demonstration" }),
      null,
    );
    assert.equal(posts, 3);
  } finally {
    reset();
  }
});
test("recovery helper refuses oversized/corrupt markers and runtime secret fields before storage", async () => {
  const { saveSignupRecovery } = await import("../src/mera/signupRecovery");
  try {
    for (const marker of [
      {
        version: 1,
        phase: "registration",
        status: "pending",
        email: "private@example.test",
      },
      { version: 1, phase: "verification", status: "verification_ready" },
      { version: 2, phase: "registration", status: "pending" },
      {
        version: 1,
        phase: "registration",
        status: "pending",
        password: "private-password",
      },
    ]) {
      assert.equal(saveSignupRecovery(marker as any, null), false);
      assert.equal(window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY), null);
    }
    window.sessionStorage.setItem(SIGNUP_RECOVERY_KEY, " ".repeat(513));
    assert.equal(readSignupRecovery().state, "corrupt");
    assert.equal(
      saveSignupRecovery(
        { version: 1, phase: "registration", status: "pending" },
        null,
      ),
      false,
    );
  } finally {
    reset();
  }
});
