# Mera UI Correction — Build Prompt with Progress Tracking

We need to correct the frontend implementation while preserving the
functional work already completed.

Read MERA_PRD.md, MERA_MULTI_AGENT_BUILD_PROMPT.md, the repository instructions,
and the current implementation status. This instruction supersedes any
earlier interpretation that allowed the original Bing Chun interface to be
replaced with the current generic Mera workspace.

OBJECTIVE

Deliver the complete Mera web platform with the visual quality, interaction
speed and coherent design of a finished hospitality product.

Keep the original Bing Chun look for the organization workspace and use its
actual components and screens as the primary design source. Extend that
design to accommodate Mera's new capabilities.

Use my original Mera website screenshot as the visual reference for the
marketing website and Mera-level administration. The current oversized
workspace screenshot is evidence of what needs correcting, not a reference
to reproduce.

Preserve the implemented backend, business rules, permissions, accounting
and working integrations. This is a frontend and experience correction,
with targeted backend changes only when required by a real workflow.

Do not equate feature completeness with a finished product experience.

1. INSPECT THE REAL REFERENCES FIRST

Before redesigning:

- Inspect the running original Bing Chun POS and administration screens.
- Inspect their source components, styles, assets and layout.
- Locate the original implementation through repository history if needed,
  without resetting the working branch or discarding changes.
- Inspect the current Mera implementation in the browser.
- Capture representative before screenshots.
- Identify the precise original fonts, colors, spacing, controls, navigation,
  product cards, tables, dialogs and ordering interactions.
- Read the current working tree and preserve uncommitted implementation work.

Do not invent a replacement “Bing Chun-inspired” design from memory.

If the original reference cannot be accessed, identify the missing source
and request it while continuing independent inspection. Do not claim visual
fidelity without seeing the reference.

2. ESTABLISH THE DESIGN AUTHORITY

Create a concise UI preservation specification containing:

- Original source screens and component paths.
- Shared typography and spacing scale.
- Colors and semantic status treatments.
- Navigation and workspace structure.
- Buttons, inputs, tables, cards, drawers and dialogs.
- Product browsing, modifiers, cart and checkout patterns.
- Responsive behavior.
- Permitted organization branding overrides.

Reuse original components where sound. Extract shared primitives rather
than copying slightly different versions across pages.

Do not apply one layout indiscriminately to marketing, administration,
POS, preparation and customer ordering.

3. CORRECT THE CURRENT WORKSPACE

The current screen has these concrete problems:

- Large welcome copy occupies valuable operational space.
- Organization, branch, account and session controls dominate the header.
- A large subscription notice exposes an unresolved development policy.
- A dropdown and long horizontal tab list duplicate navigation.
- Navigation requires horizontal browsing to discover core modules.
- Metric cards are oversized and contain implementation explanations.
- Financial methodology overwhelms the overview.
- Operational priorities and primary actions are not immediately visible.

Correct these issues structurally. Changing colors or border radii alone
does not satisfy this task.

Use the original Bing Chun navigation where it scales. If the expanded
module set requires a sidebar, derive its visual treatment from the
original system and use grouped, permission-aware navigation.

Keep organization/branch context compact and consistently accessible.
Place account, sign-out and secondary controls in an appropriate account
menu. Retain a clear connection/synchronization indicator where useful.

Remove the large greeting from operational pages. Use concise titles,
relevant context and clear primary actions.

Do not expose text such as:
- “Canonical branch records.”
- “Development trial duration is unresolved.”
- Internal ledger terminology without a user-facing purpose.
- Provider/simulator implementation notes in normal customer flows.

Keep development diagnostics in restricted developer/support surfaces.
Show genuine business-impacting notices to the right roles, at the right
severity, with an actionable next step.

4. DESIGN THE ORGANIZATION EXPERIENCE AROUND REAL JOBS

Owner/manager overview:
- Appropriate date and branch filters.
- Compact, clearly defined metrics.
- Orders needing attention.
- Outstanding payments.
- Current service activity.
- Reservations arriving soon, where enabled.
- Stock alerts.
- Staff/shift status.
- Useful recent activity and clear drill-downs.

Do not invent metrics or fill the page with decorative charts.
Distinguish sales, money received and outstanding balances accurately.
Put detailed accounting explanations in reports or contextual help.

Cashier/POS:
- Preserve the original Bing Chun product selection and order-building
  experience.
- Fast category/search access.
- Clear product images, variants and modifiers.
- Persistent cart/order summary on suitable screens.
- Clear totals and payment actions.
- Minimal interruption during repeated transactions.

Waiter:
- Assigned tables and orders first.
- Fast additional rounds.
- Visible preparation/service status.
- Clear handoff and reassignment.

Kitchen/bar:
- Dedicated preparation interface.
- Legible tickets, modifiers, timing and station assignment.
- Prominent status actions.
- No irrelevant owner dashboard content.

Front desk:
- Reservation timeline/list, arrivals, walk-ins and waitlist.
- Readable table availability and capacity.
- Direct conversion from reservation to active visit.

Management:
- Purpose-built screens for menu, stock, staff, finances, reports,
  branding, subscription and printing.
- Logical grouping rather than an endless list of top-level tabs.
- Progressive disclosure for advanced settings.

The home screen must reflect the user's permissions and job. A kitchen
user should not land on an owner financial dashboard.

5. MAKE ORDERS AND TRANSACTIONS UNDERSTANDABLE

Order lists must make these facts easy to scan:
- Reference and time.
- Customer/table/pickup context.
- Order source.
- Order status.
- Payment status.
- Amount.
- Current responsible staff member.
- Relevant next action.

Order detail must provide a clear timeline of creation, assignment,
acceptance, preparation, payment, service, cancellation and refunds.

Distinguish the current handler from historical actors.
Use concise summaries with deeper details in drawers or dedicated pages.

Transactions must clearly distinguish cash, external POS, manually
verified transfer and integrated collection. Preserve permission checks,
financial calculations and audit history.

6. CUSTOMER EXPERIENCE

Create a polished mobile-first storefront using the organization's actual
branding and product photography.

The ordering experience should retain the clarity and familiar product
language of Bing Chun while supporting each organization's theme.

Requirements:
- Immediate menu access after scanning.
- Clear branch and table context.
- Easy category navigation and search.
- Readable product cards with prices and availability.
- Simple, structured modifier selection.
- Persistent cart access and understandable totals.
- Guest name requested when useful, not as a browsing barrier.
- Transparent charges before confirmation.
- Clear payment and order tracking.
- Appropriate reservation entry for enabled businesses.
- Accessible receipts and help.

Do not expose staff administration, accounting explanations or technical
integration details to customers.

Test the experience on narrow mobile screens, not just desktop.

7. MARKETING AND MERA PLATFORM ADMINISTRATION

Marketing:
- Follow my original Mera reference: warm cream, restrained accents,
  dark controls, elegant typography and considered composition.
- Build a complete responsive website with real product explanations,
  credible previews, pricing, service modes and clear signup entry.
- Do not replace it with a generic dashboard or generic SaaS template.

Platform administration:
- Translate that visual identity into an efficient administrative
  workspace.
- Include organization/branch lookup, contacts, subscriptions, onboarding,
  wallet/provider states, transactions, fee revenue, reconciliation
  exceptions, support access and integration health.
- Use appropriate data density, filters, drill-downs and permissions.
- Do not reuse the public marketing layout as an administration layout.

8. MULTI-AGENT EXECUTION WITH VISUAL COORDINATION

Use multiple agents within actual runtime limits.

Lead:
- Inspect references and define shared design authority.
- Own shared shell, tokens, primitives and integration.
- Maintain route inventory, ownership and visual acceptance checklist.
- Review screenshots before propagating patterns.

Workstream A:
Marketing website and Mera platform administration presentation.

Workstream B:
Organization workspace, owner/manager views and management screens.

Workstream C:
Customer storefront, reservations, checkout and tracking.

Workstream D, when capacity permits:
POS, waiter, kitchen/bar and operational interaction refinement.
Otherwise rotate this workstream through the available agents.

Backend work should support these workstreams without unnecessary rewrites.

One owner per shared file. No competing navigation systems or independent
design systems. Communicate shared-component changes and dependencies.
Use contract-valid existing APIs and preserve authorization.

9. VISUAL CHECKPOINT BEFORE BROAD ROLLOUT

First implement and render:
- One organization overview.
- One original-style POS/order-building screen.
- One mobile customer menu and cart.
- The marketing homepage.

Compare them to the actual original references.

Correct obvious mismatches before applying the patterns throughout the
application. Show concise screenshots and explain material design choices.

Keep progressing through independent work. Do not stop at a design plan
or wait indefinitely for feedback unless a missing reference or decision
actually prevents faithful implementation.

Do not claim I approved a design unless I explicitly did.

10. SCREEN-BY-SCREEN COMPLETION

Create a route inventory covering every implemented PRD module. For each
screen record:
- Intended role and primary task.
- Existing functional coverage.
- Layout/components used.
- API integration.
- Loading, empty, error and permission states.
- Responsive verification.
- Visual review status.
- Remaining blockers.

Complete the existing modules in the corrected design language.
Do not leave advanced features as disconnected plain forms simply because
the dashboard looks better.

11. VERIFICATION

Use browser inspection and actual screenshots.

Verify:
- Desktop, tablet and mobile layouts.
- No unintended page-wide horizontal overflow.
- Navigation remains discoverable without a horizontal module carousel.
- Important operational information is visible without a large welcome
  section pushing it down.
- Typography, controls and spacing are consistent.
- Forms have meaningful labels and errors.
- Focus, keyboard interaction, contrast and touch targets are usable.
- Drawers/dialogs handle long content and narrow screens.
- Loading, empty, failure and recovery states are polished.
- Existing permissions and workflows still work.
- No fake charts, broken buttons or placeholder production data.
- Orders, payment allocations, stock and table privacy retain their
  existing correctness.

Run relevant regression tests. Existing passing backend tests are not
evidence that the UI meets these requirements.

12. DELIVERY

Deliver:
- Implemented UI improvements across the route inventory.
- Reused/extracted original Bing Chun components.
- Before/after screenshots of representative surfaces.
- Responsive and functional verification.
- A list of real remaining external blockers.
- A concise explanation of how the implementation now follows the
  original Bing Chun UI and original Mera reference.

Do not call the work complete after restyling the homepage.
Do not deploy to production or move real money.

Start by inspecting the original Bing Chun interface, the current Mera
screens and the working tree, then implement the correction.

13. VISIBLE GOAL, PERCENTAGE PROGRESS AND COMPLETION TRACKING

This section supplements all earlier requirements. Implement a transparent
progress system for this coding task, not a progress widget in Mera itself.

GOAL

Use this explicit objective:
"Correct Mera's complete web experience to preserve the original Bing Chun
UI, implement the supplied Mera visual direction where appropriate, and
verify all in-scope screens and workflows without regressing functionality."

If the environment provides a native goal-tracking tool, create this goal
and maintain it according to that tool's lifecycle rules. Do not create a
duplicate active goal. Do not invent native progress UI or claim background
execution. The repository tracker remains the durable source of evidence.

BASELINE AND SCOPE

After initial inspection, create MERA_UI_PROGRESS.md using repository
conventions, and a machine-readable companion if useful. Record the goal,
scope version, current revision, last update, workstream owners, task IDs,
dependencies, acceptance criteria and evidence links.

Map every route and relevant workflow in the inventory to a task. Include
shared foundations, mobile states, integration and final regression work.
Do not equate route count with effort or give completed backend modules
credit toward an unverified frontend correction.

Use these initial workstream weights:
- Reference inspection, shared design system and application shell: 15%.
- Organization owner/manager and management screens: 25%.
- POS, waiter, kitchen/bar and front-desk operational screens: 20%.
- Customer menu, cart, checkout, reservations and tracking: 20%.
- Marketing website and Mera platform administration: 10%.
- Cross-surface integration, accessibility, responsive/regression checks
  and final delivery evidence: 10%.

During baseline inspection, adjust weights only if the actual inventory
justifies it. Explain the change and freeze a versioned baseline before
reporting the first meaningful implementation percentage. Until then,
report "Baseline assessment in progress; percentage not established."
Do not invent an initial number.

MEASUREMENT

Break each workstream into weighted tasks whose weights total that
workstream's allocation. Agree the tasks and weights before implementation.
Each task earns credit through these evidence-backed checkpoints:
- 0%: not implemented or merely planned.
- 40%: implemented against real interfaces; required states included.
- 60%: integrated and exercised in the running application.
- 80%: visually checked against references at required screen sizes and
  accessibility criteria; issues corrected.
- 100%: acceptance criteria and relevant regression checks pass, evidence
  is recorded, and lead review is complete.

Apply only the highest checkpoint whose prerequisites all pass. A worker's
claim alone does not satisfy verification. Reopen tasks and remove credit
if subsequent changes invalidate checks.

Overall completion = sum(task weight × verified task completion).
Weights sum to 100%. Round down to whole percentages for user updates.
Report remaining scope as 100% minus completion. This is completion against
a scoped checklist, not an estimate of elapsed or remaining time.

Separate these three statuses:
1. UI correction completion: the weighted scope above.
2. Overall PRD coverage: mapped requirements, with implemented, verified,
   incomplete and blocked counts; do not invent a percentage without a
   separate complete denominator.
3. Production readiness: launch gates and external dependencies, including
   Rubies, Zidi, email, domains/TLS and physical printing.

A UI can reach 100% only when its own acceptance criteria are met. It does
not imply the entire PRD or production launch is complete. Simulated flows
must stay labeled and cannot satisfy live integration launch gates.

USER-FACING UPDATES

Start by stating the goal and immediate assessment work. During active
work, send concise commentary updates approximately every 60 seconds when
the environment allows, and after meaningful integrations, visual reviews,
blockers or scope changes. Do not send duplicate unchanged status spam.
Update the tracker when evidence changes. If a tool call delays updates,
report at the next opportunity; do not promise exact timers.

Use this format for substantive progress updates:

Goal: Restore Bing Chun fidelity across Mera's web experience.
UI correction: <verified percentage>% complete | <remaining>% remaining.
Current milestone: <milestone>.
Completed since last update: <concrete verified changes>.
Now: <agent/workstream tasks>.
Next: <next acceptance gate>.
Blocked: <specific dependency and affected tasks, or none>.
Evidence: <screenshots, tests or tracker reference>.

Keep routine updates short. Include per-workstream percentages at milestone
boundaries, when asked, and in the final handoff. Examples are templates,
not fabricated progress values.

On "status", "percentage", "how far" or "what remains", reconcile worker
reports with the tracker and answer immediately with verified completion,
remaining tasks and blockers, then continue the authorized work.

MULTI-AGENT REPORTING

Every worker reports its task IDs, status, changed paths, dependencies,
checks performed, screenshot/test evidence and next step to the lead after
meaningful changes. The lead alone reconciles overall percentages; do not
average agent estimates or count shared work twice.

Use statuses NOT_STARTED, IN_PROGRESS, BLOCKED, READY_FOR_REVIEW and VERIFIED.
Blocked tasks retain only previously earned valid credit. Reassignment or
handoff must preserve history. Continue unblocked work rather than waiting
for the slowest agent.

SCOPE CHANGES AND HONEST COMPLETION

Do not remove unfinished work or reduce weights to inflate completion.
For approved scope changes, version the baseline, retain the old totals,
explain recalculation and show the resulting percentage honestly. Allow
percentages to decrease when scope expands or verification fails.

Do not provide an exact completion time from percentages. If giving a time
estimate, state its basis, assumptions and uncertainty; use remaining
tasks/checkpoints when reliable timing is unavailable.

Never mark the native goal or tracker complete just because the turn is
ending, the context is full, code is committed or builds pass. At a handoff,
persist the exact state and give the next session enough information to
resume. Mark complete only when the defined goal's required work is done.
If external conditions prevent completion, report partial completion and
precise blockers without falsely claiming 100%.

FINAL HANDOFF

Report the final verified percentage and scope version, per-workstream
status, completed acceptance gates, evidence links, unfinished tasks,
external production blockers and the next concrete actions. Link to
MERA_UI_PROGRESS.md. Keep the tracker in the project so I can check progress
without reading the entire conversation.
