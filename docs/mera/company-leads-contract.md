# MeraTech consultancy and Travel interest — contract v1

Scope: real persisted company enquiries and planned-product interest; no Travel application, quotation, automatic acceptance, email notification or payment integration. This addition is independent of organization tenant records and uses the existing platform-operator authorization boundary.

## Ownership and routes

Backend: `server/mera/company-leads.js` and additive `company-leads-schema.sql`; shared browser-safe Zod contracts: `shared/mera-company-contracts.js` (+ TypeScript declarations). The existing Mera migration and router import/mount this module. No existing operational schema or state machine is replaced.

All paths below are relative to `/api/mera/v1` and retain the application's same-origin/request-header protection.

| Route | Input / result |
|---|---|
| POST `/public/company/enquiries` | `consultancyEnquirySchema` → `companyAcknowledgementSchema` |
| POST `/public/company/travel-interest` | `travelInterestSchema` → the same acknowledgement schema |
| GET `/platform/company-leads` | Optional kind, status, search, assignedHandlerId; page 1–10000, limit 1–50 (default20). Returns items/contact summaries, page, limit, total. |
| GET `/platform/company-leads/handlers` | Active platform operators `{handlers:[{id,name}]}`; no merchant staff inferred. |
| GET `/platform/company-leads/:id` | Full submitted `data`, status, handler, followUp, version, documents metadata and latest500 changes (newest first). No storage keys, request keys, hashes or document bytes. |
| PATCH `/platform/company-leads/:id` | `companyLeadUpdateSchema`; stable acknowledgement includes id/reference/version/status/assignedHandlerId/followUp/externalDelivery:false. |
| GET `/platform/company-leads/:id/documents/:documentId` | Private authenticated attachment, never a public asset URL. |

Every platform route requires an active platform membership, valid staff session and current TOTP step-up through the existing guard. List/detail/handler lookup/download/update append platform audit entries. Merchant ownership does not grant company-enquiry access. Logs and broad audit summaries omit submitted problem descriptions, contact data and internal-note text; detailed notes remain in the guarded enquiry history.

## Public submission and recovery

The shared schemas define exact fields and bounds. Consultancy captures company/contact, problem, intended users, capabilities, new/existing work, NGN budget range including “Not sure”, timeline, privacy acknowledgement and optional documents. These budget ranges describe a prospective client's budget, not Mera product prices. Travel captures contact, optional company/role/interest and acknowledgement, with no available-product signup claim.

Every request requires a UUID requestKey. First acceptance returns201; an exact normalized-payload retry returns200 with the original immutable acknowledgement. A reused key with different details returns409 `IDEMPOTENCY_CONFLICT` and never overwrites the original. References are `ENQ-` or `TRV-` plus12 uppercase hexadecimal characters. The response always states received, `externalDelivery:false`, `emailDelivery:"not_sent"`. It does not reveal internal follow-up status or other submissions. There is no public PII/history lookup endpoint.

Clients retain the exact body/key for uncertain writes and retry only explicitly.400 `VALIDATION_ERROR` includes `issues:[{path,message}]`;413 `DOCUMENT_LIMIT` occurs before persistence.503 `REQUEST_UNCERTAIN` does not imply no write.429 means wait and retain the intent; repeated requests are limited to12 per IP per15minutes in addition to existing shared public limits. This uses the current single-web-replica architecture, not a claimed distributed abuse service.

## Private documents

At most3 attachments and512KiB combined decoded bytes; existing JSON request limit remains1MiB. PNG/JPEG signatures and dimensions reuse the current asset inspector. PDFs must have a supported signature/end marker; obvious script/launch/embedded-file actions are rejected. Text must be UTF-8 without NULs. Filename extensions must match MIME types and filenames cannot contain path separators or header-control characters.

Files live in dedicated PostgreSQL BYTEA rows referencing the enquiry. Only the MFA-protected document endpoint can return them, with forced attachment, no-store, nosniff and sandbox CSP. Format checks are **not malware scanning**; the detail response states this limitation. No S3 credentials, public links or ephemeral filesystem storage are introduced. A business-approved retention schedule is still an external policy decision; no automatic deletion rule is invented here.

## Operator updates

Statuses: received, reviewing, discovery, proposal, closed. Follow-up stages: none, discovery, proposal, with optional dueAt and a bounded summary. Internal notes are appended through updates rather than replacing prior notes.

Updates require expectedVersion and UUID requestKey. The frontend sends `X-Mera-Actor-Id`; a changed signed-in account is rejected before mutation. Recovery records are also bound to their original operator, so another operator cannot reconcile the original request key. Row locking + optimistic version prevents lost concurrent updates. A retry of the same update returns the original result without another note or audit; changed intent under the same key is409. Only an active platform operator can be selected as handler. The state change, internal history and platform audit commit in one transaction, so an audit failure rolls the update back.

## Verification (20 November 2026)

`RUN_MERA_COMPANY_PG_TESTS=true node --test tests/mera-company-leads.test.js`: **4 passed,0 failed,0 skipped**. Disposable local PostgreSQL cluster on55445 was initialized and removed; this did not migrate staging or production. The sandbox initially prevented PostgreSQL shared-memory initialization; the same isolated test passed with the required execution permission.

Coverage: schema/privacy/file validation; stable truthful acknowledgements; actual concurrent duplicate public submissions and changed-body rejection; consultancy and Travel persistence; actual existing MFA/session guard; merchant denial; private file byte delivery and wrong-lead denial; bounded list filtering; concurrent updates; duplicate note/audit prevention; audit-failure rollback; invalid assignment; immediate operator revocation.

Default `npm test` runs the three pure tests and deliberately skips the opt-in PostgreSQL integration. Browser form recovery, rendered screens, hosted migration and hosted submission checks remain separate acceptance gates, not implied by this result.
