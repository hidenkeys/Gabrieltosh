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
  branding: { primary?: unknown; accent?: unknown; font?: unknown } = {},
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
  return {
    primary,
    accent,
    primaryForeground: foreground(primary),
    accentForeground: foreground(accent),
    link: contrast(primary, cream) >= 4.5 ? primary : dark,
    font,
    cream,
    dark,
  };
}
export function brandingStyle(
  branding: Parameters<typeof brandingTokens>[0] = {},
): CSSProperties {
  const t = brandingTokens(branding);
  return {
    "--mc-primary": t.primary,
    "--mc-primary-foreground": t.primaryForeground,
    "--mc-accent": t.accent,
    "--mc-accent-foreground": t.accentForeground,
    "--mc-link": t.link,
    fontFamily: t.font,
  } as CSSProperties;
}
