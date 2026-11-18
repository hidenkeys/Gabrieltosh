# O3 setup composition: integration handoff

Integrated by lead; read-only visual checks passed at desktop1440×1000, tablet834×1194 and narrow433×938. Full save/failure/launch workflow acceptance remains pending. Existing application mutation/privacy ownership stays in `OrganizationWorkspace.tsx`.

- New `src/mera/workspace/SetupChecklist.tsx` exports default presentational component with optional ReactNode slots `basics`, `operations`, `appearance`, `booking`, `pricing`, `minimumSpend`, `deposits`, `readiness`.
- Import `src/mera/workspace/setup.css` centrally from `src/main.tsx`; the component intentionally imports no CSS so Node JSX tests remain supported.
- Render one scope-keyed `SetupChecklist` in the existing permission-gated onboarding section. Supply existing elements and exact props/save callbacks; remove their old separate mounts so no duplicated forms or side effects remain.
- `basics`: existing contact/onboarding form. `operations`: existing `BranchSettings` (which already contains operations and appearance subsections), collapsed initially to avoid a long expanded settings wall. Do not mount `BranchSettings` a second time under `appearance`: it would create competing drafts. `appearance` can stay omitted until a deliberate shared-state extraction is agreed.
- `booking`: existing `ReservationPolicy`; `pricing`: `PricingPolicy`; `minimumSpend`: `MinimumSpendPolicy`; `deposits`: `DepositPolicy`; `readiness`: `LaunchReadiness`. Preserve each existing scope key, policy snapshot, disabled state, and `mutate` callback.
- Do not add completion percentages/checkmarks to this composition: it has no authoritative completion payload. Publication status remains inside the existing live readiness consumer.
- Optional forms are always mounted inside initially closed native details, retaining drafts while collapsed. Their existing loading/error/empty/permission conditions remain supplied children. Omitted slots expose no fabricated controls.
- CSS is scoped to `.mw-setup-*`, reuses original ink/cream/panel/line/blue values, sets44px input/action targets and visible focus. No global shell changes.

Remaining acceptance, owned by lead: capture same actual branch and role at desktop, tablet and narrow widths; verify basics precede policy/publication controls, no page-wide overflow, details keyboard/focus, retained drafts, actual save failure/retry, launch approvals, uncertain request recovery, permission-hidden slots and branch switch isolation. Compare saved captures with original Bing Chun operational composition. A DOM test cannot establish actual visual acceptance or native keyboard behavior.

Evidence: `tests/mera-setup-ui.test.tsx` four passing source tests cover ordering, collapsed optional state, preserved child draft, omitted slots, and unchanged real status/error/retry children. No new backend, production, provider or hardware action was introduced.
