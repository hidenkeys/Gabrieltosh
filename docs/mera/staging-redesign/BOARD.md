# MeraTech scope 3 coordination

Consolidated November 20 brief supersedes the prior company/marketing interpretation. Scope 1 (93%) and scope 2 (47.4%) remain archived. Lead preserves all prior work and integrates commits, tests and staging releases. No production or live financial actions.

| Owner | File ownership | State and dependency |
|---|---|---|
| Lead | main.tsx, Platform.tsx, company/PlatformCompanyInbox.tsx + recovery/CSS, ui/MeraEntry, skill, progress/evidence | Shared architecture, integration, recovery corrections and browser acceptance |
| marketing_refresh | marketing/**, three marketing/navigation test files | Parent/product pages and fictional demonstrations implemented; 15 focused tests passed; rendered review pending |
| owner_onboarding | public company forms/recovery/CSS, Signup and owner motion, company UI/inbox tests | Public forms implemented; 14 form/owner checks passed; inbox recovery regression additions active |
| staging | company backend/schema/contracts/tests; deployment tooling | Private durable submissions, MFA operator handling, actor/version/idempotency verified against disposable PostgreSQL; no new release yet |

## Shared contracts

- MeraTech parent; existing Mera QR; planned MeraTravel Suite; bespoke consultancy. Reference HTML is context only.
- Shared actual MeraBrand and scoped foundation tokens. CSS imported in main; operational Bing Chun styling retained.
- Marketing exact routes `/mera`, `/mera/products`, `/mera/qr`, `/mera/travel`, `/mera/consultancy`, `/mera/about`, `/mera/contact`, `/mera/sign-in`; existing legal, signup and workspace routes retained.
- Consultancy and Travel forms mount from company modules; private platform inbox mounts only after normal operator MFA. API contract: `docs/mera/company-leads-contract.md`.
- Exact uncertain requests persist for explicit retry. Malformed success or changed retry cannot silently clear intent. One owner per shared file.

## Verified staging baseline

`https://mera-web-staging.up.railway.app/mera/` at `ad02976427b6c28cc66d04aec97900674ada103e`; web/jobs successful, private PostgreSQL, synthetic data and live financial integrations disabled. Existing upload survived redeploy with matching bytes. New scope 3 source not yet deployed or visually accepted.

Full prior-revision regression: 754 tests, 752 passed, 2 skipped. This is a baseline, not a result for new changes. Scope 3 tests and rendered verification are recorded as performed.

## Remaining gates

Integrated build/regression; new hosted release; mobile/tablet/laptop/wide screenshots; genuine consultancy/interest submission and operator update; owner setup and role workflows; outstanding branding upload/floor/private table/receipt/CSV checks. Email delivery/provider access, approved commercial policies and physical printers remain external production gates.
