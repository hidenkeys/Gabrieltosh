# Bill split and merge recovery milestone

Baseline1e6748e, scope1.0 weighted67.0/100; previous turn verified progress on keyboard and integration gates. Preserve original Bing Chun bill cards, disclosures, financial authority and allocation math.

| Owner | Files | Contract |
| --- | --- | --- |
| Lead | Bills, new billChangeJournal, OrganizationWorkspace, existing bill UI tests, evidence | Actor/base/target/op/key reference-only marker before dispatch; exact body memory only; own authoritative outcome and fenced stop; preserve payment journal separately |
| Backend | bill-attempts, bill routes/schema, backend/integration tests | Optional actor-bound key with immutable original result; current authority; transactional replay/stop; open associated visit for new changes, valid counter splits preserved |
| Test reviewer | new mera-bill-recovery.test.tsx only | Unknown/read/remount/exact retry/stop/proof/storage/permission/scope matrix |

Fresh Chrome266 original split view saved/opened on isolated app3007. Read-only selected existing Window1 bill; no bill or payment mutation. Existing split/merge uncertainty was mounted-only and requests non-idempotent. New keys must not be mistaken for payment actions, and parent key deduplication must not replace the journal key.

GET/POSTabandon B/bills/:id/change-attempts/:operation/:requestKey. Proof actor/org/branch/bill/operation/key; status recorded/not_found/abandoned. Recorded result is ORIGINAL split{source,bill} or merge bill, plus recorded_operation_snapshot and matching operation metadata/intent. Missing outcome does not unlock. Full body never persisted in browser; after remount only check/explicit stop available. Recorded/abandoned proof alone clears reference. Existing payment collection behavior and parent financial journal preserved.

Remaining: focused/new tests, fullsuite/build/disposablePG, actual after/read-only responsive comparison, final evidence/commit/push. No production, money or live QA bill mutation authorized/performed in this milestone. Existing gate gaps outside bill changes remain tracked.

Finalsource4eeb5e6: full665pass/2skip39.93s, finalfocused13/parent78/build, disposablePG1pass2.43s. Actualread-onlyChrome266/267desktopcomparison +final270/271390/834forms verified; nativeblankvalidation, missingunitguidance/disabledaction observed. Intermediate269notformacceptance. No actualpreviewbill/paymentmutation. P3/Q3 checkpointunchanged,67.0. Bothpreviewsrestartedwithmigration/datapreserved; external/broadergates remain.
