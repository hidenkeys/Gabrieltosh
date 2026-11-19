# O7 print studio and QR correction handoff

Source correction awaiting lead's actual before/after browser review. No physical printer, live provider, public network configuration or production action was performed.

## Integration

Existing PrintStudio and QrCodes public props and root mounts are unchanged. Centrally import `src/mera/workspace/printing-qr.css` in main.tsx. No stylesheet is imported by either component. PrintStudio reuses shared `Disclosure` and `DataRegion` from `src/mera/ui/OperationalPrimitives.tsx`; native disclosure children remain mounted.

Print hierarchy: sample receipt/sticker switch and paper-size preview first, closed structured-format editor second, independent print queue third. Queue shows saved document reference, plain status and physical-output uncertainty; latest20 are initially rendered with explicit Show more, within a focusable bounded records region. Existing PrintDocument continues to render immutable paid-document snapshots and open a browser print dialog only. Sample documents are visibly marked SAMPLE/not a sale, use escaped values and never create a payment or queue item.

QR hierarchy: address status, existing code previews/open/download actions, then compact destination creation. The public address is checking/unavailable/blocked/configured according to real reads; a successful configured origin is not an internet reachability test. Preview codes remain explicitly not guaranteed publicly reachable. No address/DNS/provider settings were added. Table QR identifies a table, not a private joining code.

## Actual contracts and preserved limits

- GET/PUT B/templates: existing receipt heading/footer/showStaff/paperWidth58|80 and label width20..60/height15..150. Server returns incremented version metadata; the existing PUT schema has **no expected-version comparison**. UI retains the exact loaded object/draft and save body; no fake concurrency key was added.
- Unknown format save freezes local changed edits. Explicit Read latest saved format shows real heading/version while retaining the attempted draft; a read cannot cancel a delayed save or prove a safe retry. Reconciliation with an administrator remains necessary. This slice does not invent a safe unlock/overwrite endpoint.
- GET B/print-jobs only with canViewJobs; absent access shows its requirement, never an empty queue. Existing reasoned POST jobs/:id/reprint requires canReprint and reason3..300, creates a marked duplicate. It has **no idempotency key**. Unknown response freezes further duplicate requests; a queue refresh never resends or silently unlocks them. Receipt/label physical output is never inferred from queued status or browser dialog.
- QR GET/POST B/qr-codes and scoped PNG/SVG paths are unchanged. Backend `server/mera/qr.js` uses a branch lock to return the existing active code for exact kind/table destination. UI can therefore explicitly retry the **original destination** after an unknown response, without inventing a new API key or changing kind/table. HTTP503 origin failure blocks creation until read retry succeeds. Old branch responses cannot restore codes into a new scope.
- Both leaves use scope-keyed inner state, request-generation/abort checks and active guards for post-write continuations. Read failures, malformed results, loading and known-empty lists remain distinct; successful polling never clears write errors. Unknown state is component-local, not a durable cross-navigation recovery journal. Backend fences for template/reprint writes remain an unresolved capability, separate from hardware.

## Evidence and lead acceptance

`tests/mera-printing-qr-ui.test.tsx`: eight focused tests cover receipt/sticker preview and exact template payload, independent format/queue failed reads with retry and no false empty, frozen unknown format plus non-unlocking saved read, QR address blocking/retry, exact destination QR retry/export paths, stale branch suppression, no duplicate resend on queue refresh, and recoverable incomplete paper-dimension previews without losing drafts. Existing QR scoped-export and escaped document rendering regressions pass. TypeScript check passed during source implementation; no visual completion follows from these tests.

Lead before/after checks: same actual authorized branch at desktop/tablet/narrow; sample mode/paper-size changes, format draft retention across disclosures, save/error (use isolated fixtures), actual queue labels/preview/permission states, reasoned duplicate unknown handling without unnecessary physical submissions, QR scan/PNG/SVG/open readiness, long reference/URL/footer wrapping, keyboard focus/scroll regions,44px actions and no page-wide overflow. Hardware calibration, real physical confirmation, verified public origin/DNS/TLS and customer-device reachability remain separate launch gates. O7 still includes other subscription/support/customer-care/integration surfaces.
