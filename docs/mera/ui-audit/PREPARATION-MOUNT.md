# P4 station preparation handoff

Source correction, not visual acceptance. Changed Tickets.tsx and added preparation.css plus focused tests. No backend policies or main handlers changed.

## Root integration

- Centrally import `src/mera/workspace/preparation.css` in main.tsx; component imports no CSS.
- Existing Tickets props remain base,tickets,orders,disabled,save,stationScope. Optional read-state props: loading,loadError,onRefresh. Do not turn unavailable tickets/orders into [] before this component when a read genuinely failed: [] means known empty.
- Pass actual branch settings `payLater` (boolean) so awaiting-payment guidance can be shown without exposing amounts. Server remains authoritative; unknown policy is never inferred as approved.
- Pass snapshot `serverTime` for elapsed minutes; without it a device-clock estimate is used. No invented timestamps or IDs-as-names. Named latest preparation actor comes only from matching immutable order.history.ticketId; current order.handlerName is separately labeled.
- Preserve root kitchen/bar stationScope derived from actual role, plus server station authorization. The leaf filters before rendering counts/options/items.
- Pass onViewOrders only when orders.view is granted, targeting existing Orders destination. Tickets do not accept submitted orders: acceptance stays in Orders under existing permission/payment rules.
- Replace the main generic `(orders || preparation)` list condition with orders-only to remove duplicate kitchen/bar handoff list, financial/order-history clutter and overlapping progress controls. Preserve all Orders actions; do not remove submitted acceptance functionality from Orders.

## State/recovery boundaries

Cards show quantity, modifiers, notes, canonical snapshot dietary/allergen labels, elapsed time, real actor when available and prominent versioned progress. Active/ready/all views are local filters. Closed tickets retain readable prepared counts. No print dependency, money amount or setup control appears.

API bodies remain POST ticket/status {status,version} and ticket/items/:line {preparedQuantity SET total,version}. No invented requestKey API. An unknown result freezes exact original path/body/version and further preparation writes; retry never silently adopts a refreshed version. Later409 after unknown stays unresolved until an explicit newer canonical version is reviewed. That newer version server-fences the old request, so Use latest ticket can release the local barrier without claiming which actor completed the original request. Mere absence, unchanged version or failed refresh never resolves it.

This preparation barrier is component-local; it is not the durable financial journal. Navigation/remount persistence is not claimed. Version guards still prevent stale server writes after navigation. A read-only/disabled parent remains authoritative for controls, while backend rechecks all permissions, payment/payLater, accepted status, stock-hold and station rules.

## Evidence and required checks

Focused `tests/mera-preparation.test.tsx`: four tests cover station privacy/instructions/real elapsed handler, exact uncertain retry with refreshed-version conflict and explicit reviewed resolution, loading/error/known-empty distinction, waiting acceptance/payment/disabled actions. Existing station partial SET and escaped instruction regressions also pass.

Root browser review required: desktop/tablet/narrow grid and long instructions, no page-wide overflow,44px actions/focus and quantity keyboard entry, active/ready filters, scoped station roles, actual partial progress and status polling, stale409, network failure retry, permission revocation, no duplicate generic list, and an accessible route for order acceptance. No physical print/provider or full P4 completion claim follows from source tests.

## Integrated browser checkpoint — 18 November 2026

Root mounted the stylesheet, server clock, actual pay-later setting, read states and Orders destination; removed the duplicate generic order list from Preparation. In a separate loopback-only visual database (3006/55443), the primary branch test order M-38BC4DEE was accepted through Orders, started through Preparation, saved at1/2 and then2/2, and automatically appeared under Ready for service. No payment or printer action was used. Original3003 preview and store database remain separate.

Saved captures56–58 show actual desktop partial preparation and ready state at751×1075 and390×844 CSS pixels. Tablet/narrow document overflow checks returned false. Notes, elapsed time and the named update actor remained visible; no financial totals or duplicate order list appeared. Screenshot56 uses the existing desktop viewport rather than a claimed matched original preparation reference: no original Bing Chun preparation screen was accessible.

Integration validation: npm test310total,308pass,0fail,2skip; npm run build passed; git diff --check clean. The two ordinary-suite skips do not certify physical print workers or PostgreSQL. Backend-agent disposable PostgreSQL runs separately passed reservation recovery and published-counter pricing integration; final combined revision certification remains pending.

P4 checkpoint60, not complete: actual restricted kitchen/bar account browser checks, long-ticket density, keyboard/focus, live conflict/network recovery and permission revocation still need review. Reservation recovery has source/regression evidence but its new browser flow is not credited here.
