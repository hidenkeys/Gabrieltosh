# Mera next plan: venue types, multi-location, inventory modes, venue test portfolio

Prepared 24 November 2026 on `mera-ux-next` @ `7bcea40`. Planning document only: nothing here is built or approved. No deployment.

## 0. Current state (confirmed)

- Branch `mera-ux-next`, clean, level with `origin/mera-ux-next` (0 ahead / 0 behind after fetch).
- Local preview `ux-next` (app 3009, DB 55449) is stopped. Not restarted for this plan.
- Last full suite: 907 tests, 904 pass, 3 skipped (from the handover; not re-run for this plan, because only docs changed).
- Final guided Go live click is still blocked and not performed.

## 1. Review findings that drive this plan

Sources: the committed setup screenshots (`docs/audit/screenshots/setup-*.png`), the round-two audit, a read-only source inventory (Codex), and spot checks.

### 1.1 Onboarding is not one flow

| # | Finding | Evidence |
|---|---|---|
| O1 | The guide sits inside the workspace shell ("Branch setup" page title, a sidebar with 13 operational items, org/branch switchers). A new owner sees POS, Orders and Preparation before anything is set up. | `setup-business-1440.png`, `setup-branch-1440.png` |
| O2 | Nested headings: Step "Branch" → "Settings & appearance" → tabs → "Branch operating policies" → "Business". Four levels of title for one step. | `setup-branch-1440.png` |
| O3 | Every section has its own save button plus a Continue button ("Save form changes before continuing"). Two save models in one step. | `setup-business-1440.png`, `setup-branch-1440.png` |
| O4 | The Business step asks for one field (public contact) and repeats the read-only organization address card. | `setup-business-1440.png`, `BusinessDetails.tsx` |
| O5 | Operational switches (Pause new orders, Show sold-out items, Stock hold minutes) appear during setup next to service modes. They are run-time controls, not setup questions. | `BranchSettings.tsx:279–331` |
| O6 | **There is no venue type.** Service modes are four switches (`counter_takeaway`, `table_service`, `reservations`, `lounge_club`) with no explanation, and **nothing reads them** to change behaviour. Reservations are actually controlled by a separate `reservationsEnabled` setting. | `workspace-admin.js:101`, `index.js:2305`, no other readers |
| O7 | The organization has a second, dead `onboarding.data.serviceMode` (one value), separate from the branch list. | `BusinessDetails.tsx:31` |
| O8 | Nothing asks how many locations the business has, or how menus and stock are shared. | Whole flow |

### 1.2 The workspace looks the same for every kind of venue

- The menu items are fixed (`WorkspaceNavigation.tsx:48–72`) and only hidden by permission (`OrganizationWorkspace.tsx:131–152`). A takeout kiosk still sees Tables & visits, Reservations and Front desk. A club has no bottle packages, door or guest list.
- Platform feature flags are per organization only (`feature-flags.js`). There is no per-branch control.

### 1.3 Multi-location exists halfway

| Capability | Today |
|---|---|
| Many branches per organization | Yes (`mera_branches`) |
| Staff limited to some branches | Yes (`memberships.branch_ids`, `organization_wide`) |
| Different role per branch for one person | **No.** One role per organization membership. |
| Shared menu across branches | Yes, opt-in, applied explicitly with per-branch price and availability overrides (`menus.js`) |
| Stock | Always per branch, held on product records. No central store, **no transfers**. |
| All-locations view (revenue, orders, stock, staff) | **No.** Every report endpoint needs one branch (`/organizations/:org/branches/:branch/...`). |
| Telling locations apart | Name only. No code, colour or area tag. |

### 1.4 Testing uses one venue

The preview seed builds one organization (Bing Chun), one branch and one owner (`index.js:117–180`). Integration tests add a second organization only to prove the two can't see each other's data. Nobody has ever used the product as a club, a lounge or a multi-branch takeout.

## 2. Product decisions (recommendations; please confirm)

### D1. Venue type = a starting preset, not a cage

Owners pick **one main type per location**, then may **add capabilities** from other types. Recommendation: yes, mixing is needed, because real venues are mixed (café by day and lounge at night, restaurant with a bar, hotel with a pool bar). Picking several *types* is confusing, though, so mixing works through capabilities:

1. "What best describes this location?" → one type card.
2. "Anything else you do here?" → add-on chips, with the type's defaults already selected.

The type sets defaults (capabilities, workspace menu, trading hours, trading-day cutoff, guest-menu layout, receipt wording). Capabilities decide what actually switches on. Everything stays editable later in settings.

### D2. Type catalogue (what each includes and how it differs)

Shown as cards during onboarding. Each card has a one-line "best for", three "you get" bullets and one "different because" line.

| Type | Best for | Turns on by default | Different because |
|---|---|---|---|
| Quick service & takeout | Counters, kiosks, pickup, food courts | Counter ordering, QR order-and-collect, pickup ready alerts, prep queue | No tables or bills. Speed first: pay before preparing. |
| Café | Coffee, tea, bakery, bubble tea | Counter + QR at table, loyalty-ready guest profile, prep stickers | Short visits. Order at counter or table, pay first, light seating. |
| Casual dining restaurant | Sit-down restaurants | Table service, visits and split bills, kitchen and bar stations, walk-in waitlist | Guests are seated and pay at the end. Bills grow over the visit. |
| Reservation-led restaurant | Fine dining, set menus | Reservations with slots, deposits, cancellation policy, front desk, covers | The day is planned around bookings. Deposits and no-shows matter. |
| Lounge | Lounges, shisha, rooftop bars | Table service with open tabs, minimum spend per table, bar station, late cutoff | Long stays on one running tab. Minimum spend by section. |
| Club & nightlife | Clubs, events | VIP table bookings, bottle packages, minimum spend, deposits, door/guest list*, late trading day (cutoff after midnight) | Revenue is table packages and entry, not dishes. Night runs past midnight. |
| Hotel food & beverage | Hotel restaurants, pool bars, room service | Several outlets per property, table service, room charge*, central stock | One property, many outlets, often one stock room. |

\* New capability. Listed for completeness, scheduled in a later phase (§4). The card says "coming soon" until it is built. Delivery is not in the system (fulfilment is `counter_pickup`, `takeaway` or `table_service` only) and is not offered.

### D3. Capabilities (the switches underneath)

`counter_ordering`, `qr_ordering`, `pickup_alerts`, `table_service`, `open_tabs`, `split_bills`, `reservations`, `deposits`, `minimum_spend`, `waitlist`, `prep_stations`, `bottle_packages`*, `guest_list`*, `room_charge`*. Each maps to existing settings where one exists (`reservationsEnabled`, deposit and minimum-spend policies, pay-later). Today's four `serviceModes` are mapped across so stored data stays valid.

Capabilities drive (a) which workspace menu items show (hidden, not deleted: a disabled area with live records stays reachable, as rare tools do under More today), (b) which guest-menu actions appear, and (c) server checks, so a takeout branch rejects table visits. (c) is a backend change.

### D4. Locations

- An organization has 1..n locations. Onboarding asks "How many locations do you run?" (One / 2–5 / 6 or more) so the flow adapts. Single-location owners never see multi-location words.
- Each location has a name, a short code (e.g. `SUR`, `LKI`) and a colour tag used in switchers, reports and receipts. An optional area (e.g. "Lagos Island") comes later for grouping.
- The location switcher gets an **All locations** choice for people with organization-wide access.

### D5. Menu and stock: two questions, asked only when there are 2+ locations

1. **Menu**: "Same menu everywhere (prices can differ)" (the existing shared menu with overrides) or "Each location writes its own menu".
2. **Stock**:
   - **Each location counts its own stock** (today's behaviour). Reports show stock per location and a total.
   - **A central store supplies the locations**. New: a central stock location (kitchen, commissary or warehouse) that receives deliveries and sends **transfers** to branches. Branch stock goes up on receipt of a transfer. Cost moves with the transfer, so each branch's margin is right.

Copy for the owner explains the reporting effect in one sentence each. Changing mode later is a guided step (count everything, then switch), never a silent flip.

### D6. All-locations view (organization overview)

For organization-wide roles:

- Totals across locations: revenue, orders, average order, payment mix, refunds, covers, reservation no-shows, for today / this week / this month / custom.
- A comparison table with one row per location, sortable, linking into that location.
- Stock: low-stock and out-of-stock across locations, stock value by location, transfers in transit (central mode).
- Staff on shift now, per location.
- Currency is NGN everywhere today (branch creation only accepts NGN), so totals can add up safely. If other currencies are allowed later, totals must be shown per currency.

### D7. People and access

- Keep one membership per person per organization (`UNIQUE(user_id, organization_id)`), and add **per-location roles**: a membership holds `{branchId → role}` with an optional organization-level role. Example: manager at Surulere, cashier at Lekki.
- New built-in roles: **Area manager** (manages a chosen set of locations), **Finance** (read-only reports for all locations, plus exports), **Central stock controller** (only in central-stock mode: receives deliveries and sends transfers).
- New permissions: `organization.overview` (all-locations view), `stock.transfer`, `stock.receive`.
- The invite flow asks "Which locations?" and then the role at each, with a shortcut: "Same role everywhere".
- Existing memberships migrate as-is: `organization_wide` with a role stays the same, and `branch_ids` with a role becomes that role at each listed branch.

## 3. New onboarding flow

Principles: ask each fact once, one job per screen, autosave on Continue (no separate save buttons), and a calm full-screen setup shell **without** the operational sidebar.

| Step | Asks | Notes |
|---|---|---|
| 1. Account | Name, email, password, then verify email | Unchanged contract and recovery. |
| 2. Your business | Business name (Mera address made from it automatically, editable), public contact (phone or email, once), number of locations | Replaces Create organization, Business details and the contact asked again at launch. |
| 3. Kind of venue | Type cards (D2) for the first location, then add-on chips (D3). For 2+ locations: "Are your locations the same kind?" | Explains each type and how it differs. |
| 4. Your location(s) | Name, code, address. Trading hours use type presets (e.g. Club 22:00–04:00, cutoff 06:00). Timezone read-only (Africa/Lagos) with Change. For 2+ locations: add the others now or later. | Stock hold, pause orders and sold-out visibility move to settings with type defaults. |
| 5. Menu & stock | Only for 2+ locations: D5's two questions, each with its reporting consequence | Single-location owners skip this step. |
| 6. Payments | Manual methods: cash, transfer, POS terminal | Caveats word for word. |
| 7. Review & go live | One summary with Edit links. One "Go live" button per location | Readiness and legal caveats verbatim. Go live stays blocked in testing until you approve it. |

After go live: a short "first day" checklist inside the workspace (add menu items, print QR codes, invite staff). It is not part of setup.

## 4. Implementation phases

Each phase is one or more coherent commits on its own branch off `mera-ux-next`, typecheck/tests/build green, screenshots at 390/820/1440. **Phases 2–5 need backend changes**, which lifts last round's "frontend only" rule, so they need your explicit approval. No deployment at any point without a separate instruction.

| Phase | Scope | Backend? | Size |
|---|---|---|---|
| **0. Venue test portfolio** | Guarded seed for 7 synthetic organizations (§5) on a new isolated preview instance. A walkthrough checklist per venue. | Script only, no schema change | M |
| **1. Onboarding remodel (no new data)** | Full-screen setup shell, autosave per step, remove nested headings and double saves, move run-time switches to settings, merge Create organization into "Your business", explain service modes in plain words. Uses existing endpoints. | No | M |
| **2. Venue type + capabilities** | Store `venueType` and `capabilities` on branch settings (and an org default). Migrate the four `serviceModes`. Type cards and add-ons in onboarding. Navigation and guest menu driven by capabilities. Server rejects disabled capabilities. Per-branch feature flags for platform operators. | Yes: settings schema, checks | L |
| **3. Locations + all-locations view** | Code and colour per location. "All locations" in the switcher. Organization overview and reports endpoints that add up across branches the member can see. Comparison table. | Yes: new aggregate endpoints | L |
| **4. Inventory modes** | Organization `inventoryMode` (`per_location` / `central`). Central stock location, deliveries, transfers (send, receive, in transit), cost carried with the transfer. Stock reports per mode. Guided switch between modes. | Yes: stock records, transfers | L |
| **5. People per location** | Per-location roles, new roles and permissions, invite flow by location, migration of existing memberships. | Yes: membership model | M–L |
| **6. Club & hotel extras** | Bottle packages, guest list and door, room charge. Each needs its own product decision first. | Yes | L each |

Suggested order: 0 → 1 → 2 → 3 → 5 → 4 → 6. The portfolio comes first so every later phase is checked against all venue kinds. Per-location roles come before central stock because transfers need the stock controller role.

### Delegation

- Codex takes the token-heavy implementation of each phase with a precise brief (files, contracts, done criteria, checks). It also runs the Chrome/Playwright crawls and screenshot sets.
- This session plans, reviews the diffs, runs the checks and keeps `docs/mera/ux-next/BOARD.md` up to date.
- Codex jobs that run in parallel get separate files. They share one working tree, so each phase runs on its own branch or worktree.

## 5. Venue test portfolio (Phase 0 detail)

**Isolation:** new preview instance `venues` (app 3011, DB 55451, `data/mera-demo-venues-db`). The existing `ux-next` instance and its database are not touched. The seed refuses to run unless the DB host is loopback, the data directory is under `data/mera-demo-*`, and `NODE_ENV` is not production. Credentials are generated and written to a private 0600 file outside the repo. Nothing is printed or committed. All names are fictional and no real email is sent.

| Organization (fictional) | Type(s) | Locations | Menu / stock | Exercises |
|---|---|---|---|---|
| Bing Chun (existing seed) | Café | 1 | Own | Baseline, unchanged |
| Kerbside Grill | Quick service & takeout | 3 (SUR, LKI, IKJ) | Shared menu, price override at LKI; stock per location | Pickup flow, all-locations totals, per-location staff |
| Oak & Ember | Casual dining | 2 | Shared menu, stock per location | Tables, visits, split bills, kitchen and bar stations, waitlist |
| Saffron Room | Reservation-led restaurant | 1 | Own | Slots, deposits, cancellations within cutoff, front desk |
| Velvet Lounge | Lounge (+ reservations) | 1 | Own | Open tabs, minimum spend by section, late cutoff |
| Pulse | Club & nightlife | 1 | Own | VIP table bookings, deposits, minimum spend, trading day across midnight |
| Harbour Hotel F&B | Hotel F&B | 3 outlets (restaurant, pool bar, lounge) | Shared menu; central stock once Phase 4 exists | Outlets under one property; central stock later |
| Daybreak / Afterdark | Café by day + lounge by night (mixed) | 1 | Own | Proves mixing: counter and table service both on |

Each organization gets an owner plus staff in distinct roles (manager, cashier, waiter, kitchen, bar, front desk, stock controller, reports-only), a realistic menu with categories, modifiers and stock, tables where relevant, and **14 days of synthetic orders, payments, refunds and shifts** so reports and comparisons have data. Until Phase 2 exists, the organizations differ by their current settings (service modes, reservations, policies, hours), and the seed records the intended type so Phase 2 can adopt it.

Per-venue checklist (in `docs/mera/venues/CHECKLIST.md`): sign in as each role, then walk that venue's core journey (takeout: QR order → ready → collected; lounge: open tab → add rounds → minimum spend → settle; club: VIP booking with deposit → arrival → package → close after midnight; multi-location: owner switches locations, compares, a cashier at one branch cannot see another). Record what feels wrong for that kind of venue. That list becomes the Phase 1–2 backlog.

## 6. Open questions for you

1. Approve venue type as "one type per location + add-ons" (D1)? Or should owners pick several types?
2. Approve lifting "frontend only" for Phases 2–5 (local only, no deployment)?
3. Central stock: is a commissary/warehouse that *sends* stock to branches the model you want, or only a combined read-only view of per-branch stock?
4. Club & hotel extras (bottle packages, guest list, room charge): in scope for this product round or later?
5. Should Phase 0 start now?
