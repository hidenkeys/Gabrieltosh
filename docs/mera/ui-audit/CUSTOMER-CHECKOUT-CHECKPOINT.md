# Customer checkout, tracking and configured-theme checkpoint

19 November2026. Partial C2/C5 milestone preserving original Bing Chun composition, photos, basket adjacency, typography defaults and manual-payment/recovery behavior.

## Audit and correction

Before155: basket had no native form, missing-name action was silently disabled, and checkout errors were above the menu. Actual required-size fixture exposed a base₦0 card even though priced sizes were mandatory. Tracking used rawstatus codes and mixed device date formats.

After163/default phone165/tablet166: task-grouped native form with items, order details and review/send; required-name hint and focus; local error and recovery feedback; readable price-review labels. Original uncertain body/key, stored journal, scope guards and retry callbacks remain authoritative. Pricing policy remains configurable and no unapproved charges were enabled.

Size-priced cards say Choose size for price. Tracking/receipt/history share customer-readable labels and branch-labelled dates; unknown internal values are not echoed. Unpaid orders remain unpaid and do not offer paid-receipt printing.

Added precise hex text controls beside existing organization color pickers. Incomplete text is invalid and never replaces a valid color; native validation and existing branding checks remain.

## Actual browser checks

All mutations were in disposable frontdesk QA app3007/database55444. Main/store/production data and pricing/payment policy were not changed.

1. Created Local customization QA via normal admin UI: base0, Regular₦1800/Large₦2300, required1-of-1 sweetness group with Less sugar/No sugar. Reviewed and published only the local QA menu version2.
2. Actual customer dialog blocked zero and two choices, focused the required group, and carried Large·Less sugar into the basket at₦2300. Selected-size card no longer advertises₦0.
3. Native checkout refused a missing name and focused its input. With synthetic name/note, created M-3936D5E8, total₦2300, recorded payments₦0. Final tracking164 shows Sent to the venue/Payment not yet confirmed and Africa/Lagos dates; no print receipt action.
4. Added another Large to a basket, then set that QA size stock0 through admin with a test reason. Submission produced Not enough stock for this size inside the basket, focused mc-checkout-error, and retained the original request. Check original returned not recorded; explicit stop with a reason cleared the unreceived request without payment/refund. Final local notice placement is also covered by tests;159 captures the actual stock error state before the final local-notice refinement.
5. Refresh showed the Large option Sold out and disabled while Regular remained selectable.
6. Configured QA-only primary#49324F/accent#E8DDF0/Serif. Verified actual CSS primary and rendered button rgb73,50,79, serif font, required choices and362px dialog at390px viewport (158/160). These are fixture values, not new product design tokens or a different organization identity. Bing Chun assets remained its own.
7. Restored original QA primary#1558c9/accent#83ddf7/System/description. Final default captures confirm restored branding. Only the deliberately created test product and its sold-out Large fixture remain.

Default before155/after163 captured at identical unchanged desktop size and one-lemonade search/basket; after includes the extra QA fixture category. Paired customer-checkout-comparison.html/JPEG inspected. Phone390×844 and tablet834×1194 widths matched document width, no page overflow. Phone Back to menu restored search focus. These checks do not certify physical Android hardware or full WCAG.

## Validation and ownership

- Final production build passed.
- Full regression496 tests:494passed,0failed,2skipped.
- Customer-focused77/77 passed; new presentation3/3; brand/settings4/4.
- Lead: actual UI/fixture testing, BrandColorField/BranchSettings/CSS/tests, central imports and evidence.
- Customer agent: parent basket/controller presentation, checkout.css and checkout/recovery regressions.
- Visit-tools agent: orderPresentation and SessionOrders presentation/tests.
- Backend agent: read-only fixture constraints/schema assessment. No backend/API change in this milestone.

## Remaining acceptance

C2/C5 advance to60, not complete. Still pending: full browser quote-expiry/charge matrix, simulated network/session recovery across devices, paid receipt/history outcomes, long/many-group dialog matrix, and generic non-Bing-Chun photo/identity fallback. Actual configured color/font checks are not a second-business/logo certification. Provider credentials, physical printing and protected-platform QA credential recovery remain separate gates. No deployment or real money movement.
