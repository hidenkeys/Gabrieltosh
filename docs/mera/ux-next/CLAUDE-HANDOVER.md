> Update, 24 November 2026: this handover describes an earlier checkpoint. Venue/multi-location work and subsequent local acceptance fixes are now on `mera-ux-next`. Read [`../venues/VERIFICATION.md`](../venues/VERIFICATION.md) for current evidence, remaining boundaries, and the no-deployment instruction. The current seeded venue preview uses port 3011 / PostgreSQL 55451.

# Mera / Bing Chun — Claude handover

Prepared 24 November 2026. Read this before changing anything. This is context, not authorization to deploy or publish.

## 1. Start here

You are continuing an existing, substantial project. Do not recreate it or start from main.

- Local repository: `/Users/oluwateniolasobande/Gabrieltosh`
- Remote repository: `https://github.com/hidenkeys/Gabrieltosh.git`
- Working branch: `mera-ux-next`
- Remote branch: `origin/mera-ux-next`
- GitHub branch: `https://github.com/hidenkeys/Gabrieltosh/tree/mera-ux-next`
- Latest implementation/evidence commit before this handover: `ae65b8525dd1de7b7fe82c5ef40bde827d38dc62`
- The branch builds on `mera-ux-inputs@547f9fd`; round-two starting point was `3d0d0d0`.
- Working tree was clean before adding this document. Inspect it again before edits; preserve any newer work.
- This round was committed and pushed, **not deployed**. A Git push must not be described as a staging release.

```sh
cd /Users/oluwateniolasobande/Gabrieltosh
git status --short
git branch --show-current
git log -15 --oneline
```

Fetch and inspect remote changes before integrating anything. Do not reset, force-push, discard uncommitted work, or merge unrelated branches blindly. The earlier marketing branch was spelled `mera-marketung-redesign`; prior-round records say its then-current changes were already incorporated. Recheck ancestry before claiming newer marketing changes exist.

## 2. What the product is

The project began as Bing Chun Surulere's restaurant POS and expanded into MeraTech/Mera QR, a hospitality platform with:

- Public MeraTech marketing, QR product information, consultancy enquiries and planned Travel interest.
- Owner signup/email verification, organization and branch setup, roles and staff access.
- Organization workspace: POS, menu/categories/stock, orders, tables/visits/shared bills, reservations/front desk, customer requests, preparation, transactions/refunds, shifts, reports and print layouts.
- Guest QR menu, basket/ordering, order tracking, reservations, help requests and feedback.
- Separate Mera platform operator console protected by password plus MFA, with organization/service controls and audited actions.
- Existing local-store/Windows printing architecture and cloud/staging infrastructure. Physical receipt/sticker output has not been certified by this UI round.

Preserve the original Bing Chun operational style and working features. Mera marketing/platform use ivory, forest and lime. Venue colors come from existing brand variables. Do not invent a replacement design system.

## 3. Read these sources

Paths below are relative to the repository unless absolute:

1. `.agents/skills/mera-product-design-audit/SKILL.md` — primary UI rulebook for this round.
2. `docs/mera/ux-next/BOARD.md` — latest progress, evidence, limitations and commit map.
3. `docs/audit/ux-audit.md` — audit committed before implementation, plus final disposition.
4. `docs/audit/workspace-fields.md` — form/field inventory and consumers.
5. `docs/audit/browser-evidence.json` and `docs/audit/screenshots/` — 102 final captures, 34 screen/state groups, three widths.
6. `docs/mera/ux-inputs/BOARD.md` — previous round and prior hosted release evidence.
7. `docs/mera/DECISIONS.md`, `docs/mera/PRD-COVERAGE.md`, `docs/mera/ACCEPTANCE.md` — broader product context; older status statements may be historical.
8. `.agents/skills/mera-ui/SKILL.md` and `.agents/skills/mera-design-excellence/SKILL.md` — existing project design references; use the latest explicit task/rulebook when instructions differ.
9. Original PRD: `/Users/Shared/Mera/MERA_PRD.md`.
10. Original multi-agent prompt: `/Users/Shared/Mera/MERA_MULTI_AGENT_BUILD_PROMPT.md`.
11. Exact latest UX task: `/Users/oluwateniolasobande/.codex/attachments/a340fe0e-b211-4409-b54b-04e7d4ddb9c6/Pasted text.txt`.

The rulebook names `workspace/preparation-v2.css`, which does not exist. The actual stylesheet is `src/mera/workspace/preparation.css`. Do not claim to have inspected nonexistent files.

## 4. Current constraints and working preferences

The latest round explicitly overrides earlier requests to deploy all changes to staging:

- **No deployment anywhere without a new instruction.** No real payments, customer email, real accounts or production-data changes.
- Frontend only this round: no server changes, API path changes or request-body contract changes.
- Preserve existing recovery/idempotency, permissions and tenant/branch boundaries. Unknown write outcomes must not silently become a fresh action.
- Keep readiness, legal and payment-policy caveats verbatim. Pricing/payment choices remain configurable; do not invent approved rates.
- CSS imports belong in `src/main.tsx`, not component files (Node tests depend on this).
- Reuse existing controls in `src/mera/ui/`; preserve numeric units and null-versus-zero semantics.
- Keep accessible names or update tests with equivalent assertions; never delete tests to make a suite pass.
- User prefers multiple agents with explicit ownership, meaningful progress updates, and commits/pushes per workstream. Coordinate Git staging: agents share one working tree/index.
- Avoid stopping after every small fix. Finish authorized workflows; report actual blockers honestly.

## 5. Local application and database

The last verified QA environment is **isolated local simulation**, not Railway:

| Item | Location |
|---|---|
| Marketing | `http://127.0.0.1:3009/mera` |
| Workspace | `http://127.0.0.1:3009/mera/workspace` |
| Platform | `http://127.0.0.1:3009/mera/platform` |
| Operator sign-in | `http://127.0.0.1:3009/mera/platform/sign-in` |
| Guest menu | `http://127.0.0.1:3009/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001` |
| Health | `http://127.0.0.1:3009/api/health` |
| PostgreSQL | Loopback `127.0.0.1:55449` |
| Database directory | `/Users/oluwateniolasobande/Gabrieltosh/data/mera-demo-ux-next-db` |
| Preview instance | `ux-next` |

**Handover-time check: port 3009 is not responding; preview is currently stopped.** Do not assume the prior process is still running.

Node requirement: `>=22.12.0`. Stack: React 19, TypeScript, Vite 6, Express 5, PostgreSQL; tests use Node/tsx, Testing Library and jsdom.

Ordinary restart for the owner/guest preview:

```sh
cd /Users/oluwateniolasobande/Gabrieltosh
# npm ci if dependencies need installing; node_modules already existed during handover.
npm run build
MERA_PREVIEW_INSTANCE=ux-next MERA_PREVIEW_PORT=3009 MERA_PREVIEW_DB_PORT=55449 npm run preview:mera
```

Run as the normal user, never root. The preview starts embedded PostgreSQL, the app and the Mera job worker. It serves **dist**, so rebuild after UI edits; refreshing alone does not compile source changes. It binds to loopback, not the store LAN. Do not delete/reset this DB merely to obtain credentials.

Running plain `npm run preview:mera` selects a DIFFERENT default instance: app 3003, DB 55441, `data/mera-demo-db`. Do not accidentally mix these instances or launch two processes against one cluster.

For the existing synthetic platform MFA fixture, prefer the private launcher below; ordinary restart lacks its matching MFA key.

## 6. Local synthetic credentials — paths only

These files existed at handover time. They are private temporary artifacts, not tracked by Git and not guaranteed to survive OS cleanup. Do not paste their contents into chat, logs, commits or this document.

- Owner login JSON (`username`, `password`): `/private/tmp/mera-next-login.json`.
- Synthetic platform operator secrets: `/private/var/folders/ng/c3bwdsb54hj7y8d22k70jrf40000gq/T/mera-visual-operator-J6leEu/secrets.json`.
- Private QA launcher: `/private/var/folders/ng/c3bwdsb54hj7y8d22k70jrf40000gq/T/mera-ux-next-private-3YvFey/launch.mjs`.
- Launcher directory also contains its private MFA key and guarded `operator.mjs`.

To restart the SAME QA instance with its matching operator MFA key:

```sh
cd /Users/oluwateniolasobande/Gabrieltosh
npm run build
node /private/var/folders/ng/c3bwdsb54hj7y8d22k70jrf40000gq/T/mera-ux-next-private-3YvFey/launch.mjs preview
```

This is an alternative to the ordinary preview command, not a second service to launch simultaneously. It fixes the target to app 3009/DB 55449 and loads the private key without printing it. The operator is already provisioned. **Do not rerun provisioning or overwrite its MFA factor.** Use normal password login and a current TOTP from the private fixture.

The repository script `scripts/mera-visual-operator.js` is hard-guarded to a DIFFERENT older environment (3006/55443). Do not run it against 3009 by assumption. If temporary files are missing, report that and reconstruct an explicitly isolated synthetic fixture with proper guards; do not reset real/staging credentials.

Local QA credentials do not imply any Railway/staging login. No verified hosted credentials are provided in this handover.

## 7. Remote / staging location

- Known hosted staging URL: `https://mera-web-staging.up.railway.app/mera`.
- Hosted workspace: `https://mera-web-staging.up.railway.app/mera/workspace`.
- Hosted platform: `https://mera-web-staging.up.railway.app/mera/platform`.
- Hosting provider: Railway. A website URL is not a remote filesystem/SSH path; no SSH path was established in this round.
- Last documented prior-round release: `2068bd9131811af4834009aff8cc515ad4bcef9b` from `mera-ux-inputs`, web and jobs services. Evidence: `deploy/STAGING-2068BD9-EVIDENCE.json` and the round-one board.
- Current Railway deployment was **not re-queried during this handover**. Do not claim the current branch is hosted or that the historic commit remains current without checking Railway.
- `mera-ux-next` was pushed only. Deployment remains unapproved.
- Historic email/Resend and owner verification context: `docs/mera/staging-redesign/OWNER-EMAIL-VERIFICATION.md` and `INBOUND-FORWARDING.md`. Do not expose provider secrets or send real email while doing local UI work.

## 8. What this round completed

- Audit before code (`e9dc392`).
- Five guided stages: Account → Business → Branch → Payments → Go live. Removed the extra first-branch creation mount, reused one guided public contact, removed the unused scalar service-mode question, retained legacy stored values. Single guided publication action retains caveats (`308d687`, `5de436a`, `5c34ccf`).
- Eight rare tools under More; active rare tools remain discoverable; table service, floor layout and bills have separate task views with mounted drafts (`2f5e580`, `5de436a`).
- Preparation notes become collapsed one-line disclosures; structured preparation requirements stay visible.
- Policy/category/table/print numeric controls use bounded steppers/labelled units, preserving basis points, kobo, nullable cutoffs and signed sorting.
- Guest optional notes/custom help disclosures, searchable preferred tables, stop-reason presets, optional Travel details and compact project brief (`06dc5ac`).
- Platform action-specific reasons; unknown status retry retains its original intent; optional service dates collapsed (`f658f65`, `b39b59b`).
- Browser-discovered fixes: displayed one-seat default now submits 1; own busy state no longer aborts guided launch; mobile floor overflow fixed; tablet quantity controls no longer hidden by totals; legal footer spacing fixed (`5de436a`, `40bb1ca`, `c16e00d`).
- Evidence/progress committed in `ae65b85`.

Do not redo already-working star feedback, guest date/time controls, advanced order-filter disclosure or the previous preparation/stock redesign. Owner commercial proposals are legitimate owner actions; platform approval stays separate. Required consultancy fields have real downstream consumers and were retained.

## 9. Validation and actual browser evidence

```sh
npx tsc --noEmit
node --import tsx --test --test-concurrency=2 tests/*.test.js tests/*.test.ts tests/*.test.tsx
npm run build
```

Latest full run: **907 tests, 904 passed, 0 failed, 3 skipped**. Typecheck/build passed. Existing Vite >500 kB bundle warning remains. Subsequent CSS-only fixes had targeted checks/build/typecheck and visual rechecks; no claim that skipped integrations passed.

Skipped suites: PostgreSQL print worker; PostgreSQL company leads; broad isolated Mera PostgreSQL integration. Tests need loopback socket permission: an initial restricted run failed with `listen EPERM`, then the authorized local-socket run passed. That was not an app defect.

Useful logs (temporary): `/private/tmp/mera-next-final-tests.log`, `/private/tmp/mera-next-final-build.log`. The last CSS-fix build was also successful.

Actual local browser checks:

- Table creation with default one seat succeeded.
- Two-item table order ₦4,700 split into ₦1,500 and ₦3,200.
- Earlier unpaid order expired during the audit; payment was safely rejected with “Order allocation is no longer valid.” Do not remove expiry safeguards to make a test pass.
- Fresh synthetic guest order `M-B9C84D1A`: ₦1,500 cash recorded, ₦2,000 tender/₦500 change → accepted → preparing → item ready → collected → completed. No real money moved.
- Operator normal password + MFA login succeeded; protected console reviewed.
- Drawer ArrowDown moved focus with visible outline; Escape closed the drawer.
- 102 final screenshots at 390×844, 820×1180, 1440×900. Final recorded document width equals viewport width in each.
- Console inspection showed third-party Chrome-extension connection errors, not app errors.

Browser tooling note: the in-app browser bootstrap failed on a missing native classic-level build; Chrome fallback worked. Some semantic submit clicks appeared inert; native Chrome accessibility input completed guest submission, and the counter had created exactly one order. A native-click regression covers quoted table orders. Inspect actual UI/server result before retrying writes or making speculative source fixes.

## 10. Remaining limits / next actions

1. **Final local Go live click is NOT browser-verified.** Automatic approval review rejected it under the no-deployment instruction. This was reported and explicit local-only test approval was requested. The user's next message asked for this handover, not approval. Do not treat the handover as approval or bypass the rejection through API calls. Automated launch success/rejection/recovery tests pass.
2. A synthetic prior launch-policy attempt saved policy but stopped on the now-fixed busy guard. Its original browser tab may retain a conservative session-storage pending marker. Do not blindly clear unknown-intent markers or confuse stale QA tab state with real account state.
3. Physical receipt/sticker output and the three skipped PostgreSQL suites remain unverified in this round.
4. Full-page below-fold product images may be lazy-loading placeholders; screenshot captures do not certify every product image. Platform/report tables use bounded local scrolling; every column at every width was not independently exercised.
5. Reservation cancellation presets have automated coverage; this round captured the reservation form, not a complete cancellation journey.
6. Confirm user scope before any new deployment/backend expansion. If continuing UI work, inspect source and current screenshots first, preserve the shared contracts, use agents with non-overlapping ownership, and commit/push coherent changes.

For immediate familiarization: read the rulebook + board, start the isolated preview using the existing private launcher if platform testing is needed, sign in normally, and inspect the current app. Do not mistake an old screenshot/status document for the current implementation.
