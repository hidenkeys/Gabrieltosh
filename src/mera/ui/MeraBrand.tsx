/** Original supplied artwork; the viewport removes only transparent margins. */
export function MeraBrand({ className = "", tone = "dark" }: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return <span className={`mera-brand ${className}`}>
    <img src={`/mera/brand/mera-mark-${tone}.png`} alt="Mera" width="1125" height="1127" />
  </span>;
}
