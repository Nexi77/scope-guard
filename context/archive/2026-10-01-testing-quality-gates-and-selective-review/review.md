# Selective decision-screen review

Observed on 2026-10-01 at 19:45 UTC (21:45 Europe/Warsaw). Fresh local Astro production build from `fdd1792`, Chromium, light theme, loopback preview on port 4361. No production UI files were changed.

## Scope and evidence

| Screen                         | Scenario                                                                             | Viewport | Capture                                         |
| ------------------------------ | ------------------------------------------------------------------------------------ | -------- | ----------------------------------------------- |
| Customer `/shared/{token}`     | Accepted base, pending change, rejection selected with harmless reason and empty PIN | 1440×900 | [Desktop](review-assets/customer-desktop.png)   |
| Customer `/shared/{token}`     | Same scenario                                                                        | 390×844  | [Phone](review-assets/customer-mobile.png)      |
| Contractor `/offers/{offerId}` | Rejected base offer with benign multiline Polish reason and focused copy action      | 1440×900 | [Desktop](review-assets/contractor-desktop.png) |
| Contractor `/offers/{offerId}` | Same scenario                                                                        | 390×844  | [Phone](review-assets/contractor-mobile.png)    |

Captures show the entire page, so their image height exceeds the emulated viewport. Raw non-sensitive measurements are retained in `review-assets/observations.json`.

The customer base is 100.00 PLN with deadline 2099-01-15. The pending proposal doubles the painted-wall quantity, adding 100.00 PLN and seven days. Dates intentionally use a distant year so the fixture cannot expire. The long synthetic proposal identifier exercises wrapping without using customer information.

The contractor reason is:

> Proszę przygotować nową ofertę z mniejszym zakresem prac.
> Termin jest odpowiedni, ale potrzebuję niższej ceny.

## Observations

- Customer: current scope, total and deadline occupy the first card. The separate pending-proposal card states that its effects are excluded from those current values. The +100.00 PLN and +7 days labels visibly describe impacts rather than replacing the agreed values.
- Customer: the rejection confirmation is an inline form, not a modal. Both outcomes remain available; the selected rejection button is red, and the final button says Confirm rejection. On the phone, buttons and impact values stack while the long proposal title wraps inside its card.
- Customer: the empty submission focuses the error summary and reports both the missing reason and PIN. Activating the summary's reason link by keyboard focuses the textarea. Entering a harmless reason clears that field's error; the capture retains the missing-PIN error and an empty password input.
- Customer: Tab from the reason reaches the PIN. After the CSS transition, the focused invalid input has a visible three-pixel error-colored ring at both sizes. Initial immediate style sampling preceded the transition; a real Tab traversal resolved that uncertainty.
- Contractor: rejection is prominent above the offer terms, with the reason and primary copy action together. History and Review the decision supply the next step for inspecting the recorded result. The rejected offer is labeled separately from current agreed work, and its deadline remains labeled Proposed deadline.
- Contractor: Polish text retains its newline (`white-space: pre-wrap`) and wraps naturally on the phone. The copy action fits and displays a visible keyboard-focus ring.
- Whole-page horizontal overflow is absent: document width equals 390 or 1440 pixels in each capture. The phone's priced-items table is intentionally 576 pixels wide inside a 316-pixel `overflow-x: auto` container; clipped columns require horizontal scrolling within that table. This is distinct from page overflow.

No substantial layout or decision-clarity defect was observed within this scope. This is a bounded assessment, not a contrast/accessibility audit or a claim about dark theme, other browsers, every status or arbitrary text lengths. The user confirmed the clarity assessment on 2026-10-01. Any concrete follow-up identified during human review should be recorded and, if it requires UI changes, opened as a separate change.

## Privacy and cleanup

All records were synthetic and created through the existing local APIs. The customer browser context had no contractor cookies or storage. No trace, video or authentication artifact was retained by the standalone review capture. Generated PINs remained inside the fixture/API process, never entered the customer form and never appeared on screen. The contractor's synthetic shared URL was masked in the screenshot; its token is also absent from this report and observations.

Both fixtures were cleaned in `finally` after capture. Cleanup asserted an aggregate zero residue across customers, offers, offer_items, offer_revisions, offer_changes and change_decisions for each fixture. The same cleanup ran after an initial capture probe used the contractor date format for the public page; public dates are ISO and the corrected capture succeeded. Existing developer configuration and auth storage were not changed by the review.

## Human review

Confirmed by the user on 2026-10-01 ("potwierdzam") after presentation of all four captures. Current/proposed terms, rejection reason and copy/history next steps were accepted without required follow-up. Cookbook 6.5 is complete and rollout Phase 4 is marked complete. Remote GitHub Actions remains unverified as documented in `ci-verification.md`.
