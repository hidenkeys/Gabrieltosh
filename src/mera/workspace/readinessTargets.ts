let pendingTarget: string | null = null;
export const getReadinessTarget = () => pendingTarget;
export const clearReadinessTarget = () => {
  pendingTarget = null;
};
// Server fixTarget values name setup disclosures or workspace sections.
export function openReadinessTarget(
  target: string,
  onOpen?: (section: string) => void,
) {
  if (["operations", "deposits", "minimum-spend", "booking"].includes(target)) {
    pendingTarget = target;
    onOpen?.("onboarding");
    window.dispatchEvent(new Event("mera:readiness-target"));
  } else
    onOpen?.(
      (
        {
          account: "onboarding",
          business: "onboarding",
          payments: "onboarding",
        } as Record<string, string>
      )[target] || target,
    );
}
export const readinessStep: Record<string, number> = {
  account: 1,
  business: 1,
  menu: 8,
  payments: 5,
};
