import type { CSSProperties } from "react";
const hex = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
export function luminance(color: string) {
  const parts = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function brandingTokens(
  branding: {
    primary?: unknown;
    accent?: unknown;
    font?: unknown;
    background?: unknown;
    surface?: unknown;
    text?: unknown;
  } = {},
) {
  const primary = hex(branding.primary, "#1558c9"),
    accent = hex(branding.accent, "#83ddf7"),
    cream = "#fffdf8",
    dark = "#29262b";
  const foreground = (color: string) =>
    contrast(color, "#000000") >= contrast(color, "#ffffff")
      ? "#000000"
      : "#ffffff";
  const font =
    branding.font === "serif"
      ? 'Georgia, "Times New Roman", serif'
      : branding.font === "sans"
        ? "Arial, Helvetica, sans-serif"
        : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const background = hex(branding.background, "#f7f6f0"),
    surface = hex(branding.surface, "#fcfbf6");
  const requested = hex(branding.text, "#16211c");
  const readable = (bg: string) => {
    if (contrast(requested, bg) >= 4.5) return requested;
    const near =
      contrast("#111111", bg) >= contrast("#fafafa", bg)
        ? "#111111"
        : "#fafafa";
    return contrast(near, bg) >= 4.5 ? near : foreground(bg);
  };
  const text = readable(background),
    surfaceText = readable(surface);
  return {
    background,
    surface,
    text,
    surfaceText,
    surfaceLink: contrast(primary, surface) >= 4.5 ? primary : surfaceText,
    primary,
    accent,
    primaryForeground: foreground(primary),
    accentForeground: foreground(accent),
    link: branding.background
      ? contrast(primary, background) >= 4.5
        ? primary
        : text
      : contrast(primary, cream) >= 4.5
        ? primary
        : dark,
    font,
    cream,
    dark,
  };
}
export function brandingStyle(
  branding: Parameters<typeof brandingTokens>[0] = {},
): CSSProperties {
  const t = brandingTokens(branding);
  const custom = branding.background || branding.surface || branding.text;
  return {
    ...(custom
      ? {
          "--mc-paper": t.background,
          "--mc-bone": t.surface,
          "--mc-ink": t.text,
          "--mc-surface-ink": t.surfaceText,
          "--mc-surface-link": t.surfaceLink,
          "--mc-surface-muted": `color-mix(in srgb, ${t.surfaceText} 80%, ${t.surface})`,
          "--mc-muted": `color-mix(in srgb, ${t.text} 80%, ${t.background})`,
          "--mc-line": `color-mix(in srgb, ${t.text} 22%, ${t.background})`,
          "--mc-tint": `color-mix(in srgb, ${t.accent} 14%, ${t.background})`,
        }
      : {}),
    "--mc-primary": t.primary,
    "--mc-primary-foreground": t.primaryForeground,
    "--mc-accent": t.accent,
    "--mc-accent-foreground": t.accentForeground,
    "--mc-link": t.link,
    fontFamily: t.font,
  } as CSSProperties;
}

export function paletteWarnings(
  branding: Parameters<typeof brandingTokens>[0] = {},
) {
  const text = hex(branding.text, "#16211c");
  return (
    [
      ["background", "#f7f6f0"],
      ["surface", "#fcfbf6"],
    ] as const
  )
    .filter(
      ([key, fallback]) => contrast(text, hex(branding[key], fallback)) < 4.5,
    )
    .map(
      ([key]) =>
        `Text is hard to read on your ${key}. A readable text colour will be used.`,
    );
}
