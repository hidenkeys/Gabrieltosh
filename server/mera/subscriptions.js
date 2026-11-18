// Pure access projection: no recurring debit, billing state mutation or money movement.
export function subscriptionEntitlement(
  subscription = {},
  policy = {},
  now = Date.now(),
  demo = false,
) {
  const result = {
    newOrdersAllowed: true,
    exportsAllowed: true,
    existingPaidOrdersContinue: true,
    effectiveState: subscription.status || "trialing",
    warning: null,
    restrictionAt: null,
    policyVersion: policy.version || null,
  };
  const deny = (message) => ({
    ...result,
    newOrdersAllowed: false,
    warning: message,
  });
  if (["suspended", "cancelled"].includes(result.effectiveState))
    return deny(
      "New orders are restricted. Existing paid service and permitted exports remain available.",
    );
  let dueAt;
  if (result.effectiveState === "trialing") {
    if (!subscription.trialEndsAt)
      return demo
        ? { ...result, warning: "Development trial duration is unresolved." }
        : deny(
            "An explicit trial end date must be configured by the platform before accepting new orders.",
          );
    const end = Date.parse(subscription.trialEndsAt);
    if (!Number.isFinite(end)) return deny("Trial dates require review.");
    result.restrictionAt = subscription.trialEndsAt;
    if (now < end)
      return {
        ...result,
        warning:
          end - now < 3 * 86400000
            ? "The configured trial ends soon. Review subscription readiness."
            : null,
      };
    dueAt = end;
    result.effectiveState = "past_due";
  } else if (result.effectiveState === "active") {
    if (!subscription.paidThrough) return result; // Explicit platform activation may be manually maintained.
    const end = Date.parse(subscription.paidThrough);
    if (!Number.isFinite(end))
      return deny("Subscription dates require review.");
    if (now < end) return result;
    dueAt = end;
    result.effectiveState = "past_due";
  } else if (result.effectiveState === "past_due")
    dueAt = Date.parse(subscription.dueAt || "");
  else return deny("Subscription status requires platform review.");
  if (
    !Number.isFinite(dueAt) ||
    (!demo && policy.status !== "approved") ||
    !Number.isInteger(policy.graceDays) ||
    policy.graceDays > 365 ||
    policy.graceDays < 0
  )
    return deny(
      "Payment is overdue and no approved grace period is configured.",
    );
  const cutoff = dueAt + policy.graceDays * 86400000;
  result.restrictionAt = new Date(cutoff).toISOString();
  if (now >= cutoff)
    return deny(
      "The configured grace period has ended. New orders are restricted.",
    );
  return {
    ...result,
    warning:
      "Payment is overdue. New orders are available only within the configured grace period.",
  };
}
