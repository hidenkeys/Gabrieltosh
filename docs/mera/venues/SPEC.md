# Venue, location, menu-kind and stock contracts (round three)

Approved 24 November 2026 by the user: one venue type per location plus add-ons; backend changes allowed; stock/menu operating model chosen during onboarding; club and hotel extras in scope; packages and meals live on the menu; admins can preview what a QR link opens before printing; staging deploy once ready. No real payments, real email or production data.

This file is the single source of truth for every worker. Do not invent parallel names. If a contract must change, change it here in the same commit.

## 1. Shared module `shared/mera-venues.js` (new, plain JS like `shared/mera-contracts.js`)

```js
export const VENUE_TYPES = ["quick_service","cafe","casual_dining","reservation_restaurant","lounge","club","hotel_fb"];
export const CAPABILITIES = ["counter_ordering","qr_ordering","pickup_alerts","table_service","open_tabs","split_bills",
  "reservations","deposits","minimum_spend","waitlist","prep_stations","guest_list","room_charge"];
export const TYPE_DEFAULTS = { /* type -> { capabilities:[], hours:[{days,start,end}], cutoff:minutes, label, bestFor, youGet:[3], differentBecause } */ };
export const LEGACY_MODE_TO_CAPABILITIES = {
  counter_takeaway:["counter_ordering","qr_ordering","pickup_alerts"],
  table_service:["table_service","split_bills","prep_stations"],
  reservations:["reservations"],
  lounge_club:["open_tabs","minimum_spend"],
};
export function capabilitiesToLegacyModes(caps) {}   // inverse, for back-compat writes of settings.serviceModes
export function effectiveCapabilities(settings) {}  // settings.capabilities ?? derived from settings.serviceModes
export const CAPABILITY_SECTIONS = { tables:["table_service"], reservations:["reservations"], waitlist:["waitlist","reservations"],
  door:["guest_list"] };                             // workspace section -> any-of capabilities; unlisted sections always shown
export const LOCATION_COLORS = ["forest","lime","clay","ocean","plum","sun","stone","rose"];
export const ITEM_KINDS = ["single","package","combo"];
```

Type defaults (copy shown to owners lives here too, sentence case, plain words):

| Type | Default capabilities | Hours preset | Cutoff (min after 00:00) |
|---|---|---|---|
| quick_service | counter_ordering, qr_ordering, pickup_alerts, prep_stations | 08:00–22:00 daily | 0 |
| cafe | counter_ordering, qr_ordering, pickup_alerts, prep_stations | 07:00–20:00 daily | 0 |
| casual_dining | qr_ordering, table_service, split_bills, prep_stations, waitlist | 11:00–23:00 daily | 0 |
| reservation_restaurant | table_service, split_bills, reservations, deposits, prep_stations, waitlist | 12:00–23:00 Tue–Sun | 0 |
| lounge | qr_ordering, table_service, open_tabs, split_bills, minimum_spend, reservations, prep_stations | 16:00–23:59 + 00:00–02:00 next day | 360 |
| club | table_service, open_tabs, minimum_spend, reservations, deposits, guest_list, prep_stations | 22:00–23:59 + 00:00–05:00 | 420 |
| hotel_fb | qr_ordering, table_service, split_bills, reservations, room_charge, prep_stations | 06:30–23:00 daily | 0 |

Overnight hours use split windows (the existing schema requires end > start).

## 2. Data

### Organization: new column `operating JSONB NOT NULL DEFAULT '{}'` (migration `ADD COLUMN IF NOT EXISTS`)
```
{ locationCount: "one"|"few"|"many", menuMode: "shared"|"per_location", inventoryMode: "per_location"|"central",
  defaultVenueType: VENUE_TYPE, centralStockBranchId: string|null, version: int }
```
Missing keys mean legacy: per_location menu and stock. `PATCH /organizations/:org/operating` (permission `organization.manage`, optimistic `version`, requestKey idempotent). Switching `inventoryMode` after any counted stock exists returns 409 `INVENTORY_MODE_LOCKED` unless `{confirmCount:true}`; the switch is audited.

### Branch `settings` additions (validated in the existing branch settings PATCH and branch creation)
```
venueType: VENUE_TYPE (default derived: lounge_club→lounge, reservations→reservation_restaurant, table_service→casual_dining, else quick_service)
capabilities: CAPABILITY[]      // authoritative; server also writes serviceModes = capabilitiesToLegacyModes(capabilities)
code: /^[A-Z0-9]{2,5}$/ unique per organization (default: first 3 letters of name, uppercased, deduped)
colorTag: LOCATION_COLOR
area: string ≤ 60, optional
role: "outlet" | "stock_room"   // stock_room: not guest-facing, cannot launch, no QR, hidden from guest routes
```
A `stock_room` branch is created automatically when an organization sets `inventoryMode:"central"` (name "Central store", code "CST"), referenced by `operating.centralStockBranchId`.

### Membership: new column `branch_roles JSONB NOT NULL DEFAULT '{}'`
`{ [branchId]: { role, permissions[] } }`. Effective permissions for (member, branch): `branch_roles[branch]` if present, else the membership role/permissions when `organization_wide` or `branch_ids` includes branch, else none. Organization-level checks (overview, operating settings, roles) use the membership role only. Invitations gain the same `branch_roles`. Existing rows need no migration.

New built-in roles in `shared/mera-contracts.js`: `area_manager` (branch_manager permissions + `organization.overview` limited to its branches), `finance` (`reports.view`, `reports.export`, `organization.overview`, read-only payments), `central_stock` (`stock.adjust`, `stock.transfer`, `stock.receive`, `menu.view` if exists). New permissions: `organization.overview`, `stock.transfer`, `stock.receive`, `door.manage`, `room_charge.post`. Owner and organization admin get all of them.

### Product (`productInputSchema`) additions
```
kind: "single"|"package"|"combo"   default "single"
unitCost: money (kobo) | null       default null   // for stock valuation and transfer cost
serves: int 1..50 | null            default null   // "serves 4"
requiresTable: boolean              default false  // package only orderable against a table visit or reservation (bottle service)
components: [{ productId, variantId|null, quantity int 1..50 }] max 20   // package: fixed contents
choiceGroups: [{ id, name, min int>=0, max int>=1, options:[{ productId, variantId|null, priceDelta money >= 0 }] }] max 8  // combo: pick e.g. 1 main, 1 side, 1 drink
```
Rules: `single` has no components/choiceGroups. `package` requires ≥1 component; `combo` requires ≥1 choiceGroup. Components/options must be `single` products in the same branch (no nesting). Package/combo `stockMode` is forced `"unlimited"`; availability = every referenced counted component has stock ≥ needed. Orders deduct and hold stock on the **component** products. Order lines store the chosen combo options (`choices:[{groupId, productId, variantId}]`), and kitchen/bar tickets list components and choices under the line, routed per component station. Shared menus copy these fields; component references are remapped by product `code`.

### Stock transfer record (`mera_records.kind = 'stock_transfer'`, stored on the **sending** branch)
```
{ id, requestKey, fromBranchId, toBranchId, status:"sent"|"received"|"cancelled",
  lines:[{ code, variantName|null, name, quantity, unitCost|null, receivedQuantity|null }],
  note, sentBy, sentAt, receivedBy, receivedAt, cancelledBy, cancelledAt, version }
```
`POST /organizations/:org/stock-transfers` (`stock.transfer` at source) decrements source counted stock and writes `stock_movement` reason `transfer_out`. `POST .../:id/receive` (`stock.receive` at destination) increments matching product by `code` (+variant name), writes `transfer_in`; a received quantity lower than sent records the gap as movement `transfer_loss` at the source. `POST .../:id/cancel` only while `sent` restores source stock. `GET /organizations/:org/stock-transfers?status=` lists transfers where the member can see either end. Allowed in both inventory modes; in `central` mode the UI leads with "Send to locations".

### Guest list (`kind='guest_list_entry'`, branch-scoped, capability `guest_list`, permission `door.manage`)
```
{ id, requestKey, tradingDate, name, partySize, host|null, contact|null, coverCharge money|null, status:"expected"|"arrived"|"turned_away",
  arrivedCount, note, createdBy, updatedAt, version }
```
CRUD under `B/guest-list`, plus `POST B/guest-list/:id/check-in {count}`. Cover charges are collected by creating a normal counter order for the branch's entry product (a `single` product the owner marks on the menu; see `settings.entryProductId`) using the existing order and payment endpoints. No new payment path.

### Room charge
`paymentInputSchema.method` adds `"room_charge"`, allowed only when the branch has capability `room_charge` and the member has `room_charge.post`. `reference` is required: room number + guest surname (`/^[A-Za-z0-9 -]{2,60}$/`). Reports show room charges as a separate line, "Charged to rooms (settled by the hotel)", never as cash. No settlement automation.

### Capability enforcement (server)
New table visits → `table_service`. New reservations (staff and guest) → `reservations` and the existing `reservationsEnabled`. Guest QR orders → `qr_ordering`. Open tabs (pay later on a visit) → `open_tabs` or the existing payLater setting. Minimum spend policies → `minimum_spend`. Deposits → `deposits`. Room charge payments → `room_charge`. Guest list → `guest_list`. Rejections are 409 `CAPABILITY_OFF` with a plain message such as "Table service is turned off for this location." Existing open records keep working when a capability is switched off. Platform per-organization flags still apply. Add per-branch platform flags with the same names, stored in `branch.settings.platformFlags`, only through the platform-guarded route.

### Organization overview (all locations)
`GET /organizations/:org/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&branchIds=a,b` (permission `organization.overview`; branches limited to those the member can see; stock rooms excluded from sales). Uses each branch's own timezone and cutoff for trading dates. Returns:
```
{ range, currency:"NGN", totals:{ revenue, orders, averageOrder, refunds, roomCharges, covers, reservations, noShows },
  paymentMix:[{method, amount}], branches:[{ id, name, code, colorTag, venueType, revenue, orders, averageOrder, refunds, openVisits, onShift }],
  stock:{ lowStock:[{branchId, productId, name, stock, threshold}], valueByBranch:[{branchId, value|null}], inTransit:[transfer summaries] } }
```
All money in kobo. `value` is null when any counted product lacks `unitCost`; the UI says so instead of showing 0. An org-wide CSV export reuses the exports job with `scope:"organization"`.

### QR link preview
`GET B/qr-preview?target=table:<tableId>|counter` (permission `qr.manage`) returns `{ url, label, opensAs:"table_order"|"counter_pickup"|"menu_only", capabilities, menuPublished, warnings[] }`. Warnings cover cases like "Menu not published yet" or "Table service is off, so this QR opens order-and-collect". The guest menu accepts `?preview=<short-lived staff token>`. In preview mode it renders the published menu, or the current draft if not yet published, with a "Preview, orders are off" bar, and creates **no** guest session, order, help request or reservation. The server enforces this.

## 3. Workspace navigation

Sections are hidden when the location lacks every capability listed in `CAPABILITY_SECTIONS`. A hidden section that still has active records (open visits, upcoming reservations) stays reachable under More with a "turned off" badge. New sections: `door` (Door & guest list), `transfers` (Stock transfers, shown when the org has ≥2 non-stock-room branches or central mode), and `organization` ("All locations" overview, shown for `organization.overview`). The branch switcher lists locations with code and color tag, plus "All locations" for overview holders.

## 4. Onboarding (frontend)

A full-screen setup shell without the operational sidebar. Steps: Account → Your business (name, slug auto from name, one public contact, location count) → Kind of venue (type cards with label/bestFor/youGet/differentBecause from `TYPE_DEFAULTS`, then add-on capability chips; for 2+ locations, "Are all locations the same kind?") → Locations (name, code, color, address, hours prefilled by type, timezone read-only with Change) → Menu & stock (menuMode and inventoryMode, each with a one-line reporting consequence. Single-location owners see only the item-kind intro, and inventoryMode defaults to per_location) → Payments (manual methods, existing caveats verbatim) → Review & go live (one summary, Edit links, one Go live per location). Autosave on Continue: no per-section save buttons. Legacy onboarding keys stay readable. Existing create-organization and launch request bodies stay valid. Operational switches (pause orders, sold-out visibility, hold minutes) move to branch settings with type defaults.

## 5. Non-negotiables

Money in kobo, basis points unchanged, null ≠ 0. requestKey idempotency on every new write; unknown outcomes never become a fresh action. Tenant and branch boundaries are enforced on every new route (cross-org and cross-branch tests required). CSS imported only from `src/main.tsx`. Reuse `src/mera/ui/` controls. Never delete tests. Fictional data only.

## Backend request details

- Branch creation accepts the location fields alongside its existing fields. Settings PATCH keeps legacy bodies valid; writes containing location fields require `requestKey` and the current settings `version` (legacy settings start at version 1). Capability writes also update legacy service modes. Codes shorter than two characters are padded with `X` when generated.
- Invitations accept `branch_roles` with branch IDs as keys. Branch grants are checked against both the selected role and the inviter's authority, and retained on acceptance.
- Branch platform controls use `PATCH /platform/organizations/:org/branches/:branch/feature-flags` with `{requestKey,version,flags,reason}`; the flag names match organization controls.
- Guest-list create requires `requestKey`; PATCH, DELETE and check-in require `requestKey` and `version`. DELETE retains a tombstone for exact retry recovery and removes the entry from reads and covers. Check-in increments `arrivedCount`, bounded by party size. Covers count checked-in guest-list guests.
- Overview ranges are inclusive, limited to 367 days per request. Revenue follows the existing report's net recognized bill totals; orders count orders placed in the range. Refunds and payment mix use receipt dates; reservations use booking start dates. Open visits and on-shift counts show current state. Stock rooms remain visible in stock valuation but never sales.
- Organization CSV jobs reuse `POST B/exports` with `{date,requestKey,scope:"organization",branchIds?:[]}`. The date uses each location's trading day. Branch visibility is checked when queued, processed and published. Downloads use the existing export artifact route. Values in this organization CSV are explicitly labeled kobo.
