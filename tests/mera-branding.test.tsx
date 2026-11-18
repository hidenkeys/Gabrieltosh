import test from "node:test";
import assert from "node:assert/strict";
import {
  brandingTokens,
  brandingStyle,
  contrast,
} from "../src/mera/branding.ts";
test("brand text remains readable for very light and dark administrator colors", () => {
  for (const primary of [
    "#ffffff",
    "#000000",
    "#ffff00",
    "#1558c9",
    "#777777",
  ]) {
    const tokens = brandingTokens({ primary, accent: primary });
    assert(contrast(tokens.primary, tokens.primaryForeground) >= 4.5);
    assert(contrast(tokens.accent, tokens.accentForeground) >= 4.5);
    assert(contrast(tokens.link, tokens.cream) >= 4.5);
  }
});
test("branding rejects CSS injection and unapproved font families", () => {
  const tokens = brandingTokens({
    primary: "url(https://example.invalid)",
    accent: "red;display:none",
    font: "Unapproved font",
  });
  assert.equal(tokens.primary, "#1558c9");
  assert.equal(tokens.accent, "#83ddf7");
  assert.match(tokens.font, /system-ui/);
  assert.equal(
    brandingStyle({ font: "serif" }).fontFamily,
    'Georgia, "Times New Roman", serif',
  );
});
