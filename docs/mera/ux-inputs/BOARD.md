# Input modernization board

Branch: `mera-ux-inputs`. Base: `origin/mera-workspace-redesign` 1b863e1, merged staging `mera-platform` b8cfa90. Marketing branch d004bf6 is already an ancestor; remote refresh found no new marketing commits. Customer/signup/workspace visual commits imported. No API/server changes.

## Current milestone: staging release completed

Implementation: 10/10 workstreams implemented. Core release checks are complete. This is not a claim that every protected screen/state has received visual sign-off.

| Workstream | Owner | Implementation | Evidence |
|---|---|---|---|
| Shared accessible controls | owner_onboarding | Complete | Required choices, keyboard selection, buffered decimals, optional reason notes; focused tests |
| 1 Preparation tickets | bills_ui | Complete | Autosave tests; actual queued → preparing → ready browser flow; three widths |
| 2 Stock adjustment | root/customer | Complete | 19 stock/payment tests; actual isolated restock20→25 and history; three widths |
| 3 Reason presets | bills_ui/owner | Complete | Presets, Other and optional extra notes; existing reason contracts |
| 4 Money entry | bills_ui/root | Complete | Exact minor units, tender/change, denomination helpers, bounded returns; focused tests |
| 5 Searchable selections | all | Complete | Accessible comboboxes retain selected records; zero native select JSX in Mera |
| 6 Dates and party sizes | customer/bills_ui | Complete | Calendar/time controls, branch-timezone opening-hours suggestions; focused tests |
| 7 Setup and settings | owner_onboarding | Complete | Six-step review, service switches, role templates; browser checks found and fixed stretched inputs |
| 8 Filters | all | Complete | Chips and searchable choices; integrated workspace/shift85tests pass |
| 9 Guest forms | customer | Complete |146guest regression tests pass; reservation controls captured at all three widths |
|10 Copy and content | all | Complete | Plain-language labels, UTC follow-up/history controls;36focusedtests pass |

## Verification baseline

- Full `npm test`:877 tests,874passed,3skipped,0failed. Log `/private/tmp/mera-ux-final-tests.log`. This run preceded final reason notes, opening-hours suggestions and copy/calendar additions; these additions have dedicated passing suites.
- TypeScript/build passed on final source slices; final combined build passed; core screenshot checks completed.
- Browser isolated preview3008/database55448 only. Existing3003 and store data unchanged.
- Real browser evidence: preparation counts saved and ticket reached ready; stock restock saved20→25; POS item selection and server quote total₦1,500 succeeded without submitting/payment; six-step settings review navigated. No console errors in checked session.
-390/820/1440 screenshots are under `screenshots/`. Evidence includes discovered defects; not all files constitute final visual acceptance. POS clipping and setup stretched fields triggered fixes, confirmed in final desktop/phone recaptures. The tablet POS basket scrolls independently; quantity remains accessible. Payment desktop screenshot predates the general field-height fix, while the source fix is present in the released build.
- Preview session expired during a long run; normal sign-in restored access. The first phone capture showed expiry; `pos-390.png` now shows the restored cart and working quantity control.

## Contract limitations

- Opening-hours suggestions are preferences, not live table-capacity availability. Existing backend remains authoritative.
- Daily report/export DTO accepts one business date: Today/Yesterday/Custom remain truthful; multi-day aggregation is not fabricated. Invoices support range presets.
- Optional help notes are entered before sending; the API has no append-note endpoint.
- Physical printing, real payments and production deployment are outside this frontend validation.

## Release

- Source commits pushed through `2068bd9`. Evidence commit `bea96ae` pushed.
- Railway web and jobs successfully deployed exact `2068bd9131811af4834009aff8cc515ad4bcef9b` from `mera-ux-inputs`. Health200; public signup and provider email capabilities preserved. Hosted sign-in verified in Chrome. See `deploy/STAGING-2068BD9-EVIDENCE.json`.
- Production was not changed. No live payments, customer emails or real accounts created in this task.
- Core visual evidence covers preparation, stock, POS, cash-entry, branch setup and guest reservations at390/820/1440. Exhaustive screenshots of every secondary form and protected platform screen have not been claimed. Hardware printing remains untested.
- Final app console inspection had no app-origin errors; two unrelated Zotero Chrome-extension connection errors were observed.
