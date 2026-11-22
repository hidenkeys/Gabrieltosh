# MeraTech scope 3 coordination

Consolidated November 20 brief supersedes the prior company/marketing interpretation. Scope 1 (93%) and scope 2 (47.4%) remain archived. Lead preserves all prior work and integrates commits, tests and staging releases. No production or live financial actions.

| Owner | File ownership | State and dependency |
|---|---|---|
| Lead | main.tsx, Platform.tsx, company/PlatformCompanyInbox.tsx + recovery/CSS, ui/MeraEntry, skill, progress/evidence | Shared architecture, integration, recovery corrections and browser acceptance |
| marketing_refresh | marketing/**, three marketing/navigation test files | Parent/product pages implemented; mobile route reviews passed; homepage mobile correction pushed as9901897, deployed mobile recapture passed |
| owner_onboarding | public company forms/recovery/CSS, Signup and owner motion, company UI/inbox tests | Public forms and11 inbox recovery checks pass; owner guide resume/draft and private operator save verified; evidence maintained |
| staging | company backend/schema/contracts/tests; deployment tooling | Private company workflows verified against disposable PostgreSQL; isolated releases through0b06f8b healthy,9901897 healthy |

## Shared contracts

- MeraTech parent; existing Mera QR; planned MeraTravel Suite; bespoke consultancy. Reference HTML is context only.
- Shared actual MeraBrand and scoped foundation tokens. CSS imported in main; operational Bing Chun styling retained.
- Marketing exact routes `/mera`, `/mera/products`, `/mera/qr`, `/mera/travel`, `/mera/consultancy`, `/mera/about`, `/mera/contact`, `/mera/sign-in`; existing legal, signup and workspace routes retained.
- Consultancy and Travel forms mount from company modules; private platform inbox mounts only after normal operator MFA. API contract: `docs/mera/company-leads-contract.md`.
- Exact uncertain requests persist for explicit retry. Malformed success or changed retry cannot silently clear intent. One owner per shared file.

## Verified staging and workflow evidence

Existing isolated Railway web/jobs and private PostgreSQL retained. Releases through `0b06f8b` verified; `9901897` mobile homepage correction is deployed and visually verified. Synthetic data only, no production changes or live money. Full application suite:777passed/0failed/3explicit integration skips; separate company PostgreSQL4/4. Subsequent CSS changes built successfully; owner5/5 and inbox11/11 focused tests passed.

Normal operator password/MFA login, enquiry assignment/note/follow-up save, expiry, and saved-summary layouts verified. Public consultancy and Travel submissions reached storage/operator views. Owner guide resume and in-guide draft retention verified. Reservation seating, private joining after reload, zero-order full fulfillment and completed worker CSV download verified. See [hosted pass](HOSTED-WORKFLOW-PASS.md) and the root progress tracker for weighted acceptance rather than treating this list as full completion.

## Remaining gates

Broader page/state and four-size coverage; complete privacy/commercial policy approvals; browser attachment/logo upload remains explicitly denied by Chrome despite setting confirmation. Zero-value order does not produce automatic paid documents, so positive-paid receipt/sticker generation remains a separate unverified check. Email sender/provider access and physical printer/Windows validation remain external gates. No backend expansion is planned unless an actual workflow blocker is found.
