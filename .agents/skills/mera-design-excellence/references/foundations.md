# Verified foundations — 20 November 2026

Paths are repository-relative. Reinspect code after later changes.

## Sources and provenance

- `src/App.tsx`, `src/styles.css`: original Bing Chun operational application; retained source authority. Detailed original source mapping: `.agents/skills/mera-ui/references/bing-chun.md`.
- `src/mera/marketing/Marketing.tsx`, `marketing.css`, `MarketingSecondary.tsx`, `marketing-secondary.css`: Mera marketing and policy presentation.
- `src/mera/Signup.tsx`, `signup.css`, `signupRecovery.ts`: registration presentation and durable request recovery. Existing real email delivery is blocked; simulator is not email verification.
- `src/mera/workspace/OrganizationWorkspace.tsx`, `SetupChecklist.tsx`, `BusinessDetails.tsx`, `LaunchReadiness.tsx`: real organization setup and readiness integration.
- `src/mera/Platform.tsx`, `platform.css`: operator directory, health, support, finance and MFA.
- `src/mera/ui/useDialogFocus.ts`: shared focus containment/return behavior.
- `src/mera/branding.ts`: organization branding validation and contrast helpers; do not replace with Mera marketing palette.

## Actual logo

`public/mera/brand/mera-mark-dark.png` and `mera-mark-light.png` are byte-for-byte copies of the two supplied November20 attachments. Each is1125×1127 RGBA. Nontransparent content(alpha>10) is x170–958/y411–685; both contain92114 visible pixels with matching bounds. First predominantly dark, second white. The second was not blank: white-on-white presentation concealed it.

`src/mera/ui/MeraBrand.tsx` preserves original proportions and uses CSS clipping of transparent margins only. Rendered mark width104px, aspect789/275; use dark on light, supplied white on forest. Keep source files intact. No invented text wordmark.

## New Mera foundations (deliberate proposal, not original tokens)

`src/mera/ui/mera-foundations.css`, imported once in `src/main.tsx`, scopes color/motion to `.mera-identity`.

| Token | Value | Purpose |
|---|---|---|
| --mera-ink | #152b24 | Text |
| --mera-muted | #56635c | Secondary text |
| --mera-forest | #153f32 | Main controls/dark sections |
| --mera-paper | #f7f6f0 | Warm base |
| --mera-white | #ffffff | Working surfaces |
| --mera-lime | #d9eb92 | Limited emphasis on dark |
| --mera-border | #d8ded6 | Separators |

Inter/Arial/sans-serif; bold sans display with deliberate tight tracking. Do not use the old Libre Caslon heading throughout the new Mera surfaces. Existing fonts remain usable by unaffected surfaces. Motion140ms feedback/220ms entrance, cubic-bezier(.2,.7,.2,1); reduced-motion disables transitions and animation.

## Visual evidence

`docs/mera/staging-redesign/screenshots/01-marketing-before.png`: current-run full-page capture of old homepage, actual1440×900 CSS viewport, localhost3003. Opened and inspected. Shows invented text logo, dominant serif heading, cropped Counter imagery, repeated pale surfaces. This is evidence of the rejected design, not the new target.

Earlier evidence under `docs/mera/ui-audit` is historical. It does not certify new edits or hosted screens. New protected-state and responsive captures must be added as they are actually inspected.
