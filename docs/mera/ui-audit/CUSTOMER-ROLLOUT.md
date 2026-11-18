# Customer rollout: journey, recovery and acceptance inventory

Date: 18 November 2026. UI baseline: scope 1.0. Workstream: C.

This is a source review and rollout plan, not approval of broader layouts or proof of browser acceptance. Customer components are frozen while the lead completes Q1, the four-surface visual gate. Only this document was added for this task. The lead owns browser captures, shared shell/tokens, integration and completion accounting.

## Scope and design authority

The frozen allocation remains C1 menu/cart 6, C2 checkout/tracking/receipts 5, C3 visits/bills/help 4, C4 reservations/activity/consent 3, C5 customization/theming 2. Existing backend work does not earn UI correction credit.

Use the project [mera-ui skill](../../../.agents/skills/mera-ui/SKILL.md), verified Bing Chun Counter in `src/App.tsx`, its effective `src/styles.css` cascade and real `ProductImage` mappings. Retain organization branding and contrast safeguards. Marketing/platform direction remains the lead's selected reference; do not propagate that layout into customer ordering.

Existing lead-owned pilot captures are [desktop](screenshots/12-customer-desktop.jpg), [narrow menu](screenshots/13-customer-narrow-menu.jpg), [narrow basket](screenshots/14-customer-narrow-basket.jpg) and [tablet](screenshots/15-customer-tablet.jpg). They are not proof of all checkout, recovery, dialog or reservation states. Subsequent dialog accessibility changes still need browser review.

## Routes and ownership

The customer entry is `/mera/menu/:slug/:branchId` or `/mera/store/:slug/:branchId`, optionally with `?tableId=...`. Menu, basket, tracking, visits, reservations and help are in-component views, not independent URLs.

| Surface | Current implementation | Main responsibility |
| --- | --- | --- |
| Menu/cart/checkout/tracking/receipt | `src/mera/customer/CustomerExperience.tsx` | Main view state, frozen checkout intent, price review, current order/visit polling |
| Categories | `src/mera/customer/categories.ts` | Published category ancestry and legacy fallback |
| Session order list/end | `src/mera/customer/SessionOrders.tsx` | Guest-scoped history pagination, fresh order fetch, explicit session-ending confirmation |
| Reservations/feedback history | `src/mera/customer/GuestActivity.tsx` | Activity summaries and cancellation requests |
| Venue help | `src/mera/customer/HelpRequests.tsx` | Own help requests, private context and uncertain retry |
| Optional marketing preference | `MarketingPreference` in `CustomerExperience.tsx` | Explicit current-session consent choice |
| Feedback submission | `Feedback` in `CustomerExperience.tsx` | Completed-order rating/category/text |
| Transport | `src/mera/customer/client.ts` | Fifteen-second full-response timeout, cookies, explicit venue hint, no automatic retry |
| Styling | `src/mera/customer/customer.css` | Scoped customer styles and browser print rules |
| Shared read-only dependencies | `src/mera/branding.ts`, `src/ProductImage.tsx`, `src/brand.ts` | Approved theme values, readable contrast and existing photography |

Do not change pricing, permissions, stock, payment/settlement calculations, visit authorization or publication rules as part of layout work. Missing endpoints are dependencies to agree with the lead, not permission to invent successful responses.

## Existing API contracts

Below, `P` means `/api/mera/v1/public/:slug/:branchId`. All private responses require the valid server guest session. The organization header is a routing hint, not authorization.

| Journey | Existing endpoints | Invariants to preserve |
| --- | --- | --- |
| Discover a venue | `GET P/menu`; `GET /api/mera/v1/public/organizations/:slug/branches` | Anonymous browsing; only published eligible menus/branches; public table context grants no bill access |
| Begin a guest interaction | `POST P/guests`; `GET P/guest` | Display name is not durable identity; scoped HttpOnly cookies; no name/table lookup of private history |
| Review prices | `POST P/quote` | Guest required; server validates menu/items and returns complete monetary breakdown and expiring quote |
| Submit/track order | `POST P/orders`; `GET /api/mera/v1/public/orders/:id` | Stable request key, original quote/body, server pricing/stock and private ownership |
| Recover own orders | `GET P/guest-orders?take=20&cursor=...` | Maximum take 30; scoped cursor; returns public-order projection, not an arbitrary person's history |
| End guest access | `POST P/guest/end {}` | Explicit confirmation; expires this organization session only; does not cancel orders, close visits or confirm refunds |
| Join a visit | `POST P/visits/terms`; `POST P/visits/join` | Current code and one table/visit context; terms check grants no membership; acknowledge original policy/version before joining |
| Read private bill | `GET /api/mera/v1/public/visits/:id` | Cookie plus membership; canonical bills/balance and original minimum-spend summary; no previous-party access |
| Reserve | `POST P/reservations` | Capacity/window/deposit/minimum-spend checks; original acknowledgement/version; table preference remains subject to server checks |
| Review/cancel reservation | `GET P/activity`; `POST P/reservations/:id/cancellation` | Own session only; a deposit may require staff review; cancellation request is not refund confirmation |
| Ask venue for help | `GET/POST P/help-requests` | Exact replay; maximum three unresolved requests; own order or joined live visit context only; no external delivery |
| Give feedback | `POST /api/mera/v1/public/orders/:id/feedback`; `GET P/activity` | Own completed/collected order; one feedback per order; private by default |
| Marketing preference | `GET/PUT P/consent` | Optional explicit choice, separate from transactions; no contact verification or delivery claim |

## User journeys and next layout boundaries

### C1: discover, search, customize and reach the basket

Current pilot provides compact venue/branch context, real photos, category IDs with legacy fallback, search recovery, sold-out/paused states and mobile basket access. Opening or scrolling into the basket hides the fixed shortcut; Back to menu restores search focus. Customization has named controls, required-group error focus, inert background, contained scrolling and a persistent action.

Preserve this behavior through C2 extraction. Do not reintroduce a full catalog scroll before basket access, duplicate overlapping CTAs or a required name before browsing. Long product, variant, option, branch and organization names require actual narrow-browser checks. Current source tests do not measure layout geometry or screen-reader output.

### C2: review complete price, submit once, understand the result

The intended journey is basket review → useful guest details/fulfillment → server charge review when enabled → deliberate submit → stable reference and tracking → receipt/history.

Current checkout captures the full order body before guest/order awaits and locks editing in the mounted page. It stores request key, quote ID, menu version, guest name, fulfillment/visit, item quantities/variants/modifiers and note. It prevents repeated in-flight taps. An unknown outcome preserves that body for the explicit original retry. The retry can remain available even when a refreshed menu changes or is paused. No client price calculation authorizes a charge.

The next layout should separate item review, complete totals and the one appropriate next action without burying required information in notices. Replace technical implementation copy with an actionable venue/payment explanation. Preserve genuine uncertainty. Raw state keys may receive readable labels, but independent order/payment/settlement states must remain distinct.

Tracking polls every three seconds and refreshes online; the displayed reference and last confirmed state must remain clear during interruption. Outstanding, effective settlement, refund and write-off fields are server-authoritative. A write-off must never be described as money received. Session history permits reopening earlier own orders with a fresh private fetch.

Customer receipt printing currently calls `window.print()` from the tracking page. It is not silent receipt/sticker output or proof of physical printing. The print stylesheet hides several secondary panels, but the lead still needs to inspect print preview for unrelated tracking copy/history and define the receipt-only output boundary. Do not expose staff document endpoints without a public scoped contract.

### C3: understand table context, join privately, review the bill and ask for help

Scanning a table remains a public hint. The customer supplies a display name and current private code. The terms request resolves the live visit and returns saved minimum-spend terms without bill access. Enabled terms need an unchecked explicit acknowledgement before join. Policy-disabled visits may join after the terms check.

Keep a clear distinction between public table, joined party and selected order. Show current shared/split bill totals and any unused deposit credit without implying withdrawable funds. Minimum-spend shortfalls require ordinary additional orders or an authorized waiver; do not add a charge. Expired/closed visits remove private bill access, not historical orders belonging to the same valid guest.

Help should be easy to reach from the relevant order/table, with visible request reference, status and customer reply. It is an in-app venue request; no email/SMS/push delivery is implemented. Preserve the maximum-open-request rule and private context checks.

### C4: book, follow the booking and manage current-session privacy

The form captures name/contact, party size, device-local date/time/duration, safe public table preference and notes. It discloses the approved deposit/minimum policy and acknowledges the exact policy version. A returned request reference does not mean staff confirmed the booking. Recovery/activity shows booked policy snapshots rather than replacing them with today's branch settings.

Cancellation states must distinguish cancelled, request awaiting deposit review and a confirmed financial outcome. Optional marketing preference remains separate and unchecked unless a previous explicit choice is loaded.

Improve grouping and summary/action placement after Q1. The device-time versus venue-time distinction must remain explicit; do not silently change timezone conversion. Session ending requires its own in-app confirmation and explains loss of private access, unchanged orders/visits, no refund and unaffected other-venue sessions.

## Correctness and recovery findings

These are source-confirmed limitations or risks, not implemented fixes.

| ID | Finding | Consequence and acceptance decision |
| --- | --- | --- |
| R1 | Checkout body/key/quote, cart and retry lock exist only in React state/refs. No customer storage or server attempt-recovery contract is present. A hard reload remounts with a new key and empty cart. | Same-page exact retry is supported; reload-safe original retry is not established. If the product claims recovery across reload, agree the recovery contract and privacy/expiry policy first. No offline synchronization or persistence is implied by this document. |
| R2 | Startup restores the latest own order and history, but the public order projection does not expose correlation to the lost request key. There is no current customer lookup of an order by original attempt key. | A recent order proves only that order exists; it is not proof that a particular unresolved attempt succeeded. Do not silently label the latest order as the resumed attempt. A late commit can arrive after the first history refresh. |
| R3 | Checkout currently clears the pending intent for every HTTP status below 500. | A first definitive rejection can allow correction, but a later auth/rate-limit rejection may occur before the server resolves an earlier uncertain attempt. Numeric status alone does not always prove that the original was unaccepted. Agree authoritative resolution/error semantics and test this sequence before claiming robust recovery. |
| R4 | Retrying calls guest creation/reuse first. If the original guest session expired, this can establish a new guest context. | Never transfer previous private orders to the new identity or silently rebuild/re-submit the old order with a new key. Provide an explicit lost-access/review path. Server ownership remains authoritative. |
| R5 | The `Feedback` instance is not keyed/reset by order ID. Its local `done`/error state can remain when selecting another completed order from history. | A previous thank-you must not appear as proof of feedback for another order. Key/reset by canonical order identity and add a two-order regression before rolling out history-driven feedback. |
| R6 | Reservation retry body and minimum-policy acknowledgement are memory-only. Help retry state is in a conditionally mounted child and can also disappear when leaving its tab. Cancellation intent maps exist only while activity is mounted. | Do not describe these as durable recovery. Refresh canonical own activity after interruption, preserve exact intent where available, and do not auto-create a replacement request. Backend duplicate/action guards remain necessary. |
| R7 | Quotes have an expiry and the UI displays its time, but there is no automatic expiry-state transition. | Server409 remains final authority. Do not silently refresh prices or submit a fresh quote on the customer's behalf. An accepted order's original retry must keep the same quote/key even after expiry. |
| R8 | `GuestActivity` does not currently use a generation/abort guard when its prefix changes; most actual branch navigation is a full reload. | Test same-instance route/scope transitions before reusing this component under a new shared router. Old private activity must never flash or replace the new scope after a delayed response. |

A possible future recovery design could retain a minimal scoped attempt and resolve it under the existing secure guest cookie. That would require an agreed storage lifecycle, alias-stable organization/branch scope, retention/redaction, session-expiry behavior and an authorized attempt lookup or equivalent server contract. Browser storage must never become identity or authorization. No such design is selected or implemented here.

## Required acceptance before C2 rollout credit

| Scenario | Unit/contract evidence required | Lead browser evidence required |
| --- | --- | --- |
| First price review | Real server breakdown, modifier validity and quote identity; no order before deliberate confirmation | Narrow complete total/charges readable before submit; one clear next action |
| Pending write | Repeated taps send one logical intent; items/name/note/fulfillment cannot change the frozen body | Busy state and edit lock understandable; no covering mobile toolbar |
| Unknown result | Same body/key/quote replay; preserve uncertainty across status/policy/menu changes | No false confirmation; original retry and recent-history review discoverable |
| Hard refresh mid-write | Exercise both accepted-before-response-loss and request-not-accepted; identify current unsupported boundary or chosen recovery contract | Reload, reconnect and late commit observed; no invented association or silent new-key resubmission |
| Rejected retry after earlier uncertainty | Auth expiry, forbidden/rate-limit/stale-policy outcomes classified by actual backend resolution semantics | Customer can distinguish lost access/try later from confirmed rejection |
| Price expiry/change | Existing accepted replay before quote validation; unaccepted stale quote requires new explicit review | No unexplained total change or automatic submission |
| Guest history | Scoped pagination and fresh private selection; wrong cursor/guest/venue denied | Two own orders selectable, dates/reference clear, feedback state isolated by order |
| Session ending | Only matching organization session expires; no cancellation/refund/visit closure; in-flight responses cannot restore ended private state | Explicit confirmation, clear loss-of-access message, new-session name entry, other venue remains usable |
| Visit recovery | Code/terms checks grant no bill until acknowledgement/join; current/previous party isolation | Public versus private context clear, minimum terms and canonical shortfall readable |
| Reservations/deposits | Original snapshot and retry; concurrent capacity/cutoff checks; cancellation does not invent refund | Device/venue timezone clear; requested/confirmed/deposit-review states visually distinct |
| Help/activity/consent | Own-session context, exact replay, no private note leak, explicit preference separate from transactions | Accessible entry/status/reply, no fictitious external delivery, meaningful empty/loading/error states |
| Receipt | Correct canonical items/charges/payments/refunds/settlement; no private neighboring history in output | Actual browser print preview checked; logo/long lines/page breaks and receipt-only scope reviewed |
| Accessibility | Named controls, focus/error group association, dialog isolation, exact-intent regressions retained | Keyboard, long names/options, actual touch dimensions, narrow scroll/IME behavior and screen-reader checks recorded |

Existing executable source evidence: `tests/mera-customer-ui-correction.test.tsx`, `tests/mera-customer.test.js`, `tests/mera-customer-qr.test.js`; the last scoped run had 26 passing tests. This does not include new tests for R1–R8 and does not prove browser or production acceptance.

## Dependencies versus production gates

- Existing APIs cover the proposed layout correction. Do not add fake availability, payment, recovery or delivery endpoints.
- A chosen reload-recovery claim needs a separately agreed attempt-resolution contract and privacy lifecycle; it cannot be completed through layout alone.
- Optional verified customer cross-device identity has no completed customer login/recovery flow. Provider access alone must not be described as making that code complete.
- Rubies live collection/return behavior, real Zidi integration, verified email/notification delivery, target domains/TLS and physical receipt/sticker calibration remain separate external/implementation launch gates. The customer UI must not promise them.
- Commercial policies, taxes, retention and mandatory disclosures require explicit decisions. Keep policy approval and technical diagnostics in appropriate restricted surfaces; customer notices should explain the real next action.

## Next handoff

Complete and review Q1 first. Then agree R1–R4 recovery semantics and address R5's per-order feedback state before broader C2 layout implementation. Preserve the current business rules and local exact-intent regression while extracting review/tracking components. The lead schedules browser captures and alone updates the weighted tracker. This document establishes no new percentage or completion claim.

## Correctness checkpoint: tab-bound checkout recovery

The audit above records the earlier source state. The authorized C2 correctness slice now addresses R1–R5 without broad layout rollout: `checkoutRecovery.ts` validates and bounds an exact pending-intent journal in tab session storage, bound to organization, branch and the canonical authorized guest `sessionRef`. It is written and verified before the order POST. Restoring only reads the current cookie-backed guest; it never creates a guest or submits automatically. Original review, quote, body and key survive refresh and uncertain auth/rate/domain responses. Missing, changed or unavailable session proof blocks the basket and hides its saved private review; unresolved records have no silent expiry into a new order. Feedback mounts separately for each actual order ID.

The backend's additive attempt-resolution contract supplies authoritative recovery. “Check original order” opens a recorded original, while `not_found` keeps the request frozen. “Stop unconfirmed request” requires an in-app explanation and explicit confirmation: the server either returns the already recorded order unchanged or durably abandons the unrecorded request before the client permits a new key. These actions do not cancel orders, take payments or confirm refunds. Ending guest access retains an unresolved journal and explains the resulting loss of access.

Executed source evidence: `node --import tsx --test tests/mera-customer.test.js tests/mera-customer-qr.test.js tests/mera-customer-ui-correction.test.tsx tests/mera-customer-recovery.test.tsx` passed **40/40**. The twelve dedicated recovery cases cover remount with changed/paused current menu, exact original review and replay, scope/session mismatch, missing/expired/offline proof, storage refusal, corrupt/oversized records, not-found versus abandonment, recorded-original priority, and explicit session ending. Backend session-reference and attempt-resolution PostgreSQL tests were independently reported passing by the backend owner. Customer browser refresh/reconnect/stop-confirmation acceptance is still pending lead captures after preview restart. R6–R8 and broader layout work are not completed by this checkpoint; this is tab-lifetime recovery rather than cross-device identity or an offline order queue.

## Post-Q1 narrow activity and receipt correction

R8 now has a keyed scope boundary: changing the activity prefix immediately removes the previous venue's private content and cancellation intents. A mounted/generation guard ignores delayed activity responses and prevents a completed cancellation from refreshing an unmounted venue. Loading and intentional retry are visible. Authorization failure removes private activity. Two executable tests cover an old-venue delayed response after switching and an expired guest session; the five customer suites now pass **42/42**.

The printable order details now contain their own order reference, canonical statuses, recorded payments/refunds/write-off and outstanding balance. Print CSS isolates this receipt from tracking history, feedback, session history and unrelated main content. The paid-order print control explicitly opens device print options and does not claim to send another venue receipt/sticker job. Unpaid or partially paid orders still do not gain the payment-receipt control. This is source and DOM evidence; no physical printer or browser print-preview result is claimed.

Acceptance checklist for the lead's next browser pass:

- Switch venue/activity scope with a delayed request: old names, feedback, reservations and cancellation forms disappear immediately and never return.
- Expire the guest session during activity refresh: remove private content, show an actionable error, and leave deliberate retry available.
- Open a paid order with long item/modifier names, recorded returns and charges; inspect print preview for only that order's receipt, correct canonical amounts, wrapping and no history/feedback/session panels.
- Cancel print preview and return to tracking without a new order, payment or venue-printer request. Check unpaid/write-off states retain their actual payment status and do not imply cash received.
- Recheck narrow tracking/activity loading, error and empty states, keyboard focus and touch targets. Actual browser evidence remains pending; source tests do not establish those visual outcomes.

R6 remains a separate bounded recovery decision for reservations/help/cancellation, and R7 still needs a time-aware expired-quote review state. Neither should create replacement requests or refresh prices automatically. No new API is needed for this narrow correction; cross-device verified recovery and silent venue printing remain outside its claims.

R7 follow-up source checkpoint: expiring price reviews now use the quote response's HTTP Date plus its one-second precision bound and full measured request duration. A monotonic deadline avoids relying on the customer's device wall clock. The review transitions to “Review latest total” at expiry (also rechecked on focus/visibility and immediately in the submit handler), so that action only requests another price review. It never sends an expired fresh order or automatically refreshes/submits. Missing/malformed server time fails closed for expiring reviews. Quotes without expiry retain their previous contract. Existing uncertain journal attempts keep their original quote/key regardless of expiry. The local preview's actual same-origin menu response Date header was read and verified; no browser expiry interaction is claimed.

Six scoped customer suites pass **45/45**, including an actual timed DOM transition requiring deliberate fresh review with zero order POSTs, missing-time and network-delay bounds, and the existing uncertain replay/remount checks. Lead browser acceptance: leave a valid review open until expiration, return after backgrounding, verify customer wording and focus, deliberately review changed charges, then verify a separately uncertain original still offers its exact original retry. No backend DTO change was required.
