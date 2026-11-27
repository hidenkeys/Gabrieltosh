// Shared organization budget and gateway accounting for all Mera AI features.
export const fallback = {
  "anthropic/claude-sonnet-5.5": [2e-6, 1e-5],
  "anthropic/claude-haiku-5.5": [1e-7, 5e-7],
  "google/gemini-3-flash": [5e-7, 3e-6],
};
export function aiLimit(env) {
  const n = Number(env.MERA_AI_MONTHLY_LIMIT_USD ?? 5);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
export async function aiTotal(c, org) {
  return Number(
    (
      await c.query(
        "SELECT COALESCE(SUM(cost_usd),0) AS total FROM mera_ai_usage WHERE organization_id=$1 AND created_at >= date_trunc('month',now())",
        [org],
      )
    ).rows[0]?.total || 0,
  );
}
export function aiCost(model, usage = {}, pricing) {
  const charged = Number(usage.cost);
  const rates = pricing
    ? [Number(pricing.input), Number(pricing.output)]
    : fallback[model] || fallback["anthropic/claude-sonnet-5.5"];
  return usage.cost != null && Number.isFinite(charged) && charged >= 0
    ? charged
    : Math.max(0, Number(usage.prompt_tokens) || 0) *
        (Number.isFinite(rates[0]) ? rates[0] : 0) +
        Math.max(0, Number(usage.completion_tokens) || 0) *
          (Number.isFinite(rates[1]) ? rates[1] : 0);
}
export function insertAiUsage(
  c,
  {
    id,
    organizationId,
    branchId,
    userId,
    feature,
    model,
    inputTokens = 0,
    outputTokens = 0,
    costUsd = 0,
    status = "pending",
    files = [],
  },
) {
  return c.query(
    "INSERT INTO mera_ai_usage(id,organization_id,branch_id,user_id,feature,model,input_tokens,output_tokens,cost_usd,status,files) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      id,
      organizationId,
      branchId,
      userId,
      feature,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      status,
      JSON.stringify(files),
    ],
  );
}

export async function hasAiBudget(c, organizationId, env, reserve = 0) {
  const total = await aiTotal(c, organizationId),
    limit = aiLimit(env);
  return total < limit && total + reserve <= limit;
}
