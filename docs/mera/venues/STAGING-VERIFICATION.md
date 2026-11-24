# Staging acceptance — 24 November 2026

User authorized deployment of mera-ux-next with the seven fictional venues and hosted workflow checks. Production was not touched.

## Release

- Origin: https://mera-web-staging.up.railway.app
- Workspace: https://mera-web-staging.up.railway.app/mera/workspace
- Application commit: `6fad4374a0b02d396cfac8a612b95cbc7bdd3785`, branch `mera-ux-next`.
- Railway project: `242b97ee-5c3d-4991-8613-ff3a2628732b`; environment: `1d313de7-1669-4ded-a6c8-4fe3581abee4` (staging).
- Web deployment: `30c51770-bc21-4ad1-8089-5a0b4ad4fef4`, SUCCESS. Guarded migrations ran before startup; health returned 200, ok=true, local=false, mode=simulation.
- Jobs deployment: `e496c262-b238-460a-81df-b4f00d517263`, SUCCESS, durable worker started. Deployed after web health passed.
- Both sources are pinned to the application commit. Subsequent QA/documentation commits do not automatically redeploy.
- One-time web-only portfolio opt-in and private password configured; existing staging records and Resend variables preserved. Seven venue owners successfully authenticate. Portfolio contains 13 locations (12 outlets plus a central store) and 77 role accounts.

## Shared progress board

| Milestone | Owner | Result |
| --- | --- | --- |
| Guarded release review | integration_checks | Additive migrations reviewed; no destructive schema operations |
| Web migration, portfolio and health | coordinator | Complete |
| Matching durable worker | coordinator | Complete |
| Seven-venue role/responsive walkthrough | pulse_checks | 680 passed, zero failures, 75 screenshots |
| Hosted API acceptance | integration_checks | Initial 17 passed; subsequent three checkout workflows and three hours-restoration checks all passed |
| Manual workspace/report check | coordinator | Owner login, All locations totals, queued export ready for download |
| Evidence and credentials handoff | coordinator | Credentials private, no secrets committed |

## Evidence and limits

- `../../audit/venues-staging/walkthrough.json`: UI sign-in, navigation, roles, seeded history and responsive assertions at 390/820/1440. This is not 680 completed transactions.
- `../../audit/venues-staging/api-checks.json`: seven owner and seven cashier contexts, location configuration, secure cookies, tenant/platform isolation, manager role overrides, persisted guest check-in and stock-transfer receive/cancel.
- Direct screenshot review: Kerbside All locations at 390 and 1440; Pulse overview at 390. Pulse shows prior trading day 2026-11-23 and ₦180,000. Not every screenshot was manually reviewed. The Pulse guest-list tablet image caught loading; API persistence is separate evidence.
- Actual synthetic writes: one Pulse guest-list entry and one-person check-in, one hotel central-stock transfer of two units received, another one-unit transfer cancelled, and one organization CSV export. Seed history/settings preserved. No real money, email, production records or launch action.
- Initially blocked checkout gates are now closed: after explicit user approval, only the three affected fictional branches were temporarily opened through the versioned settings API. Kerbside combo, Oak package and Harbour room-charge orders completed on staging. Original service hours and all other non-version settings fields were verified restored in each finally block.
- Chrome displayed the CSV job as ready in one attempt. The browser download confirmation timed out; do not count that action as a confirmed browser download. Screenshot: `../../audit/venues-staging/report-ready.png`. A separate authenticated API download returned HTTP 200 with a CSV attachment containing SUR, LKI, IKJ and organization totals; evidence: `../../audit/venues-staging/export-check.json`.
- Physical receipt/sticker printing, live financial providers and production readiness remain separate gates.

## Access and rollback

Owner usernames are `<venue-slug>.owner@example.test`, for kerbside-grill, oak-ember, saffron-room, velvet-lounge, pulse, harbour-hotel and daybreak-afterdark. All use the private staging venue password delivered to the user. Staff role usernames and credentials are in the private local file `/private/tmp/mera-staging-venues-20261124.json`, mode 0600. They are organization accounts, not platform operators.

Previous code revision `2068bd9131811af4834009aff8cc515ad4bcef9b` remains recorded as the rollback candidate, with previous web deployment `92fe51ba-9c07-4b9f-a8ea-09468e7afc1a` and jobs `56f29a93-dec1-456e-83f5-d31974a8338d`. Migrations are additive, but old code does not understand all new venue behavior. Review before rollback after new transactions; do not replace the database or rerun seeds.

## Checkout follow-up — completed at 05:53 Africa/Lagos

User explicitly authorized temporarily opening only the affected test branches and restoring hours afterwards. `scripts/mera-staging-checkout-check.js` targets the exact staging origin, checks synthetic portfolio markers, saves original settings privately before mutation, journals every write, and refuses automatic reruns after any previous attempt. No application defect was found; no new deployment was needed.

| Scenario | Total | Verified component stock deduction | Result |
| --- | --- | --- | --- |
| Kerbside combo, manual cash | ₦6,500 | MAIN 1, SIDE 1, DRINK 1 | Completed; original settings restored |
| Oak & Ember package, manual cash | ₦200,000 | MAIN 1, DRINK 6 | Completed; original settings restored |
| Harbour Hotel room charge | ₦4,500 | MAIN 1 | Completed; charge separate from cash; original settings restored |

Each scenario created a new order, recorded a synthetic payment, accepted the order, marked all preparation tickets ready, collected and completed it, and asserted the exact payment-method report delta. Cash scenarios also asserted the net-sales delta. The three completed QA orders and their stock/payment/audit records remain in staging. Hours and other business settings were restored, with normal settings-version increments retained.

Evidence: `../../audit/venues-staging/checkout-checks.json` (three lifecycle passes plus three settings-restoration passes; no failures). These are authenticated hosted API workflows, not a claim that every checkout was performed through browser controls. Production, real money, email and physical printers were untouched. Previous 680-check browser evidence remains separate.

## Browser end-to-end journeys

The lead runs `scripts/mera-staging-browser-journeys.mjs`; local syntax validation is not hosted acceptance. It leaves fictional transactions in staging.

```sh
RUN_ID=lead-20261124-a node scripts/mera-staging-browser-journeys.mjs --only=kerbside-grill,harbour-hotel --open-hours=kerbside-grill,harbour-hotel
```

`ORIGIN` must equal `https://mera-web-staging.up.railway.app`. `CREDENTIALS` defaults to `/private/tmp/mera-staging-venues-20261124.json`. Omit `--only` for all seven venues. `--open-hours` defaults to none; only listed, selected venues may be temporarily opened. Original settings are saved before opening and verified restored in `finally` immediately after each venue. Restoration failure stops everything with exit 2; other failures continue independently and return exit 1.

`JOURNAL` defaults to `/private/tmp/mera-staging-browser-journeys-<runId>.json` (0600). Every existing journal is refused before login, even if complete. Reuse `RUN_ID` to prevent accidental replay. Reconcile interrupted operations manually; a fresh ID intentionally creates fresh transactions. Evidence is written to `docs/audit/venues-staging-e2e/`: latest `results.json` and run-prefixed screenshots at 1440, plus 390 for guest steps. No credentials, cookies or joining codes are exported.

The runner's first step for Oak, Velvet, Pulse and Harbour uses the owner settings UI to enable “Allow preparation before full payment” when off. It journals this as a permanent configuration change before taking the temporary-hours snapshot; hours restoration does not undo it. New type defaults do not rewrite existing staging data. This source update still needs the lead's build/release and hosted rerun.

Walk-in party size now uses a stepper and persists `partySize`; guest cancellation uses preset reasons plus Other. Saffron records its required deposit before front-desk confirmation. Chip radios are clicked and their `aria-checked` state verified. The hotel surname field still accepts letters only: fictional “Fable” is used, with the run marker in the order name and payment note.

Lead to fill after reviewing hosted results and screenshots:

| Venue | Run ID | UI / server assertions | Screenshot review | Result / follow-up |
| --- | --- | --- | --- | --- |
| Kerbside Grill (SUR) | — | — | — | — |
| Daybreak / Afterdark | — | — | — | — |
| Oak & Ember (GDN) | — | — | — | — |
| Saffron Room | — | — | — | — |
| Velvet Lounge | — | — | — | — |
| Pulse | — | — | — | — |
| Harbour Hotel (POL; CST → RST) | — | — | — | — |
