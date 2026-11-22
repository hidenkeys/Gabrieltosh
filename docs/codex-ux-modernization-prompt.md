# Codex task: modernize data entry and ticket UI across the Mera app

Paste this whole file into Codex. Work on a new branch off `mera-workspace-redesign`
(for example `mera-ux-inputs`). Commit and push after each numbered workstream.

## Context

- Repo: `hidenkeys/Gabrieltosh`. Stack: React 19, Vite 6, TypeScript, plain CSS, Lucide icons.
- The visual redesign is already done on these stacked branches:
  `mera-marketing-redesign` → `mera-customer-redesign` → `mera-signup-redesign` → `mera-workspace-redesign`.
  Read these first: `src/mera/marketing/marketing-v2.css` (design tokens `--mx-*`, easing, fonts),
  `src/mera/customer/customer-v2.css`, `src/mera/workspace/workspace-v2.css`, `src/mera/account-v2.css`.
- Design language: ivory and forest green, "order ticket" metaphor (perforated edges, notches,
  dashed tear lines), Mera Display (Bricolage Grotesque) for headings and figures, Mera Text
  (Instrument Sans) for body. Organizations bring their own colour through `--brand`
  (workspace) and `--mc-primary` (guest menu). Always derive accents from those variables,
  never hard-code blue.
- Motion rules: motion answers a person's action (press, open, confirm). No decorative
  scroll or load animation. Use `transform` and `opacity` only. Gate hover effects with
  `@media (hover: hover) and (pointer: fine)`. Respect `prefers-reduced-motion`. Press feedback
  is `scale(0.97)`. Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Touch targets are at least 44px. Every control needs a visible `:focus-visible` ring.
- Do NOT change API paths, request bodies, or server code. This is a front-end task.

## Hard constraints (these will bite you)

1. CSS may only be imported from `src/main.tsx`. A CSS import inside a component breaks the
   Node test runner (`ERR_UNKNOWN_FILE_EXTENSION ".css"`). Put new styles in a new file such as
   `src/mera/ui/inputs-v2.css` and import it last in `main.tsx`.
2. New shared components go in `src/mera/ui/`: `Segmented.tsx`, `Chips.tsx`, `Stepper.tsx`,
   `MoneyInput.tsx`, `Switch.tsx`, `DatePicker/TimeSlots`, `Combobox.tsx`, `BottomSheet.tsx`.
   Build them once, then reuse everywhere. They must be real accessible controls
   (`role="radiogroup"` / `radio`, `aria-pressed`, `aria-live` for value changes, keyboard arrows).
3. Tests: `node --import tsx --test --test-concurrency=2 tests/*.test.js tests/*.test.ts tests/*.test.tsx`.
   Currently 779 pass, 3 skipped, 0 fail. Many tests find controls by accessible name
   (for example `Prepared quantity for <item> on <station>`, `Choose: <item>`, `Submit order`).
   Keep those accessible names, or update the test with an equivalent assertion in the same commit.
   Never delete a test to make it pass.
4. `npx tsc --noEmit` and `npm run build` must stay clean.
5. Keep native form semantics where the server expects them (`required`, `min`, `max`,
   `maxLength`). A custom control must still submit the same value as the field it replaces.
6. Prepared quantities on a kitchen ticket can only go up (`min={item.preparedQuantity}`), so the
   stepper cannot decrement below the saved value.

## How to run it and see the screens

```
npm ci
npm run preview:mera          # starts an embedded Postgres + demo data on http://127.0.0.1:3003
```

The first run prints `ISOLATED MERA DEMO LOGIN: admin / <password>`. If you miss it, delete
`data/mera-demo-db` and run again. It must run as a non-root user. Workspace: `/mera/workspace`.
Guest menu: `/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`. After each CSS or TSX
change run `npm run build` (the preview serves `dist`). Verify with Playwright screenshots at
390x844 (phone), 820x1180 (tablet) and 1440x900.

## Decision rules for choosing a control

Apply these everywhere instead of deciding case by case.

| Situation | Use |
| --- | --- |
| 2 to 4 fixed options | Segmented control or radio cards (replaces `<select>`) |
| 5 to 12 fixed options | Wrapping chips (single select) |
| More than 12 options, or options that come from data (orders, tables, products) | Searchable combobox that shows reference, name and amount |
| Yes / No | Switch with a label that states the effect |
| A count a person usually changes by 1 to 3 | Stepper (`−` value `+`), long-press repeats, tap the value to type |
| Money | `MoneyInput` (see workstream 4) |
| A reason or note | Preset chips first, free text only behind "Other" |
| Date and time | Day strip plus time-slot chips, not `datetime-local` |
| 5 or more related checkboxes | Grouped toggle list with presets |
| A form with 15 or more controls on one screen | Split into steps with a progress indicator |

## Workstreams, in priority order

### 1. Kitchen and bar preparation tickets (highest value)

Files: `src/mera/workspace/Tickets.tsx`, `src/mera/workspace/preparation.css`.
Problem: every item on a ticket renders its own `<form>` with a number input labelled
"Prepared quantity" and a "Save prepared quantity" button, plus a text line "0 / 2 prepared".
A three-item ticket therefore carries three inputs and three buttons, and the card is tall and
hard to use with wet hands on a tablet.

Redesign as a real ticket:
- Header: station name, big order reference (display font), and an elapsed-time chip that
  turns amber after 8 minutes and red after 15 (use the existing waiting-time data; keep the
  text version in `aria-label`). Replace the sentence "N min since ticket received".
- Perforated divider with side notches under the header (reuse the notch technique from
  `.mc-basket-heading` in `customer-v2.css`).
- Items as compact rows: quantity badge, name, size, modifier line, instruction notes.
  Remove the number input and the per-item Save button. For quantity 1 the whole row is one
  tap target that marks it prepared. For quantity above 1 show a row of dots or a `−/+` stepper;
  tapping `+` saves immediately (optimistic, show a spinner on the row, roll back and show an
  inline error on failure). Keep the accessible name `Prepared quantity for <item> on <station>`
  on the stepper's value.
- Cancelled quantities show as struck-through dots, not a separate paragraph.
- Footer: one full-width action ("Start preparing", then "Mark ready"). Remove the second line of
  helper text where the button label already says it.
- Layout: on tablet landscape and desktop show three columns (Queued, Preparing, Ready) so a
  ticket moves across when its status changes. On phones use a single column with a sticky
  status filter.
- Replace the two selects ("Preparation station", "Ticket view") with a chip row for stations
  and a segmented control for Active / Ready / All. Show counts on the chips.
- Reduce chrome: the "Preparation update unconfirmed" recovery panel, the waiting message and
  the error line should be a single inline banner on the affected ticket, not page-level blocks.
- Add an optional "new ticket" chime toggle and a one-tap fullscreen/kiosk button.

### 2. Stock adjustment (Menu & stock → Products, and `StockMovements.tsx`)

Problem: `OrganizationWorkspace.tsx` around line 2576 renders, for all 34 products at once, a
number input ("Count") and a text input ("Adjustment reason"). That is 68 empty inputs on one
screen. `StockMovements.tsx` uses a type select (Restock / Waste / Loss) and a free quantity.
- Product list: show the stock level as a bar with the number, and one "Adjust stock" button.
- Adjust stock opens a bottom sheet: current balance, stepper for the change, quick chips
  (+1, +5, +10, −1, −5), movement type as a segmented control (Restock, Waste, Loss, Count
  correction), reason chips (Delivery received, Spilled, Expired, Staff meal, Recount, Other→text).
  Show the resulting balance live before saving.
- Items with unlimited stock show "Unlimited" and hide the adjust control.

### 3. Free-text reason fields become presets

Every one of these asks the user to type a sentence:
- `ItemCancellation.tsx` "Cancellation reason" (required, min 3) and "Reviewed cancellation refund reason".
- `RefundRequests.tsx` "reason" and "Review reason" (min 10 characters).
- Orders page: "Requested return (₦)" and "Reason".
- `ReservationRequest.tsx` "Reason for stopping".
- Receipt studio: "Reason for reprint" ("Why is a duplicate needed?").
- Shift and cash movement notes in `ShiftOperation.tsx` and `CashMovement.tsx`.

Replace with preset chips plus an "Other" text field. Suggested presets:
cancellation (Customer changed mind, Item unavailable, Wrong item entered, Took too long, Other);
refund (Wrong item, Quality issue, Overcharged, Duplicate payment, Service issue, Other);
reprint (Printer jammed, Customer asked for copy, Wrong details, Other);
cash movement (Float top-up, Bank drop, Supplier payment, Change for till, Tip payout, Other).
Send the chip label as `reason` so the server contract is unchanged, and append the optional note.
Where the form enforces a minimum length, treat a chip as satisfying it.

### 4. Money entry

41 fields use `type="number"` for naira amounts or counts.
- Build `MoneyInput`: `₦` prefix, `inputMode="decimal"`, thousands separators while typing,
  no spinner arrows, no scroll-wheel changes, value announced as currency.
- Transactions "Amount received (naira)": add quick chips (Exact amount, round-ups to the next
  ₦500 and ₦1,000), and for Cash show a change-due line that updates live.
- Refund "Requested return (₦)": chips for Full amount and Half, and a per-line picker so staff
  tick the lines being returned instead of computing a number.
- Shifts & cash "Counted cash" (text input with placeholder "0.00"): replace with a note-and-coin
  counter (₦1000, ₦500, ₦200, ₦100, ₦50, ₦20, ₦10, ₦5) using steppers that sum to the total, with
  the manual total still available.
- Replace free numeric fields that are really counts (party size, quantity) with the stepper.

### 5. Choosing an order, table or product from a dropdown

"Order → Choose order" appears as a `<select>` on Orders, Transactions (twice), Refunds and
Subscription. "Table → Choose a table", "Bill to manage → Select an open bill", and
"Choose product" are the same pattern.
- Use a combobox that searches by reference, customer name and table, and shows
  `JH-017 · Table 6 · ₦4,200 · Unpaid` style rows.
- Better, prefill from context: an order row's "Refund" or "Record payment" action should open
  the form already bound to that order, so the select is never needed.

### 6. Dates, times and party sizes

- `datetime-local` is used in `ReservationRequest`/Reservations (two), Subscription (two) and the
  guest reservation form (`#mc-reservation-start`, customer `CustomerExperience.tsx` ~line 2419).
  Replace with a seven-day date strip, then time-slot chips generated from branch opening hours
  in 15 or 30 minute steps, with unavailable slots disabled and a "Later" overflow.
- Guest reservation "duration" select becomes chips (1 h, 1.5 h, 2 h, 3 h).
- Party size in Reservations, Front desk (waitlist) and the guest form: stepper with quick chips
  1 to 8 and "9+".
- Overview and Report exports `type="date"`: add presets (Today, Yesterday, This week, This month,
  Custom). Custom opens the native picker.
- Phone numbers: `type="tel"`, `inputMode="tel"`, `autocomplete="tel"`, format as the user types.

### 7. Settings and onboarding walls

- **Getting started** (the owner setup page) has roughly 60 controls on one screen: 14 checkboxes,
  four Yes/No selects, many number inputs and a text field defaulted to "Africa/Lagos"
  for the timezone. Split into steps (Business, Service modes, Hours, Payments, Reservations,
  Review) with a progress bar, one concern per step, Yes/No as switches, opening hours as a
  weekly grid with "same every day" copy, timezone as a searchable select, and a final review
  card before publishing.
- Fields that show `Unresolved` as a placeholder or option ("Unresolved — no approved default")
  must read as plain language: "Not set. Choose how this works before you go live", with a
  clear required state. Do not show internal words.
- **People**: the invite form has a role select with 7 roles and then about 20 checkboxes. Show
  role cards (Owner, Organization administrator, Branch manager, Cashier, Waiter, Kitchen, Bar)
  each with one line saying what the role can do, then a grouped permission list with switches,
  prefilled by the chosen role, and "customized" shown only when changed.
- **Integrations** credential scopes (four checkboxes) become a scope list with a plain
  explanation per scope.
- **Subscription** has about 15 number, date and select fields with the same "Unresolved"
  options. Group them into labelled sections and move operator-only settings out of the owner view.

### 8. Filters and small selects

Replace selects with segmented controls or chips, showing counts where available:
Orders (Service queue, state, channel, payment: four selects); Preparation (see 1);
Front desk waitlist view; Shift queue; Customer requests category; Tables "Party view";
Receipt studio paper width (58 mm / 80 mm); POS Fulfillment (Counter pickup / Takeaway /
Table service); Payment origin (Cash / External POS / Verified external transfer);
Menu QR "Menu destination". On the guest menu, the mobile category `<select>`
(`.mc-category-select`) becomes a sticky horizontally scrolling chip row.

### 9. Guest (customer) forms

File: `src/mera/customer/CustomerExperience.tsx`.
- Order details: name field "What should we call you?", a table select and an order-note
  textarea. Keep the name optional with a friendly default, show the table as a chip like
  "Table 6" when it came from the QR, and replace the note with chips (Less ice, No sugar, Allergy,
  Extra napkins) plus a text box.
- Help request (category select + textarea): make four large tiles (Call a waiter, Ask for the
  bill, Water or napkins, Something else). One tap sends it, and the note is optional afterwards.
- Feedback `rating` select becomes five tappable stars or faces. The category select becomes chips.
- Item customization (`.mc-modifier` checkboxes): chips for options, steppers for quantity,
  and a sticky "Add to basket · ₦X" button whose price updates live.
- Reservation form: see workstream 6. Table choice becomes optional seating cards.

### 10. Wording and content pass (do alongside the above)

Rewrite microcopy to the guest's or staff member's words, in sentence case, active voice, with a
button that says exactly what happens:
- Remove internal vocabulary from the UI: "Unresolved", "uncertain order", "Request origin is
  not permitted", "Check and stop original request", "Preparation update unconfirmed",
  "Individual preparation counts are unavailable for this older ticket", "Order handler",
  "Party view", "Ticket view", "Service queue". Use plain labels such as "Show", "Waiting",
  "Who is handling this".
- Errors say what went wrong and what to do next, and never apologize.
- Empty states invite the next action ("No orders yet. New orders appear here the moment a guest
  sends one.").
- The same action keeps the same name across the flow (Save → toast "Saved").
- Remove duplicate headings and helper lines that restate a label.
- Keep the readiness and legal caveats in the marketing and legal pages exactly as written.

## Acceptance checklist

- `npx tsc --noEmit`, the full test suite and `npm run build` are clean.
- Screenshots at 390, 820 and 1440 widths for every changed screen, with no horizontal scroll
  and no console errors.
- Every new control works with keyboard (arrows, space, enter) and shows a focus ring.
- Reduced motion turns off all new animation.
- No `type="number"` remains for currency. No `<select>` remains with four or fewer options.
- The preparation ticket has no text input and no per-item save button.
- One commit and push per workstream, with a message that names the screens touched.

## Not audited yet (look before you change)

I crawled the workspace pages and tabs with demo data only. I did not open: the POS cart with
items, bill splitting and payment dialogs, table and floor editing, the owner setup wizard
steps in sequence, report detail pages, print studio, and the platform console at
`/mera/platform`. Check those for the same patterns (text where a button would do, bare
number inputs, long checkbox lists) and apply the decision rules above.
