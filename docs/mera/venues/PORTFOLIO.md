# Synthetic venue portfolio

All businesses, people, orders and receipts are fictional. No real payments or messages are sent. The seed inserts only absent organization slugs under a transaction advisory lock; reruns preserve existing organizations, users, credentials and activity. Stable UUIDs use a private portfolio namespace. Money is in kobo.

From this worktree, start the isolated preview in one terminal:

```sh
MERA_PREVIEW_INSTANCE=venues MERA_PREVIEW_PORT=3011 MERA_PREVIEW_DB_PORT=55451 npm run preview:mera
```

Once preview migrations have completed, use a second terminal. Supply the preview's local development database login from `scripts/preview-mera.js` through a private `DATABASE_URL` environment variable (host 127.0.0.1, port 55451, database postgres). Do not use a production URL.

```sh
MERA_PREVIEW_INSTANCE=venues MERA_PREVIEW_DB_PORT=55451 \
  npm run seed:mera-venues -- --credentials-out /private/tmp/mera-venues-credentials.json
```

`DATABASE_URL` must already be exported. The credentials destination is required, absolute, outside this repository, and must not exist; it is created with mode 0600. Only counts are printed. Keep this file private. Reruns write credentials only for newly inserted organizations; retain the original file. This command does not migrate, start a server or create a database. It rejects production, missing instances, `ux-next`, non-loopback hosts, mismatched ports, URL query overrides and data-directory symlink escapes. The preview instance directory must already exist under `data/mera-demo-*`; PostgreSQL’s actual `data_directory` must match it.

| Organization / username prefix | Locations | Type / operating model |
|---|---|---|
| Kerbside Grill / `kerbside-grill` | SUR, LKI, IKJ | Quick service; shared menu, LKI main price override, independent stock |
| Oak & Ember / `oak-ember` | GDN, TER | Casual dining; shared menu, independent stock |
| Saffron Room / `saffron-room` | SRM | Reservations, deposits |
| Velvet Lounge / `velvet-lounge` | VLT | Lounge, reservations, open tabs, minimum spend |
| Pulse / `pulse` | VIP | Club, VIP bottle package, deposits, minimum spend, entry product, guest list; cutoff 07:00 |
| Harbour Hotel F&B / `harbour-hotel` | RST restaurant, POL pool bar, LNG lounge; CST central store | Hotel outlets; shared menu, central stock, room charges, sent and received transfers |
| Daybreak / Afterdark / `daybreak-afterdark` | DAY | Café with table service, open tabs and minimum spend add-ons |

Each prefix has usernames `<prefix>.<role>@example.test` for these roles: `owner`, `branch_manager`, `cashier`, `waiter`, `kitchen`, `bar`, `front_desk`, `stock_controller`, `area_manager`, `finance`, `central_stock`. Owner and finance see all locations; area manager sees the first two; central stock sees all stock locations; other staff see the first location. Kerbside's branch manager additionally has **cashier** access at LKI, manager access at SUR and no IKJ access. Users have no platform privileges. Each outlet contains 14 days of history, refunds and shifts; relevant venues also contain reservations and no-shows. Shared menu component references remain local to each branch. Stock rooms are unpublished.

## Journey checklist

- Kerbside: QR pickup → payment → preparation → ready → collected. Compare SUR/LKI main prices and stock. Owner opens All locations and compares totals. SUR cashier is denied LKI; manager switches SUR → LKI and loses manager actions.
- Oak & Ember: seat a party → add kitchen and bar items → split bill → settle both parts → close visit.
- Saffron: book → record manual deposit → cancel before cutoff → review refund; inspect no-show history.
- Velvet: open tab → add rounds → inspect minimum spend → settle → close after midnight.
- Pulse: reserve VIP table → deposit → bottle package (requires table) → guest-list door check-in → collect entry through normal order/payment → settle minimum spend → close after midnight, check 07:00 trading cutoff.
- Harbour: record room charge with room and fictional surname → verify separate payment mix → inspect central store → receive the sent transfer → compare the already received transfer and outlet stock.
- Daybreak / Afterdark: counter pickup by day → seated order → open tab → minimum-spend review → settle.
- Every venue: sign in across roles, verify navigation and denied actions, inspect daily reports, refunds and open shifts. No real funds move.

## Staging opt-in

Keep every existing staging guard and `MERA_STAGING_SEED=synthetic-v1`. Set `MERA_STAGING_VENUES=portfolio-v1` and the private `MERA_STAGING_VENUE_PASSWORD` (at least 16 characters) for the existing release command. All new venue users share that private staging password. The separate `mera_railway_venue_portfolio_v1` marker commits atomically with the portfolio. Once ready, releases never rerun it or overwrite existing data. Unknown portfolio selections and missing/short passwords fail closed. No production seed or startup hook is added.

Automated verification uses only pg-mem and pure fixtures. Actual local and staging walkthroughs require an operator to run these commands; this implementation does not run against a persistent database.
