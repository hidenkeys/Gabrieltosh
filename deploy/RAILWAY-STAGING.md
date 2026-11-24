# Mera isolated Railway staging

Verified 20 November 2026 through the connected **hidenkeys Railway account**: user `bd01dff6-2afa-4ef1-a95b-48c0440026b7`, personal workspace `316c834e-d625-468b-9bd5-3dc90264e894`. None of the nine existing projects hosted Mera; the Bing Chun project uses the separate marketing repository. Existing services were not modified.

## Infrastructure

- Project `mera-staging`: `242b97ee-5c3d-4991-8613-ff3a2628732b`.
- Environment `staging`: `1d313de7-1669-4ded-a6c8-4fe3581abee4`.
- Web `3240b9a3-4f3b-4d5f-a78e-9c3055b53807`.
- Durable jobs `c4601f31-cf68-44b1-9c22-be21383b9ffa`.
- Postgres `47e2ac6d-6235-4388-910e-80dd9a759490`, Railway PostgreSQL18 template, persistent database volume.
- Assigned hostname: `https://mera-web-staging.up.railway.app`. An assigned hostname alone is not a deployment success; consult the deployment evidence record.

`railway-staging-settings.json` records direct Railway service settings. Railway's current integration rejects deprecated `railway.json`/`railway.toml`; apply recorded build/start/predeploy/health settings through `update-service`, not Config as Code. Railpack Node22 is explicit. Web installs via `RAILPACK_NODE_NPM_INSTALL="npm ci --include=dev"` then builds `npm run build`; jobs install via `npm ci --omit=dev` then syntax-check the worker. Cache mounts are disabled because the initial build exposed a Vite cache / clean-install EBUSY conflict; lockfile installs remain reproducible. Pin the source to the reviewed pushed commit rather than deploying every subsequent push automatically.

## Configuration and isolation

Both services use `NODE_ENV=production`, `MERA_ENABLED=true`, `MERA_DEMO=false`, `MEMORY_DB=false`, `MERA_RAILWAY_STAGING=true`, `COOKIE_SECURE=true`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `MERA_PUBLIC_ORIGIN` and `PUBLIC_ORIGIN` equal to the HTTPS hostname. Web binds `0.0.0.0`, port8080 (matched by the service domain); use `PORT` supplied to the runtime. `MERA_ROOT_DOMAIN` is empty: explicit `/mera/menu/:organizationSlug/:branchId` routes exercise existing tenant resolution; wildcard domains and custom TLS are deliberately not represented as verified.

Web-only `MERA_STAGING_SEED=synthetic-v1` and strong unique `MERA_STAGING_OWNER_PASSWORD` initialize the synthetic owner `staging.owner`. The password and a generated `MERA_PLATFORM_MFA_KEY` are private deployment variables, never committed or printed. The owner receives organization memberships for the published synthetic Bing Chun venue and an unpublished **Staging setup practice** organization, not platform privileges. The latter exercises save/resume setup without pretending email verification succeeded. Legacy catalog seed contact settings are replaced with synthetic details. No provider-verification identity is fabricated. Resend was configured in a later staging round; this release preserves the current email settings. Email delivery is not re-tested by the seven-venue acceptance run. Platform QA uses an explicit one-off `scripts/mera-staging-operator.js` invocation over authenticated Railway SSH. It requires the staging marker and exact environment, receives private credentials on stdin, refuses to rotate existing credentials, records an audit entry, and grants no merchant membership. It is never called by startup or release. Normal password login and MFA remain required.

Jobs use `MERA_RUN_JOBS=true`. `MERA_BACKUPS_ENABLED=false`, `DISABLE_BACKUPS=true`: no unconfigured cloud backups claimed. No print bridge runs in the cloud; browser receipt/label previews remain available and physical output is a hardware gate. Rubies and live billing remain gated. Resend staging configuration is preserved; this venue acceptance does not send email.

Uploads are already bounded, organization-scoped `mera_assets.bytes` PostgreSQL data; report artifacts also live in PostgreSQL. They do not depend on an ephemeral web filesystem. Asset persistence across an actual redeploy remains an explicit acceptance check. One web replica preserves the existing in-process abuse limiter semantics. Railway-edge mode trusts one hop and takes the documented validated `X-Real-IP` instead of client XFF chains. Indexing is disabled by `X-Robots-Tag` and `robots.txt`; private routes still require real authentication.

## Release / rollback

Run `node scripts/mera-staging-release.js` as the **web-only predeploy command** (180-second timeout). It checks exact project/environment/private database target before any import that can connect. It refuses populated databases lacking its marker, serializes releases with an advisory lock, explicitly applies existing migrations, and inserts synthetic organization/branch/catalog/owner only once. It never copies customer history, financial records or production credentials. A completed seed is not overwritten by subsequent releases. Normal production startup does not migrate or seed.

Deploy the web first; only attach the jobs service source after the migration completes and web health passes. Check `/api/health`, marketing, published menu, unauthorized workspace/platform denial, HTTPS authentication cookies, and the current signup/verification policy. Preserve the previous successful deployment revision before each UI slice. Roll back by reconnecting the web/jobs source to that prior commit and deploying it in this environment only; do not rerun initialization, delete volumes or restore an older database over newer records. This rollback changes code, not schema: review backward compatibility before any future destructive migration. Current staging changes are additive.

Operational updates use existing three-second HTTP polling and canonical refresh. There is no new websocket dependency. Actual reconnect browser acceptance remains separate.

Official documentation inspected:
- https://railpack.com/languages/node/ — Node pinning, npm install command override and framework cache behavior.
- https://docs.railway.com/deployments/pre-deploy-command — private-network migration execution; failures prevent deployment; predeploy filesystem is not durable.
- https://docs.railway.com/networking/public-networking/specs-and-limits — HTTPS edge, X-Real-IP / forwarded protocol headers, request timeouts and websocket support.

The automatic approval reviewer initially rejected hostname creation. A bounded retry cited the user's explicit request for a reachable Railway HTTPS hostname and succeeded; no bypass or alternate exposure mechanism was used.
