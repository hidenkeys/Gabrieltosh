# Venue verification — 24 November 2026

Scope: finish local acceptance checks on `mera-ux-next`, preserve the existing checkout and seeded venue database, commit/push verified changes. **No deployment authorized this round.** Staging and production remain untouched.

## Shared progress and ownership

| Workstream | Owner | Status / evidence |
| --- | --- | --- |
| Trading-day reporting and legacy capability compatibility | overview_review | Complete: 24 targeted tests; committed in `62393cb` |
| Single-location navigation, conditional metrics and handheld monetary values | coordinator | Complete: combined 37 targeted tests, build/typecheck, manual Pulse captures at 390/820/1440; `a7326f2` |
| Existing PostgreSQL integration gates | integration_checks | Complete: printing 9/9, company enquiries 4/4, broad Mera 1/1; disposable clusters cleaned up |
| Seven-venue / role browser walkthrough | pulse_checks | Complete: 680/680 checks, 75 stable captures at 390/820/1440; local 3011 only |
| Historical screenshot review | pulse_checks | Reviewed all 50 captures; findings in `docs/audit/venues/SCREENSHOT-REVIEW.md` |
| New venue transaction integration journeys | integration_checks | Complete: 4/4 actual PostgreSQL journeys, actual router/authorization/persisted records; isolated database only |
| Final full suite, evidence and push | coordinator | Complete: 998 passed, 0 failed, 5 environment skips separately passed on PostgreSQL; build/typecheck passed; targeted export and final layouts verified |

## Findings resolved

- Overview presets now resolve each location's trading day using its timezone and cutoff. Before 07:00, Pulse's activity belongs to the preceding date; after cutoff, a new day can legitimately have zero sales. Tests cover both sides, week/month boundaries and DST.
- Legacy `serviceModes` locations project their effective capabilities; explicitly disabled capabilities remain disabled.
- All locations is hidden in navigation and the location picker for a single outlet. Central stock rooms do not count as a second sales outlet.
- Irrelevant zero room-charge/cover metrics are hidden; historical nonzero values remain visible after capabilities are disabled. Covers follows the guest-list measure. Daily CSV export now has its own explicit trading date, independent of overview filters, and retains its original date on uncertain retries.
- Phone branch-overview and All locations cards no longer split currency decimals onto another line. Tablet and desktop retain their multi-column layouts.
- The broad PostgreSQL test now expects the intentional anonymous `{guest:null}` read and enables capabilities through normal versioned settings. Unauthorized writes and expired sessions remain protected; deposit/minimum-spend rejection is tested before enabling them.

## Live manual checks

Chrome, real owner login, existing local Pulse account. No authentication bypass.

1. Overview showed ₦180,000 net sales for trading day 2026-11-23 before its 07:00 cutoff.
2. Mobile menu omits All locations; Escape closes the menu and restores focus to its trigger. Location picker contains only Pulse VIP.
3. Captured/reviewed overview at 390×844, 820×1180 and 1440×900. Before/after files are in `docs/audit/venues-review/`.
4. Added the synthetic guest **QA arrival verification**, checked in one guest, reloaded and confirmed the arrived state persists. This explicit QA record remains in the isolated local venue database.

## Evidence boundaries

- PostgreSQL printing uses simulated hardware, not physical receipt or sticker printers.
- No real email, money movement, production-data modification or staging deployment occurred.
- Go live was not clicked. Provider, release and hardware acceptance are separate from these local checks.
- Historical screenshot review is identified as historical. New walkthrough output must be distinguished from earlier manifests; no percentage claims based on stale boards.

## Transaction evidence

Executed on 24 November 2026 against isolated test data. These are API-level business-flow checks: they exercise the mounted router, real authorization, persisted records and assertions on the resulting state. They do **not** establish that a person completed every portfolio journey through the browser.

| Command | Result | Database and evidence |
| --- | --- | --- |
| `npm run test:postgres` | 9 passed, 0 failed, 0 skipped | Disposable PostgreSQL on 55439. Includes receipt before individual labels, preparation advancement, fulfillment, reporting and refund. Log: `/private/tmp/mera-remaining-legacy-pg.log`. Printing is simulated. |
| `RUN_MERA_COMPANY_PG_TESTS=true node --test tests/mera-company-leads.test.js` | 4 passed, 0 failed, 0 skipped | Disposable PostgreSQL on 55445. Duplicate enquiries, private attachments, MFA, concurrent changes and audit rollback. Log: `/private/tmp/mera-remaining-company-pg.log`. |
| `npm run test:mera:postgres` | 1 broad integration scenario passed, 0 failed, 0 skipped | Disposable PostgreSQL on 55442; many sequential assertions in `tests/mera.integration.test.js`. Includes tenant boundaries, last-unit concurrency, order/payment lifecycle, table/guest privacy, reservations, refunds, minimum spend and shifts. Log: `/private/tmp/mera-remaining-mera-pg.log`. |
| `node scripts/test-mera-venue-journeys.js` | 4 passed, 0 failed, 0 skipped | Disposable PostgreSQL on 55446. New mounted-route journeys in `tests/mera-venue-journeys.test.js`. Log: `/private/tmp/mera-venue-journeys-pg.log`. |
| `node --test tests/mera-venue-journeys.test.js` | 2 passed, 0 failed, 2 explicitly skipped | Default pg-mem mode covers door and stock-transfer journeys. Checkout/payment require PostgreSQL because pg-mem does not implement the SQL used by those routes. Both skipped cases passed using the preceding PostgreSQL command. Log: `/private/tmp/mera-venue-journeys-memory.log`. |

The new venue fixture starts with portfolio product/location definitions and no historical orders or payments. It tests newly submitted transactions rather than interpreting existing seed rows as proof that a workflow succeeded. Disposable clusters were stopped and removed. Pool-shutdown failure cannot prevent a cluster-stop attempt; files are retained if cluster shutdown fails. The existing venue preview database on 55451 was not used by these tests.

### Coverage against the seven portfolio journeys

| Portfolio scenario | Executed transaction evidence | Boundary still requiring browser or broader scenario acceptance |
| --- | --- | --- |
| Kerbside Grill | New venue test persists package/combo orders, component stock holds, exact-key replay, cancellation restoration, invalid choice rejection and foreign-product rejection. Broad integration exercises guest order, payment, preparation, collection/completion and reports. | The broad lifecycle uses its own integration fixture, not a complete Kerbside browser sale. SUR/LKI price comparisons and manager role switching are separate UI/portfolio checks. |
| Oak & Ember | Broad integration opens table visits, orders against a visit, splits/merges bills, allocates payments and tests visit-closing restrictions. New venue checks reject another tenant's product and authority. | No claim that the complete Oak & Ember seated-party journey was repeated in the browser by these tests. |
| Saffron Room | Broad integration submits reservations, records deposits, exercises cancellation/deposit outcomes, returns/forfeiture, seating and capacity protections. Deposit capability denial is checked before enabling it through normal settings. | These API assertions do not verify every Saffron date-picker, policy disclosure or refund screen interaction. |
| Velvet Lounge | Broad integration covers pay-later/table debt, minimum-spend acknowledgement, shortfall handling and closure guards. Minimum-spend capability denial is checked before enabling it. Reporting tests separately cover trading-day cutoffs. | No new test claims a complete Velvet multi-round browser service spanning midnight. |
| Pulse | New venue test creates a guest-list entry, checks in a guest, replays without double counting, rejects over-capacity check-in and denies cashier/cross-tenant access. A separate journey rejects bottle-package checkout without a table, opens an acknowledged VIP visit, accepts the table package and deducts six mixers from persisted stock. | Guest-list check-in and table-package checkout are verified API segments, not one complete browser booking → deposit → entry payment → minimum-spend settlement → overnight close journey. |
| Harbour Hotel F&B | New venue test denies a cashier room-charge authority, records and replays an owner room charge once, moves the order through acceptance, ticket readiness, collection and completion, then verifies revenue and a distinct room-charge payment mix. Another journey sends central stock, partially receives it, records loss, cancels a second transfer, verifies replay and denies cross-tenant actions. | The charge remains an internal recorded hotel charge; no external hotel settlement or real funds are exercised. Browser forms and the external hotel accounting process require their own acceptance. |
| Daybreak / Afterdark | Broad integration covers the constituent counter, table, pay-later and minimum-spend rules. Venue contracts/portfolio tests establish its selected add-on capabilities. | No dedicated day-to-night browser service session is implied by the shared backend assertions. |

The new venue tests use a minimal relational schema and normal application routing. They complement, rather than replace, the broad PostgreSQL suite's full migration, concurrency and append-only protections. Provider delivery, real payments, physical printers, production readiness and staging deployment remain outside this transaction evidence.


## Final acceptance checkpoint

- Seven-venue role/navigation walkthrough: **680 passed, 0 failed**, 75 stable screenshots at 390×844, 820×1180 and 1440×1000. `docs/audit/venues/walkthrough.json` records the run. Screenshots use reduced motion and settled layout; they do not certify normal animation timing.
- Final reporting/export check: **14 passed, 0 failed**. One local synthetic Kerbside CSV job completed and its UI download contained SUR/LKI/IKJ and kobo-labeled columns. Export date remained 2026-11-23 while overview selected This week.
- After the last CSS-only correction, targeted recapture: **12 passed, 0 failed**, all three multi-outlet businesses at all three widths, including single-line metric values. Nine final captures and before/after comparison are in `docs/audit/venues-review/`; no extra export job was created.
- Default suite: **998 passed, 0 failed, 5 environment-dependent skips**. All five skipped cases were exercised successfully by the four dedicated PostgreSQL commands above. `TEST-RESULTS.json` records counts and commands.
- Final build and TypeScript passed. Existing Vite large-chunk advisory remains; no build error. Final CSS-only adjustment was built and browser-verified after the full functional suite.
- Local preview remains at http://127.0.0.1:3011/mera with the existing venue database on 55451. Existing seeded data was preserved; one clearly labelled QA guest and one synthetic CSV export are the intentional browser-test records.
- Commits: `62393cb` trading-day compatibility/integration fixtures; `a7326f2` navigation/metrics; `a7f96f8` scoped walkthrough; `05b6efe` persisted venue journeys; `11bb9ee` history/daily-export clarity and cleanup; `0dce346` final currency layout/stable captures.

The requested local verification pass is complete. Staging release and staging validation are deliberately deferred by the user's no-deployment instruction. Physical printer/Windows-device acceptance and live provider acceptance remain external gates. The API transaction journeys and browser role/navigation/reporting checks are separate evidence layers; this checkpoint does not claim every seven-venue commercial journey was manually repeated from beginning to end in a browser. No Go live click was made.
