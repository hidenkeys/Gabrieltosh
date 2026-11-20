# Mera staging/redesign coordination

Scope2.0, November20. Historical scope1 archived intact at93%. Lead integrates commits and serializes migrations/deploys. No production deployment/data/payment changes.

| Owner | Paths | Current milestone | Dependencies |
|---|---|---|---|
| Lead | main.tsx, ui/MeraBrand.tsx, ui/mera-foundations.css, projectskill, progress/evidence | Actual logos, scoped tokens, baseline capture; integration | Browser/current server; all agent slices |
| staging | deploy/, scripts/mera-staging-*, server/mera-hosting.js, limited server/app.js, staging tests | 405d8a0 pushed; exactSHA web deployment authorized | Isolated PostgreSQL; webhealth beforejobs |
| marketing_refresh | marketing/*, marketing-ui test; now Platform.tsx/platform.css/platform UI tests | Marketing implementation5/5tests; platform rail/details correction | Shared brandcontract ready; root owns browser |
| owner_onboarding | Signup/signup.css, OwnerSetup/owner-setup.css, narrow OrganizationWorkspace mount, advisory slug route + tests | Guidedsetup/signup implementation and behavioraltests | Shared brandready; main CSS import ready; real email unavailable |

## Shared contract

MeraBrand props className? and tone dark/light. Original assets only, CSS margin crop. Root .mera-identity provides scoped forest/paper/lime tokens. Import CSS only in main.tsx; component imports remain runnable in node tests. Existing Bing Chun themes and shared server pricing/authorization contracts unchanged. One owner per sharedfile.

## Current evidence

- HEAD405d8a0 infrastructure tests5/5rerun bylead; pushed.
- Marketing tests5/5 agent run; lead integrated suite pending.
- Projectskill initializer+official quickvalidator passed (temporary Python dependencyenvironment only).
- Logo pixel inspection1125×1127 RGBA, matchingalpha/contentbounds; originalfiles copied without pixeltransformation.
- Current-run marketing/signup beforecaptures opened. Chrome localhost3003 allowed; previous127.0.0.1:3007denial not retried/bypassed. In-appbrowser initialization fails missingnativebuild.
- HostedURL assigned; reachability not yet claimed. Emailprovider, productionbilling, printerhardware remain separate gates.
