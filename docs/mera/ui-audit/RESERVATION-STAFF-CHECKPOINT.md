# Reservation and staff correction checkpoint

UI milestone only; scope1.0 remains30tasks/36screens. No production deployment, payment, email, invitation delivery, new security grant or hardware output was performed.

## Reservation path

Actual browser: isolated127.0.0.1:3006, database data/mera-demo-visual-db on55443. A primary-branch request for20November14:00/2guests was created using synthetic example.test contact data. The requested record remained in the same guest activity after reload; no second reservation was submitted. Consent remained optional and unchecked. The original3003 preview and store3002 database were separate.

Captured59 form;60 before activity;63 after status/disclosure correction;65 narrow requested activity. Matched desktop comparison uses actual1440×1000 captures60/63. It predates the final date/control-height polish, not a fabricated final render.66 shows the final actual narrow cancellation result, including Africa/Lagos date context.390×844 activity had no document overflow. Native cancellation disclosure was opened with Enter; no POST occurred until its explicit Send action.

The no-deposit test request was cancelled by the authoritative server. Browser evidence contradicted a blanket staff-review message, which was corrected: cancelled records say cancelled; pending review stays pending; neither confirms a refund. Deposit-review behavior and unknown network→4xx retries are tested separately. The reason and request key stay unchanged after unknown cancellation; editing the reason cannot create another write. Cancellation uncertainty is component-local, not advertised as a refresh-persistent journal. Reservation creation has its own validated sessionStorage journal and server attempt/abandonment endpoints; browser dropped-response interception was unavailable, so its uncertain/reload/late-write behavior is proved by component and actual-PG tests rather than claimed as live browser fault injection.

Human state labels and a subordinate reference replace the raw success state. Activity dates now use supplied venue timezone, with explicit device/UTC fallback instead of an unmarked device-time assumption. Recent-order lists clear synchronously on branch change, clear private rows on401/403/404, suppress late responses and distinguish loading/failure/known-empty. Canonical GET-before-open and guest-ending callbacks are retained.

## Research and preservation

Target: reservation activity/status and cancellation entry, web hospitality, source GuestActivity.tsx and the reservation result region in CustomerExperience.tsx. Preserve booking/payment semantics, identity, private scope, optional consent, palette/fonts and existing routes. The correction was already authorized under the complete UI prompt; no new theme was selected.

Mobbin web previews were actually opened. These are structural examples from other booking domains, not adopted themes or claims of measured business outcomes:

- Turo [cancelled-trip status](https://mobbin.com/screens/57f25bf9-df77-458a-a544-07088a58ad50): explicit human status leads details. Used for state hierarchy only; no vehicle/travel copy, colors, benefits or financial assumptions.
- Expedia [manage booking](https://mobbin.com/screens/9c4f3fca-fbb2-4dd0-b926-113ad4e3b94f): cancellation is a distinct entry action beside rules. Used for a deliberate cancellation entry; the native in-place disclosure and wording are project-specific judgment.
- GetYourGuide [cancellation/refund choice](https://mobbin.com/screens/f540152f-67de-4bbc-8589-bae5f1244ecd) was inspected and dropped: its confirmed-refund choice does not match this product's reviewed deposit semantics.

The paired artifact was opened and visually inspected with both actual1440×1000 panes loaded. It is an audit comparison, not an approved replacement image. No original Bing Chun reservation screen was accessible or claimed.

## People

Root mounted staff-management.css. Normal owner read verified in the same separate visual database. Members stay first. Invitation form/history and existing custom-role summary precede the native closed permission editor. Keyboard Enter opens/closes it without a write; default cashier ID and server-derived grantable choices remain. The invitation button was visibly overstretched and corrected to44px, confirmed by browser measurement. Desktop1440×1000 and narrow390×844 were reviewed, with no document overflow at either. Captures61/62/64 and the self-contained comparison retain actual source/after evidence. Sidebar scroll and focused disclosure differ; no claim those were redesign changes.

No member mutation, invitation or role/security grant was submitted in browser. Focused tests cover independent failed reads/retry/confirmed-empty, scope changes, unknown invitation outcomes and exact limited/versioned role update. Membership tables, scope editing, long-row/tablet acceptance and durable non-idempotent invitation/role recovery are still incomplete; O5 is40, not complete.

## Platform support

Platform support loading/failure/retry/confirmed-empty and authentication-transition focus were corrected with seven UI tests. Existing operator/MFA/authority/uncertain-write rules remain. Authenticated operator browser acceptance is not claimed. A read-only assessment is checking whether a separate synthetic operator fixture can exercise the normal MFA flow safely in the isolated visual database; production operator custody remains a launch gate.

## Validation and remaining work

Final npm test:324total,322passed,0failed,2skipped; terminal0. TypeScript/Vite build passed; git diff --check clean. Ordinary-suite PostgreSQL and print-worker skips are not hidden: a separate npm run test:mera:postgres passed1/0/0 in2.4s with the same unchanged backend revisioncfce7e7, including reservation attempt/late-write fences and published POS catalog tests. No physical print certification follows.

C4 advances40→60 from actual normal/reload/cancellation browser work plus the creation recovery source/regression evidence. O5 advances0→40 from partial implementation and read/keyboard/responsive review. M3 and other task weights stay unchanged. Remaining C4 work includes live deposit/review/expiry states, refresh-safe cancellation recovery, broad privacy/consent accessibility and full state/device acceptance. Remaining project modules remain on MERA_UI_PROGRESS.md; provider/hardware gates do not excuse local implementation tasks.
