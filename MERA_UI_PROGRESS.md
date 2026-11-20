# Mera UI correction progress

Goal: Deliver a coherent MeraTech parent website, Mera QR onboarding, planned Travel interest and functional consultancy with verified Railway staging, preserving hospitality operations.

Scope **3.0** · revision `91c88c6 + reviewed UI integration` · updated 2026-11-20

**UI correction: 54% complete | 46% remaining.** Weighted evidence: 54.6/100. This is checklist completion, not a time estimate.

Consolidated MeraTech brief supersedes marketing direction and adds company/product pages, real consultancy and Travel interest plus entry motion. Scope1 historical93% and scope2 historical47.4% remain archived intact. Existing staging and working shared foundations retain only applicable evidence; prior marketing implementation earns no new website credit.

## Current milestone

Company pages, public submissions and private operator inbox integrated. First local desktop/mobile/tablet review performed; final corrections and staging release in progress. Hosted acceptance and remaining operational checks are still pending.

## Measurement

Weights are frozen in the current versioned scope. Checkpoints:0 planned/not implemented;40 real interfaces and required states implemented;60 integrated and exercised;80 reference/size/accessibility review corrected;100 acceptance/regressions/evidence/lead review passed. The highest fully supported checkpoint applies. Changes can reopen tasks and remove credit. Source/backend completeness alone earns no UI credit.

## Workstreams

| Workstream | Weight | Verified completion | Owner |
| --- | ---: | ---: | --- |
| Reassessment, skill, tokens and actual brand | 15% | 65% | lead |
| Railway staging and hosted configuration | 15% | 93% | staging |
| Parent website, products, demonstrations and motion | 25% | 55% | marketing_refresh / lead |
| Mera QR signup and owner onboarding | 20% | 40% | owner_onboarding |
| Consultancy, interest and platform administration | 15% | 60% | staging / owner_onboarding / lead |
| Responsive, regression and delivery verification | 10% | 0% | lead |

## Task board

| ID | Task | Weight | Checkpoint | Status / owner | Evidence |
| --- | --- | ---: | ---: | --- | --- |
| F1 | Company architecture, source audit and updated design skill | 5% | 60% | IN_PROGRESS · lead | [SKILL.md](.agents/skills/mera-design-excellence/SKILL.md), [company-architecture.md](.agents/skills/mera-design-excellence/references/company-architecture.md), [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| F2 | Original logo variants across company and product contexts | 4% | 80% | IN_PROGRESS · lead | [MeraBrand.tsx](src/mera/ui/MeraBrand.tsx), [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| F3 | Scoped design foundations and accessible shared motion | 6% | 60% | IN_PROGRESS · lead | [mera-foundations.css](src/mera/ui/mera-foundations.css), [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| R1 | Isolated services, migrations and synthetic credentials | 5% | 100% | VERIFIED · staging | [STAGING-BASELINE-EVIDENCE.json](deploy/STAGING-BASELINE-EVIDENCE.json) |
| R2 | HTTPS routing, sessions, worker and private database verification | 5% | 100% | VERIFIED · staging | [STAGING-AD02976-EVIDENCE.json](deploy/STAGING-AD02976-EVIDENCE.json) |
| R3 | Persistent assets, safe releases and rollback documentation | 5% | 80% | IN_PROGRESS · staging | [STAGING-AD02976-EVIDENCE.json](deploy/STAGING-AD02976-EVIDENCE.json), [RAILWAY-STAGING.md](deploy/RAILWAY-STAGING.md) |
| W1 | MeraTech parent homepage and offering hierarchy | 7% | 60% | IN_PROGRESS · marketing_refresh / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| W2 | Mera QR and planned Travel with truthful interface demonstrations | 7% | 60% | IN_PROGRESS · marketing_refresh / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| W3 | Products, consultancy, about, contact, sign-in and policy navigation | 6% | 40% | IN_PROGRESS · marketing_refresh / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| W4 | Session introduction, QR resolution and responsive product motion | 5% | 60% | IN_PROGRESS · marketing_refresh / lead | [MeraEntry.tsx](src/mera/ui/MeraEntry.tsx), [mera-entry.css](src/mera/ui/mera-entry.css), [mera-entry.test.tsx](tests/mera-entry.test.tsx), [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| S1 | Secure account, sign-in and separate demo routes | 5% | 40% | IN_PROGRESS · owner_onboarding | [Signup.tsx](src/mera/Signup.tsx), [MeraSignIn.tsx](src/mera/MeraSignIn.tsx) |
| S2 | Guided nine-step owner setup and contextual previews | 10% | 40% | IN_PROGRESS · owner_onboarding | [OwnerSetup.tsx](src/mera/workspace/OwnerSetup.tsx) |
| S3 | Saved progress, validation, availability and failure recovery | 5% | 40% | IN_PROGRESS · owner_onboarding | [mera-owner-setup.test.tsx](tests/mera-owner-setup.test.tsx), [mera-address-availability.test.js](tests/mera-address-availability.test.js) |
| C1 | Private enquiry and interest storage, validation and duplicate protection | 4% | 60% | IN_PROGRESS · staging / owner_onboarding / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| C2 | Functional consultancy brief with documents and recovery | 4% | 60% | IN_PROGRESS · staging / owner_onboarding / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| C3 | Truthful Travel interest submission and confirmation | 3% | 60% | IN_PROGRESS · staging / owner_onboarding / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| C4 | MFA-protected enquiry and interest operator workflows | 4% | 60% | IN_PROGRESS · staging / owner_onboarding / lead | [SCOPE3-INTEGRATION.md](docs/mera/staging-redesign/SCOPE3-INTEGRATION.md) |
| Q1 | Rendered mobile/tablet/laptop/wide review and accessibility | 4% | 0% | IN_PROGRESS · lead | Pending |
| Q2 | Branding, CSV, floor/seating, private visits and receipt checks | 3% | 0% | IN_PROGRESS · lead | Pending |
| Q3 | Final regressions, deployed revision and manual testing evidence | 3% | 0% | IN_PROGRESS · lead | Pending |

Task acceptance criteria, dependency IDs, change history and blockers are in [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json). Every implemented surface/workflow is mapped below; section locators do not claim new browser routes.

## Screen and workflow inventory

| Screen | Route / section | Role | Tasks | Components / primary job | State / visual acceptance |
| --- | --- | --- | --- | --- | --- |
| home | /mera | Prospect | W1 | Company and offerings | New-scope verification pending; Pending |
| products | /mera/products | Prospect | W3 | Choose offering | New-scope verification pending; Pending |
| qr | /mera/qr | Hospitality prospect | W2 | QR product story and actual demo | New-scope verification pending; Pending |
| travel | /mera/travel | Travel prospect | W2, C3 | Planned direction and interest | New-scope verification pending; Pending |
| consultancy | /mera/consultancy | Client | W3, C2 | Project brief | New-scope verification pending; Pending |
| about | /mera/about | Prospect | W3 | Company intent | New-scope verification pending; Pending |
| contact | /mera/contact | Visitor | W3 | Correct enquiry destination | New-scope verification pending; Pending |
| signin | /mera/sign-in | Returning user | W3, S1 | Product routing | New-scope verification pending; Pending |
| legal | /mera/legal | Visitor | W3 | Approved policy boundaries | New-scope verification pending; Pending |
| signup | /mera/signup | QR owner | S1, S3 | Registration and separate demo | New-scope verification pending; Pending |
| setup | /mera/workspace?setup=1 | Owner | S2, S3 | Nine-step setup | New-scope verification pending; Pending |
| platform | /mera/platform | MFA operator | C4 | Company submissions and platform operations | New-scope verification pending; Pending |
| entry | Company and QR routes | Visitor | W4 | Real loading and nonblocking intro | New-scope verification pending; Pending |
| operations | Organization and guest routes | Staff and guest | Q2 | Remaining operational checks | New-scope verification pending; Pending |

## Separate PRD coverage

Status: INVENTORY_DRAFT_REVIEW_PENDING. 208 requirement IDs inventoried in docs/mera/PRD-COVERAGE.md. Denominator/classification needs lead review; no PRD percentage inferred. UI weights remain independent. Counts/percentage remain unestablished until the atomic PRD map is complete. Historical evidence remains in [ACCEPTANCE](docs/mera/ACCEPTANCE.md) and [BOARD](docs/mera/BOARD.md), including explicit incomplete implementation work.

## Production readiness

**NOT_READY**. UI completion does not clear these gates:

- Rubies agreements/verified API and credentials
- Zidi versioned contract/access
- Authorized email identity/delivery
- Target domains/TLS/hosting and deployment approval
- Physical receipt/sticker output and calibration
- Approved pricing/fee/tax/retention policies
- Production operator/key custody/monitoring/load/device verification

## Current dependencies and next actions

- Existing staging healthy atad02976; new additive company submission migration awaits reviewed deployment.
- Real owner email verification and live finance remain blocked; no false activation.
- Browser access to HTTPS staging works; historicallocal3007denial is not bypassed.
- Supporting documents use private PostgreSQL storage and MFA-protected download, not public branding assets.
- Physical printer output remains unverified.

## Scope history

- 2026-11-18T15:56:52+01:00: Baseline1.0 frozen before new implementation; weight 100; 11.2 points / 11% rounded.
- 2026-11-18T16:10:03+01:00: Customer menu/cart integrated and exercised; account/settings/signup pilots remain partial; no scope change; weight 100; 14.8 points / 14% rounded.
- 2026-11-18T16:32:27+01:00: Exact Mera visual selected; overview required sections implemented; no scope change or backend visual credit; weight 100; 18 points / 18% rounded.
- 2026-11-18T17:08:29+01:00: Selected Mera homepage visual/state review corrected; global pilot gate still pending; scope unchanged; weight 100; 21.2 points / 21% rounded.
- 2026-11-18T17:17:08+01:00: Four-surface comparison gate passed; customer wording corrected; broader shell and workflow rollout next, scope unchanged; weight 100; 27.6 points / 27% rounded.
- 2026-11-18T17:29:28+01:00: Shared all-page shell visual/role checks accepted; checkout recovery state implementation credited. Setup/platform/customer follow-on slices remain partial; scope unchanged; weight 100; 32.8 points / 32% rounded.
- 2026-11-18T22:52:35+01:00: Menu/branch integrated and exercised with actual publication recovery; basic reservation interface corrected; scope unchanged; weight 100; 39.4 points / 39% rounded.
- 2026-11-18T23:28:34+01:00: Station preparation browser integration verified; published POS pricing and reservation recovery integrated with regressions; reservation browser review remains pending; scope unchanged; weight 100; 41.2 points / 41% rounded.
- 2026-11-18T23:41:52+01:00: Reservation browser milestone and partial People hierarchy/read-state review accepted; safe recent-history/platform read-state integrations tested; no scope change; weight 100; 43 points / 43% rounded.
- 2026-11-19T00:24:32+01:00: Private visit and approved protected-platform partial milestones verified; subscription surface accepted without broad O7 credit; source46.2weighted points, scope unchanged; weight 100; 46.2 points / 46% rounded.
- 2026-11-19T01:03:29+01:00: Records printing QR support and customer-help partial milestone verified; shared primitives introduced; scope unchanged; weight 100; 51 points / 51% rounded.
- 2026-11-19T01:18:04+01:00: Finance/shift/export and remaining management partial milestone; browser-native date submission corrected and actual CSV download verified; scope unchanged; weight 100; 52.6 points / 52% rounded.
- 2026-11-19T01:50:36+01:00: Front desk, customization and public information partial milestone; actual waitlist transitions, focus, signup density and pricing deep links verified; scope unchanged; weight 100; 56.6 points / 56% rounded.
- 2026-11-19T08:45:26+01:00: Receipt/sticker studio integrated and exercised; source d56f410, scope unchanged; weight 100; 62 points / 62% rounded.
- 2026-11-19T09:12:02+01:00: People/member/role partial milestone verified at90b8a50; scope unchanged; weight 100; 62.6 points / 62% rounded.
- 2026-11-19T09:27:32+01:00: Overview/service/order drilldown partial milestone verified at77e397c; scope unchanged; weight 100; 63.2 points / 63% rounded.
- 2026-11-19T09:57:42+01:00: Attention destinations visual/focus/size milestone verified atf5b4452; scope unchanged; weight 100; 63.8 points / 63% rounded.
- 2026-11-19T10:24:38+01:00: Staff reservation recovery slice verified at942d77e; no checkpoint or scope-weight change; weight 100; 63.8 points / 63% rounded.
- 2026-11-19T10:39:08+01:00: Shift open/close recovery slice verified at10e1feb; checkpoints andscopeweightsunchanged; weight 100; 63.8 points / 63% rounded.
- 2026-11-19T15:16:12+01:00: Shared dialog/primitive source-and-browser milestone verified at49ffed5; F4 advances40→80, scopeunchanged; weight 100; 64.6 points / 64% rounded.
- 2026-11-19T15:38:02+01:00: Public marketing/onboarding milestone verified at5b5816f; M2 advances40→60; scopeunchanged; weight 100; 65 points / 65% rounded.
- 2026-11-19T20:41:27+01:00: Lead-reviewed F4/F5/P4/C1 closure at0e054fb; role/menu evidence documented; full regression rerun pending; scopeunchanged; weight 100; 70.6 points / 70% rounded.
- 2026-11-19T21:11:26+01:00: O1/O2 accepted withfinaloverview/roleevidence at3edb270; fullregression729pass2skip/buildpassed; scopeunchanged; weight 100; 71.6 points / 71% rounded.
- 2026-11-19T21:20:48+01:00: M3accepted100/M2reviewed80 withactualplatformdenial/audit and736passingregressions;scopeunchanged; weight 100; 74.4 points / 74% rounded.
- 2026-11-19T21:22:54+01:00: Lead-approved literal acceptance reconciliation:O4/O5/O7/P1/P2/C5/Q3closed;O3/O6/P3/P5/C2/C3/C4/Q2reviewed80;O6downloadenvironmentBLOCKED;scopeunchanged; weight 100; 92.4 points / 92% rounded.
- 2026-11-19T21:33:18+01:00: C4accepted100atbcc76e7; remaining finitebrowser/upload/downloadgates explicitlyBLOCKED; no workaround/wholegoalcompletion; scopeunchanged; weight 100; 93 points / 93% rounded.
- 2026-11-19: undefined; weight undefined; undefined points / undefined% rounded.
- 2026-11-20: Scope2 expanded staged deployment and Mera redesign. Scope1 archived intact at93%.; weight 100; 0 points / 0% rounded.
- 2026-11-20: Scope3 consolidated company/two-products/consultancy brief. Scope2 archived47.4%. Applicable implementation and hosted evidence retained only.; weight 100; 30.8 points / 30% rounded.

Regenerate this report with `node scripts/mera-ui-progress.js`. The calculation validates weights, task IDs, mapped screens and local evidence paths; the lead still reviews whether evidence supports each checkpoint.
