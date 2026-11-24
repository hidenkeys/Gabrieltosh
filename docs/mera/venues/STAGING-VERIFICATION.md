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
| Hosted API acceptance | integration_checks | 17 passed, zero failures, 3 closed-hours scenarios blocked |
| Manual workspace/report check | coordinator | Owner login, All locations totals, queued export ready for download |
| Evidence and credentials handoff | coordinator | Credentials private, no secrets committed |

## Evidence and limits

- `../../audit/venues-staging/walkthrough.json`: UI sign-in, navigation, roles, seeded history and responsive assertions at 390/820/1440. This is not 680 completed transactions.
- `../../audit/venues-staging/api-checks.json`: seven owner and seven cashier contexts, location configuration, secure cookies, tenant/platform isolation, manager role overrides, persisted guest check-in and stock-transfer receive/cancel.
- Direct screenshot review: Kerbside All locations at 390 and 1440; Pulse overview at 390. Pulse shows prior trading day 2026-11-23 and ₦180,000. Not every screenshot was manually reviewed. The Pulse guest-list tablet image caught loading; API persistence is separate evidence.
- Actual synthetic writes: one Pulse guest-list entry and one-person check-in, one hotel central-stock transfer of two units received, another one-unit transfer cancelled, and one organization CSV export. Seed history/settings preserved. No real money, email, production records or launch action.
- Kerbside combo checkout, Oak package checkout and Harbour room-charge lifecycle were not exercised on staging because the configured venues were closed at test time. Hours were not bypassed. Prior isolated PostgreSQL lifecycle tests are recorded in VERIFICATION.md; they do not replace these hosted gates.
- Chrome displayed the CSV job as ready in one attempt. The browser download confirmation timed out; do not count that action as a confirmed browser download. Screenshot: `../../audit/venues-staging/report-ready.png`.
- Physical receipt/sticker printing, live financial providers and production readiness remain separate gates.

## Access and rollback

Owner usernames are `<venue-slug>.owner@example.test`, for kerbside-grill, oak-ember, saffron-room, velvet-lounge, pulse, harbour-hotel and daybreak-afterdark. All use the private staging venue password delivered to the user. Staff role usernames and credentials are in the private local file `/private/tmp/mera-staging-venues-20261124.json`, mode 0600. They are organization accounts, not platform operators.

Previous code revision `2068bd9131811af4834009aff8cc515ad4bcef9b` remains recorded as the rollback candidate, with previous web deployment `92fe51ba-9c07-4b9f-a8ea-09468e7afc1a` and jobs `56f29a93-dec1-456e-83f5-d31974a8338d`. Migrations are additive, but old code does not understand all new venue behavior. Review before rollback after new transactions; do not replace the database or rerun seeds.
