# Table service correction checkpoint

Partial P3 milestone, 19 November 2026. Existing Bing Chun palette, typography, operational shell and shared disclosures reused. Backend routes and policy remain unchanged.

## Verified evidence

- Main preview before/after: screenshots 144 and 145. Tables and active parties precede setup; closed visits have a separate view. Private joining codes were not revealed.
- Disposable frontdesk database only, app3007/database55444: created Window1/Garden2, opened Local lunch party, followed Add a round to POS with the correct visit selected, reviewed and submitted one unpaid ₦1,500 lemonade order.
- Split ₦500 into Local shared portion, verified ₦1,000/₦500 balances, merged back to ₦1,500. No payment recorded.
- Combined both tables under the same party. Server rejected closing with an outstanding balance; party and bill remained open.
- Actual 390×844 phone and834×1194 tablet captures146/147 inspected. Document width matched viewport; no page horizontal overflow. Desktop145 inspected. Setup/map scrolling remains intentionally contained.
- Build passed. Full suite469 tests:467 passed,0 failed,2 skipped. Initial sandbox run lacked loopback permission; rerun with approved loopback access passed.
- Focused regression coverage includes mounted draft preservation across party filters, unknown versus empty reads, shared table mutation fences, exact retry bodies, authorization loss and bill split/merge/payment recovery.

## Remaining acceptance

P3 remains partial: assigned waiter work/prepared handoff, full least-privilege browser matrix, minimum-spend/deposit outcomes, partial settlement/recovery and large-volume acceptance remain. Payment paths have automated tests but were not exercised with actual money. Non-idempotent legacy table/split/merge writes freeze after an unknown result; durable attempt/version support remains a backend limitation across reloads. Printer hardware and live provider gates are separate.

## Source ownership

- Lead: TableServiceView, OrganizationWorkspace integration, table-service.css, central imports and filter tests.
- Bills agent: Bills, bills.css and bill regression tests.
- Visit tools agent: VisitTables, VisitMinimumSpend, PrivateVisitAccess, visit-tools.css and visit regression tests.
- Table hardening agent: NonReplayForm, FloorMap, TableEditor and mutation-fence tests.

No production deployment or production data change.
