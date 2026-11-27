# Ask Mera v1

Ask Mera is branch and actor scoped. Open it in the workspace header or phone navigation’s More menu. Billing is unchanged and no financial, staff, deletion or price tools are registered.

Routes under `/organizations/:organizationId/branches/:branchId/assistant`:

- `POST /messages`: `{conversationId?, message}`; returns narrative, structured read results and pending confirmation cards.
- `POST /confirm` or `/cancel`: `{actionId}`. Actions expire after ten minutes and are single use; confirmation rechecks current permissions and product scope under the branch transaction lock.
- `GET /weekly-summary`: deterministic card data, no model call, requires `reports.view`.

Read tools: sales summary (today, this week, last seven days), weekly summary, top items, open orders/delays, menu search, low/sold-out items, table status, permission-filtered help requests. Revenue reuses recognized net sales in `report`/`buildOverview`; order counts use creation date. Weekly comparisons use the same elapsed trading days in the previous week. Item quantities use recognized orders. Busiest hours use branch-local order creation time. Sold-out events count recorded bulk availability operations; unavailable historical transitions are not inferred.

Write tools: product availability (`menu.edit`) and branch ordering pause/resume (`organization.manage`). Both use shared normal-endpoint executors. There is no existing order-note update service, so no order-note tool was added. Product creation remains outside v1.

`AI_ASSISTANT_MODEL` defaults to `anthropic/claude-sonnet-5.5`. Gateway URL/key, monthly organization budget and accounting are shared with menu import. Accounting feature is `assistant`. An organization transaction reserves $1 before a real request (four bounded calls); actual usage replaces it afterward. Failed/unknown usage retains the reservation. This conservative allowance can reject a request when less than $1 remains. Rate limit: 30 messages per actor per organization per hour, persisted in usage records. Maximum four model rounds, four calls per round, 800 output tokens and 48,000 serialized UTF-8 input bytes. Tool results are projected, bounded data. No real provider is needed for tests.

`MERA_AI_MOCK=true`, or no key outside production, enables scripted tools: “Weekly summary”, “What’s sold out?”, “Open orders”, “mark Jollof rice sold out/available”, “pause/resume ordering”. Production without a key returns a configuration error.

Conversations and pending actions use existing `mera_records` kinds `assistant_conversation` and `assistant_action`. Conversations retain twelve redacted user/assistant messages, not provider traces or arbitrary tool output. Credential-like strings are redacted; staff should not enter credentials. Audit details include `source: "assistant"`, conversation ID and action ID where applicable. Read tools expose only their needed fields; Help results omit guest messages/private context. Refund requests are refused even for owners; unauthorized users receive a permission explanation.

Verification covers injected gateway calls, deterministic mock behavior, SQL persistence through pg-mem, permissions, confirmation replay/expiry/scope, budgets/rate limits and keyboard/UI flows. Live PostgreSQL concurrency and responsive screenshot verification remain separate checks.
