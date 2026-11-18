# Decisions and external gates

2026-11-18: User explicitly requests full coordinated implementation, forbids production deployment, money movement and production data changes. PRD governs product behavior; attachments are implementation specifications, not permission to cross these boundaries.

Retain current framework and working POS; separate opt-in MERA tables and isolated demo database. No silent destructive migration. Reserve lead plus three worker slots; rotate marketing after customer/backend capacity frees. Shared file edits go through named owner.

Pricing: NGN 13,500/month and 0.1% integrated collections are proposals, not approved charges. Additional branch rate, payer, basis, rounding/refunds, trial/grace/suspension, taxes/retention and deposit/minimum-spend policies require explicit configuration and launch approval. Live Rubies, Zidi, notification delivery, hosting/DNS and physical printers are external gates; no fictitious activation or settlement.

Rubies official developer landing and fintech site were read-only inspected; neither yielded a readable verified API contract. This is insufficient evidence of wallet, settlement, refund or callback capabilities. Provider verification remains blocked pending actual authorized contract/access.

Platform authentication uses an authenticator second factor bound to the hashed current staff session, ten-minute step-up expiry, persisted replay prevention and attempt lockout. A boolean membership flag is insufficient. TOTP follows RFC6238 SHA-1/30-second parameters with published test vectors (https://www.rfc-editor.org/rfc/rfc6238). Secrets use AES-256-GCM and an explicit deployment encryption key. Only a narrowly restricted isolated-demo provisioning script is supplied; production operator provisioning/recovery is a controlled launch task, never public self-enrollment.

Production MERA startup rejects demo identity/simulator settings, ephemeral databases, insecure cookies and missing public HTTPS origin. Startup does not automatically migrate or seed a production database. A reviewed migration step must precede approved deployment. Public request limits here are process-local; distributed rate limits must be configured before multi-replica hosting.
