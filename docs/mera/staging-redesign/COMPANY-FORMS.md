# Company enquiry interfaces

Implementation evidence, 20 November 2026. Visual verification is pending the coordinator's browser pass; automated component tests are not screenshot evidence.

## Routes and ownership

- Marketing mounts `ProjectBrief` on `/mera/consultancy#project-brief` and `TravelInterest` on `/mera/travel#travel-interest`.
- Public components and their scoped CSS are under `src/mera/company/`. `PlatformCompanyInbox.tsx` in the same directory is independently owned by the coordinator.
- Contracts come from `shared/mera-company-contracts.js`; the backend owns validation, private documents and platform authorization.
- Signup identifies Mera QR, retains separate demo behavior and links to `/mera/qr#commercial`. Owner setup only receives short, reduced-motion-safe step entry motion; operational behavior is preserved.

## Implemented behavior

Consultancy is a three-step contact/project/review form with accessible validation, retained backward-navigation drafts, scope, unsure/NGN budget ranges, timeline, private optional files and explicit consent. Files are limited to PDF/TXT/PNG/JPEG, three files and 512 KB combined. Client checks do not claim malware scanning. The server remains authoritative for document validation.

Travel is an interest form, explicitly for a planned product. It neither creates a product account nor promises a launch date or confirmation email.

Both forms persist an exact request and UUID in a bounded, read-back-verified session journal before dispatch. A network failure, malformed acknowledgement, 429 or uncertain error retains the original request. Reload never submits automatically. Explicit retry sends the same payload and key. A first definitive 400/413/422 rejection reopens editing; a rejection following uncertainty leaves the original request locked. Corrupt or unavailable storage blocks a new submission. Confirmed receipt replaces private details/documents with a nonprivate receipt marker. Submissions do not disappear on page reload or reappear as a blank form inviting duplicate requests.

The temporary private copy and purpose of collection are disclosed before consent. Successful acknowledgement displays the actual server reference, never invented delivery or acceptance. Completion storage failure is disclosed separately.

## Automated evidence

`node --import tsx --test tests/mera-company-ui.test.tsx tests/mera-owner-setup.test.tsx`: 14 passed (9 company UI/recovery, 5 owner workflow). `npx tsc --noEmit`: passed.

Coverage: consent/contact validation; actual acknowledgement and private-copy clearing; reload/exact retry; rejected-first vs uncertain-retry behavior; false email-delivery acknowledgement rejection; corrupt/quota storage; guided step draft preservation; combined document size; complete consultancy review and duplicate-click prevention. Server integration/private-download tests belong to the backend agent.

## Browser verification checklist

1. Desktop consultancy: contact validation/focus, next/back retention, all scope fields, review, private upload/remove, consent and valid receipt. Inspect step sidebar and usable line lengths.
2. Mobile consultancy: compact three-step indicator; stacked fields; no horizontal overflow; readable filenames and review text; footer actions remain tappable.
3. Travel desktop/mobile: optional fields, consent and honest planned-product receipt.
4. Throttle/block one submission response, reload, verify no automatic request and original contact summary, then explicit retry with unchanged key/body. Use only synthetic local/staging data.
5. Sign-in/signup entry and owner setup: retained existing behavior, short transitions; reduced-motion turns transitions off.
6. Platform MFA operator: submitted synthetic brief/interest actually present; private attachment unavailable anonymously. Coordinator/backend own this check.

No production deployment, live payment, outbound email or physical hardware operation was performed by this workstream.
