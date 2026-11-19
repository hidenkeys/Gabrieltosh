# Shared dialog lifecycle milestone

Baseline63.8/100 at10e1feb, scope1.0 unchanged. Previous goal turn was progress: shift recovery verified/pushed. New F4 milestone replaces duplicated modal lifecycle handling across all four Mera dialog consumers, not business controllers or visual themes.

| Owner | File ownership | State / dependencies |
| --- | --- | --- |
| Lead | NEW useDialogFocus; OrganizationWorkspace signout, WorkspaceAccount trigger ref, MenuPublication; shared/integrated tests and evidence | Shared focus/scroll/isolation lifecycle; native showModal and explicit fallback; preserves source geometry, journals and callback rules |
| Visit tools | CustomizationDialog only | Frozen; existing19customer tests pass; initial dialog focus/passive return after parent isolation retained |
| Platform owner | Platform + focused platform UI test | Frozen9pass; native behavior preserved, pendingChange blocks dismissal, auth heading priority and exact-intent recovery unchanged |

Audit: customer trap included hidden controls and separate global handlers; native fallback platform open lacked modal isolation and could focus disabled first controls; signout had bespoke button loop without general isolation/return. Current source dialog/layout assets retained. Existing native publication captures228/229 have different desktop sizes, so rejected as matched comparison. Reconstructed committed56517ab frontend at temporarylocalhost3008 from git archive, preserving working tree; proxied only existing API reads. Same tab then navigated3003 for final match233/235,2782×1048 and identical720×1015.77dialog rectangle. No publication/order/payment/policy action submitted.

Tests: shared5 cover hidden/closed/disabled/inert controls, tab order/radio groups, zero tabbables, programmatic escape, pending Escape/cancel, fallback modal isolation, detached opener, nested stack/scroll and StrictMode cleanup. Integrated signout verifies account-trigger return, containment, no logout or journal loss on dismiss. Workspace/publication/recovery95pass, customer19pass, platform9pass. Fullsuite618total/616pass/0fail/2skip43.03s; build passed.

Actual native publication ShiftTab→Publishfocus (no click),Tab→Close,Escape→Reviewtrigger,15isolatedsiblings→0 andbodylockrestored; narrow433CSSpx (90%Chromezoom) nooverflow. Customer actual834/390CSSpx,560/362dialog width, modifiererrorfocus, checkbox selection,Escape actualproducttrigger and0isolation/bodylock restored. Captures230–232 opened. Platform protected current-browser verification unavailable because prior temporaryQAoperator credential artifact not recoverable; no regrant/reset performed. Broader Q2/state/assistive-technology matrix remains unfinished, so no Q2 credit. F4 can advance to80 after final combined comparison/lead acceptance, not100 or whole-platform completion.
