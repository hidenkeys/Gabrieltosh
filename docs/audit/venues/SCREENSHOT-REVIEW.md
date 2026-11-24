# Historical venue screenshot review

Reviewed 24 November 2026 before the new local walkthrough. This is a review of the **existing 50 PNG files**, associated with `walkthrough.json` generated at `2026-11-24T03:45:21.017Z`; it is not a new browser run or certification of current source. That manifest records 530 passing checks and one failure. The previous captures can be recovered from the pre-review Git revision `5a38481` if a subsequent run replaces the same filenames.

All 50 files were visually inspected in ten five-image contact sheets. Five representative originals were opened at full resolution: Pulse overview and All locations (390), Oak & Ember overview (390), Harbour All locations (390), and Kerbside guest menu (1440). Contact sheets support broad composition comparison; they do not establish small-text legibility or every detail of long reservation lists. Filenames claim 390 and 1440 widths; no 820-width capture exists in this set.

## Findings

| Screen/job | Finding | Evidence in historical set | Verdict | Effort | Impact |
|---|---|---|---|---|---|
| Pulse trading-day reporting | Overview says trading date 2026-11-23 with ₦180,000 net sales, while All locations Today says ₦0 and zero orders. This is concrete evidence of inconsistent day selection, not evidence that the stored sale vanished. | `pulse-owner-real-ui-sign-in-and-authorized-location-codes-390.png`; `pulse-venue-capability-navigation-and-all-locations-390.png` | Fix and verify per-location presets against cutoff boundaries. Current backend review handles this separately. | M | High |
| Single-location navigation | Daybreak, Pulse, Saffron and Velvet expose an All locations view despite having only one outlet. | Their `venue-capability-navigation-and-all-locations` pairs | Remove redundant destination from sidebar and switcher; retain branch Overview. Current uncommitted navigation work addresses this; live confirmation still required. | S | Medium |
| Mobile overview money | Values wrap within currency amounts, for example Oak ₦4,500.0 followed by 0; Pulse ₦180,000 followed by .00. No horizontal overflow does not imply readable metrics. | `oak-ember-owner-real-ui-sign-in-and-authorized-location-codes-390.png`; Pulse equivalent; other overview mobile captures | Use sufficient metric width or smaller responsive type so an amount stays together. | S | High |
| Mobile workspace entry | “Workspace menu” is almost invisible against the cream surface in the captured Overview state. Screenshot cannot establish whether animation/capture timing contributes. | Oak, Pulse and other owner overview 390 captures | Recheck actual mobile resting and focused states; maintain clear contrast and keyboard access. | S | High |
| All locations metric relevance | Charged to rooms appears for businesses without room-charge capability; single-outlet pages also add unnecessary comparison UI. | Daybreak, Kerbside, Oak, Pulse, Saffron and Velvet All locations screenshots | Hide irrelevant zero-value features while preserving real historical financial records. | S | Medium |
| All locations comparison | Table content extends within a narrow internal region; only early columns are visible at 390. Stock sections are tightly stacked and ungrouped. | Harbour, Kerbside and Oak All locations 390 | Keep internal scrolling with clear region and sticky row identity, verify keyboard/touch access to all columns; scoped styling is being reviewed. | M | Medium |
| Guest menu assets | Synthetic products use explicit “Photo coming soon” placeholders. These are honest placeholders, but cannot support a claim of complete image curation or polished production menus. | All guest menu pairs | Keep fictional test data honest; production image curation is a separate acceptance item. | M | Medium |
| Capture integrity | Some 1440 full-page captures repeat the page header and top content in the lower half. Kerbside guest screenshot is a clear example. This may be capture/stitching behavior; screenshots alone do not establish duplicated live DOM. | `kerbside-grill-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png`; Pulse equivalent | Re-capture and inspect live DOM before treating these as final visual acceptance. | S | Medium |
| Reservations | Lists are very long at 390; cards remain vertically stacked. The captures demonstrate seeded history, not successful reservation creation/deposit/cancellation. | Harbour, Pulse, Saffron, Velvet reservation pairs | Keep evidence claim narrow; exercise complete transactions separately. | M | Medium |

## What the runner does and does not prove

The existing runner signs in across roles, checks authorized location options/navigation, checks the Kerbside location override, inspects seeded destination screens, checks QR preview, checks guest disabled-ordering/choice constraints when available, and collects console/network and page-width signals. It never settles bills, records deposits, receives transfers, launches venues or sends email. Opening a screen is not completing its transaction.

The old Pulse block required today's revenue and orders to be positive. That is brittle because fixture dates age and a valid trading day can contain no orders. The revised runner checks the actual server-provided Today response against the rendered values, and verifies that both navigation and location switcher hide All locations for one outlet. Separate deterministic backend tests must verify the correctness of trading-date calculation; comparing UI with its API alone does not prove it.

The runner's closed-hours path explicitly returns without opening the combo sheet. A passing disabled-ordering check at a closed venue therefore does not certify combo min/max selection in the browser.

## Transaction journey checklist still outside the historical runner

| Venue | Full journey requiring separate execution/evidence |
|---|---|
| Kerbside | Submit QR pickup → record synthetic payment → prepare → ready → collected; verify affected stock and report. Existing price/location-role checks are separate. |
| Oak & Ember | Seat party → add kitchen and bar items → split bill → settle both parts → close visit. |
| Saffron | Create reservation → record manual deposit → cancel before cutoff → review refund; distinguish existing no-show history from a new exercised transition. |
| Velvet | Open tab → add rounds → inspect minimum spend → settle → close; verify overnight date/cutoff deterministically rather than waiting for midnight. |
| Pulse | Reserve VIP table → deposit → table-required bottle package → door check-in → entry order/payment → minimum-spend settlement → close; verify 07:00 cutoff and per-station component preparation. |
| Harbour | Room charge with fictional room/surname → separate payment mix; receive a synthetic sent stock transfer → confirm destination/source stock and idempotent recovery. |
| Daybreak / Afterdark | Counter pickup → seated order → open tab → minimum-spend review → settle. |
| All venues | Complete role denial/recovery checks around new writes, reports/refunds/shift close; verify mobile/tablet/desktop and keyboard behavior. |

Physical receipt/sticker output, Windows installer/hardware behavior, real email deliverability, real provider settlement, staging deployment and staging walkthrough are not certified by these images. No production activity was performed for this review.

## Reviewed file inventory

Each original file is listed with a SHA-256 prefix so this review remains attributable if the next walkthrough replaces its path.

| File | SHA-256 prefix |
|---|---|
| `daybreak-afterdark-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `0cdd54c5c4aa65e4` |
| `daybreak-afterdark-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `3bd98e5a50c9cb5b` |
| `daybreak-afterdark-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `c24c59a024370c7e` |
| `daybreak-afterdark-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `0b298f2c256f4783` |
| `daybreak-afterdark-venue-capability-navigation-and-all-locations-1440.png` | `87b9583595a261bc` |
| `daybreak-afterdark-venue-capability-navigation-and-all-locations-390.png` | `46f53759595cec4b` |
| `harbour-hotel-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `41cdcba14172efe8` |
| `harbour-hotel-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `37489eee4885f68e` |
| `harbour-hotel-journey-checklist-inspect-reservations-1440.png` | `4bef1087ef8dd27e` |
| `harbour-hotel-journey-checklist-inspect-reservations-390.png` | `5f310ec5bf1545f5` |
| `harbour-hotel-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `d1bcf385c4d413e2` |
| `harbour-hotel-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `d3ef4c6519807ffc` |
| `harbour-hotel-venue-capability-navigation-and-all-locations-1440.png` | `3a7a6372590067db` |
| `harbour-hotel-venue-capability-navigation-and-all-locations-390.png` | `393b1514a0b248c1` |
| `kerbside-grill-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `8ace4f4cf5dbf14e` |
| `kerbside-grill-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `ff1762def5b380f1` |
| `kerbside-grill-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `b7a9b211bbf94c29` |
| `kerbside-grill-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `e1ae09c152c715b2` |
| `kerbside-grill-venue-capability-navigation-and-all-locations-1440.png` | `c22c5e380d49903b` |
| `kerbside-grill-venue-capability-navigation-and-all-locations-390.png` | `7adbfb2e71d2b8dd` |
| `oak-ember-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `9b0e11b7dfb07590` |
| `oak-ember-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `e860e8d393772bd1` |
| `oak-ember-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `649025ca51055b1a` |
| `oak-ember-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `7b11d09cc94df53a` |
| `oak-ember-venue-capability-navigation-and-all-locations-1440.png` | `d8e7ce1ae891df04` |
| `oak-ember-venue-capability-navigation-and-all-locations-390.png` | `ad59de9085df81a7` |
| `pulse-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `d0a3717df963e1da` |
| `pulse-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `5dc009fa3d304903` |
| `pulse-journey-checklist-inspect-reservations-1440.png` | `9637dbe4efed5c52` |
| `pulse-journey-checklist-inspect-reservations-390.png` | `2f2b18cbd5eef301` |
| `pulse-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `42b92643716acbd8` |
| `pulse-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `7c7bc1549f2440d4` |
| `pulse-venue-capability-navigation-and-all-locations-1440.png` | `1a7ce88e9c7dd591` |
| `pulse-venue-capability-navigation-and-all-locations-390.png` | `a5f382811781b283` |
| `saffron-room-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `8756d5958d20970e` |
| `saffron-room-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `84718dfd58f0da97` |
| `saffron-room-journey-checklist-inspect-reservations-1440.png` | `45888ab4b729d2db` |
| `saffron-room-journey-checklist-inspect-reservations-390.png` | `f5cfbf42d766e7f5` |
| `saffron-room-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `acfaa7113074aa66` |
| `saffron-room-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `77aabec6d68f75af` |
| `saffron-room-venue-capability-navigation-and-all-locations-1440.png` | `088e3aa4b528de27` |
| `saffron-room-venue-capability-navigation-and-all-locations-390.png` | `e16c7476adefc2f6` |
| `velvet-lounge-counter-qr-package-table-requirement-and-combo-min-max-sheet-1440.png` | `b0eb9d02acb286b0` |
| `velvet-lounge-counter-qr-package-table-requirement-and-combo-min-max-sheet-390.png` | `20dab2abb0f4c3a5` |
| `velvet-lounge-journey-checklist-inspect-reservations-1440.png` | `0a77e8d82ccbc75d` |
| `velvet-lounge-journey-checklist-inspect-reservations-390.png` | `a1cd0109e222c3d6` |
| `velvet-lounge-owner-real-ui-sign-in-and-authorized-location-codes-1440.png` | `fa3e2e2edb97ab99` |
| `velvet-lounge-owner-real-ui-sign-in-and-authorized-location-codes-390.png` | `c527815c591f7c0e` |
| `velvet-lounge-venue-capability-navigation-and-all-locations-1440.png` | `f57f3144452a4e19` |
| `velvet-lounge-venue-capability-navigation-and-all-locations-390.png` | `cc910c37afb405f3` |

## Follow-up: live local verification on 24 November 2026

The authorized existing seven-venue runner was executed only against `http://127.0.0.1:3011`, using existing synthetic accounts. The stable final run in `walkthrough.json` was generated at `2026-11-24T04:15:04.107Z`: **680 checks passed, zero failed, 75 screenshots**. It now checks 390×844, 820×1180 and 1440×1000. The Pulse navigation failure is closed in this run. The full portfolio still has the transaction scope limits described above; a higher check count includes the additional tablet width, not newly completed payment journeys.

Screenshot stability was corrected in the runner: reduced-motion contexts, font readiness and two animation frames precede width checks; screenshots use `animations: "disabled"`. A read-only Kerbside diagnostic confirmed the mobile menu has blue foreground `rgb(50,102,172)` on cream `rgb(252,251,246)`. The initially invisible state came from `wx-rise` applying opacity zero during its entrance delay after resizing, not from incorrect resting colors. Stable captures show the menu clearly. The duplicated desktop guest page top also disappears in the stable Kerbside capture. These were capture-timing findings; no color change was justified from them.

Representative stable captures were opened directly: Kerbside mobile overview, Kerbside desktop guest menu, Pulse mobile Door & guest list, and the before/after Pulse comparison in `../venues-review/pulse-comparison.png`. The latter shows the branch-overview money wrapping correction. This review does not claim every line of all 75 long captures was inspected at full resolution.

A separate final-build check covered all three multi-outlet businesses at all three widths; all nine screenshots were opened directly. `../venues-review/final-overview-check.json` records **14 passing checks, zero failures**: explicit daily export date retained while changing the overview to This week, no page overflow at three widths, and one synthetic Kerbside daily organization export. The request used trading date `2026-11-23`; the worker completed it; the actual UI download contained SUR, LKI and IKJ and explicitly labeled kobo columns. Only one synthetic report job was created, with no real payment or email. The CSV itself remains outside the repository at `/private/tmp/mera-final-organization-export.csv`.

That final visual inspection identified wrapping of larger weekly revenue amounts in the separate **All locations** mobile metrics. The subsequent responsive correction is verified in `../venues-review/final-layout-check.json`: **12 checks passed, zero failed**, covering Kerbside, Oak and Harbour at 390, 820 and 1440 pixels. These checks include no page overflow and single-line metric values. All nine final All locations captures were refreshed without creating another export job. The 390-pixel Oak and Harbour captures and the combined Kerbside before/after image were inspected directly; the lead also inspected the combined comparison. The mobile monetary wrapping issue is resolved. The preserved comparison is `../venues-review/kerbside-all-locations-comparison.png`; the original mobile capture is `../venues-review/kerbside-all-locations-before-390.png`. The earlier 14-check export evidence remains valid and is separate from these final layout checks.

Closed-hours limitations remain explicit: the stable runner did not open the combo sheet at Kerbside, Oak, Velvet, Harbour or Daybreak because ordering was closed/paused. Saffron and Pulse have QR ordering disabled in their seeded capabilities. These outcomes prove the relevant disabled state, not live combo submission. Functional combo rules have separate automated tests; browser transaction evidence must be named separately.
