# Owner email verification integration

Implemented 21 November 2026. This workstream used mocked delivery only: no actual message, provider configuration, production mutation or deployment was performed by the author. Runtime enablement and the approved real staging email test belong to the coordinator.

## Enablement contract

Provider registration opens only when `MERA_OWNER_VERIFICATION_ENABLED=true`, `MERA_IDENTITY_TOKEN_SECRET` contains at least 32 characters, `MERA_EMAIL_ALLOWED_RECIPIENTS` is explicitly populated, and the existing Resend adapter reports valid enabled configuration. Preserve the secret securely across deployments; rotation changes deterministic challenge derivation, so existing send retries fail closed rather than sending a different token under the same provider idempotency key. Initial staging allowlist is the user-approved test mailbox only. Sender authorization must be verified independently; syntactically valid environment values are not evidence that a domain is authorized.

Existing simulator behavior remains limited to explicit non-production demo mode. Its challenges default to `simulator`; provider verification selects only `provider` challenges, and simulator verification only `simulator`. Existing organization creation still requires a provider-verified owner outside demo mode. Staff memberships and platform MFA are untouched.

## Endpoints and recovery

- `GET /identity/capabilities`: adds `registration: provider` / `emailDelivery: provider` when explicitly enabled; otherwise existing simulator/blocked behavior.
- `POST /identity/provider/register`: UUID requestKey, name, normalized email, password (12–128 characters). Recipient allowlist is checked before database mutation. Creates an inactive user, bcrypt password hash, provider challenge and durable request transactionally. The acknowledgement includes requestKey, verification-required state, expiry, retry availability and delivery state, never the real token/contact/password. Same-key register only matches the original name/email/password; different input conflicts.
- `POST /identity/provider/recover`: original requestKey only; returns non-identifying receipt/delivery state without sending. Unknown/missing outcome does not invite a new account. Frontend performs no automatic resubmission on reload.
- `POST /identity/provider/retry`: original requestKey only; retries the same fixed message and same Resend idempotency key. It cannot select another recipient or body. After the one-hour challenge expires, or sender/origin/reply-to/secret changes, it refuses repeating that expired delivery; the explicit resend flow below issues a new challenge. This is bounded inside the provider's 24-hour idempotency window. A still-running send is not dispatched again within 30 seconds.
- `POST /identity/provider/verify`: explicit token consumption. Atomically rejects expired, consumed or wrong-mode challenges and activates the user with `verification_mode=provider` only after a valid challenge.

The real email link is `/mera/signup#verify=<token>`. The existing signup page captures and removes the fragment; merely opening it does not issue a verification POST. The user chooses **Verify email**. The token is retained only in component memory, never in recovery storage. Reopening the email link is needed after reloading the stripped verification page. Consumed-link or unknown-verification outcomes advise trying sign-in, not blind automatic activation/retry.

Only a challenge hash is stored; the original token is deterministically reconstructed with HMAC from an unguessable challenge ID and the separate server secret for exact email retry. Delivery records contain no plaintext token or password. Browser recovery stores only the registration UUID. An unrelated existing recovery reference is not erased by verifying a different email link.

Delivery states distinguish pending, sending, unknown, not_sent and accepted. Accepted means Resend accepted the request, **not inbox delivery**. A malformed provider acknowledgement remains unknown. A definite allowlist rejection permits correction without retaining the password. Expired requests never resend automatically. The explicit resend flow below rotates the challenge for the existing account.

## Files and validation

Backend: `server/mera/provider-identity.js`, `identity.js`, `identity-schema.sql`. Frontend: `src/mera/ProviderSignup.tsx`, `Signup.tsx`. Existing `email-provider.js` adapter is reused unchanged.

Validation: 21 focused tests passed across provider identity, provider signup, existing signup and signup recovery; TypeScript passed. New tests exercise actual SQL through an in-memory PostgreSQL-compatible engine with mocked transport, provider fragment-token delivery, explicit activation, consumed/expired/wrong-mode rejection, before-write allowlist, identical unknown-send retry, malformed acknowledgements, recovery without stored secrets, and no automatic verification on page open. This does not substitute for real PostgreSQL migration, real Resend acceptance, mailbox receipt or browser end-to-end verification.

## Explicit public signup policy — 21 November update

The user subsequently authorized public owner signup on **staging**, replacing the initial single-recipient restriction. Set `MERA_EMAIL_RECIPIENT_POLICY=public` on the staging web service to permit valid recipient addresses. This explicit value intentionally overrides any retained legacy `MERA_EMAIL_ALLOWED_RECIPIENTS`; removing a list by accident does not open owner signup. `MERA_EMAIL_RECIPIENT_POLICY=allowlist` requires a nonempty valid list. Omitted policy preserves prior transport semantics and existing allowlists, while owner signup still requires either a valid list or explicit public mode. Unknown/empty/malformed policy values fail closed. Existing email-enable, owner-verification-enable, sender/origin/key and token-secret gates remain required.

Capabilities now expose only `recipientPolicy: public|allowlist`, not addresses. Public signup no longer displays approved-recipient restriction text. Verification is still required before activation and organization creation. Fixed inbox-to-Gmail forwarding is independent and unchanged.

New regression coverage sends a mocked verification email to an address absent from the old list, proves that actual organization-creation handler rejects this owner before verification, consumes the actual challenge, verifies the user is active, and invokes that handler to create an owner-scoped organization/first branch with ordering paused and billing disabled. This uses an isolated in-memory database and actual route handler, not a real login cookie or live mailbox. Browser login/verification/create-organization remains the coordinator's end-to-end check. No production environment setting, real email, account or organization was changed by these tests.

## Existing owner recovery and resend — 21 November update

- `POST /identity/provider/resend {requestKey,resendKey}` rotates the existing owner’s provider challenge without creating another account. The original opaque recovery capability authorizes the action. A fresh UUID identifies the new intent; its recorded parent and owner must match on replay. Existing provider tokens are expired in the same transaction. A new challenge lasts one hour.
- `GET /identity/owner-status` binds to the signed-in user and returns `verified`, `unverified`, `no_owner_identity`, or `platform_operator`. Only that user’s actual owner identity supplies an email. Platform membership never fabricates email verification or permits owner creation.
- `POST /identity/owner-resend {resendKey}` is bound to the signed-in owner and supports optional `X-Mera-Actor-Id` mismatch protection. It uses the recorded parent on exact replay even if the current latest request changes.
- `POST /identity/provider/recover-account {email,password}` checks the existing owner password, including inactive accounts, before returning its latest non-identifying receipt and opaque capability. It never sends mail, activates, or creates an account. Wrong password, unknown email and missing provider request share a generic denial. Password is not persisted in browser recovery.

Receipts add `verified`, `expired`, `superseded`, `canResend`, `resendAvailableAt`, and `reason` while retaining the original delivery fields. Resend is explicit; cooldown is 60 seconds and the cap is five new requests per rolling 24 hours including initial registration. An unknown resend retains its exact UUID and original message. Explicit replay dispatches that same child only while retryable; accepted, verified, superseded and expired requests do not dispatch again. Accepted remains provider acceptance, not evidence of inbox receipt.

Per-IP fifteen-minute rate buckets separately cap sends at five, receipt reads at thirty, credential attempts at ten, and verification attempts at ten. Credential guessing cannot consume the receipt-read budget. Account-level limits and identity-first database locks remain authoritative for rotation; verification acquires the same identity lock before consuming the challenge.

Validation: 11 backend tests pass, including expired rotation, prior-token rejection, stable replay, exact uncertain resend body/provider key, cooldown/day cap, cross-account key rejection, operator/staff/owner status, generic credential recovery for inactive owners, no implicit delivery, and independent rate buckets. Existing verification-before-organization-creation test still passes. Tests use pg-mem and mocked delivery: they do not establish real PostgreSQL concurrent lock behavior or real mailbox delivery. No live emails or deployment were performed in this backend workstream.
