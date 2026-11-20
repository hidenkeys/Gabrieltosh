# Hosted workflow browser pass — 20 November 2026

Target: `https://mera-web-staging.up.railway.app`, synthetic **Bing Chun · Staging / Surulere · Staging**. This records the coordinator's actual browser execution and reviewed screenshots, plus an independent read of the downloaded CSV by the supporting agent. It does not turn source inspection or unit tests into visual evidence. No production data or real money was involved.

## Confirmed browser outcomes

| Workflow | Observed result | Evidence |
| --- | --- | --- |
| Restricted consultancy review | Operator saved assignment, internal note and follow-up; confirmation and activity were visible. | [16 — operator enquiry](screenshots/16-hosted-operator-enquiry.png) |
| Expired MFA | Restricted access displayed the expired-session/MFA state on mobile. This is failure-state coverage, not a fresh successful MFA login. | [17 — expired MFA](screenshots/17-hosted-mfa-expired-mobile.png) |
| Owner guide resume | The hosted owner guide resumed its saved position. This verifies the demonstrated resume, not every possible setting in all nine steps. | [18 — owner resume](screenshots/18-hosted-owner-resume.png) |
| Floor and seating | Synthetic **QA Browser Party** was seated at **QA workflow table**, capacity 2, with zero deposit. Floor map was reviewed. | [19 — floor map](screenshots/19-hosted-floor-map.png) |
| Private table access | Customer joined the current private visit, opened its bill and retained private access after reload. No joining code is recorded in this document. | [20 — private table](screenshots/20-hosted-private-table.png) |
| Zero-price customer order | **M-42D4D851** submitted with total 0, recorded payments 0, and the current UI label **Payment confirmed**. This denotes no outstanding amount, not money received. | [21 — zero order](screenshots/21-hosted-zero-order.png) |
| Preparation | Order accepted, station preparation started, prepared quantity 1 saved, and the ticket became ready. | [22 — preparation ready](screenshots/22-hosted-preparation-ready.png) |
| Fulfillment | **Collected and completed were both confirmed in the UI**, superseding the earlier click-only pending note. The CSV also contains both history actions. | Coordinator browser observation plus downloaded CSV below |
| Report export/download | Completed report exposed its actual download link; browser downloaded the CSV and its contents were read. | [23 — report ready](screenshots/23-hosted-report-ready.png), local downloaded artifact below |
| Service-mode alignment | Native service-mode checkbox/text alignment was visually reviewed after deployment of revision **0b06f8b**. | [24 — owner aligned](screenshots/24-hosted-owner-aligned.png) |

The operator screenshot predates the newer saved-versus-draft summary; it proves the saved workflow shown, not visual acceptance of every later UI change. Screenshot 24 verifies the deployed checkbox correction specifically. These targeted screenshots do not constitute complete four-size coverage of all surfaces.

## Downloaded CSV evidence

Browser artifact: `/Users/oluwateniolasobande/Downloads/mera-trading-day-2026-11-20.csv`.

The supporting agent independently read its contents and verified:

- Export format v2; branch **Surulere · Staging**, trading date **2026-11-20**, timezone **Africa/Lagos**, currency **NGN**.
- One order and **Completed = 1**.
- **QA complimentary sample — Sample**, recognized quantity **1**, recorded item value **0**.
- Payments/deposits received **0**; cash, external POS and external transfer receipts each **0**; outstanding **0**.
- Staff history contains **accepted**, **preparing**, **ready**, **collected**, **completed**, each count **1**. Submitted actor is explicitly **Identity unavailable** / unknown; no invented customer identity or role was substituted.
- No joining code or session token appears in the downloaded content. The CSV is aggregate trading-day evidence; it does not itself contain the order reference, so reference linkage comes from the coordinator's browser workflow.
- Mera fees remain **Unavailable** with an explicit lack-of-authoritative-assessment explanation, not an invented fee total.

## Printing boundary

Refreshing Receipt studio showed no actual print jobs for this zero-total order. This is consistent with `server/mera/printing.js`: automatic paid documents require positive total and positive recorded payment. The current pass therefore **does not validate positive-paid receipt/sticker generation**, printer queue delivery, Windows bridge behavior or physical output. Sample preview capability is distinct from a real order's document. Complimentary-order document eligibility remains a separate product decision; no backend rule was changed to make this test pass.

## Still blocked or pending

- **Branding upload:** retried after the user enabled the requested permission, but the browser tool still returned an explicit local-file permission denial. No bypass was attempted. Logo upload/save/persistence is not claimed complete.
- **Four-size visual coverage:** full systematic coverage remains pending; isolated desktop/mobile evidence is insufficient to claim all layouts verified.
- **Real owner email verification and external providers:** no new credential, sender authorization, delivery or provider approval is established by this browser pass.
- **Positive-paid documents and hardware:** unverified as stated above; no physical print or real payment occurred.
- Any workflow not explicitly listed as executed retains its own checklist and evidence requirement. Tests and source review remain separate evidence.

## Additional owner-guide responsive and draft checks

The coordinator executed two further viewport checks:

- **390 px mobile:** document scroll width was **390 px**, so no page-level horizontal overflow was measured. The **Setup step** selector worked. [25 — owner mobile](screenshots/25-hosted-owner-mobile.png) shows the compact selector, stacked form, aligned native service-mode checkboxes, visible Back/Continue controls and saved-business preview.
- **834 px tablet:** document scroll width was **834 px**. At **Brand & address**, the coordinator entered the unsaved brand-description text `Synthetic draft retention check`, moved to **05 Menu** with saved-position confirmation, returned to **04 Brand & address**, and verified the textarea's actual DOM value still contained the draft. The original description was restored without saving branding. [26 — owner tablet](screenshots/26-hosted-owner-tablet.png) shows the returned screen after restoration, the saved-position notice and brand editor. The screenshot alone does not establish the intermediate draft value; that evidence comes from the coordinator's DOM check.

The supporting agent visually inspected both stored screenshots. No new blocking visual defect is apparent: fields and actions remain within their panels, tablet step navigation is legible, the mobile selector is usable, and service-mode checkbox/text alignment is retained. Minor density observations: mobile operating settings require a long vertical scroll; selected organization/branch names truncate in their compact header controls, while fuller context is displayed below; tablet color-control labels wrap onto two lines without clipping. These observations do not establish failures or warrant broad operational redesign from this pass.

This is targeted owner-guide evidence at **two** sizes, not completion of the four-size visual matrix or every application surface. Upload permission and positive-paid/physical-print limitations remain unchanged.

## Subsequent signup and operator evidence

- [27 — signup readiness](screenshots/27-hosted-signup-readiness.png): the coordinator observed the truthful awaiting-email-verification/setup state. No account was created; real email delivery remains unverified.
- A fresh normal operator login and MFA succeeded. Reopening the original enquiry showed **version 2**, **reviewing**, the assigned synthetic operator and **discovery** follow-up persisted. No authentication bypass was used.
- The deployed latest-saved-details summary was reviewed at **1440 desktop** ([28](screenshots/28-hosted-inbox-saved-desktop.png)), **390 mobile** ([29](screenshots/29-hosted-inbox-saved-mobile.png)), **834 tablet** ([30](screenshots/30-hosted-inbox-tablet.png)) and **1920 wide** ([31](screenshots/31-hosted-inbox-wide.png)). The coordinator reviewed mobile and the assigned reviewer inspected the other images; they reported no overlap or page overflow. This supersedes the earlier lack of screenshot evidence for the newer saved-versus-draft summary, specifically for this saved-detail view.
- The ten-minute MFA window later expired, and the protected editor was removed **before** an unsaved-inbox-draft browser check could run. That check was **not executed**. Full C4 concurrent-update/recovery behavior remains supported by automated tests, not a completed multi-operator browser exercise. Do not equate a four-size saved-detail review with full C4 interaction acceptance.

## Additional route captures, not yet visual acceptance

The coordinator exercised actual DOM/navigation routing and captured the following mobile pages: [35 — products](screenshots/35-hosted-products-mobile.png), [36 — Mera QR](screenshots/36-hosted-qr-mobile.png), [37 — About](screenshots/37-hosted-about-mobile.png), [38 — Contact](screenshots/38-hosted-contact-mobile.png), and [39 — product sign-in routing](screenshots/39-hosted-signin-routing-mobile.png). **These five images were captured but had not yet been visually reviewed at this update.** Routing checks passed; their visual acceptance remains pending. No authentication policy, financial policy, payment or provider configuration was changed in these checks.

## Marketing route review

Agent visually opened screenshots35–39 after root executed mobile navigation through Products, QR, About, Contact and product sign-in. All five captured mobile layouts were readable without visible clipping or overlap. The QR offline FAQ was expanded through the browser and described connection/reconciliation and printer requirements accurately. This is mobile route review, not every route at four widths. Homepage captures13/32/33 passed desktop/wide/tablet review;34 revealed a squeezed readiness note. CSS correction9901897 is built and pushed; its fresh hosted mobile acceptance is recorded separately once deployed.

## Final rendered correction and matrix

Revision9901897 is live on the same isolated web/jobs services. Root opened40-hosted-home-mobile-corrected.png: the readiness note now uses full text width with its link below. No horizontal overflow at390px. Together with13/32/33, this closes the captured homepage layout issue. No motion/keyboard certification is inferred.

Supporting agents opened all four42-consultancy and43-qr captures at390/834/1440/1920. No blocking visible overlap/clipping was found. All widths measured document width equal to viewport width. Consultancy matrix covers the initial step, not every form state; prior public submission/recovery evidence remains separate. Root reviewed20private table and21zero order screenshots, confirming readable balances and explicit no-money values.

The real downloaded CSV is also preserved as [synthetic report artifact](downloads/mera-trading-day-2026-11-20.csv). Chrome's first download attempt targeted the wrong semantic control and timed out; inspection found the real link and the corrected browser download succeeded. This was a test-driver recovery, not an application export failure.
