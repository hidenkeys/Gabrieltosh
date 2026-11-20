# Verified foundations — 20 November 2026

Paths are repository-relative. Reinspect code after later changes.

## Sources and provenance

- `src/App.tsx`, `src/styles.css`: original Bing Chun operational application; retained source authority. Detailed original source mapping: `.agents/skills/mera-ui/references/bing-chun.md`.
- `src/mera/marketing/Marketing.tsx`, `marketing.css`, `MarketingSecondary.tsx`, `marketing-secondary.css`: Mera marketing and policy presentation.
- `src/mera/Signup.tsx`, `signup.css`, `signupRecovery.ts`: registration presentation and durable request recovery. Normal `/mera/signup` and explicit `/mera/signup?demo=1` remain separate. Existing real email delivery is blocked; simulator is not email verification.
- `src/mera/MeraSignIn.tsx`, `mera-signin.css`: shared Mera sign-in presentation with explicit organization/operator modes. `src/App.tsx` mounts organization mode for Mera workspace sign-in; `src/main.tsx` routes `/mera/platform/sign-in` to operator mode. Both reuse `/api/login`; operator login then enters the existing membership/MFA gate. The non-Mera Bing Chun login remains unchanged.
- `src/mera/workspace/OrganizationWorkspace.tsx`, `SetupChecklist.tsx`, `BusinessDetails.tsx`, `LaunchReadiness.tsx`: real organization setup and readiness integration.
- `src/mera/workspace/OwnerSetup.tsx`, `owner-setup.css`: guided owner setup presentation, integrated into the existing workspace. Step progression must follow saved configuration and readiness; do not infer completion merely from opening a step.
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

## Current-run review and skill forward test

The marketing/platform implementation agent applied this skill to the real `Marketing.tsx`, `Platform.tsx` and returning-user entry task. The three-context rule kept the original operational theme intact; the shared-component rule selected `MeraBrand` and foundation tokens; functional-preservation rules retained authentication, MFA, exact-request recovery and dialog focus behavior. The new brief explicitly supersedes the old `mera-ui` marketing image-matching instruction, so the previous ivory/serif reference is historical rather than a conflicting acceptance target. No Zidi brand references were imported.

- `docs/mera/staging-redesign/screenshots/03-marketing-first-pass.png`: opened for independent review. Shows the actual geometric mark, full Counter preview, forest service-journey section, service-mode selector, proposed pricing and FAQ. The offscreen menu image was blank in this capture; it cannot establish image-loading acceptance. Capture the image after scrolling it into view and inspect the new file. The journey heading left “too.” on a separate line; the next source revision shortens the second line to “Keep it connected.” Its rendered acceptance still needs a new capture. The lead verified that the blank capture margins came from Chrome zoom: document scroll width and inner width both measured1440 CSS pixels, not page overflow.
- `docs/mera/staging-redesign/screenshots/05-platform-before.png`: opened; authenticated **before** directory with two synthetic staging organizations. It documents the old wordmark, serif heading and horizontal section strip. It does not verify the new sidebar, protected workflows or responsive result.

Focused current implementation checks passed: marketing behavior5/5, public navigation5/5, platform UI10/10 and Mera sign-in3/3. These cover functional contracts and focus/error behavior, not visual or hosted acceptance. Record later hosted captures and actual viewport sizes separately; do not infer them from image dimensions or historical screenshots.
