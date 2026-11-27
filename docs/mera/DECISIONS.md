# Decisions and external gates

2026-11-18: User explicitly requests full coordinated implementation, forbids production deployment, money movement and production data changes. PRD governs product behavior; attachments are implementation specifications, not permission to cross these boundaries.

Retain current framework and working POS; separate opt-in MERA tables and isolated demo database. No silent destructive migration. Reserve lead plus three worker slots; rotate marketing after customer/backend capacity frees. Shared file edits go through named owner.

Pricing: NGN 13,500/month and 0.1% integrated collections are proposals, not approved charges. Additional branch rate, payer, basis, rounding/refunds, trial/grace/suspension, taxes/retention and deposit/minimum-spend policies require explicit configuration and launch approval. Live Rubies, Zidi, notification delivery, hosting/DNS and physical printers are external gates; no fictitious activation or settlement.

Rubies official developer landing and fintech site were read-only inspected; neither yielded a readable verified API contract. This is insufficient evidence of wallet, settlement, refund or callback capabilities. Provider verification remains blocked pending actual authorized contract/access.

Platform authentication uses an authenticator second factor bound to the hashed current staff session, ten-minute step-up expiry, persisted replay prevention and attempt lockout. A boolean membership flag is insufficient. TOTP follows RFC6238 SHA-1/30-second parameters with published test vectors (https://www.rfc-editor.org/rfc/rfc6238). Secrets use AES-256-GCM and an explicit deployment encryption key. Only a narrowly restricted isolated-demo provisioning script is supplied; production operator provisioning/recovery is a controlled launch task, never public self-enrollment.

Production MERA startup rejects demo identity/simulator settings, ephemeral databases, insecure cookies and missing public HTTPS origin. Startup does not automatically migrate or seed a production database. A reviewed migration step must precede approved deployment. Public request limits here are process-local; distributed rate limits must be configured before multi-replica hosting.

Historical migration rehearsal deliberately reports operationalOrdersImported=0 and operationalImportVerified=false: preserving historical snapshots in isolated staging proves reconciliation mechanics, not a completed production importer. Actual historical-data inclusion and cutover need a reviewed mapping/import implementation and explicit approval.

Reservation buffer/lead-time/cancellation rules are explicit per-branch policy. Unknown cancellation/late cutoffs remain null. Cancellation with held deposits or inside a configured cutoff requests staff review; it never confirms a refund. Unpaid unprepared item cancellation can reduce debt/stock holds safely; paid-item cancellation requires an explicit allocation workflow rather than silently double-crediting an existing refund.

## 2026-11-27 — Phase 5: rooms use the existing table QR contract

Hotel room service uses a `table` record named, for example, `Room 204`, with
`zone: "Rooms"`. Its QR remains `kind: "table"`; checkout remains
`fulfillment: "table_service"`, carrying the table ID and QR ID. The guest menu
includes the zone and displays “Room 204 · ordering to your room”. Harbour Hotel's
fictional portfolio now supplies this room context instead of an ordinary table.

A room QR creates an independent delivery order. It does not join an occupied
room's bill or reveal a visit joining code. Joining a running bill still requires
the private visit code. Active QR/table validation, TABLE_QR_REQUIRED, tenant
scope, guest ownership and the three-open-order cap remain in force. Room charge
is a separate staff-authorized payment method requiring `room_charge.post`; this
change does not authorize a guest to post charges, verify room occupancy, or
integrate with a property management system.

Readiness requires an active Rooms-zone location when room charge is enabled,
and an active table QR when table service is enabled. Reservations use the
existing branch guest capacity and service windows (there is no separate slot
inventory). Door capability enables the door module; readiness additionally
requires a non-deleted guest list entry or the saved `guestListWalkInsOnly`
decision in location settings. Disabled capabilities contribute no readiness row.
Service hours are required for every venue type. Billing remains off.
