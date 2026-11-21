# MeraTech Resend setup

Status on 21 November 2026: configured and deployed to staging. Resend confirms delivery of the direct Gmail test, the incoming inbox test, and the automatically forwarded Gmail copy. The signed webhook returned HTTP 200 on its first attempt. See `STAGING-6DB5812-EVIDENCE.json` for deployment and provider IDs. Gmail folder placement and live attachment rendering are not asserted.

The owner approved temporary use of `notify.zidihq.com`, inbound forwarding to `letimapro23@gmail.com`, staging deployment and test emails. The dedicated `MeraTech Staging` key has sending-only access to that domain; existing Zidi credentials remain separate. The sender/reply address is `meratech@notify.zidihq.com`.

Railway manages this domain's DNS despite its Name.com nameservers. Added only MX `notify` → `receive-euw1.forge.rmta.net`, priority 10, TTL 300; Resend shows it verified. Existing root-domain Zoho MX records are preserved. Inbox ID: `2cd7a3e7-fc63-4627-9672-fab561bab98b`. Webhook ID: `01886694-5483-4c77-bc30-835b7e9932bc`, listening only for `inbox.email.received` at `https://mera-web-staging.up.railway.app/api/mera/webhooks/resend-inbox`.

## Staging configuration

Keep credentials in Railway service secrets, never source control or client bundles:

- `RESEND_API_KEY`: dedicated MeraTech credential restricted to the approved domain.
- `MERA_EMAIL_ENABLED=true`: explicit delivery opt-in, after sender authorization.
- `MERA_EMAIL_FROM`: approved branded sender address.
- `MERA_EMAIL_REPLY_TO`: optional approved reply mailbox.
- `MERA_PUBLIC_ORIGIN`: the existing HTTPS staging origin, used for application links.
- `MERA_EMAIL_ALLOWED_RECIPIENTS`: optional comma-separated staging test recipient allowlist.

The provider adapter validates configuration and uses the fixed Resend HTTPS endpoint with an idempotency key. Provider acceptance is not inbox delivery. Keep ambiguous outcomes distinct from definitive rejection; retries must retain the original message and key.

## Integration gates

1. Select and verify a MeraTech sending domain, or explicitly approve temporary use of an existing verified domain. DNS changes must not replace an existing mailbox's MX records unintentionally.
2. Create the domain-restricted credential and store it only in the authorized staging service. Browser credential creation needs confirmation at the action step.
3. Connect real owner registration to durable verification challenges and provider delivery. Existing simulator responses must never establish a provider-verified identity. Configuring a key alone does not unblock registration.
4. Specify forwarding semantics: website enquiry notifications or inbound mail forwarding. Inbound forwarding additionally needs receiving configuration, verified webhook handling, recipient allowlisting, duplicate/loop protection, and appropriate receiving access. The native Inboxes forward endpoint supports the domain-restricted sending key and preserves original content/attachments without retrieving message bodies into this application. Full-access reading credentials are unnecessary for this implementation.
5. Send one explicitly addressed test, verify provider delivery evidence, then exercise the normal verification link. Do not retroactively email existing synthetic submissions.
6. Commit, push, deploy to the existing isolated Railway staging environment and verify actual hosted behavior before claiming completion.

## Official references

- [Send email](https://resend.com/docs/api-reference/emails/send-email)
- [API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
- [Receiving email](https://resend.com/docs/dashboard/receiving/introduction)
- [Forward received emails](https://resend.com/docs/dashboard/receiving/forward-emails)

## Incoming forwarding runtime

`MERA_INBOUND_FORWARDING_ENABLED=true` and `RESEND_INBOX_WEBHOOK_SECRET` enable the signed incoming webhook. Only the approved inbox is forwarded, only to the approved Gmail recipient. The journal stores identifiers and outcomes, not message content. Forwarding uses stable provider idempotency keys and a bounded retry window; unresolved old sends require review. See `docs/mera/staging-redesign/INBOUND-FORWARDING.md` for the detailed contract.

Owner registration also requires `MERA_OWNER_VERIFICATION_ENABLED=true` and a persistent random `MERA_IDENTITY_TOKEN_SECRET`. Staging now explicitly uses `MERA_EMAIL_RECIPIENT_POLICY=public`, allowing any valid email recipient and overriding the retained legacy allowlist. Use policy `allowlist` with a nonempty `MERA_EMAIL_ALLOWED_RECIPIENTS` to restore restricted testing. Unknown policies fail closed. No existing account is silently marked verified, and a test email alone does not activate an owner identity.
