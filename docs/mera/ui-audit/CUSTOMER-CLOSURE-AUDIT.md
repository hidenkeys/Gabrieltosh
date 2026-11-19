# Customer menu and checkout closure audit

19 November 2026. Source baseline `7156558`. Read-only workflow assessment plus scoped regression; no new browser inspection, order, payment, print or provider operation was performed for this audit. Lead owns browser verification and tracker reconciliation. This document supersedes outdated remaining-work statements only where a later named checkpoint provides evidence; it does not replace the historical audit.

## Scope and checkpoint decision

| Task | Current frozen checkpoint | Evidence-backed position | Requirement to close |
| --- | --- | --- | --- |
| C1 menu and persistent basket, weight 6 | 80, IN_PROGRESS | Implemented, integrated and visually compared at narrow/tablet/desktop; source-driven original imagery, categories, search, customization and basket navigation retained | Lead signs off final current-build state/keyboard matrix below; document outstanding malformed/missing-photo and long-content coverage accurately |
| C2 checkout, recovery, tracking and receipts, weight 5 | 60, IN_PROGRESS | Native validation, local checkout errors, real unpaid submission/tracking, original-attempt recovery and readable status/history exercised in documented subsets | Current-build end-to-end walkthrough plus timed-charge/uncertainty and paid-receipt browser fixtures; do not award 80/100 from unit tests or the unpaid walkthrough alone |

The tracker remains `MERA_UI_PROGRESS.json`/`.md`; only the lead changes checkpoints. No task weights or overall percentage are changed here. Existing unpaid orders, isolated money fixtures and browser print dialogs are distinct from live payment/physical output acceptance.

## Source and interface map

- `src/mera/customer/CustomerExperience.tsx`: published menu, search/category controls, persistent basket, controller validation, server quote review, submit/recovery, private tracking and isolated printable receipt.
- `CustomizationDialog.tsx`, `customization-dialog.css`, shared `src/mera/ui/useDialogFocus.ts`: controlled size/options presentation and keyboard lifecycle. Parent retains required/max constraints and stock/price state.
- `checkoutRecovery.ts`: bounded tab-session journal, exact intent and original review, canonical cookie-backed guest `sessionRef` binding. Reference is not authentication. No automatic POST on restore.
- `quoteClock.ts`: conservative HTTP Date precision plus full RTT and monotonic elapsed time. Missing timing fails closed for expiring reviews; uncertain replay keeps its original quote/key.
- `SessionOrders.tsx`: branch/session history, canonical order selection, explicit end-session confirmation. Reads reject malformed successful pages rather than rendering false empty/crashing; auth failures clear private rows. Confirmation focuses its heading; Keep restores its trigger.
- `orderPresentation.ts`: customer-readable status/activity and branch-labelled timestamps. Unknown values do not become raw internal status labels.
- `customer.css`/`checkout.css`: existing organization theme and 44px customer targets, responsive basket, receipt-only print boundary.

Existing API dependencies only:

| Journey | Existing endpoint | Safety boundary |
| --- | --- | --- |
| Browse | GET `/public/:slug/:branchId/menu` | Published product/category snapshot; browse does not require guest creation |
| Establish/recover current guest | POST `P/guests`, GET `P/guest` | HttpOnly organization-scoped cookie; canonical sessionRef required before stored-intent writes |
| Review configured charges | POST `P/quote` | Server totals and policy version; no client-generated payable charge |
| Submit/retry | POST `P/orders` | Original body/requestKey/menuVersion/quoteId preserved across uncertainty |
| Resolve original attempt | GET `P/order-attempts/:key`, POST same `/abandon` | Absence is not rejection; authoritative abandoned state fences a late original. An accepted order wins without cancellation/refund |
| Follow/open history | GET `/public/orders/:id`, GET `P/guest-orders` | Cookie ownership and current venue header; no name/table-number lookup |
| End own session | POST `P/guest/end` | Explicit confirmation; no order cancellation, table closure or refund; other venue sessions remain separate |
| Customer print | `window.print()` on paid receipt | Device print options only, no venue reprint job or physical-success assertion |

`P` denotes the current public venue/branch prefix. No staff receipt endpoint is exposed to guests.

## Prior actual evidence retained

1. `PILOT-CHECKPOINT-2026-11-18.md`, captures12–15 and `customer-comparison-current.html/.jpg`: immediate menu, no-match clear, categories, persistent basket, no basket/submit overlap, tablet/narrow layout. Earlier viewport measurements433×938 and926×1326 were Chrome-zoom-dependent; use the documented exact capture sizes rather than relabeling them390px.
2. `SHARED-SHELL-CHECKPOINT.md`, screenshot39: synthetic unpaid M-E4DC42B8, ₦1500, reopened after session refresh/full reload. Payment remained unconfirmed; receipt print absent.
3. `CUSTOMER-CHECKOUT-CHECKPOINT.md`, before155/after163, phone165/tablet166, tracking164: default basket comparison, missing-name focus, required/max options, size-only price, QA-only serif/color configuration and restored branding. Unpaid M-3936D5E8 total₦2300. Stock conflict159 retained original attempt, authoritative check/stop; no money/refund.
4. `FRONTDESK-PUBLIC-CHECKPOINT.md` and `SHARED-DIALOG-CHECKPOINT.md`: customization extraction and shared modal lifecycle; the latter is not certification of every long modifier/theme combination.
5. `RECORDS-PRINT-HELP-CHECKPOINT.md`: narrower receipt/history layouts and request/reply privacy evidence. These are not a paid receipt browser print-preview certification.
6. Current history/focus closure is documented in `UI-CLOSURE-WORKBOARD.md` and tracker history; do not conflate all workspace screenshots282–288 with customer-only evidence.

## Safe current-build QA3007 walkthrough for the lead

Use only the existing disposable frontdesk instance at `http://127.0.0.1:3007` (database55444). Preserve existing immutable QA records. Do not use3002/store data. Obtain the actual published public-menu link from this QA organization's current QR/menu admin screen; retain its slug/branch identifier rather than guessing a private ID. No sign-in credentials are documented here.

1. Open that public menu in a dedicated tab. Confirm venue/branch and actual product photos before choosing anything. Record viewport390×844,834×1194 and the agreed unchanged desktop viewport for comparisons. Measure document width, not only a screenshot crop.
2. Browse before entering a name. Search `Fresh Lemonade`; verify the actual published item and displayed price. If absent/unavailable, stop this fixture-dependent path and choose a clearly available existing item; record its actual name/price. Do not alter stock/menu/pricing merely to force the path.
3. Check a no-match search, Clear search, and category return. Add one item. On phone, use View basket. Verify quantity/name/price and that no fixed shortcut covers the submit control. Back to menu should focus search and preserve the basket. Return to basket.
4. With blank name, activate Submit order (or Review total if actual policy requires review). Native validation should focus Your name and provide the local hint/error; there must be no new order. Fill a clearly synthetic name such as `UI closure unpaid QA` and note `Synthetic UI check; no payment` using the visible form. Choose the actual counter-pickup option; do not join a private table.
5. If the actual current branch uses server review, activate Review total and inspect every returned adjustment/total before Send order. If it does not, the ordinary Submit order path is appropriate. Do not enable a new policy or infer absent tax/service charges. Take the pre-submit capture with final name, note, quantities and total visible.
6. Deliberately submit once. This creates a synthetic **unpaid** order and may reserve configured stock; it is not a money action. Record the returned public reference and displayed total. If the result is uncertain, do not create another basket: use Check original order, retain original intent, and follow the explicit recovery instructions. Do not call absence failure.
7. Confirm Your order receives focus, shows reference, Sent to the venue (or actual newer server state), Payment not yet confirmed and branch-labelled Placed time. Recorded payments should reflect actual canonical data; for this new unpaid fixture it should be₦0. Check lines/size/options/note where displayed, total and outstanding. Do not mark paid or collected to obtain a prettier screenshot.
8. On the same cookie session, use Your recent orders → Refresh session orders → Open order for the new reference. Confirm canonical order fetch returns that reference, then reload and recover through history again. No name-based search or new order POST should occur. Verify keyboard focus on End guest session… → confirmation heading → Keep this guest session → trigger; do **not** terminate this QA guest while another unresolved intent exists.
9. On unpaid tracking, verify Print payment receipt is absent. This is the correct end-to-end no-money receipt boundary, **not** a paid receipt test. No device dialog or venue printing occurs.
10. Capture final phone/tablet/desktop states and review them against the matching previous capture. Record real console/application errors separately from unrelated browser extensions. Preserve the synthetic order as QA history; no destructive cleanup or payment/refund.

## Remaining acceptance matrix

| Check | Existing source/test evidence | Browser fixture/action still required |
| --- | --- | --- |
| Catalog loading/error/unpublished/paused/no-match | `mera-customer-ui-correction.test.tsx` | Current narrow keyboard/error-state pass; fixture pause/unpublish only in explicitly approved isolated test branch |
| Required/min/max/sold-out variants and modifier labels | checkout/customization tests; actual required1-of-1 and sold-out Large checkpoint | Long/many groups and touch/keyboard matrix; stock remains authoritative at submit |
| Name/empty/paused direct handler guard | `mera-customer-checkout.test.tsx` | Missing-name focus already seen; repeat current native form as above |
| Quote charges/expiry/background tab | quote-clock, checkout, correction tests | Approved isolated branch pricing fixture with HTTP Date and real expiry; no real payment needed, no automatic re-review/POST |
| Unknown POST → refresh → exact replay | recovery/correction tests, realPG attempt contracts | Controlled dropped-response browser harness; same cookie proof and immutable original body/key; no second accepted order |
| Wrong/expired guest, branch switch, storage failure | recovery tests, scoped history tests | Controlled isolated multi-session browser fixture; missing proof must hide saved private review and block new writes |
| Tracking transient failure/auth denial | scoped polling tests/history tests | Controlled safe failed GET; last confirmed state versus hidden denied state; no stale cross-venue painting |
| Paid/part-paid/refunded/written-off receipt | canonical source/DOM assertions, receipt-only print CSS | Existing authorized synthetic saved paid fixture. Inspect device preview/cancel only: correct totals/adjustments/returns, long wrapping, and no history/help/session UI in printed output. Do not record money to satisfy this UI check |
| Second organization branding/photo fallback | branding helper + source/theme tests; QA color/font subset | Existing second-organization public fixture, actual logo/photos and no Bing Chun mascot leakage; no new invented brand |

Unknown/missing legacy monetary fields deserve a focused fixture review: current tracking passes defaults for some absent paid/line amounts. The canonical live DTO normally supplies these numbers; this audit has not demonstrated a live missing-field defect and does not authorize changing ledger or receipt amounts. A malformed fixture must never be accepted as proof of a real payment.

## Outcome and boundaries

No new demonstrated UI blocker beyond the already integrated recent-orders robustness/focus correction was found during this source consolidation. No customer source change was necessary for this audit. C1 stays80 and C2 stays60 pending lead evidence; neither is declared complete. Live providers/email/domains/physical printer calibration remain production gates, while controlled browser UI fixtures above remain ordinary implementation acceptance work rather than credential excuses.

## Executed regression for this audit

`node --import tsx --test` on customer UI-correction, checkout, recovery, quote-clock, session-orders and order-presentation files: **51 passed, 0 failed, 0 skipped**, actual log `/tmp/mera-customer-closure-audit-tests.log`. This is DOM/unit evidence only; no browser viewports, timed real-server quote or physical receipt result is inferred.
