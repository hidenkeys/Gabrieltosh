# MeraTech Resend setup

Status: preparation only. No MeraTech key, sender, forwarding rule or live delivery has been verified yet.

The logged-in Resend workspace was inspected on 20 November 2026. Its only verified domain was `notify.zidihq.com`; existing Zidi credentials must remain separate. A new `MeraTech Staging` sending-only key form was prepared, but not submitted. Sender domain, forwarding destination and test recipient await the owner's choice.

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
4. Specify forwarding semantics: website enquiry notifications or inbound mail forwarding. Inbound forwarding additionally needs receiving configuration, verified webhook handling, recipient allowlisting, duplicate/loop protection, and appropriate receiving access. A sending-only key is not sufficient for reading inbound content.
5. Send one explicitly addressed test, verify provider delivery evidence, then exercise the normal verification link. Do not retroactively email existing synthetic submissions.
6. Commit, push, deploy to the existing isolated Railway staging environment and verify actual hosted behavior before claiming completion.

## Official references

- [Send email](https://resend.com/docs/api-reference/emails/send-email)
- [API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
- [Receiving email](https://resend.com/docs/dashboard/receiving/introduction)
- [Forward received emails](https://resend.com/docs/dashboard/receiving/forward-emails)
