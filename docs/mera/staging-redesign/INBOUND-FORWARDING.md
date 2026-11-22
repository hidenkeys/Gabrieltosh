# Scoped inbound forwarding

Implemented 21 November 2026. New Resend **Inboxes API**, not legacy receiving or AI agents. No live message or provider configuration was sent by this implementation workstream.

## Fixed route and scope

Webhook: `/api/mera/webhooks/resend-inbox`, subscribed only to `inbox.email.received`. The coordinator created webhook `01886694-5483-4c77-bc30-835b7e9932bc` for the staging URL. Runtime enablement requires `MERA_ENABLED=true`, `MERA_INBOUND_FORWARDING_ENABLED=true`, `RESEND_INBOX_WEBHOOK_SECRET`, and the existing `RESEND_API_KEY`. Keep the secret outside source control.

Only inbox `2cd7a3e7-fc63-4627-9672-fab561bab98b`, `meratech@notify.zidihq.com`, is forwarded, solely to `letimapro23@gmail.com`. Those values are fixed in the module; incoming content cannot choose recipients, URLs, headers or actions. Outbound events and other inbox IDs are ignored. A normal inbound reply from Gmail remains eligible; sender identity is not used as an authorization substitute.

The raw Express route precedes JSON parsing/browser CSRF middleware and uses Svix HMAC verification with exact raw bytes, strict header parsing, constant-time comparison and a five-minute timestamp tolerance. Only this exact route uses webhook authentication; other API CSRF protections remain intact. Limit: 256 KB webhook JSON. No message bodies, subjects, attachments, API keys or signatures are logged or persisted. The journal stores inbox/thread/email/event IDs, status, numeric HTTP result and attempt timestamps.

## Delivery and recovery

The module calls Resend's native `POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/forward` with only the fixed `to` list. Resend includes the original message and attachments; the application does not fetch, transform, drop or interpret them. Provider limits can reject oversized/unsupported originals; those are not silently forwarded without attachments.

Durable row locking and one row per inbox/email prevent duplicate sends. The deterministic idempotency key and fixed body are reused within a maximum **23-hour** window from first dispatch, below Resend's documented 24-hour retention. Concurrent sending leases remain locked for 30 seconds; stale leases recover after crashes. Accepted is terminal and cannot be overwritten by an older uncertain result. A valid sent-email UUID is required for acceptance; transport/timeout/malformed responses remain unknown. Response-body reading is covered by the eight-second timeout.

The webhook returns 2xx only for accepted or ignored events. Uncertain/rejected/transient states return 503 so Resend's delivery retries drive recovery; no separate worker or automatic responder is added. At 23 hours the row becomes `review_required` and will not dispatch again, including manual webhook replay. Review the provider result before any intentional new forward. Resend's finite retry schedule is not an indefinite queue: failed deliveries need dashboard/operator review if automatic attempts are exhausted. Provider acceptance is not proof of Gmail inbox delivery.

## Official sources checked

- [Resend official OpenAPI](https://github.com/resend/resend-openapi/blob/main/resend.yaml): Inboxes sending-access permissions, native forward route, event fields and idempotency contract. A domain-scoped **sending** key can forward for its domain; full access is needed for other management/read endpoints, not this runtime operation.
- [Resend Inboxes reference](https://github.com/resend/resend-skills/blob/main/skills/resend/references/inboxes.md): native forwarding retains original attachments; unsupported URL-path originals or size limits may return 422.
- [Resend webhook setup reference](https://github.com/resend/resend-skills/blob/main/skills/agent-email-inbox/references/webhook-setup.md): raw Svix headers, delivery retries and replay.
- [Svix manual signature verification](https://docs.svix.com/receiving/verifying-payloads/how-manual): signed bytes and HMAC comparison.

## Validation boundary

Focused tests use mocked Resend transport and an in-memory PostgreSQL-compatible engine: signature/tamper/time checks; exact fixed forwarding call; no private-content persistence; duplicates; unknown same-key replay; foreign/outbound ignore; stale lock and 23-hour cutoff; accepted terminal; retryable webhook response; scoped middleware ordering. These do not prove actual Gmail receipt or attachment rendering. A separately authorized real inbox message/attachment test and recorded provider acceptance plus Gmail receipt are required for end-to-end acceptance.
