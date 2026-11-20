# Owner signup and guided setup

Implemented against the existing identity and organization contracts on 20 November 2026. Browser acceptance remains a separate lead-owned gate.

## Entry points

- `/mera/signup`: real owner registration readiness. Does not display the simulator form even if the service is in demo mode. Email delivery is currently blocked; the screen states this before collecting a password.
- `/mera/signup?demo=1`: explicit demonstration, only when the server advertises simulator capability. Existing nonsecret durable markers, unknown-outcome locking, single-use in-memory verification and acknowledgment validation remain intact. This never establishes real email ownership.
- `/mera/workspace`: returning owner/staff authentication; authenticated users without memberships receive organization creation, or can request an invitation to an existing team.
- `/mera/workspace?setup=1`: authenticated guided setup intent. Only organization-wide management access can open the guide. It does not grant a role or bypass verification.
- `/mera/platform`: separately linked operator access; MFA and platform permissions are unchanged.

## Real integrations

`src/mera/workspace/OwnerSetup.tsx` wraps existing setup forms. Ordinary Getting started remains available with its Bing Chun appearance. The guide groups account, business, branch, brand/address, menu, service, team, payments and launch work. Existing menu/table/reservation/team/billing tools remain their authoritative editors; no duplicated financial or membership logic was introduced.

Step navigation persists via existing authenticated `PATCH /organizations/:id/onboarding`, storing a branch-specific `ownerGuideStep_<branchId>` key in the existing data object. The form saves remain independent. Moving between guide steps keeps child forms mounted, preserving unsaved drafts; leaving for another workspace page requires saving changes first, stated beside those actions. A visited step is never labelled ready. The actual launch readiness service remains authoritative.

`CreateOrganization.tsx` requests authenticated `/organizations/address-availability?slug=…`. The new small read-only route uses the existing slug validation and checks both canonical organization addresses and retained aliases. It returns only a boolean and reason, no names or identifiers. The precheck is advisory; existing atomic claim during organization creation decides the outcome. A changed address invalidates the prior result. Unknown creation outcomes persist an opaque nonprivate marker and do not auto-replay after reload.

The nine-step guide is navigated by a vertical list on desktop and a labelled select on narrow layouts. Mera branding uses the lead-owned real artwork component and shared identity variables. Operational components retain their existing behavior and styling outside the guide.

## Checks actually run

- 20 signup/owner component behavioral tests passed: existing recovery invariants, normal/demo separation, password visibility, guide draft retention, saved position restore, focus movement, exact-step retry, scoped-user preservation organization creation/unknown outcome and explicit owner-verification denial.
- 1 actual HTTP route test passed: unauthenticated denial, format/reserved names, canonical/alias claims, case normalization and response privacy.
- 98 focused setup/business/workspace/presentation/owner integration tests passed. This batch overlaps the owner tests above; counts must not be summed as unique tests.
- TypeScript `--noEmit` passed for the integrated slice; the lead runs the build and full regression gate.
- Existing source screenshot `240-public-signup-after.jpg` was opened for before-state inspection; it showed the previous generic cream/serif signup layout. No new browser screenshots or rendered acceptance are claimed here.

## Remaining external/visual gates

Email delivery/sender authorization remain required for real owner registration. Hosted simulator registration is not enabled merely to make a green test. Invitation delivery and payment-provider approval remain distinct readiness gates. Lead must inspect actual hosted signup, creation and guide at mobile/tablet/laptop/wide desktop, plus saved-step reload, address conflict, permission changes, form actions and launch preview. No live account verification, publication, billing or user design approval is claimed by these component tests.
