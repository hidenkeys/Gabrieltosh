import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://mera.test/mera/invite",
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
const { render, screen, cleanup, fireEvent } =
  await import("@testing-library/react");
const { default: InviteAccept } = await import("../src/mera/InviteAccept");
const { safeMeraNext } = await import("../src/mera/MeraSignIn");
const token = "a".repeat(64);
const preview = {
  organizationName: "Test Kitchen",
  role: "Cashier",
  email: "staff@example.test",
  expiresAt: "2027-01-01T00:00:00Z",
  accountExists: false,
  signedInAsInvitee: false,
};
for (const state of ["new", "existing", "signed-in", "wrong-user"] as const)
  test(`invitation page renders ${state} state and removes URL secret`, async () => {
    const original = globalThis.fetch;
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/mera/invite#token=" + token);
    globalThis.fetch = async (input, options) => {
      if (String(input) === "/api/me")
        return Response.json(
          {},
          {
            status: state === "signed-in" || state === "wrong-user" ? 200 : 401,
          },
        );
      assert.equal(String(input), "/api/mera/v1/invitations/preview");
      assert.equal(JSON.parse(String(options?.body)).token, token);
      return Response.json({
        ...preview,
        accountExists: state !== "new",
        signedInAsInvitee: state === "signed-in",
      });
    };
    try {
      render(<InviteAccept />);
      await screen.findByRole("heading", {
        name: "Join Test Kitchen as Cashier",
      });
      assert.equal(window.location.hash, "");
      assert.equal(
        window.sessionStorage.getItem("mera-invitation-token"),
        token,
      );
      if (state === "new") {
        assert(screen.getByRole("button", { name: "Create account and join" }));
        assert(screen.getByLabelText("Your name"));
      }
      if (state === "existing")
        assert.equal(
          screen
            .getByRole("link", { name: "Sign in to accept invitation" })
            .getAttribute("href"),
          "/mera/sign-in?next=/mera/invite",
        );
      if (state === "signed-in")
        assert(screen.getByRole("button", { name: "Accept invitation" }));
      if (state === "wrong-user")
        assert(
          screen.getByText(/Sign out and sign in with staff@example.test/),
        );
    } finally {
      cleanup();
      globalThis.fetch = original;
    }
  });
test("invalid invitation provides recovery link", async () => {
  const original = globalThis.fetch;
  window.history.replaceState(null, "", "/mera/invite");
  window.sessionStorage.clear();
  try {
    render(<InviteAccept />);
    assert(await screen.findByRole("alert"));
    assert.equal(
      screen.getByRole("link", { name: "Return to Mera" }).getAttribute("href"),
      "/mera",
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("account form prevents password mismatch and sends account details only on matching confirmation", async () => {
  const original = globalThis.fetch;
  window.history.replaceState(null, "", "/mera/invite#token=" + token);
  let accepts = 0;
  globalThis.fetch = async (input, options) => {
    if (String(input) === "/api/me") return Response.json({}, { status: 401 });
    if (String(input).endsWith("/preview")) return Response.json(preview);
    accepts++;
    assert.deepEqual(JSON.parse(String(options?.body)), {
      token,
      name: "Staff",
      password: "long-password-123",
    });
    return Response.json({ error: "Please retry later." }, { status: 503 });
  };
  try {
    render(<InviteAccept />);
    await screen.findByLabelText("Your name");
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Staff" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "long-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account and join" }),
    );
    assert.equal(
      (await screen.findByRole("alert")).textContent,
      "Passwords must match.",
    );
    assert.equal(accepts, 0);
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "long-password-123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account and join" }),
    );
    await screen.findByText("Please retry later.");
    assert.equal(accepts, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("sign-in redirect is restricted to local Mera paths", () => {
  assert.equal(safeMeraNext("?next=/mera/invite"), "/mera/invite");
  for (const next of [
    "https://evil.test/mera/invite",
    "//evil.test/mera/",
    "/mera/../../api/logout",
    "/mera/\\evil.test",
    "/other",
  ])
    assert.equal(
      safeMeraNext("?next=" + encodeURIComponent(next)),
      "/mera/workspace",
    );
});
