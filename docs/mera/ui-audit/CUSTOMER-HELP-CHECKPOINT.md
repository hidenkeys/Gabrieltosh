# Customer help checkpoint

This source slice owns `src/mera/customer/HelpRequests.tsx`, the new scoped `help-requests.css`, focused tests, and the existing QR help fixture only. Parent composition and central stylesheet imports remain lead-owned. The leaf retains its existing props; no parent API or provider capability was added.

The form now groups name, topic, optional current-order/joined-visit context, message and send action. Its companion request list separates human-readable status, request message and actual staff reply. Loading, confirmed empty, unavailable history and uncertain writes are distinct. A successful list refresh cannot clear a write error or unlock an original request simply because another item has matching text. Original Bing Chun cream/ink surfaces, Inter inheritance, blue focus/reply accents and 44px controls are reused. No imagery or alternative design system was introduced.

## Current-session safety

A fresh request snapshots its complete body and key before awaiting guest setup. Only that initial attempt may call `ensureGuest`. Before the first help POST, authorized GET `/public/:slug/:branchId/guest` must supply a valid `sessionRef`. An interrupted help POST retains the exact body, key and reference in memory. Every retry reads the existing cookie-backed guest, verifies the same reference, and sends the original body; it never creates another guest. A missing, expired or changed guest proof prevents POST and hides the prior private name/message/history. An identity-setup failure before a help POST is distinguished from an unknown help-write outcome.

The existing own-session help POST is idempotent by guest and request key. The backend owner confirmed no help-attempt lookup/abandon endpoint exists. Therefore this slice does **not** add a durable journal, infer a recorded result by comparing list text, offer an unproven discard/unlock action, or claim refresh/cross-device recovery. Leaving the mounted page or refreshing loses retry details; the pending notice explains this and directs customers to staff. Adding durable recovery needs an explicit actor/context-bound attempt lookup and safe resolution/release contract. Email, text and provider delivery remain unavailable, and no messages were sent by this work.

## Executed tests and limits

Eight new cases verify: complete context captured before identity setup; current-cookie proof before POST; unknown→403→429→original success without a second guest creation; missing/different proof preventing writes and hiding private fields; list refresh preserving write uncertainty; scope switches rejecting late old reads; distinct loading/auth-error/empty states and safe reply projection; and an earlier delayed history response not restoring private content after a concurrent authorization failure. The minimal existing QR fixture now explicitly provides the real session-reference contract and asserts one guest setup across retries.

The focused help/QR/session-history/activity batch passes **30/30**. These are source/DOM/fetch-fixture checks, not browser, delivery, production or accessibility certification.

Lead browser acceptance after the central CSS import and preview restart:

- Desktop: compact task heading and form/request-list adjacency; narrow/tablet: sensible single-column order, wrapping long messages/replies and reachable 44px controls.
- Anonymous state: useful empty guidance without a guest write until **Send help request**. Required name/message constraints and existing optional context choices remain usable.
- Isolated fixture send: the actual returned reference and human status appear; staff reply is shown only when the response contains one. No email/text promise.
- Keyboard and screen-reader checks: visible labels, message hint association, logical form/history order, focus outlines, loading/status/error announcement and disabled original details during uncertainty.
- Controlled interruption only: retry preserves the body/key, an auth/session switch hides private fields and cannot create a new guest, and refreshing the list neither clears the uncertain write nor restores stale private content.

No browser comparison or real help submission is claimed by this source checkpoint. The lead owns the saved before/after captures and final integration acceptance.
