# C: workspace density and policy controls

Implementation follows the committed round-2 audit (`docs/audit/ux-audit.md`). This checkpoint records source and test evidence, not final visual acceptance.

## Changed

- `WorkspaceNavigation.tsx` keeps daily service/management tasks prominent and puts eight permitted, less frequent tasks under **More**. Active rare destinations open that section. Existing destination IDs, permission filtering, explicit keyboard activation and mobile drawer behavior remain. Arrow traversal skips collapsed tools; More remains a normal keyboard-accessible button.
- `OrderInstructions.tsx` exposes an optional compact note mode used only by `Tickets.tsx`. A one-line preparation-note summary expands to escaped full text. Structured allergens, dietary facts and modifiers remain visible. Existing non-ticket consumers keep their expanded notes. Ticket writes, cumulative counts, exact retry intents, clock, columns, sound and fullscreen are unchanged.
- `UnitInput.tsx` reuses the existing shared-control design for rates, durations, dimensions and coordinates. It keeps native `min`, `max`, `step`, `required` and raw string input callbacks. Nullable units have a deliberate unset action; their consumers still serialize blank as `null`, distinct from zero. Unit presets are draft actions, never automatic policy approval.
- `PolicyEditor`, `PricingPolicy`, `DepositPolicy`, `ReservationPolicy`, `PrintStudio` and `TableEditor` use labelled units. Currency inputs remain money controls. Percentage-to-basis-point conversion, printer dimensions and 0–100 floor coordinates retain their original wire values. `Categories` uses a signed stepper retaining the −100000..100000 ordering range.
- Existing Orders advanced filters were already disclosed and were preserved.

## Contract boundaries

No API paths, request shapes or server code changed. Policy/readiness caveats and approval acknowledgements remain verbatim. Print calibration and unknown-write recovery remain; this is not printer certification. Subscription presentation, table task navigation and parent integration are root-owned and are not part of this leaf change.

The browser-discovered Create table default-seat defect was fixed by root in `OrganizationWorkspace.tsx`. The integration regression here proves that the displayed default1 submits numeric `capacity: 1` without requiring a quantity edit.

## Checks

- 59 focused density/navigation/preparation/print/table checks passed. These cover More reveal/filtering/focus, ticket note isolation and escaping, visible allergens, numeric bounds/presets, signed category requests, nullable cutoff null versus zero, and preserved preparation/print recovery.
- Full `tests/mera-workspace.test.tsx` passed80 tests after More adaptations. A subsequent dedicated default-seat regression passed separately.
- TypeScript and build passed on the C source. Root owns the final combined rerun/build after the table default fix and other workstreams.
- Browser verification at390/820/1440, comparison captures, real keyboard traversal and console inspection remain root's acceptance gate. This document does not claim those screens were inspected by this worker.

No deploy, real accounts, customer email or real payments were used.
