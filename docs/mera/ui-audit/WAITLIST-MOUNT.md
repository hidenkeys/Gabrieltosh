# P5 front desk waitlist correction

Source handoff awaiting lead browser verification. Main mounts and API handlers are unchanged.

## Integration

`Operations.tsx` retains existing named exports: Complaints still reexports CustomerCare; Waitlist now reexports the extracted default `Waitlist.tsx`. Other source modules were not edited. Existing `{base,disabled,save}` props still work. Optional `timeZone` accepts the actual branch timezone; default/invalid values display explicit UTC rather than silently claiming device time is branch time. Root may pass `timeZone={branch?.timezone}` and centrally import `waitlist.css` in main.tsx.

Hierarchy: recorded-arrival order active parties first; Waiting & notified / Seated & cancelled / All filters; actual status and arrival timestamp; contact/front-desk notes in an initially closed shared Disclosure; compact Add a party disclosure last. Real known contacts remain in the authorized DOM inside the closed disclosure, not omitted/redacted from the API—this is shoulder-surfing reduction, not an additional authorization boundary. Late old-scope data is suppressed entirely. Details and add-form drafts remain mounted while collapsed. No table visit is auto-created and no customer message is sent.

## Verified contracts and recovery

Source `server/mera/operations.js`: reservations.manage guards branch GET/POST/PATCH waitlist. GET returns records. POST keeps `{displayName,partySize,contact,notes}` limits1..100-name,1..100-guests,160-contact,500-note. PATCH remains `{status}` waiting/notified/seated/cancelled; seated/cancelled entries are terminal. No expected version or requestKey exists. Mark manually notified records staff external contact, not delivery.

Unknown POST freezes its original draft without blind retry; an empty refreshed list is not proof it failed. Unknown PATCH freezes that party’s further status actions while other independent parties remain workable. No read auto-resolves or resends either write. Existing successful write notification comes from the actual supplied save callback; post-write GET failure remains a separate read error, not a failed creation to repeat.

Reads distinguish initial loading, error+explicit retry, successful empty and filtered empty. Scope-keyed state and active/abort/generation guards protect reads and post-write continuations; successful reads do not erase write errors. Recovery is component-local, not a durable navigation/reload journal. This slice does not invent an abandonment endpoint, record matching proof or safe retry fence.

## Evidence and open checks

Five focused tests in `tests/mera-waitlist-ui.test.tsx` pass: oldest real active arrival first, closed-history filtering, actual branch midnight time, disclosed/escaped contact notes; failed-read retry without false empty; frozen unknown creation after empty refresh; exact status-only notification and frozen unknown update; stale branch contact exclusion.

Lead must verify actual before/after at desktop/tablet/narrow: arrival scanability, optional details/add disclosure keyboard focus,44px actions, read-error recovery, readable long party/contact/note content and no page-wide overflow, actual manual notified/seated/cancelled transitions in isolated fixtures, branch/permission revocation and unknown-write guidance. No production writes, external contact delivery or broad P5 completion are claimed. Reservation timelines, seating/table-visit creation and deposit outcomes remain their existing separate workflows.

Independent integration review added synchronous in-flight protection and authorization-denial fencing: rows/drafts are cleared, reads/writes stop, and late responses cannot restore private contacts. Six focused tests pass.
