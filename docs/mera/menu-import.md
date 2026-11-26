# AI menu import

Owners with `menu.edit` can open **Import from a menu file** in Menu, or use the menu task in the go-live checklist. Upload up to five JPG, PNG, WebP, PDF, XLSX, CSV or DOCX files (10 MB combined), review the extracted table, then import selected items. Products enter the branch's draft menu; publishing remains a separate manual action. Images over 2000 pixels on their longest edge are reduced before uploading.

Configuration is server-only: `AI_GATEWAY_API_KEY`, optional `AI_GATEWAY_BASE_URL` (default `https://ai-gateway.vercel.sh/v1`), `AI_MENU_MODEL` (default `anthropic/claude-sonnet-5.5`), and `MERA_AI_MONTHLY_LIMIT_USD` (default 5 per organization). `MERA_AI_MOCK=true` returns a deterministic fixture without any provider or model-pricing requests. Missing configuration returns 503. Extraction uses a 90-second provider timeout and retries HTTP 429/5xx once.

`POST /api/mera/v1/organizations/:organizationId/branches/:branchId/menu-import/extract` accepts `{files:[{name,mime,data}]}` with base64 data. File signatures determine actual media types. Office archives are bounded to 2000 entries and 20 MB decompressed, and extracted text to 200,000 characters. Images and PDFs are passed as multimodal content; Office and CSV files become text. Uploaded content is treated as data in the system prompt. Model output must pass schema validation before the owner sees a draft.

`POST .../menu-import/apply` accepts the reviewed draft and optional `importId`. A single branch transaction reuses or creates categories, creates products with integer kobo prices, variants and add-ons, and records the import audit. Missing-price items and case-insensitive duplicate name/category pairs are reported as skipped. No opening stock is added. Retrying an unchanged completed draft skips the already-created products.

`mera_ai_usage` records each authorized extraction attempt, including failures and mock requests. It retains file names, detected types and byte counts; file contents and API keys are never stored or logged by the importer. The organization limit uses month-to-date token costs. An organization row lock serializes hourly admission (10 attempts/hour), including across branches and server workers. Spend is based on completed provider responses; concurrent in-flight requests may finish after the monthly threshold is crossed. Pricing comes from the gateway model list cached for 24 hours, with static fallback rates.

`GET /api/mera/v1/organizations/:organizationId/ai-usage` requires `organization.manage` and returns month-to-date spend, the configured limit and the latest 50 events. The platform overview includes `aiMonthToDateUsd` for each organization.

## Verification

Tests cover ZIP/Office extraction and limits, gateway request shape, mock mode, validation failures, authorization, usage/cost recording, hourly/monthly limits, atomic apply rollback, category reuse, duplicate handling, kobo conversion, variants and extras, real SQL through pg-mem, and the editable React review flow.

Browser screenshot verification could not run in this environment: the browser skill runtime failed to load its native dependency, and the Computer Use fallback reported that the browser access host was unavailable. Responsive rules are implemented at 820px, but desktop/tablet/phone screenshots and a real-browser keyboard walkthrough remain unverified. No real AI service was contacted.
