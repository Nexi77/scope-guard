# Offer history UI verification — 2026-09-28

Environment: local Supabase with the history paging forward migration applied; local Astro production preview; disposable account and offer created by `scripts/smoke.mjs`.

## Earlier manual checks

The user confirmed on 2026-09-28 that they checked the UI manually before this review. They did not save the screenshots. This is their confirmation of the earlier checks, separate from the checks reproduced below.

## Reproduced in this review

- At a 1280 × 800 browser viewport, inspected a paged history with revision creation, replacement, and customer decision entries. The creation summary used the state at creation, and the replacement linked to both affected records.
- At a 390 × 844 browser viewport, inspected the same timeline and both page controls. Cards and navigation fit within the viewport without horizontal overflow.
- Activated “Later events” with Enter on its link. The next page contained the next chronological events and offered both earlier and later navigation.
- Followed a version-details link from a decision event. Its target details were open and visibly emphasized. Browser Back and refresh preserved the target; after both, the target summary held keyboard focus.
- Followed “Current state” from history. The current offer displayed 3,00 zł and the agreed work item. History showed a rejected proposal and its exact rejection reason, while the current offer excluded that proposal's effect.
- `npm run offer-contract` and `npm run smoke` passed against local Supabase; `npm run lint` and `npm run build` passed.

## Limits of this record

No earlier Phase 2 before/after screenshots or Phase 3 screenshot files are available, and the browser screenshots observed during this review were not saved as files. This review did not reproduce every earlier manual scenario, including a customer proposal outside the first page reached from the current offer and an old undated replacement in the browser. The contract and HTTP suites cover those data and route behaviors separately.
