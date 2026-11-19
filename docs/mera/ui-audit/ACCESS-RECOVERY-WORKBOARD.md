# Access-change recovery milestone

Baseline f24cd0b, scope 1.0 weighted 67.0/100. Previous receipt-studio milestone was verified and pushed. The current milestone does not close the wider role, accessibility, provider or hardware acceptance gates.

| Owner | Files | Contract and dependencies |
| --- | --- | --- |
| Lead | AccessOperationRecovery, accessOperationJournal, member/role/workspace integration, visual evidence | One nonsecret actor/organization reference; original body only in memory; shared pause, exact check/retry and server-fenced stop; current authority before accepting responses |
| Backend | f1a1010: organization access routes, attempt helper/schema, isolated tests | Five keyed operations, current grants and actor checked under organization lock; original safe acknowledgments; append-only resolution; no invitation token in storage/replay/proof |
| Recovery reviewer | new mera-access-recovery.test.tsx only | Storage, proof mismatch, remount, sibling lock, explicit stop, secret rejection and changed-authority delayed-response coverage |
| Existing-test reviewer | member, role-manager guards and workspace tests only | Adapt fixtures to real keyed/proof contract while preserving uncertain-write and current-authority assertions |

Chrome popup dismissed by user; browser connection verified. Actual baseline 277 and own-access review 278 saved and opened. Read-only review confirms own-access changes unavailable. No invitations, grants, suspensions or role writes submitted through preview/browser. Backend changes exercised only in disposable PostgreSQL tests.

Build passes. Independent review found delayed-response authority and role acknowledgment binding gaps; both corrected. New recovery tests 8/8 pass. Existing fixture adaptations and full regression remain in progress. No visual completion or overall percentage increase claimed yet.

Final source ee6c4e8 with backend f1a1010. Full688total/686pass/0fail/2skip in51.20s; build passed. Milestone verified within stated scope; overall67.0 unchanged. Main3003 andQA3007 restarted with existing databases preserved.
