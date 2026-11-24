# Mera walkthrough for newcomers

A guided tour of the whole application: what each surface is for, who uses it, and the journeys that connect them. Read this first, then `docs/mera/ux-next/CLAUDE-HANDOVER.md` for environment and status.

This describes the app as it is on `mera-ux-next` (24 November 2026). Planned changes (venue types, multi-location, inventory modes) are in `docs/mera/NEXT-PLAN.md` and are **not** built yet.

## 1. The product in one paragraph

Mera started as the point-of-sale for Bing Chun, a bubble-tea shop in Surulere, Lagos, and grew into a hospitality platform. A business (an **organization**) signs up, configures one or more **branches**, publishes a **menu**, and puts **QR codes** on tables or the counter. Guests scan, order and pay, book, or call for help from their phone. Staff run the floor from the **workspace**. Mera's own team supervises every organization from a separate **platform console**.

## 2. The four surfaces

| Surface | URL (local) | Who | Job |
|---|---|---|---|
| Marketing | `/mera` | Prospects | Explain Mera QR, consultancy and Travel; collect enquiries. |
| Workspace | `/mera/workspace` | Owners, managers, cashiers, kitchen/bar staff | Run the business: sell, prepare, seat, book, settle, report. |
| Guest menu | `/mera/menu/<org-slug>/<branch-id>` | Guests (no account) | Browse, order, track, book, ask for help, leave feedback. |
| Platform console | `/mera/platform` | Mera operators (password + MFA) | Review organizations, approve commercial terms, suspend or enable services. Every action is audited. |

Local base URL is `http://127.0.0.1:3009` for the `ux-next` instance. See the handover for start commands. The preview serves `dist`, so run `npm run build` after source edits.

## 3. Core vocabulary

- **Organization**: the business, such as "Bing Chun". It owns the brand, members and the commercial relationship with Mera.
- **Branch**: one physical location, such as "Surulere". It has its own address, hours, timezone, service modes, tables, QR codes, shifts and launch state.
- **Member**: a person with access to an organization, holding a **role** that grants permissions.
- **Service modes**: how a branch serves guests: counter and takeaway, table service, reservations, lounge and club.
- **Visit**: a party seated at a table. Orders attach to a visit and roll into a **bill** that can be split.
- **Shift**: a cashier's session with an opening float and a cash count at close.
- **Readiness / Go live**: the checklist a branch must pass before guests can order. Going live publishes the branch. It is not a deployment.

## 4. Journey A: owner from sign-up to first sale

1. **Sign up** at `/mera/signup` with name, email and password, then verify the email. Locally the email is simulated; never send real mail.
2. **Create the organization**: business name, Mera address (slug) and first branch name.
3. **Guided setup**, five stages in the workspace under More → Getting started:
   1. Account: already done by sign-up and verification.
   2. Business: the public contact guests and receipts use.
   3. Branch: address, timezone, service modes, trading hours, stock hold, reservations and capacity, brand appearance.
   4. Payments: manual payment methods (cash, transfer, POS terminal). No live payment provider is connected.
   5. Go live: one review, one "Go live" action. Readiness and policy caveats are shown word for word.
4. **Build the menu** in Menu & stock: categories, products, modifiers, prices (stored in kobo), stock counts.
5. **Set up tables and QR** in Tables & visits (floor layout) and More → Menu QR codes.
6. **Invite the team** in People: roles and staff access.
7. **First sale** at Point of sale: add items, take payment (cash shows quick tender chips and change due), print or show the receipt.

## 5. Journey B: a guest order from phone to collection

1. The guest scans a table or counter QR and opens the guest menu with the venue's colours.
2. They add items, with options and an optional note, and review the basket.
3. They submit. The order appears in Orders and Preparation in the workspace.
4. Staff **accept** → **preparing** → mark items **ready** → **collected** → **completed**. The guest's tracking page updates at each step.
5. Payment is recorded by staff (cash, transfer, terminal) or allowed later if the branch permits preparation before full payment.
6. The guest can leave star feedback afterwards.

Expired or cancelled orders reject payment ("Order allocation is no longer valid."). That is a safeguard, not a bug.

## 6. Journey C: table service and bills

1. In Tables & visits, open a visit for a table and set the party size.
2. Orders from the POS or the guest QR attach to that visit.
3. Open the bill and split it by amount or by item. Collect each part.
4. Close the visit when the bill is settled.

## 7. Journey D: reservations and front desk

1. The guest books from the guest menu: day strip, time chips from opening hours, party size.
2. Staff confirm, seat or cancel in Reservations (cancellation reasons are preset chips).
3. Front desk and Waitlist handle walk-ins and arrivals.
4. Deposit and minimum-spend policies are configured per branch. Cancellation with a held deposit goes to staff review; it never refunds automatically.

## 8. Journey E: running the day

- **Shifts & cash**: open a shift with a float, record cash movements, count and close.
- **Transactions**: payments, refund requests and their approval.
- **Customer requests**: guest help calls such as "bring the bill" or "call a waiter".
- **Overview**: today's sales, attention items and activity for the selected branch.
- **Reports** (inside Overview): sales, items, payments, shifts by date range. Exports are under More → Report exports.
- **Printing**: receipt and sticker layouts in More → Receipt studio. Physical printing goes through the Windows local-store agent and is not certified in the current round.

## 9. Journey F: Mera platform operator

1. Sign in at `/mera/platform/sign-in` with password and then an authenticator code.
2. The directory lists organizations with their status and services.
3. Open one to review commercial proposals, enable or suspend services, or record support actions. Each action asks for a specific reason and is audited.
4. Operators cannot act as owners, and owners cannot reach the console.

## 10. Where things live in the code

| Area | Path |
|---|---|
| Workspace screens | `src/mera/workspace/` (navigation: `WorkspaceNavigation.tsx`) |
| Guest screens | `src/mera/customer/` |
| Marketing | `src/mera/marketing/` |
| Shared controls (Segmented, Stepper, MoneyInput, Combobox, Switch, ReasonInput, DateTimePicker) | `src/mera/ui/` |
| CSS entry (all imports) | `src/main.tsx` |
| API and domain logic | `server/mera/` (schemas in `*.sql`, roles in `roles.js`) |
| Local preview | `scripts/preview-mera.js` |
| Tests | `tests/` |
| Design rulebook | `.agents/skills/mera-product-design-audit/SKILL.md` |

## 11. Rules a newcomer must not break

- No deployment, real payments, real email or production data changes without explicit approval.
- Keep API paths and request bodies stable unless a backend change is approved.
- Money is in kobo; percentages are basis points; `null` and `0` mean different things.
- Import CSS only from `src/main.tsx`.
- Never delete a test to make the suite pass.
- Never paste credentials from the private fixture files into chat, logs or commits.
