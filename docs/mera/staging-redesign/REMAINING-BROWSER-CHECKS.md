# Remaining browser workflow checks

Source-reviewed checklist, 20 November 2026. **These are instructions for pending browser checks, not claims that the checks passed.** The coordinator's Chrome session was blocked by an extension popup when this checklist was prepared. No browser session, operational record, branding or provider configuration was changed in preparing it.

## Target and fixture guard

Use only `https://mera-web-staging.up.railway.app`. Sign in through the ordinary organization workspace at `/mera/workspace`, using the private synthetic owner credentials already held by the coordinator. Confirm **Bing Chun · Staging / Surulere · Staging** before mutations. Do not put passwords, joining codes, session cookies or private visitor data into screenshots or this document.

The existing fixture manifest is documented in [HOSTED-WORKFLOW-FIXTURES.md](HOSTED-WORKFLOW-FIXTURES.md): **QA workflow table**, capacity 2, zone **QA checks**, and **QA complimentary sample**, code `MQA-ZERO-20261120`, zero price, unlimited stock, no required options. The preparation snapshot had 35 published products, preserving the original 34. Inspect current state before using these fixtures; they may already have been used by another browser pass. Do not recreate them or republish a stale version. Fixture retirement is a separate explicit workflow.

## 1. Logo upload and persistence

1. In the workspace, open **Getting started**. For the guided route, choose **Resume guided setup**, then **Brand & address**. The direct guide entry is `/mera/workspace?setup=1`.
2. Find **Organization logo**. Its **Upload image** input is distinct from the second **Upload image** under **Storefront cover photo**. Scope the chooser to the logo section; do not select the first upload input globally if other settings are mounted.
3. Choose a small synthetic PNG/JPEG using the browser's actual file chooser. File chooser permissions must be available; don't bypass a browser denial with script injection. Record upload success and **Uploaded image preview**, then choose **Save branding**.
4. Refresh the workspace and return to this section; verify **Current organization logo** persists. Save the prior logo reference privately before changing it. Check any public branding/publication behavior separately rather than assuming upload alone publishes it.

Source: `src/mera/workspace/BranchSettings.tsx`, `src/mera/MediaUpload.tsx`. Upload writes an asset and updates a local branding draft; **Save branding** is a second operation. Upload success alone is not proof of saved organization branding.

## 2. Floor map and seating

1. Open **Tables & visits**. Expand **Floor layout and table setup**. Locate **Live floor map**, select zone **QA checks**, and verify the fixture button is labelled with **QA workflow table**, its current status and **2 seats**. At mobile size, the floor plan is intentionally a labelled horizontal scrolling region; page-level overflow is not intentional.
2. If testing a position change, select only the synthetic fixture and use its coordinate form → **Save floor position**. Record the prior coordinates and verify persistence after refresh. Do not drag or alter other tables for a screenshot.
3. To test reservation seating, use **Reservations** → **Reservations & front desk**, create/review one synthetic reservation for at most two guests with the actual on-screen booking form. Follow the current reservation state to its seat action; choose **Seat at table** → **QA workflow table** → **Seat reservation**. Do not record a deposit or payment merely to bypass readiness. If policies or the table's current occupancy block seating, capture that real state.
4. For the simpler private-visit path, use **Tables & visits** → **Open a table visit** → **Table** / **Guest display name** → **Open visit**. Use this only when the synthetic table is available and no active synthetic visit already exists. It is an alternative to seating a reservation, not a second visit on the same table.
5. Verify the party appears under **Table parties** and the table status reflects occupancy. The successful opening/seating response should populate **Private access · [party]**.

Source: `TableServiceView.tsx`, `FloorMap.tsx`, `ReservationDesk.tsx`, `ReservationSettlement.tsx`, and the `Tables & visits` mount in `OrganizationWorkspace.tsx`.

## 3. Private table joining and navigation

1. In the owner session, reveal **Show private joining code** only for the current synthetic party. Keep its value out of saved screenshots. If no current code is confirmed, inspect the visit first; explicit replacement requires **Generate a new code for this party**, a **Joining-code replacement reason**, then **Generate replacement private code**. Replacement invalidates the previous code; it is not a harmless refresh.
2. In the customer context open `/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`. Use **Join a table** (or **Join table** from a table-linked menu), enter **Your name**, select **Table** = **QA workflow table**, enter **Joining code**, then **Join current visit**. With no selected table, the alternate path requires **Visit reference**.
3. Read any returned terms and acknowledge only the actual applicable terms. The fixture preparation confirmed disabled minimum-spend policy; don't enable it for this check.
4. Verify the view becomes **Your table & bill**. Navigate to the menu and back to **Your table**; reload and verify the private session survives without exposing another party. In a fresh customer context without this party's session/code, the permanent menu/table QR must not reveal the bill.
5. Check the private-access panel's clear/hide controls. Do not publish a joining code in a QR export or permanent link. A blocked code or changed visit should yield an honest recovery state, not another party's bill.

Source: `PrivateVisitAccess.tsx`, `CustomerExperience.tsx`. A public table selector or QR is not authentication for a private bill.

## 4. Zero-price order and receipt preview

1. Use the existing published **QA complimentary sample** in the customer menu. Confirm the cart total is exactly zero and no other product, option or extra charge is present before submission. Submit once using the visible checkout action; retain the resulting order reference.
2. Verify the real returned order/payment state. A legitimate zero-total paid order does not represent a cash/card transfer. Do not manually record a payment or turn on a provider to create a receipt.
3. As owner open **Receipt studio**. For layout-only coverage, **Receipt** / **Sticker** selects **Receipt sample preview** / **Sticker sample preview**. **Edit receipt & sticker format** exposes the saved format form; reviewing a sample does not verify a real order document.
4. The zero-price fixture does **not** qualify for automatic receipt/sticker jobs: `eligiblePaidDocuments` in `server/mera/printing.js` requires `total > 0` and `paid > 0`. An empty queue for this order is expected, not a browser failure. Do not treat sample previews as actual order document evidence. Actual paid-document generation remains unverified by this zero-price workflow. Changing complimentary-order eligibility is a separate product decision; a positive synthetic payment, if ever used, requires separately authorized scope and must not represent real money.
5. Opening the browser print dialog is permitted only as preview; cancel it. Do not choose **Queue marked duplicate** merely to view a document. Keep **Physical output unconfirmed** distinct from physical acceptance. No Windows printer or physical output is validated by this check.

Source: `PrintStudio.tsx`, `PrintDocument.tsx`. Real document previews use the saved payment-time snapshot, unlike sample previews.

## 5. CSV export and download

1. Open **Report exports**. Review existing jobs first; use the smallest existing synthetic report if suitable.
2. Set **Business date** to the branch date containing the synthetic workflow; choose **Queue report export** once. Record queued status and use the page's refresh control to observe worker completion.
3. Only a completed job exposes **Download report CSV**. Click it through the browser and inspect the downloaded file: nonempty CSV, correct selected branch/business date, and no joining codes/session tokens. Compare synthetic zero-total order presence and totals with the on-screen report if this report includes it.
4. Queued is not downloaded. If the worker is unavailable or the job fails, capture the current status and reason. **Retry failed job** requires the existing controlled retry form; don't repeatedly enqueue fresh exports to bypass an uncertain outcome.

Source: `src/mera/workspace/ExportJobs.tsx`. Download completion requires both the real job result and a browser download, not merely an enabled button.

## 6. Signup readiness boundary

1. Open `/mera/signup` without demo query parameters. Verify the current capability response yields **Registration is awaiting verification setup** when real sender/email setup remains blocked.
2. Verify ordinary owner credentials are not collected as though public signup were operational. Existing owners/staff retain their sign-in path. The commercial information link is **Discuss plans and terms** → `/mera/qr#commercial`.
3. If separately inspecting the explicit demonstration flow, keep its demonstration account and **Try the verification step** wording distinct. A simulated verification is not real email delivery or ownership. Do not create new demo identities just to claim hosted real signup passed.

Source: `src/mera/Signup.tsx`. A truthful blocked readiness screen can pass its UX check while real email delivery remains externally blocked.

## 7. Nine-step owner guide resume

1. Use an organization-wide owner; branch-limited access intentionally retains the ordinary checklist. Enter `/mera/workspace?setup=1`, or **Getting started** → **Resume guided setup**.
2. Verify the sequence: **Your account**, **Your business**, **First branch**, **Brand & address**, **Menu**, **Service**, **Your team**, **Payments & plan**, **Preview & launch**. Desktop uses step navigation; mobile uses **Setup step**.
3. Choose a later step or **Continue** and wait for **Your place in setup is saved. Form changes use their own save buttons.** Refresh and re-enter the guide; confirm the same branch resumes at the saved step.
4. Enter a harmless unsaved field draft, move between mounted steps, and return to verify the draft is retained within the guide. Do not claim unsaved field drafts survive full reload. Step position is persisted separately using branch-scoped `ownerGuideStep_[branch id]`.
5. **Open menu editor**, **Manage team invitations**, and the other tool links leave the guide; save intended form edits first. Return through **Getting started** → **Resume guided setup**.
6. If step save becomes uncertain, expect **Retry saving this step** and locked navigation. Retry the existing step; don't call unrelated save endpoints to force progress. Visiting all nine steps must not falsely mark readiness or activate payments.

Source: `src/mera/workspace/OwnerSetup.tsx` and its permission-aware mount in `OrganizationWorkspace.tsx`.

## Evidence to record

For each check record target URL, actor/role without secrets, viewport, exact action, actual outcome, screenshot/file evidence and any remaining blocker. Distinguish source inspection, API fixture preparation, unit tests, browser execution, worker completion and physical hardware testing. Refresh this checklist's status only after the coordinator actually executes the check.

## Execution update from the coordinator

After browser access resumed, the coordinator reported: **QA Browser Party** seated at the fixture; guest joined and private access survived reload; order **M-42D4D851** submitted at total 0 / recorded payments 0 with **Payment confirmed** displayed; order accepted, preparation started, and saving prepared quantity 1 automatically made it ready. The coordinator clicked collection, but the response had not yet been confirmed at this update. Do not mark collection or completion passed from the click alone. No print jobs appeared after refreshing Receipt studio, as expected under current eligibility. Other checklist items retain their separate evidence requirements. These are coordinator-reported executions, not independent visual verification by this document's author.

## Latest status — subsequent confirmed pass

The later coordinator pass **confirmed both collected and completed** for M-42D4D851, superseding the earlier pending-click note. The actual completed-report link downloaded `mera-trading-day-2026-11-20.csv`; its contents independently confirm branch/date/currency, one completed order, complimentary quantity 1/value 0, zero collections, and accepted → preparing → ready → collected → completed history. See [HOSTED-WORKFLOW-PASS.md](HOSTED-WORKFLOW-PASS.md) for exact evidence and screenshots 16–24.

Status by checklist area: floor/seating, private join/reload, zero-order preparation/fulfillment and CSV download have the targeted execution evidence described there. Owner guide resume and the deployed checkbox alignment have targeted visual evidence. **Branding upload remains blocked by explicit browser local-file permission denial even after the user's enablement; no bypass.** Full four-size visual coverage remains pending. Actual positive-paid document generation and physical printing remain unverified; an empty queue for the zero-price order is expected. Real signup/provider readiness is not established by this pass. Do not generalize these targeted outcomes into all-workflows or all-viewports acceptance.
