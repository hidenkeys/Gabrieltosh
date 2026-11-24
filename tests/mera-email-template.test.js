import test from "node:test";
import assert from "node:assert/strict";
import { renderMeraEmail } from "../server/mera/email-template.js";

test("branded email renders matching html and text with the action link", () => {
  const { html, text } = renderMeraEmail({
    preheader: "Preview line",
    eyebrow: "Account verification",
    title: "Confirm your email",
    paragraphs: ["Hi Ada,", "Second paragraph."],
    action: { label: "Verify email", url: "https://mera.test/mera/signup#verify=abc" },
    details: [{ label: "Business", value: "Fictional Grill" }],
    note: "Link expires in one hour.",
  });
  for (const part of ["Confirm your email", "Hi Ada,", "Verify email", "Fictional Grill", "Link expires in one hour.", "MERA", "Preview line"])
    assert.ok(html.includes(part), part);
  assert.equal(html.match(/href="https:\/\/mera\.test\/mera\/signup#verify=abc"/g).length, 2);
  assert.match(text, /^MERA\n\nConfirm your email\n\nHi Ada,/);
  assert.ok(text.includes("Verify email: https://mera.test/mera/signup#verify=abc"));
  assert.ok(text.includes("Business: Fictional Grill"));
});

test("branded email escapes user content and refuses unsafe links", () => {
  const { html } = renderMeraEmail({
    title: "Hello <script>",
    paragraphs: [`Hi "Bob" & <b>friends</b>`],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Hello &lt;script&gt;"));
  assert.ok(html.includes("Hi &quot;Bob&quot; &amp; &lt;b&gt;friends&lt;/b&gt;"));
  assert.throws(() =>
    renderMeraEmail({ title: "x", action: { label: "Go", url: "javascript:alert(1)" } }),
  );
  assert.throws(() => renderMeraEmail({ title: "" }));
});
