# MERA PRD coverage inventory

Assessment: 18 November 2026. Source: `/Users/Shared/Mera/MERA_PRD.md` v1.0, all 360 lines, and `/Users/Shared/Mera/MERA_MULTI_AGENT_BUILD_PROMPT.md`, all 290 lines, read in full for this inventory. This is a source/evidence inventory, not a release certificate. It does not replace the PRD or the independently frozen UI scope in `MERA_UI_PROGRESS.json`.

Latest user correction: preserve Bing Chun's actual original visual language for organization operations; create a separate sophisticated enterprise identity for Mera marketing/platform. No original Mera screenshot exists. Three proposed concepts await selection. Earlier instructions or skill references implying an original Mera marketing screenshot are superseded.

## Classification and evidence rules

- **implemented**: an executable mounted path and relevant existing evidence were identified for the narrowly stated outcome. This does not mean its complete UI, security surface or production behavior is verified.
- **unverified**: code exists, but integration, completeness or current environment evidence is insufficient for the stated outcome. Test-file existence alone is not a passing result.
- **missing**: no complete integrated implementation was identified; some supporting primitives may exist.
- **externalblocked**: the stated outcome specifically requires unavailable authorized provider, hosting, policy or physical evidence. Related local software gaps are listed separately.

Paths below are repository-relative. `I` means `server/mera/index.js`; `D` means `server/mera/domain.js`; `C` means `shared/mera-contracts.js`; `PG` means `tests/mera.integration.test.js`; `W` means `src/mera/workspace/`; `U` means `src/mera/customer/`. Named test files live under `tests/`. Test references indicate assertions/source coverage unless a run is explicitly identified. UI captures prove only the pictured state, not every flow in a module.

Actual execution evidence available to this assessor: the last backend PG run before printing/alias edits passed one integration scenario, zero failures (historical agent session44800; exact runtime not revalidated for this inventory), including current bounded-query revisions. PG assertions at1993–2063 cover old-key hot-path replay,220 history records,100/100/20 pages, cursor scope/filter denial,200-order snapshot bound, full/date report equivalence and23/25-hour DST. Later printing/alias additions were not covered by that run. Earlier checkpoint results in `BOARD.md` are historical evidence, not a fresh full-tree pass. Exact UI batch executed twice during this assessment passed12/12 in1164ms and1010ms: signup, signup-ui, management-ui and customer-ui-correction. No fresh backend, build, browser, hardware or provider verification was performed for this document.

## Integration boundary requiring special attention

Current disk inspection finds **printing and aliases mounted**, not wholly unmounted: I imports/mounts `mountMeraPrinting` and `mountMeraOrganizationAliases`, migrates aliases, and calls paid-document enqueue helpers. These edits are **unverified after the last PG gate**; treating them as proven or absent would both be wrong. The latest own-session history/end-session followup additions are mounted but also lack new actual-PG evidence.

`server/mera/workspace-admin.js`, `refund-requests.js`, and `stock-history.js` exist with leaf tests, but I has **no imports/mounts** for them at this inspection. Their frontend consumers cannot establish working server behavior. Existing direct approved refunds and legacy stock adjustment endpoints do not satisfy the new request/approval separation or typed movement APIs. Preserve these exact limitations until an owner integrates and verifies them. No backend expansion is authorized by this documentation task.

## Requirements: objective, architecture and organization

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P01.01 | §1 objective | Hosted web surfaces serve hospitality lifecycle | src/main.tsx; I; ARCHITECTURE.md | Local routed surfaces exist; authorized target-host operation untested | unverified |
| P01.02 | §1 evolution | Bing Chun Surulere works without destructive rewrite | src/App.tsx; I seed; src/ProductImage.tsx | Original captures01/02; isolated demo seed; hosted cutover not performed | implemented |
| P02.01 | §2 exclusions | Finished-item stock included; ingredient purchasing/native apps excluded | C; D; ARCHITECTURE.md | Scope exclusion, not a request to build native installers | implemented |
| P02.02 | §2 degraded network | Disconnection never implies successful order/payment | U/client.ts; W/api.ts; W/financialJournal.ts | Retry/uncertainty tests; representative WAN/offline rehearsal remains | unverified |
| P03.01 | §3 surfaces | Marketing, workspace, guest, platform and integration have distinct access | src/main.tsx; I; server/mera/zidi.js | Routes exist; complete role/surface visual review pending | unverified |
| P03.02 | §3 modes | Branch composes counter/takeaway/table/reservations | I settings; W/BranchSettings.tsx | ServiceModes consumer exists; branch creation leaf unmounted | unverified |
| P04.01 | §4 hierarchy | Organization/branch IDs scope operational records | server/mera/schema.sql; I guard/locked | PG cross-org/branch assertions; hosted-boundary tests | implemented |
| P04.02 | §4 memberships | A user has separate organization memberships | I/context; server/mera/roles.js | Explicit organizationWide and branchIds projections; PG scope tests | implemented |
| P04.03 | §4 access | Branch membership never grants organization-wide authority | I guard; roles.js; platform-support.js | PG scope/support tests; UI navigation separately unverified | implemented |
| P04.04 | §4 identifiers | Names/slugs can change without changing IDs | schema.sql; organization-aliases.js | UUID ownership; alias rename integration post-PG unverified | unverified |
| P04.05 | §4 boundaries | Jobs/exports/files remain tenant scoped | operations.js; assets.js; queries.js | PG scoped downloads/assets/job permission recheck; full cache/event audit pending | unverified |
| P04.06 | §4 menu sharing | Shared definition has explicit branch override | menus.js; W/SharedMenus.tsx | PG shared-use tests; category ID crossbranch handling requires review | unverified |
| P04.07 | §4 branch ownership | Authorized owner creates additional branch safely | workspace-admin.js; I settings | Leaf tests exist; branch POST module unmounted | missing |

## Onboarding, branding, domains and identity

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P05.01 | §5 step1 | Owner registers and verifies real account | identity.js; identity-schema.sql; src/mera/Signup.tsx | Demo register/verify tested; real email ownership/provider unavailable | externalblocked |
| P05.02 | §5 steps2–4 | Owner creates organization, claims name/address, supplies contacts/branch | I organization POST; C | Existing org creation path; atomic alias claim integration post-PG unverified | unverified |
| P05.03 | §5 step5 | Timezone/currency/hours/cutoff configurable | I settings; catalog.js; W/BranchSettings.tsx | Timezone validated; PG DST/report tests; form state tests | implemented |
| P05.04 | §5 steps6–8 | Owner configures brand/menu/modifiers/stock/policies | I; menus.js; assets.js; W/OrganizationWorkspace.tsx; CatalogOperations.tsx | Individual consumers and tests; complete resumable user journey pending | unverified |
| P05.05 | §5 steps9–10 | Owner adds floor/reservation policy and staff | I; roles.js; reservation-policy.js | Scoped APIs; invitation external delivery blocked separately | unverified |
| P05.06 | §5 steps11–13 | Payment methods, print layouts and commercial proposals reviewed | readiness.js; I; W/PrintStudio.tsx; W/PolicyEditor.tsx | Explicit policy/readiness primitives; print integration post-gate | unverified |
| P05.07 | §5 resumable | Fourteen steps persist and explain incomplete work | I onboarding; W/OrganizationWorkspace.tsx onboarding section | Numerical step updates exist; full ordered completion/refresh walkthrough missing | unverified |
| P05.08 | §5 preview/publish | Preview before launch; readiness separate from provider approval | readiness.js; I publicContext | PG non-demo unpublished404; manual launch opt-in; UI verification incomplete | unverified |
| P06.01 | §6 original UI | Original Bing Chun operational style preserved | src/styles.css; W/OperationalOverview.tsx; W/StaffPos.tsx | captures01–11,16–17; overview/POS pilot only | unverified |
| P06.02 | §6 shared UI | Shared readable controls/tokens across all surfaces | W/workspace.css; src/mera/*css | Pilot verified; broad roles/modules not corrected | unverified |
| P06.03 | §6 branding | Logo/colors/font/cover/description/contact customizable | assets.js; I branding; W/OrganizationWorkspace.tsx branding section | Uploaded media/branding tests; complete preview/contrast walkthrough pending | unverified |
| P06.04 | §6 previews | Mobile/desktop live preview and contrast safeguards | W/OrganizationWorkspace.tsx branding section; U/customer.css | Partial preview components; all combinations contrast not verified | unverified |
| P06.05 | §6 safe content | Scripts/unrestricted HTML rejected; uploaded images scoped | assets.js; C; security middleware | Raster signature/size/dimension tests and PG foreign/public scope | implemented |
| P06.06 | §6 domain routes | Marketing/app/org/platform domains resolve with TLS | domains.js; server/mera-security.js | Local domain routing tests; actual DNS/TLS/ownership unavailable | externalblocked |
| P06.07 | §6 allocation | Unique case-insensitive reserved-safe concurrent subdomain claims | organization-aliases.js; aliases-schema.sql; I | Unit aliases/domain tests; seed/create/rename mounted post-PG | unverified |
| P06.08 | §6 stable QR | Permanent QR survives updates/approved renaming | qr.js; organization-aliases.js; W/QrCodes.tsx | QR unit/PG earlier context tests; alias integration no fresh PG | unverified |
| P06.09 | §6 QR privacy | QR contains only org/branch/optionaltable context | qr.js; U/CustomerExperience.tsx | Scoped QR resolution tests; no private visit code in QR | implemented |
| P07.01 | §7 customers | Anonymous browsing creates no identity/order | U/CustomerExperience.tsx; I publicmenu | Customer UI correction tests confirm browse performs no guest/write | implemented |
| P07.02 | §7 displayname | Submission/join requires name and secure guest session | I guest/createOrder; U/client.ts | PG secure session and ownership tests | implemented |
| P07.03 | §7 crossdevice | Optional verified phone/email persistent history | identity.js only owner; guest models | No integrated customer identity/provider workflow | missing |
| P07.04 | §7 guest continuity | Current guest persists securely per organization | I guest/scopedcookies; U/client.ts | PG multi-org cookies/denial; no storage/fingerprint identity | implemented |
| P07.05 | §7 privacy | Name/table/publicQR cannot reveal private history | I guest/visits/orders; minimum-spend.js | PG successive visit/code/cookie/privacy assertions | implemented |
| P07.06 | §7 consent | Marketing preference recorded separately | qr.js consent; U/CustomerExperience.tsx | Consent API/PG scope; admin records leaf unmounted | unverified |
| P07.07 | §7 retention | Retention/account-support policy and operating workflow | legal page; RUNBOOK.md; platform-support.js | Proposed legal text only; retention automation/account history rights incomplete | missing |
| P07.08 | §7 templates | Ten template roles carry explicit server permissions | C; I guard | Role context/PG grant tests; role-specific complete UI pending | implemented |
| P07.09 | §7 custom roles | Bounded delegated custom grants/scopes editable | roles.js; W/RoleManager.tsx | Version/authority tests and PG custom role access | implemented |
| P07.10 | §7 invitations | Expiring single-use invitation can be accepted/revoked | I invitations; W/RoleManager.tsx | Hash/expiry/revocation primitives and PG; real sender blocked | unverified |
| P07.11 | §7 delivery | Invitation reaches intended verified email recipient | identity/email capability disclosure | Authorized sender/delivery not configured; demo token not delivery | externalblocked |
| P07.12 | §7 suspension | Revocation/suspension applies promptly | I guard; W/api.ts; context refresh | PG current-membership denial; stale UI clear tests | implemented |
| P07.13 | §7 authority | Cannot overgrant or remove last active owner | I memberships; roles.js | Organization lock and PG owner/grant tests | implemented |
| P07.14 | §7 strongauth | Platform operator uses session-bound stronger authentication | platform.js; platform-schema.sql; Platform.tsx | RFC TOTP/key/replay/session/revocation tests and PG | implemented |
| P07.15 | §7 highrisk | High-risk financial actions demand stronger authentication | I refunds/payments; platform.js | Staff permission checks exist; staff financial step-up not identified | missing |

## Menu and stock

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P08.01 | §8 categories | Nested category graph validates cycles/depth/scopes | categories.js; I publishedCategories; W/Categories.tsx | Category unit + PG publication snapshot checks | implemented |
| P08.02 | §8 starters | Suggested starter categories accelerate setup | seed and W menu editor | Seed labels exist; general starter-selection workflow not identified | missing |
| P08.03 | §8 photos | Products include safe photos/descriptions | C; I products; assets.js; ProductImage.tsx | Existing photos+uploaded assets; media tests | implemented |
| P08.04 | §8 variants | Sizes/variants price and stock independently | C; D quote; catalog.js | PG concurrent last variant and scoped adjustment | implemented |
| P08.05 | §8 modifiers | Required/optional limits/prices include sweetness/ice/toppings | D; C; W/ModifierGroupsEditor.tsx; U | Server validation tests; structured editor real-task UI not verified | unverified |
| P08.06 | §8 dietary | Allergen/dietary instructions persist in order snapshots | D quote; W/OrderInstructions.tsx | New array snapshot edit after last PG, no explicit new regression | unverified |
| P08.07 | §8 overrides | Branch price/availability overrides do not leak foreign category | menus.js; I product binding | Shared menu tests; structured category crossbranch case requires review | unverified |
| P08.08 | §8 schedules | Hours, item schedules and manual pause are independent | catalog.js; I settings/createOrder | Time window/availability PG cases; full UI save/publish review pending | unverified |
| P08.09 | §8 bulk | Bulk availability changes are authorized/atomic | I bulk endpoint; W menu | Added prior checkpoint with tests; complete rendered flow unverified | unverified |
| P08.10 | §8 publication | Guests see published eligible snapshots only | I publish/publicmenu; D | PG draft hierarchy/menus; immutable historical snapshots | implemented |
| P08.11 | §8 checkout | Server rejects stale/invalid prices/modifier selections | pricing.js; D quote; U/W quote consumers | Quote/expiry/policy/conflict tests; same accepted replay after expiry | implemented |
| P08.12 | §8 routing | Products route to independent kitchen/bar stations | tickets.js; I accept; W/Tickets.tsx | PG station readiness/prepared count tests | implemented |
| P09.01 | §9 balances | Counted/unlimited/manual available stock branch-scoped | C; I stock/createOrder | PG branch/variant isolation; quantity tests | implemented |
| P09.02 | §9 holds | Cart does not consume; checkout hold expires/releases | I holds; D | PG expiry/rejection/lastunit concurrency | implemented |
| P09.03 | §9 commitment | Consumption committed once under confirmation/paylater rules | I accepted/payment/createOrder | PG duplicate/concurrent variants/pay-later rules | implemented |
| P09.04 | §9 stock refunds | Refund does not automatically restock prepared goods | I refund; cancellation.js | PG prepared/cancellation/stock conservation assertions | implemented |
| P09.05 | §9 adjustments | Permissioned reasoned stock adjustment recorded | I stock; W/StockMovements.tsx | Existing adjustment path; new typed endpoint separately missing | implemented |
| P09.06 | §9 movement types | Restock/waste/loss have explicit typed signed history | stock-history.js; W/StockMovements.tsx | Leaf unit exists; route unmounted, no actual PG integration | missing |
| P09.07 | §9 alerts | Configurable low-stock and shown/hidden sold-out behavior | I products/publicmenu; C; W menu | Threshold fields present; operational alert/show-hide behavior needs complete verification | unverified |
| P09.08 | §9 latepay | Successful payment after expired hold becomes explicit exception | reconciliation.js; I payments | Simulated late/reordered events tested; actual provider blocked | unverified |

## Orders, responsibility and state transitions

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P10.01 | §10 channels | Guest/staff/Zidi share price/stock/order rules | I createOrder; zidi.js; pricing.js | PG shared rules/credential-bound quote/source attribution | implemented |
| P10.02 | §10 journey | Scan-to-menu-to-review-to-tracking completes on mobile | U/CustomerExperience.tsx; client.ts | captures12–15 + customer tests; complete final checkout/payment journey visual audit pending | unverified |
| P10.03 | §10 totals | All mandatory tax/charges/discounts disclosed before confirm | pricing.js; U/W quote UI | Price/tax/rounding and PG original-policy assertions | implemented |
| P10.04 | §10 retry | Duplicate/changed-intent retries return stable canonical result or conflict | I; financial-requests.js; U/W journals | PG keys, tombstone fencing, stale quote replay; UI uncertainty tests | implemented |
| P10.05 | §10 uncertainty | Pending/rejected/unavailable/uncertain states recover honestly | U/client.ts; W/api.ts; financialJournal.ts | Focused tests; physical network outage/reconnect journey unverified | unverified |
| P10.06 | §10 help | Guest sends own-order/current-visit help without exposing others | help.js; U; W/HelpRequests.tsx | Role/privacy/rate/intent tests and PG | implemented |
| P10.07 | §10 substitutions | Staff records customer-approved substitution and result | No complete integrated path identified | Ordinary modifier editing/cancellation is not an approved substitution workflow | missing |
| P10.08 | §10 attribution | Current handler/history includes creator/preparation/payment/fulfillment actors | I snapshots/events; tickets.js; fulfillment.js | PG actor and partial handoff tests; rendered identity clarity needs audit | unverified |
| P10.09 | §10 filters | Scoped bounded order search by state/source/payment/staff/time | queries.js; W/OrderHistory.tsx | PG220paging/cursor/filters/cashier commercial denial | implemented |
| P10.10 | §10 reassignment | Eligible handler picker and audited assignment | I assign; workspace-admin.js | Assignment API exists; safe eligible staff module unmounted | missing |
| P10.11 | §10 delays | Unassigned/delayed work clearly visible without fake clientclock | I serverTime; platform signals; W overview | Authoritative timestamp/signal exists; all staff screens live verification pending | unverified |
| P11.01 | §11 order states | Only authorized allowed state transitions occur | D transitions; I | PG reject/prepare/ready/collect/completion guards | implemented |
| P11.02 | §11 payment states | Payment lifecycle independent of preparation/print | I; reconciliation.js; printing.js | Prior PG independence; uniform print addition not rerun | unverified |
| P11.03 | §11 reservation states | Requested through no-show transitions enforce actors/capacity | I reservation routes; reservation-policy.js | PG reservation/seating/cancel/minspend assertions | implemented |
| P11.04 | §11 partial cancellation | Original-policy partial cancellation consumes approved refund credit once | cancellation.js; pricing.js; W/ItemCancellation.tsx | PG tax-aware credit/conservation/fulfilled floor cases | implemented |
| P11.05 | §11 partial fulfillment | Handover cannot exceed prepared/uncancelled quantity | fulfillment.js; W/ItemFulfillment.tsx | Unit/reordered-intent + PG prepared/version guards | implemented |
| P11.06 | §11 readiness | Overall ready derives from required station/line completion | tickets.js; I status; W/Tickets.tsx | PG independent station status/readiness | implemented |
| P11.07 | §11 printer independence | Failure/reprint never creates order or blocks preparation inherently | I print jobs; printing.js | Earlier independent-state test; latest uniform enqueue unverified | unverified |

## Tables, visits, bills and reservations

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P12.01 | §12 floor | Zones/labels/capacities editable on a meaningful floor map | I tables; W/FloorMap.tsx; TableEditor | Map source exists; touch positioning/accessibility/live UI not verified | unverified |
| P12.02 | §12 identity | Physical table/visit/guest/waiter/order/bill distinct | schema records; I; table-service.js | PG privacy/move/seating tests | implemented |
| P12.03 | §12 occupancy | Future booking doesn't occupy current table; reset checks active visits | I table status; reservation-policy.js | PG future capacity/oldvisit close and active table protection | implemented |
| P12.04 | §12 joining | Staff-controlled code admits guests only to current visit | I join; visit-access.js; minimum-spend.js | PG old/new rotation, wrong/closed/stale code/privacy | implemented |
| P12.05 | §12 rounds | Multiple guest rounds remain private to joined party | I attachBill/privatevisit; U | PG secure guest round/visit tests; UI private bill overview exists | implemented |
| P12.06 | §12 moves | Move/combine only eligible empty tables preserving same party | table-service.js; W tables | PG occupied conflict/version/retry/alltables cleanup | implemented |
| P12.07 | §12 items/amount | Split/merge conserves charges/paid allocations | I bills | PG per-order paid split protection; split/merge exact uncertain retry/version still missing | unverified |
| P12.08 | §12 byguest | Deliberate guest-specific splitting safely groups guest charges | I bills aggregate/items | No complete per-guest API/consumer + no-version split concern | missing |
| P12.09 | §12 partial pay | Bill/order allocations cannot pay twice or overallocate | I bills/payments; D paidForBill | PG partial/excess/deposit/refund/split conservation | implemented |
| P12.10 | §12 closure | Debt blocks closure except audited noncash outcome | I close; writeoff.js | PG writeoff does not increase cash/paid; close and rereclose guards | implemented |
| P12.11 | §12 minimumspend | Acknowledged booked terms require additems or reviewed waiver | minimum-spend.js; I; U/W consumers | PG snapshot/ack/stale/replay/waiver and no fake fee | implemented |
| P12.12 | §12 deposits | Deposit allocated once; retained/return/forfeit balance visible | I deposits; deposit-outcomes.js | PG returns/forfeit/remainingcredit/balanced tax postings | implemented |
| P13.01 | §13 booking | Booking captures contact/party/time/duration/branch/preferences/notes/source | I reservation schema; U/W reservation | Core inputs exist; exact optional zone/contact completeness needs review | unverified |
| P13.02 | §13 capacity | Concurrent bookings respect window/buffer/overlap capacity | I reservations; reservation-policy.js | PG concurrent201/409 and window/policy cases | implemented |
| P13.03 | §13 frontdesk | Waitlist/walkin/arrivals/no-show have operational controls | operations.js; I; W/Operations.tsx | Routes/consumer tests; full frontdesk flow and overrides audit not visually verified | unverified |
| P13.04 | §13 reminders | Authorized reminders delivered to guest | No live notification provider | Adapter/readiness only; delivery credentials and business authorization absent | externalblocked |
| P13.05 | §13 conversion | Seating preserves reservation guest/deposit/minspend once | I seat; minimum-spend.js | PG allocation/snapshot/retry tests | implemented |
| P13.06 | §13 cancellations | Cutoff/cancellation/no-show/refund outcomes explicit before publish | reservation-policy.js; customer-followup.js; deposit-outcomes.js | PG held-deposit request only + outcomes; policies still require operator approval | unverified |

## Payments, subscriptions and reporting

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P14.01 | §14 manual | Cash/POS/verifiedtransfer record amount/method/reference/actor/time | I payments; W financial forms | PG manual partial/excess/reference/idempotency/ledger | implemented |
| P14.02 | §14 paymentclaims | Guest payment claim never confirms funds | I customer verification path; U | No client-only paid transition; provider testmode isolated | implemented |
| P14.03 | §14 integrated | Rubies verifies legitimate incoming funds | reconciliation.js simulator/readiness | Verified agreement/webhook/auth/credentials not supplied | externalblocked |
| P14.04 | §14 exceptions | Partial/excess/late/failed/reversed/unmatched records resolve explicitly | reconciliation.js; I payments/refunds | Simulator/PG exception cases; operator resolution completeness/live settlement unverified | unverified |
| P14.05 | §14 events | Duplicate/out-of-order events cannot double credit | reconciliation.js | Schema-validated simulator replay/reorder PG; actual signed callback contract unavailable | unverified |
| P14.06 | §14 money | Integer minor units/explicit rounding/currency conserved | C; D; pricing.js | Unit rounding + PG tax/refund/bill conservation | implemented |
| P14.07 | §14 ledger | Immutable balanced postings and compensating reversals | schema.sql; D; I; cancellation/deposit/writeoff modules | PG DB immutability/balance/recognition tests | implemented |
| P14.08 | §14 reconciliation | Match internal records with actual provider transactions/settlements | reconciliation.js | Local simulated projection; real reconciliation contract/data unavailable | externalblocked |
| P14.09 | §14 separation | Distinguish sales/collections/entitlement/fees/refunds/settlement | D report; reconciliation.js; W/ReportDetails.tsx | PG taxes/refunds/deposits/writeoffs; full UI accounting walkthrough pending | unverified |
| P14.10 | §14 credentials | Browser never receives provider secrets | providers disclosure; server env boundary | Security tests/readiness; live credentials absent, full secret/log audit pending | unverified |
| P14.11 | §14 wallet | Approved business/wallet/VA ownership and branch structure verified | Provider readiness only | Rubies agreement/capabilities and approvals missing | externalblocked |
| P14.12 | §14 withdrawals | Scoped audited withdrawals/account changes require valid authorization | No money-moving integrated workflow | Provider capabilities/approval absent; local highrisk workflow also not implemented | missing |
| P14.13 | §7/14 refunds | Requester differs from approver with pending/reject/record flow | refund-requests.js; I direct refunds; W/RefundRequests.tsx | Leaf tests exist; module/permission/refundRequestId integration missing | missing |
| P15.01 | §15 proposal | Configurable proposed13500/onebranch, no unlimited promise | C; I policy; marketing | Nullable prices/trial/grace bounds; proposed disclosure; no final approved public offering | implemented |
| P15.02 | §15 fee basis | Payment origin, not order channel, determines integrated fee | reconciliation.js; I payment snapshots | PG manualfee0, source attribution and policy snapshot | implemented |
| P15.03 | §15 approval | Fee payer/base/round/refund/cost/dates retained historically | platform.js; I policySnapshot; pricing.js | PG proposal vs approved snapshot; manual and simulator only | unverified |
| P15.04 | §15 invoice | Invoice/history reflect approved immutable commercial snapshot | operations.js; W/Invoices.tsx | PG approved-price vs laterproposal regression; no actual debit | implemented |
| P15.05 | §15 restrictions | Trial/grace/suspension restrict new actions, preserve paid service/exports | subscriptions.js; I; feature-flags.js | Pure boundary + PG paid continuity/flags/replay tests | implemented |
| P15.06 | §15 collection | Subscription charges and fee collection execute with consent | Disabled provider liveBilling | Approved terms/provider recurring debit capability/consent unavailable | externalblocked |
| P16.01 | §16 opening | Shift captures float and only eligible active branch staff | I shifts; shifts.js; W/OrganizationWorkspace.tsx shifts section | PG oneactive/user and scoped workflow | implemented |
| P16.02 | §16 cash | Reasoned idempotent cash movements reconcile expected/count variance | I cashmovements; W financial journal | PG duplicate/stale/variance; UI exact uncertain retry | implemented |
| P16.03 | §16 approval | Manager variance approval/handover records actors | shifts.js; W shifts | Unit/PG approval/handover; full cashier visual task pending | unverified |
| P16.04 | §16 tradingday | Timezone/cutoff incl DST selects correct day | D report; queries.js | PG23/25h DST and full/date differential; cutoff tests | implemented |
| P16.05 | §16 definitions | Distinguish ordervalue/grosssales/discount/tax/fee/refund/net/collections/debt | D report; W/ReportDetails.tsx | Recognition timestamps, explicit ex-tax/null legacytax, product qty tests | implemented |
| P16.06 | §16 quantities | Quantities/staff/payment/state summaries match recognition basis | D report; W reports | Unit/PG recognized vs cancelled and totals; business accountant review pending | unverified |
| P16.07 | §16 exports | Authorized dated export durable/scoped, revocation rechecked | operations.js; queries.js; W/ExportJobs.tsx | PG worker lease fencing/artifact download/permission recheck | implemented |

## Printing, customer care, integration and platform

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P17.01 | §17 studios | Branded receipt/sticker layouts have supported width and previews | I templates; W/PrintStudio.tsx; PrintDocument.tsx | Template/preview source exists; full layout samples/tax/payment/context verification missing | unverified |
| P17.02 | §17 paid documents | Fully actual-paid order generates one receipt and perunit labels | printing.js; I enqueue paths | Newly mounted after last PG; bill/direct/deposit/duplicate paths not actually rerun | unverified |
| P17.03 | §17 queue | Routing/queue/retry/reprints independently audited | I print jobs; printing.js; W/PrintStudio.tsx | Prior queue APIs; latest immutable paid snapshots/reprint flags not rerun | unverified |
| P17.04 | §17 browser | Preview/dialog submission does not claim physical output | W/PrintDocument.tsx; printing.js browser-submission | UI dialog explicit; audit route mounted post-PG, consumer coupling unverified | unverified |
| P17.05 | §17 silent | Supported localbridge install/calibration explicit if selected | Legacy server/worker.js, RUNBOOK.md | Legacy bridge is not a verified Mera hosted tenant bridge | missing |
| P17.06 | §17 hardware | Receipt/sticker correct on actual selected devices | No attached test hardware | Models/connectivity/paper/labels/driver/calibration not physically established | externalblocked |
| P18.01 | §18 feedback | Completed own order/visit permits rating/text | I feedback; customer-followup.js; U | Scoped feedback/privacy tests; full visit completion rating variant review pending | unverified |
| P18.02 | §18 complaints | Category/status/resolution managed without leaking sensitive notes | operations.js; W/Operations.tsx; U/GuestActivity.tsx | Complaint own-session/history tests; complete sensitive-note abuse audit pending | unverified |
| P18.03 | §18 accountability | Complaints assigned/escalated to appropriate handler | operations.js complaint handler primitives | No complete eligible-assignee/escalation integrated workflow identified | missing |
| P18.04 | §18 customerrecords | Organization staff view branch-scoped activity/consent | workspace-admin.js; qr.js consent | Leaf5tests; customer list/detail API module unmounted | missing |
| P18.05 | §18 retention/abuse | Retention and abuse procedures govern customer records | help.js limits; security middleware; legal prep | Some limits; complete retention/support enforcement not implemented | missing |
| P18.06 | §18 reviews | Publication is deliberate moderated feature | No public complaint dump identified | Safe nonpublication; no reviewed publishing/moderation workflow | missing |
| P19.01 | §19 credentials | Scoped hashed revocable integration credentials | zidi.js; W/Integrations.tsx | PG branchscope/revocation/auth checks | implemented |
| P19.02 | §19 contract | Versioned menu/quote/order/status/reservation simulator shares web rules | zidi.js; C; pricing.js | PG credential quote/stock/capacity/terms; labeled nonprod | implemented |
| P19.03 | §19 limits | Integration idempotency/rate/source attribution enforced | zidi.js; server/mera-security.js; I | Simulator contract/PG tests; real load profile unverified | unverified |
| P19.04 | §19 outbound | Actual Zidi signed outbound events use supported contract | zidi.js readiness | Authorized partner event/signature contract not supplied | externalblocked |
| P19.05 | §19 payments | Supported integration payment initiation verifies via common provider | Disabled live provider | No independent integration confirmation; provider support/credentials unavailable | externalblocked |
| P20.01 | §20 directory | Operator browses organizations/branches/contacts/onboarding | platform.js; Platform.tsx | PG authorized directory; full useful navigation/responsive audit pending | unverified |
| P20.02 | §20 subscription | Operator reviews subscription/invoices/provider/wallet states | platform.js; Platform.tsx | Core statuses and proposals exist; actual wallet live state blocked | unverified |
| P20.03 | §20 lookup | Audited exact reference lookup excludes unnecessary customer data | platform.js; Platform.tsx | PG orgscope/reason/audit; aliases latest UI pending | implemented |
| P20.04 | §20 finance | Processed volume/fee lifecycle/cost/net revenue reflect evidence | platform.js; reconciliation.js; Platform.tsx | Simulator metrics and distinctions; no real collected/settled provider figures | unverified |
| P20.05 | §20 health | Operators see exceptions/integration/jobs and backup readiness | platform.js; operations.js; Platform.tsx | DB signals/backup metadata source; complete usable queue drilldowns missing | unverified |
| P20.06 | §20 support | Versioned support cases separate private notes/customer replies | platform-support.js; Platform.tsx; W/SupportCases.tsx | Unit/PG scope/replay/private-note/stale tests | implemented |
| P20.07 | §20 controls | Audited new-action flags/suspension/restoration preserve active paid work | feature-flags.js; subscriptions.js; Platform.tsx | PG flags/replay/continuity; UI controls retain reason requirements | implemented |
| P20.08 | §20 supportaccess | Restricted support access is audited, never implicit impersonation | platform.js support-access; Platform.tsx | Configuration-only support; no impersonation implemented or claimed | implemented |
| P20.09 | §20 audit | Privileged financial/support/config actions expose audit history | I event; platform.js; Platform.tsx | Append-only audit source; full actor/detail/filter UX not verified | unverified |
| P20.10 | §20 identity | Mera marketing/platform have selected enterprise visual identity | Marketing.tsx; Platform.tsx; related CSS | Three concepts awaiting user selection; current long-page UI not accepted direction | missing |

## Security, reliability, accessibility, delivery and launch

| ID | PRD source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| P21.01 | §21 authorization | Every mutation/read enforces tenant/branch/permissions | I guard; leaf guards; server/app.js | Broad PG denial tests; new unmounted/unverified leaves separately identified | unverified |
| P21.02 | §21 sessions | Secure sessions/secrets and CSRF/browser protections | server/mera-security.js; app.js; platform.js; identity.js | Security/session/TOTP tests; actual HTTPS hosting cookie review pending | unverified |
| P21.03 | §21 input | Validated payloads/uploads and bounded sensitive traffic | C; assets.js; security middleware | Schema/upload tests; full hostile/load audit not performed | unverified |
| P21.04 | §21 logs | Logs redact credentials and unnecessary personal information | server error/log paths; RUNBOOK.md | No comprehensive current-tree log redaction test inventory identified | unverified |
| P21.05 | §21 jobs | Durable jobs have bounded retry/deadletter/lease fencing | operations.js; scripts/mera-worker.js | PG stale lease and commit authorization checks; worker hosting unverified | implemented |
| P21.06 | §21 migration | Versioned migrations evolve isolated schema without legacy mutation | schema migrations; scripts/test-mera-postgres.js | PG/recovery migration tests; production migration not executed | implemented |
| P21.07 | §21 backups | Opt-in encrypted scheduled backups enforce retention/fencing | server/backup.js; backup-policy.js; worker | Encryption/policy/lease tests; actual schedule/cloud transfer not executed | unverified |
| P21.08 | §21 restore | Backup restores schema/data/finance/images/MFA correctly | scripts/mera-restore-rehearsal.js; mera-recovery.test.js | Historical23table isolated hash/tamper rehearsal reported; latest aliases newtable not rerun | unverified |
| P21.09 | §21 monitoring | Hosting alerts cover stuck orders/payment exceptions | platform signals; RUNBOOK.md | Local query signals exist; actual external monitoring/alert routing not configured | externalblocked |
| P21.10 | §21 runbooks | Operators can follow incident/outage/restore procedures | docs/mera/RUNBOOK.md | Draft procedures exist; target-host drill not completed | unverified |
| P21.11 | §21 reconnect | Reconnect refreshes canonical state and ignores stale scope responses | U/client.ts; W/api.ts; workspace; Platform.tsx | Stale denial/epoch tests; representative reconnect browser drill pending | unverified |
| P21.12 | §21 simultaneous | Stale/concurrent writes cannot oversell/overbook/misallocate | I locked; versioned leaf modules | Actual PG stock/capacity/bill/deposit/lease invariants | implemented |
| P21.13 | §21 WCAG | Primary workflows meet WCAG2.2AA keyboard/focus/contrast | all React/CSS; UI progress tracker | Narrow pilot keyboard; signup focus tests; complete contrast/dialog/role audits missing | unverified |
| P21.14 | §21 responsive | All primary roles work desktop/tablet/narrow touch | W/U/Platform/Marketing CSS | captures01–17 only selected states; no broad module completion | unverified |
| P21.15 | §21 states | Loading/empty/error/retry stay meaningful across primary workflows | signup/workspace/customer consumers | New signup and management/customer batch12pass; coverage incomplete elsewhere | unverified |
| P21.16 | §21 performance | Menu usable within3seconds on representative mobile | Route splits; U | Small loopback readprofile only, no representative mobile measurement | unverified |
| P21.17 | §21 latency | Internal operations mostly<2seconds, updates<3seconds | APIs/polling/bounded queries | Query tests not latency proof; actual environment benchmark missing | unverified |
| P21.18 | §21 scale | Written load profile and measured supported capacity | BOARD.md smallprofile; queries budgets | No production-size mixed-write/WAN capacity validation | unverified |
| P22.01 | §22 entities | Entity boundaries preserve listed business invariants | schema.sql; generic mera_records; specialized tables | Generic records acceptable; no requirement one table/entity; omissions captured by feature rows | unverified |
| P23.01 | §23 sequence | All included modules remain in scope through release preparation | BOARD.md; this inventory | No acceptance gate inferred from sequence/checkpoint labels | implemented |
| P24.01 | §24 assessment | Existing code/UI/localWindows dependencies assessed | ARCHITECTURE.md; UI-PRESERVATION.md; original captures | Original source and authentic pilot evidence recorded | implemented |
| P24.02 | §24 migration | Historical Bing Chun financial data safely reconciles | legacy-import.js; scripts/mera-migration-rehearsal.js | Isolated fixture only explicitlegacy_paid_basis; no actual production history cutover | unverified |
| P24.03 | §24 isolationgate | Jobs/files/exports/events/cache tenant isolation proven | PG; hosted-boundary/security tests | Strong partial evidence; complete event/cache/targethost threat validation missing | unverified |
| P24.04 | §24 ordergate | Complete staff/customer order same rules and clear actor trail | I; W/StaffPos.tsx; U | Backend tests+selected browser catalog controls; full real-task E2E gate remains | unverified |
| P24.05 | §24 financialgate | Representative tradingday reconciles every included financial category | D; PG; report UI | Many isolated invariants; single reconciled operator E2E acceptance artifact missing | unverified |
| P24.06 | §24 domainsgate | Actual organization URLs/QR/TLS route safely on host | domains.js; qr.js; aliases | Authorized target-domain environment absent | externalblocked |
| P24.07 | §24 networkgate | Internet loss/recovery and job outage exercised | U/W clients; operations.js | Unit/API retry evidence, not realistic outage/latency E2E evidence | unverified |
| P24.08 | §24 providersgate | Actual integrations authorized or exact blockers documented | zidi/reconciliation readiness; RUNBOOK.md | Blockers documented; actual access/approval not supplied | externalblocked |
| P24.09 | §24 printergate | Supported receipt and sticker output physically calibrated | Printing paths and legacy worker | No hardware; queued/submitted cannot satisfy physical gate | externalblocked |
| P25.01 | §25 commercial | Additionalbranch/fee/trial/grace decisions explicitly approved | PolicyEditor; platform approval; subscriptions.js | Configurable/nullsafe; business approval/live terms remain | externalblocked |
| P25.02 | §25 compliance | Retention/tax/disclosures decided by responsible business/legal/accounting owner | LegalInformation; report taxunknown disclosures | No final decisions supplied; local retention tooling separately missing | externalblocked |
| P25.03 | §25 offline | Offline continuity level explicit, no assumed full sync | client errors/journals; RUNBOOK.md | Honest degraded approach; no full offline sync implemented or promised | implemented |
| P26.01 | §26 sources | External links are discovery, not capability approval | RUNBOOK.md; provider disclosures | No fetched public document treated as authorization or settlement proof | implemented |

## Marketing and signup (PRD §2/3/5/6; build Agent A)

| ID | Source | User-observable outcome | Implementing paths | Evidence / remaining work | Classification |
|---|---|---|---|---|---|
| MKT.01 | §3 marketing | Features/service modes/demo entry explain actual product | marketing/Marketing.tsx | Existing static page/links; selected direction and browser review pending | unverified |
| MKT.02 | §15 pricing | Unapproved prices/fees never appear final or unlimited | marketing/Marketing.tsx | Explicit proposed13500/0.1% text, unresolvedadditionalbranch terms | implemented |
| MKT.03 | build AgentA legal | Legal information is honest preparation, not fabricated final terms | Marketing.tsx LegalInformation | Actual provisional content; business/legal signoff external | implemented |
| MKT.04 | §5 signup | Failure/retry/unsupported capability has accessible focus and no fake registration | src/mera/Signup.tsx | signup + signup-ui actual4/4pass; full integration batch12/12 twice | implemented |
| MKT.05 | §6 visual | Marketing/platform use selected shared enterprise identity | marketing.css; platform.css; signup.css | Direction selection pending; no visual change implemented in this pass | missing |

## Build-prompt execution requirements

These are delivery obligations, not additional customer-product features. No product percentage combines them with the UI tracker.

| ID | Prompt heading | Observable obligation | Evidence / gap | Classification |
|---|---|---|---|---|
| B01 | Mission/source of truth | Complete PRD/prompt read; later user corrections override | Full sources reread for inventory; UI direction correction recorded above | implemented |
| B02 | Execution rules1–3 | Integrated slices reuse existing project | ARCHITECTURE; original code reused; unmounted leaves explicitly excluded | unverified |
| B03 | Execution rules4–5 | No fabricated provider/test/print claims; simulator nonprod | Readiness flags and production guards; latest unverified edits called out | implemented |
| B04 | Execution rules6–7 | Independent work continues; production/money/data changes require approval | Current task docs only; provider/live deployment off | implemented |
| B05 | Team/file ownership | Up to4agents, named owners, avoid overlapping writes | BOARD and coordinator messages; current doc solely this agent | implemented |
| B06 | Initial assessment | Architecture, migration, decisions, contracts, UI and board docs | docs/mera/{ARCHITECTURE,DECISIONS,CONTRACTS,UI-PRESERVATION,BOARD,ACCEPTANCE}.md | implemented |
| B07 | Shared checkpoint | Executable IDs/permissions/money/time/state/snapshot/retry contracts | C + scoped modules; current leaf integration gaps remain | unverified |
| B08 | Communication | Contract readiness differs from integrated DONE | Board evidence can become stale; this doc corrects mounts/tests vs claims | unverified |
| B09 | Phase1 gate | Auth/tenant contracts and shared UI across shells | API evidence strong; all-surface UI not verified | unverified |
| B10 | Phase2 gate | Full order loop, concurrency, handler and station routing | PG tests; full current UI acceptance flow pending | unverified |
| B11 | Phase3 gate | Table turnover, capacity, split/partial/deposit conservation | PG evidence; perguest and split uncertain retry incomplete | unverified |
| B12 | Phase4 gate | Payments/reconciliation/refund/fees verified with honest live disable | Local simulator and ledger; requestapprove unmounted/liveprovider blocked | unverified |
| B13 | Phase5 gate | Reconciled daily operations and contract-tested Zidi | Backend primitives; full-day acceptance artifact, full print integration pending | unverified |
| B14 | Phase6 gate | Accessibility/reconnect/recovery/load/hosting/hardware release review | Multiple explicit code, verification and external gaps remain | unverified |
| B15 | Testing expectations | Meaningful auth/concurrency/finance/state/E2E tests | Many focused tests/PG; this assessment does not rerun full suite | unverified |
| B16 | Final delivery | Startup/config/seed/architecture/checks/blockers/release artifacts | RUNBOOK and docs exist; full release acceptance not complete | unverified |

## Concrete next evidence, without expanding the authorized UI task

1. Owner integrates and actually PG-verifies uniform printing/alias paths, including direct/bill/deposit settlement, duplicate attempts, changed intent, old alias and canonical cookie continuity. Review zero/part-refunded settlement and old order-line identifier cases explicitly. Do not imply the current doc performs this work.
2. Owner mounts/administers the workspace-admin, refund-request and typed-stock leaves, then tests their real SQL, tenant/branch roles, stale stock, refund requester/approver separation and exact retries. Until then consumers are incomplete.
3. Complete perguest splitting and fenced/versioned bill split/merge, approved substitutions, complaint assignment/escalation, customer verified history/retention, and staff highrisk step-up. These are local code gaps, not missing credentials.
4. Select Mera identity; continue the frozen UI correction task list with original-style operational layouts and separate enterprise marketing/platform. Real screenshots/tasks, keyboard/contrast/narrow checks determine UI evidence; backend tests do not contribute UI credit.
5. Obtain actual provider/hosting/policy/hardware artifacts separately; perform approved target-environment recovery/load/outage and physical print calibration before release claims.

No overall product completion percentage is stated. Atomic rows provide a reviewable denominator proposal, but scope decomposition/evidence must be coordinator-reviewed before deriving any score; repeated cross-cutting launch gates are intentionally not additive product work. The independent UI tracker remains the sole authority for its own weighted visual-correction progress.
