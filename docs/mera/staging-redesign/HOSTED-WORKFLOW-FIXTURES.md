# Hosted browser-workflow fixtures

Prepared 20 November 2026 through the existing authenticated API at **https://mera-web-staging.up.railway.app**. This is fixture preparation and API verification, not browser acceptance.

Scope guards checked the exact host, noindex response header, non-demo authenticated context, the synthetic organization/branch flags and names, organization-wide owner permission, disabled billing, blocked Rubies provider, and disabled extra-charge/deposit/minimum-spend policies. No direct database connection, migration, guest creation, order creation, reservation creation, payment, or provider configuration was performed by this script.

- Organization: `10000000-0000-4000-8000-000000000001`, Bing Chun · Staging.
- Branch: `20000000-0000-4000-8000-000000000001`, Surulere · Staging.
- Table: **QA workflow table**, `710bae30-1d54-420b-b144-09c4225d0cdb`; zone **QA checks**, capacity 2, originally available at position 70/70.
- Product: **QA complimentary sample**, `9197c89a-210c-4ea4-8fa4-e63a7149d13e`; code `MQA-ZERO-20261120`, price zero, unlimited stock, no required options, existing sample image reference.
- Reviewed menu publication: version **2**, **35 products**. All 34 pre-existing published products retained every original public field, and all existing draft products remained unchanged. The preview hash and expected version guarded the publication.

`prepare` succeeded, then a separate `inspect` run passed. The fixture script journals pending creates before dispatch and does not automatically replay an uncertain non-idempotent create. A repeated preparation resolves the named fixture only when its manifest already records the original attempt, refuses collisions/duplicates, reuses the same publication request key, and stops if the table has been put into service.

Script: `scripts/mera-staging-workflow-fixtures.js`.

Private mode-0600 before-state and ID manifest: `/private/tmp/mera-hosted-workflow-fixtures.json`. It includes original product/table/settings snapshots and original operational counts, but no credentials or cookies. Credentials are read from an explicitly supplied private file and remain in process memory; the script signs out its own API session.

## Browser use

The lead can create a synthetic reservation and seat it at this table, then join using the current private code through the customer UI. Keep joining codes out of permanent evidence. A customer submission of the complimentary product has a legitimate zero-total paid state, so its receipt can be inspected without recording money. Cancel browser print preview; this is not physical print validation.

## Retirement after browser checks

No retirement has occurred. Do not remove active visit/reservation records or overwrite unrelated menu changes.

The existing API has no table/product deletion endpoint. To retire fixtures through supported workflows, first resolve/close the synthetic visit with zero balance and no outstanding commitment, then mark the table unavailable with a test-completion reason. Set only the fixture product unavailable through the existing product-availability action, obtain a fresh publication preview, confirm the retained original products remain unchanged, and publish using that reviewed hash/version. Retain synthetic order/reservation/audit history; publication versions are monotonic and should not be rewound to version 1. A future cleanup needs its own explicit invocation after browser work is complete.
