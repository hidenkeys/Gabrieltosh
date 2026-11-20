# Mera UI correction progress

Goal: Deploy isolated Mera Railway staging and rebuild Mera-owned marketing, owner onboarding and platform administration while preserving Bing Chun operations.

Scope **2.0** · revision `ad02976` · updated 2026-11-20

**UI correction: 47% complete | 53% remaining.** Weighted evidence: 47.4/100. This is checklist completion, not a time estimate.

Expanded scope authorized November20. Historical scope1 retains93/100 at commit2c6d0e9 in docs/mera/staging-redesign/history. New deliverables start at0; planning alone earns no credit.

## Current milestone

Baseline405d8a0 hosted and17HTTPchecks passed; ad02976 redesign deploying. Hostednormaloperatorpassword+MFA successful; beforecapture05 inspected. Build and23focusedchecks pass; fullsuite rerun after obsoleteheading assertionfix. Responsive/operationalbrowserchecks pending.

## Measurement

Weights are frozen in the current versioned scope. Checkpoints:0 planned/not implemented;40 real interfaces and required states implemented;60 integrated and exercised;80 reference/size/accessibility review corrected;100 acceptance/regressions/evidence/lead review passed. The highest fully supported checkpoint applies. Changes can reopen tasks and remove credit. Source/backend completeness alone earns no UI credit.

## Workstreams

| Workstream | Weight | Verified completion | Owner |
| --- | ---: | ---: | --- |
| Railway staging and deployment verification | 20% | 77% | staging |
| Mera skill, assets and foundations | 15% | 60% | lead |
| Marketing website | 20% | 45% | marketing_refresh |
| Signup and owner onboarding | 25% | 40% | owner_onboarding |
| Platform administration | 10% | 40% | lead |
| Responsive, accessibility and regression evidence | 10% | 0% | lead |

## Task board

| ID | Task | Weight | Checkpoint | Status / owner | Evidence |
| --- | --- | ---: | ---: | --- | --- |
| R1 | Guarded staging runtime and repeat-safe synthetic seed | 5% | 100% | VERIFIED · staging | [mera-staging-release.js](scripts/mera-staging-release.js), [mera-staging.test.js](tests/mera-staging.test.js), [STAGING-BASELINE-EVIDENCE.json](deploy/STAGING-BASELINE-EVIDENCE.json) |
| R2 | Isolated HTTPS deployment and database migrations | 7% | 80% | IN_PROGRESS · staging | [STAGING-BASELINE-EVIDENCE.json](deploy/STAGING-BASELINE-EVIDENCE.json), [04-hosted-baseline.png](docs/mera/staging-redesign/screenshots/04-hosted-baseline.png) |
| R3 | Hosted auth, uploads, workers and rollback verification | 8% | 60% | IN_PROGRESS · staging | [STAGING-BASELINE-EVIDENCE.json](deploy/STAGING-BASELINE-EVIDENCE.json) |
| D1 | Verified project design skill and source references | 5% | 80% | IN_PROGRESS · lead | [SKILL.md](.agents/skills/mera-design-excellence/SKILL.md), [foundations.md](.agents/skills/mera-design-excellence/references/foundations.md) |
| D2 | Original logo variants and scoped identity primitives | 5% | 60% | IN_PROGRESS · lead | [MeraBrand.tsx](src/mera/ui/MeraBrand.tsx), [mera-mark-dark.png](public/mera/brand/mera-mark-dark.png), [mera-mark-light.png](public/mera/brand/mera-mark-light.png) |
| D3 | Shared motion, accessibility and responsive foundations | 5% | 40% | IN_PROGRESS · lead | [mera-foundations.css](src/mera/ui/mera-foundations.css) |
| W1 | Marketing composition and real product story | 10% | 60% | IN_PROGRESS · marketing_refresh | [Marketing.tsx](src/mera/marketing/Marketing.tsx), [marketing.css](src/mera/marketing/marketing.css) |
| W2 | Service modes, pricing disclosures and FAQ | 5% | 60% | IN_PROGRESS · marketing_refresh | [Marketing.tsx](src/mera/marketing/Marketing.tsx), [mera-marketing-ui.test.tsx](tests/mera-marketing-ui.test.tsx) |
| W3 | Marketing navigation, mobile and visual acceptance | 5% | 0% | IN_PROGRESS · marketing_refresh | Pending |
| S1 | Separate secure registration, sign-in and demo | 7% | 40% | IN_PROGRESS · owner_onboarding | [Signup.tsx](src/mera/Signup.tsx), [MeraSignIn.tsx](src/mera/MeraSignIn.tsx), [mera-signin-ui.test.tsx](tests/mera-signin-ui.test.tsx) |
| S2 | Resumable nine-step owner configuration | 10% | 40% | IN_PROGRESS · owner_onboarding | [OwnerSetup.tsx](src/mera/workspace/OwnerSetup.tsx), [mera-owner-setup.test.tsx](tests/mera-owner-setup.test.tsx) |
| S3 | Validation, subdomain, readiness and recovery | 8% | 40% | IN_PROGRESS · owner_onboarding | [CreateOrganization.tsx](src/mera/workspace/CreateOrganization.tsx), [mera-address-availability.test.js](tests/mera-address-availability.test.js) |
| A1 | Operator identity, navigation and record hierarchy | 5% | 40% | IN_PROGRESS · lead | [Platform.tsx](src/mera/Platform.tsx), [platform.css](src/mera/platform.css) |
| A2 | Protected detail, filters, MFA and permission verification | 5% | 40% | IN_PROGRESS · lead | [mera-platform-ui.test.tsx](tests/mera-platform-ui.test.tsx) |
| V1 | Hosted role and remaining operational workflow checks | 4% | 0% | IN_PROGRESS · lead | Pending |
| V2 | Responsive screenshots, keyboard and reduced motion | 3% | 0% | IN_PROGRESS · lead | Pending |
| V3 | Regression suite, deployment evidence and final review | 3% | 0% | IN_PROGRESS · lead | Pending |

Task acceptance criteria, dependency IDs, change history and blockers are in [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json). Every implemented surface/workflow is mapped below; section locators do not claim new browser routes.

## Screen and workflow inventory

| Screen | Route / section | Role | Tasks | Components / primary job | State / visual acceptance |
| --- | --- | --- | --- | --- | --- |
| marketing | /mera | Prospect | W1, W2, W3 | Product discovery and signup | Before captured; after pending; Pending |
| signup | /mera/signup | New owner | S1, S3 | Secure registration, separate demo | Before captured; after pending; Pending |
| owner | /mera/workspace | Owner | S2, S3 | Guided configuration | Pending; Pending |
| platform | /mera/platform | Operator | A1, A2 | Authorized platform management | Pending; Pending |
| operations | /mera/workspace and customer routes | Staff/guest | V1, V2, V3 | Preserved operational workflows and historical remaining gates | Historical evidence preserved; hosted pending; Pending |

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

- Staging credentials and data must be synthetic; no production changes.
- Real email delivery remains unavailable; no simulated verification on real signup.
- Local QA3007 saved browser denial remains separate; current localhost3003 baseline inspection works.
- Physical printer/provider verification remains outside UI acceptance.

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

Regenerate this report with `node scripts/mera-ui-progress.js`. The calculation validates weights, task IDs, mapped screens and local evidence paths; the lead still reviews whether evidence supports each checkpoint.
