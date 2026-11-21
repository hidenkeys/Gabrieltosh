# Owner email verification integration

Implemented 21 November 2026. This workstream used mocked delivery only: no actual message, provider configuration, production mutation or deployment was performed by the author. Runtime enablement and the approved real staging email test belong to the coordinator.

## Enablement contract

Provider registration opens only when `MERA_OWNER_VERIFICATION_ENABLED=true`, `MERA_IDENTITY_TOKEN_SECRET` contains at least 32 characters, `MERA_EMAIL_ALLOWED_RECIPIENTS` is explicitly populated, and the existing Resend adapter reports valid enabled configuration. Preserve the secret securely across deployments; rotation changes deterministic challenge derivation, so existing send retries fail closed rather than sending a different token under the same provider idempotency key. Initial staging allowlist is the user-approved test mailbox only. Sender authorization must be verified independently; syntactically valid environment values are not evidence that a domain is authorized.

Existing simulator behavior remains limited to explicit non-production demo mode. Its challenges default to `simulator`; provider verification selects only `provider` challenges, and simulator verification only `simulator`. Existing organization creation still requires a provider-verified owner outside demo mode. Staff memberships and platform MFA are untouched.

## Endpoints and recovery

- `GET /identity/capabilities`: adds `registration: provider` / `emailDelivery: provider` when explicitly enabled; otherwise existing simulator/blocked behavior.
- `POST /identity/provider/register`: UUID requestKey, name, normalized email, password (12–128 characters). Recipient allowlist is checked before database mutation. Creates an inactive user, bcrypt password hash, provider challenge and durable request transactionally. The acknowledgement includes requestKey, verification-required state, expiry, retry availability and delivery state, never the real token/contact/password. Same-key register only matches the original name/email/password; different input conflicts.
- `POST /identity/provider/recover`: original requestKey only; returns non-identifying receipt/delivery state without sending. Unknown/missing outcome does not invite a new account. Frontend performs no automatic resubmission on reload.
- `POST /identity/provider/retry`: original requestKey only; retries the same fixed message and same Resend idempotency key. It cannot select another recipient or body. After the one-hour challenge expires, or sender/origin/reply-to/secret changes, it refuses sending and requires account review. This is bounded inside the provider's 24-hour idempotency window. A still-running send is not dispatched again within 30 seconds.
- `POST /identity/provider/verify`: explicit token consumption. Atomically rejects expired, consumed or wrong-mode challenges and activates the user with `verification_mode=provider` only after a valid challenge.

The real email link is `/mera/signup#verify=<token>`. The existing signup page captures and removes the fragment; merely opening it does not issue a verification POST. The user chooses **Verify email**. The token is retained only in component memory, never in recovery storage. Reopening the email link is needed after reloading the stripped verification page. Consumed-link or unknown-verification outcomes advise trying sign-in, not blind automatic activation/retry.

Only a challenge hash is stored; the original token is deterministically reconstructed with HMAC from an unguessable challenge ID and the separate server secret for exact email retry. Delivery records contain no plaintext token or password. Browser recovery stores only the registration UUID. An unrelated existing recovery reference is not erased by verifying a different email link.

Delivery states distinguish pending, sending, unknown, not_sent and accepted. Accepted means Resend accepted the request, **not inbox delivery**. A malformed provider acknowledgement remains unknown. A definite allowlist rejection permits correction without retaining the password. Expired requests have no automatic resend/new-account path in this integration; review is intentional to avoid ambiguous duplicate identities.

## Files and validation

Backend: `server/mera/provider-identity.js`, `identity.js`, `identity-schema.sql`. Frontend: `src/mera/ProviderSignup.tsx`, `Signup.tsx`. Existing `email-provider.js` adapter is reused unchanged.

Validation: 21 focused tests passed across provider identity, provider signup, existing signup and signup recovery; TypeScript passed. New tests exercise actual SQL through an in-memory PostgreSQL-compatible engine with mocked transport, provider fragment-token delivery, explicit activation, consumed/expired/wrong-mode rejection, before-write allowlist, identical unknown-send retry, malformed acknowledgements, recovery without stored secrets, and no automatic verification on page open. This does not substitute for real PostgreSQL migration, real Resend acceptance, mailbox receipt or browser end-to-end verification.
