# Overview and order-review milestone

Baseline62.6/100 at8f7faae, scope1.0 unchanged. Previous goal turn was progress: People correction committed/pushed with full regression and browser evidence.

| Owner | Files / task | Contract and state |
| --- | --- | --- |
| Lead | OperationalOverview.tsx, overviewPresentation.ts, parent order filters, scoped overview CSS, UI tests/evidence | Correct expired/current/unavailable service classification; safe time/text/counts; direct active/delayed/reference queue selection;17focused and integrated drilldown test passed; responsive correction in review |
| Visit-tools | OverviewAttention.tsx, ServiceAttention.tsx, attention tests | Frozen; safe arrival/clock/timezone/age/variance states, missing threshold honest, hidden counts, optional reference drilldown;6focused plus existing pilot passed |
| Backend reviewer | Read-only snapshot contract; temporary QA fixture only | Snapshot success includes all SQL-active orders under cap; capacity returns error, history.liveOrders is not active count. Four zero-value delayed orders/13new rows only in verified frontdeskQA database, no existing/financial/stock/security changes. Exact manifest cleanup prepared, not yet executed |

Actual baseline191 captured/opened; shows two expired-payment orders counted as active despite empty server alerts. New main classification excludes them. QA positive192/global4alertcount,3listed+1more verified; specific reference opens only its order193 and branch alert opens4delayed articles with Waiting-time alerts filter. Initial desktop full-page provider repeats were rejected and recaptured viewport-only. Phone390 no document overflow, but first table squeezed offscreen action into extremely tall rows; rejected capture and added bounded960px table/column widths. Final phone/tablet visual checks pending; no production/security/payment write.

QA fixture manifest /private/tmp/mera-overview-qa-0159E9.json, zero-value LOCAL-OVERVIEW-QA-0159E9-1..4. Cleanup must delete only exact13 inserted rows after visual checks, verify original financial/stock/print counts and restored report/current queues. Never infer production readiness from this synthetic clock fixture.

Next gates: final handheld/tablet and matched main captures → fixture cleanup/restoration proof → full regression result → checkpoint/tracker/commit/push. Other alert destinations remain permitted module links; no product/reservation IDs or financial balance policies invented.

Final gates passed: build;17focused plus parentdrilldown; full suite570pass/2skip; actual390/834layouts corrected; matched main2782×1110 before/after inspected. Exact13fixture rows cleaned, original3orders/financial-stock-print counts restored, browser197 confirms no fixture. Final refinement build/focused integration passed. See OVERVIEW-OPERATIONS-CHECKPOINT.md. Ready commit/push/tracker; remaining scope active.
