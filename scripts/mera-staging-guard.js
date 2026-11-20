export const stagingScope = Object.freeze({
  projectId: "242b97ee-5c3d-4991-8613-ff3a2628732b",
  environmentId: "1d313de7-1669-4ded-a6c8-4fe3581abee4",
  databaseName: "railway",
});
export function assertStagingTarget(env = process.env) {
  if (env.RAILWAY_PROJECT_ID !== stagingScope.projectId || env.RAILWAY_ENVIRONMENT_ID !== stagingScope.environmentId || env.MERA_RAILWAY_STAGING !== "true" || env.NODE_ENV !== "production" || env.MERA_ENABLED !== "true" || env.MERA_DEMO === "true" || env.MEMORY_DB === "true")
    throw new Error("This release only runs in the explicitly verified Mera Railway staging environment.");
  let target;
  try { target = new URL(env.DATABASE_URL); } catch { /* fail closed below */ }
  if (!target || !["postgres:", "postgresql:"].includes(target.protocol) || target.hostname !== "postgres.railway.internal" || target.pathname !== "/" + stagingScope.databaseName || target.port && target.port !== "5432")
    throw new Error("Staging release requires its isolated private PostgreSQL database.");
  if (env.MERA_STAGING_SEED !== "synthetic-v1") throw new Error("Explicit synthetic staging seed selection is required.");
}
