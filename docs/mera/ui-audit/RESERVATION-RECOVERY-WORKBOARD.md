# Staff reservation recovery milestone

Verified baseline: 63.8/100. Scope 1.0 remains frozen. This milestone is in progress; no completion credit yet.

| Owner | File ownership | Dependency / state |
| --- | --- | --- |
| Lead | OrganizationWorkspace, API helper, main CSS import, integrated tests, evidence and progress | Replaced original fresh-key form with recovery leaf; global recovery navigation and fail-closed logout integrated; build passed; regression verification underway |
| Backend | reservation-attempts, narrow router mount, backend tests | Staff own-request lookup and durable stop fence, same branch lock; expected actor header checked before mutation; focused and disposable PostgreSQL tests passed |
| Visit tools | ReservationRequest, staffReservationJournal, scoped CSS and focused tests | Exact original intent persisted before dispatch; reload/branch recovery, proof validation, private-data redaction; successful-draft reset under final review |
| Independent review | Read-only contract/privacy audit | Actor expectation and failed-redaction logout gates incorporated; no additional blocking defect reported |

Browser reconnected after the user dismissed the extension popup. Original main reservation screen saved and opened as screenshot 212. Main and QA databases remain unchanged by this milestone. New runtime routes are not verified until the preview is restarted with final source.

Remaining acceptance: final focused and workspace regression tests, API actor/key integration tests, full regression/build, real desktop/tablet/phone browser checks and matched screenshot comparison, optional synthetic disposable booking with exact provenance/cleanup, commit/push and tracker update. Hardware printing, managed-browser download restrictions, remaining role/platform flows and protected operator access are separate unresolved gates.

Final integration: native datetime input synchronization corrected after actual browser finding; full suite599/597pass/0fail/2skip44.07s; explicit focused12pass and integratedparent4pass; final build passed. Main and QA restarted using existing databases. Actual834/390nooverflow and matched2782×1110main comparison inspected. Normal synthetic booking accepted; deliberately invalid-date request survived navigation/reload, authoritative missing lookup stayed locked, explicit stop confirmed on phone. No live network-drop injection claim. QA cleanup initially rolled back because append-only audit guard rejected deletion; guard remains enabled, two immutable synthetic audit events will be retained honestly while only allowed mutable fixture records are removed. No extra weighted completion credit for this recovery slice; P5 broader acceptance remains in progress.

Restoration verified: exact own booking and resolution removed (2mutable rows); two immutable synthetic audit events retained. All90baseline record content hashes, exact branch settings and financial/stock/print/order counts unchanged; audit29→31 is the explicit expected delta. Guard never disabled. Actual221 confirms0QAreservations. Source/evidence committed at942d77e; tracker stays63.8/100 because fullP5 acceptance remains outstanding.
