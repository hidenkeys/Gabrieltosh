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

import { brandPresets } from "../src/mera/brandPresets.ts";
import { paletteWarnings } from "../src/mera/branding.ts";
import { brandingSchema } from "../server/mera/branding.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GuestMenuPreview from "../src/mera/workspace/GuestMenuPreview.tsx";
test("all curated palettes have readable text on both surfaces", () => {
  for (const preset of brandPresets) {
    assert.ok(contrast(preset.text, preset.background) >= 4.5, preset.name);
    assert.ok(contrast(preset.text, preset.surface) >= 4.5, preset.name);
    assert.deepEqual(paletteWarnings(preset), []);
  }
});
test("unreadable palette text falls back on each surface", () => {
  const tokens = brandingTokens({ text: "#777777", background: "#777777", surface: "#ffffff" });
  assert.ok(contrast(tokens.text, tokens.background) >= 4.5);
  assert.ok(contrast(tokens.surfaceText, tokens.surface) >= 4.5);
  assert.equal(paletteWarnings({ text: "#ffffff", background: "#ffffff" }).length, 2);
});
test("branding contract accepts full palettes and rejects invalid colours and preset IDs", () => {
  const { id, name, ...colors } = brandPresets[5];
  const value = { ...colors, description: "Our kitchen", palettePreset: id };
  assert.equal(brandingSchema.parse(value).palettePreset, id);
  for (const field of ["background", "surface", "text"]) assert.equal(brandingSchema.safeParse({ ...value, [field]: "red" }).success, false);
  assert.equal(brandingSchema.safeParse({ ...value, palettePreset: "unknown" }).success, false);
});
test("guest preview shows tenant address, menu items and live palette variables", () => {
  const markup = renderToStaticMarkup(<GuestMenuPreview organization={{ name: "Juniper", slug: "juniper" }} rootDomain="example.com" branding={brandPresets[5]} items={[{ name: "Soup", price: 2500 }]} />);
  assert.match(markup, /juniper.example.com/);
  assert.match(markup, /Guest menu preview/);
  assert.match(markup, /--mc-paper:#151c26/);
  assert.match(markup, /Soup/);
});

test("owner preview loads unpublished brand uploads through authorized asset routes", () => {
  const markup = renderToStaticMarkup(<GuestMenuPreview organization={{ id: "org" }} branding={{ logo: "/api/mera/v1/public/assets/logo", coverImage: "/api/mera/v1/public/assets/cover" }} />);
  assert.match(markup, /src="\/api\/mera\/v1\/organizations\/org\/assets\/logo"/);
  assert.match(markup, /src="\/api\/mera\/v1\/organizations\/org\/assets\/cover"/);
});
