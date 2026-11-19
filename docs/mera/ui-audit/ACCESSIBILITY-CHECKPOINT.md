# Workspace keyboard and integration gate checkpoint

Source3642f55 integrates handoff hint02f2586 and platform test-diagnostic correction8343d3b. Baseline scope1.0 weighted65.8/100; no frozen task/screen/weight changes.

## Fresh audit steps and corrections

1. Chrome260 captures the original mobile workspace drawer. Activate Orders with Enter:261 and DOM observation show focus falls to BODY after the drawer closes. Preserve existing Bing Chun structure and route user-triggered mobile selection through the existing destination-heading focus mechanism. Desktop manual tab activation keeps focus on the tab; polling/search do not steal it. Final265 shows existing blue focus treatment on Orders H1, not a new design token.
2. Open mobile drawer, use End to focus the last nonselected tab, then Tab. Actual browser reproduced focus escaping behind the drawer into tabpanel because tabindex-1 current roving focus was omitted from containment. Include the current active control in the boundary calculation. Final browser End→Tab lands on the drawer’s close button, Escape returns the local Workspace menu toggle. Close button/backdrop likewise return the local toggle in component tests.
3. Repeat selection at tablet width:264 focuses Reservations H1. Resize an open drawer beyond the existing1000px breakpoint: mobile state closes/backdrop disappears, avoiding a desktop focus trap/hidden-toggle destination. Actual desktop Orders Enter leaves focus on the selected tab. Source matchMedia listener is removed on unmount. No permission, record, payment or server lifecycle change.
4. Multiple live handoff composers used one fixed description ID. useId now gives each input exactly one local hint, including hidden mounted cards. New regression checks actual DOM target association, hidden/unhidden preservation, node identity and stable IDs. No handoff quantity/write contract change.

## Verification evidence

- Saved/opened current screenshots260–265; same-tab261/265 before/final actualCSS433px atChrome90%zoom, requested390×844. Tablet actualCSS926px, requested834×1112; desktop2782px. Measured document widths match viewport widths. Viewport reset. Drawer scroll position differs260/262 after End navigation; only261/265 are the matched screen comparison. Combined comparison rendered, saved and opened.
- Navigation/workspace focused87pass8.84s; handoff15pass; final build passed.
- Standard npm test now includes tests/*.test.ts in addition to JS/TSX, covering staff reservation/shift journal files previously omitted. Final fullsuite658total/656pass/0fail/2existing skips37.84s. Separate current-source disposable PostgreSQL gate1pass/0fail3.21s; no preview or production DB selected.
- First broad run failed the platform UI test file. Investigation reproduced17.5 seconds spent constructing assertion diagnostics inside initial failing readiness polling. Bounded predicate errors preserve the same resolver/focus identity requirements, without serializing React DOM object graphs. Platform9pass1.08s after correction; final fullsuite green. This is a test diagnostic fix, not a relaxed timeout or removed assertion, and does not claim protected-browser verification.

## Integration evidence matrix and remaining work

| Requirement | Current exercised evidence | Remaining acceptance |
| --- | --- | --- |
| Role/scope denial | member-access, role-manager-guards, platform-ui, export-jobs-guards, workspace tests; actualPG tenant/MFA/category isolation | Full current-browser role/screen matrix; protected platform operator access |
| Orders/stock | fulfillment/live cards/history/preparation projection tests; PG last-unit/quote/pricing/stock/station gates | All operational actor/state combinations; historical table names cannot be reconstructed where no snapshot exists |
| Payments/bills | bills-ui/finance operations/domain/EOD; actualPG conservation/refund/deposit/writeoff | Bill split/merge still lack durable authoritative operation recovery across navigation; preserve this software gap |
| Tables/guest privacy | table-service, customer visit refresh/summary; actualPG successive party/old code/combined tables/close | Broad current-browser multi-staff journey matrix |
| Unknown outcomes | checkout/reservations/shift/help/signup journals + realPG replay/actor/stop races | Reprint/template recovery remains mounted-memory only; access/signup lack authoritative lookup/stop; order status version fencing is not owned acknowledgment |

Q3 advances0→40 for the implemented, currently executed integration/regression gate, not full workflow acceptance. Q2 is IN_PROGRESS at0: cross-screen screen/state/role/contrast/accessibility acceptance remains incomplete, despite these concrete corrections and prior per-screen evidence. No WCAG, printer, Android, live email/provider or protected platform certification. Q4 remains unfinished. Overall weighted67.0/100; goal remains active.

No business mutations, new users/access grants, provider calls, deployments or money actions in this milestone. Existing main3003/QA3007 services/data preserved; rebuilt frontend served normally.
