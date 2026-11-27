# Phase 5 manual venue walkthroughs

These are instructions for a human on staging; they have not been executed by
this code task. Use fictional portfolio accounts from the staging seed operator,
never real guest data. Keep billing off. Use separate browser profiles for owner,
staff and guest; do not share cookies between roles.

## Common owner review (repeat for each venue)

1. Sign in as the venue owner and choose its outlet (never the central store).
2. Verify business/contact details, timezone/currency, service days and hours,
   published menu, and manual payment methods. Check that disabled capabilities
   have no launch rows or settings forms. Printer defaults should already pass.
3. In Go live, follow every blocked row's Fix button. Confirm it opens the named
   workspace section or the correct guided setup step. Recheck after saving.
   Missing service hours must block every venue. Going live must reject blockers.
4. For table venues, create an available table and export its table QR. A table
   without an active QR must block launch. For hotels create the room in Rooms.
5. Launch only after all rows pass. Confirm there is no subscription blocker or
   online payment claim while billing is off.

## Quick service — Kerbside Grill (`quick_service`)

Sign in as owner for readiness, cashier for manual collection, kitchen/bar for
preparation. Guest scans a branch QR, enters a name, selects pickup and orders.
Cashier records the actual manual payment; preparation cannot start unpaid when
pay-first is configured. Kitchen/bar marks the ticket ready; cashier marks it
collected. Look for one persisted order, correct total/stock, pickup instructions,
and no table/reservation/deposit/minimum-spend/door/room setup rows.

## Café — Daybreak / Afterdark (`cafe`)

Use the daytime café outlet, owner, cashier and bar roles. Guest scans branch QR,
selects pickup, customizes a drink and orders. Record manual payment, prepare at
the correct station, mark ready and collected. Check modifier prices, pickup
reference and no table-visit requirement. If testing the after-dark outlet too,
use its actual overridden capabilities rather than assuming the café preset.

## Casual dining — Oak & Ember (`casual_dining`)

Owner configures tables/QR and hours. Guest scans the table QR and orders to that
table. Waiter accepts, kitchen/bar prepares, waiter records service using the
existing handoff/collected action. Verify table name on the order, no automatic
joining of another party's bill, and that missing/wrong QR context is rejected.
Test private-code joining separately when using a running visit.

## Reservation restaurant — Saffron Room (`reservation_restaurant`)

Owner reviews reservation enablement, capacity/hours and deposit policy. Guest
requests a future booking with contact and party size. Front desk/cashier records
the verified deposit, confirms the reservation and seats it at an available table.
Waiter creates an order against the resulting reservation/visit; kitchen/bar
prepares it and waiter marks served/collected. Check deposit credit on the bill,
capacity conflict handling and reservation ownership. The preset has no QR
ordering: staff-assisted ordering must work without turning that capability on.

## Lounge — Velvet Lounge (`lounge`)

Owner reviews capacity, hours and approved minimum-spend terms. Waiter opens a
table visit after acknowledging current terms. Guest joins with the private code
and acknowledges the same policy version, then orders onto the tab. Kitchen/bar
prepares; waiter marks served/collected. Check one open bill, charge attached once,
minimum spend disclosure and manager review for a shortfall. A room/table QR alone
must never grant access to a party bill.

## Club — Pulse (`club`)

Owner reviews deposit/minimum-spend policies and reservation capacity/hours.
Door staff adds a guest list entry and checks the arriving party in, or owner
explicitly saves Walk-ins only in location settings. Verify readiness responds to
that saved decision. Waiter opens the VIP table with minimum-spend acknowledgement;
guest privately joins, and waiter places a VIP drink/package order on that visit.
Bar prepares, waiter serves/collects. Check bottle package components and stock,
list count/idempotent check-in, and denial of door actions to cashier-only staff.
The preset has no QR ordering; use staff-assisted ordering after entry.

## Hotel F&B — Harbour Hotel (`hotel_fb`)

Owner creates Room 204 in the Rooms zone of a guest-facing outlet and exports its
table QR. Guest scans it: banner must read “Room 204 · ordering to your room”.
Guest orders; kitchen/bar prepares; waiter delivers and marks served/collected.
Check room identity survives checkout/reload and a wrong QR is rejected. Owner or
a role explicitly granted room_charge.post may separately record a room charge
with a reviewed reference; cashier without that grant must be denied. This is a
manual charge reference, not a PMS or room-occupancy verification. Central store
must have no guest menu, guest QR or go-live action.

## Visual and security observations

At 390, 820 and 1440 CSS pixels, check readable blocker details, reachable Fix
buttons, keyboard focus, no page overflow and honest saved/error states. Repeat a
submission after interrupted connectivity to check duplicate protection. Try a
foreign venue visit/reservation, invalid private joining code, unavailable room,
and a fourth unpaid open guest order; existing guards must reject them. Record
screenshots, viewport, role and actual outcome for each staging run.
