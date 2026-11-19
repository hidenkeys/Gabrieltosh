# Receipt and sticker studio checkpoint

Scope1.0 unchanged. O7 advances40→60 (integrated and exercised), not complete. This follows earlier subscription, QR and care milestones; physical output and broader role/device/recovery acceptance remain open.

## Verified changes

- Receipt/sticker studio preserves unsaved drafts across reads, stops protected activity after authorization denial and freezes uncertain non-idempotent writes. Optional branch/timezone context is passed from the existing workspace.
- Saved document rendering accepts legacy v1 and additive v2 snapshots. It uses saved branding, item options, pricing, branch/table context and payment totals. Missing amounts and payment-method breakdowns remain explicit. HTML text is escaped; external resources are blocked. A new format does not rewrite old jobs/reprints.
- Receipts support58/80mm and stickers20–60mm wide,15–150mm high. Preview uses physical paper widths; small labels warn about calibration. These bounds do not prove text fits physical stock. No text is silently discarded to make a fit claim.
- New paid-time snapshots include scoped branch/context and applied/lifetime/refund amounts. Settlement eligibility, once-only queue creation and preparation independence remain unchanged. Default template headings now use the scoped organization's name; saved headings win.

## Actual evidence

Build passed. Full suite547 tests:545pass,0fail,2skip. Focused printing35pass. Separate disposable PostgreSQL integration passed paid/partial/replay eligibility, v1/v2 compatibility, browser-submission truth, immutable reprint context and cross-organization default branding. No real money or production data changed.

Browser: screenshot178 before and182 after use the main branch/default desktop at3091px capture width. Combined printing-comparison.html/JPEG opened and inspected. Saved local QA heading/footer/80mm/staff-hidden survived actual reload (179); original heading/footer/58mm/staff-visible and50×40 defaults restored through the UI. Unsaved20×15 draft survived reading latest saved format and showed a small-label warning (180), then defaults restored. Actual390px phone (184),433px main-origin zoom-adjusted phone (181) and834px tablet (183) had matching document/viewport width. Saved images opened and inspected. Receipt content longer than preview is scrollable; screenshot does not show every row simultaneously.

Main3003 and isolated QA3007 restarted with existing databases, updated source and worker. Final main receipt text confirmed. No credential provisioning/reset. Main operational records untouched.

## Remaining gates

No physical printer, output calibration, Android print service or silent local bridge verified. Browser sample print-dialog invocation was not exercised in this milestone. Browser export download remains separately blocked by managed Chrome policy. Populated queue browser/reprint review and broader role/recovery matrix remain pending; pure HTML/guard and real-PG tests are not substitutes for those screens. Provider access, approved policies and isolated platform operator recovery remain separate dependencies.
