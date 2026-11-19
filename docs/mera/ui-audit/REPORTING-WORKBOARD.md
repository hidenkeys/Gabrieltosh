# Reporting milestone workboard

Scope1.0 unchanged; last verified total60.4/100, published60%. Previous goal turn was progress (customer checkout milestone4c70c63). Current milestone: dated EOD review and complete report export.

| Owner | Files / task | Dependency | Current evidence |
|---|---|---|---|
| Lead | OperationalOverview/OrganizationWorkspace/main integration, date→export test, actual browser | ReportExplorer callback + ExportJobs initialDate | Integrated/tested; actual date fix and reviewed-date handoff verified,167–177 |
| Customer agent | ReportDetails/ReportExplorer/reporting.css/focused UI tests | Additive backend report DTO | Frozen/integrated;11focused tests, actual populated report and responsive review |
| Backend agent | domain report, export formatter/worker, scoped query if required, backend tests | Exact recognition/time cohort definitions | Frozen/integrated;17focused tests and actual disposable PostgreSQL worker/download passed; CSVv2 |
| Visit-tools agent | ExportJobs and focused tests | None; preserves existing API | Frozen;8new+6existing tests passed; duplicate/late/auth/uncertainty guards |

Integration gates passed: source review, affected tests, build, full regression518pass/2skip, PostgreSQL gate, preserved local server restart, actual report/job/responsive review. Browser download gate remains blocked by Chrome organization policy; no success or bypass claimed. Evidence: EOD-REPORTING-CHECKPOINT.md. Commit/push/tracker credit follows this verified partial milestone.

Constraints: No production data/deployment/real money. Do not infer dated staff/order-state data from the current live queue. Do not relabel provider costs as Mera fees. Unavailable amounts are not zero. Old stored summary CSV files remain unchanged; new format must identify itself. Remaining provider/printer/platform-QA-credential gates do not block this implementation.
