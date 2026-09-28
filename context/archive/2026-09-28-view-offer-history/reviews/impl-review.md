<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: View Offer History

- **Plan**: context/changes/view-offer-history/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation
- **Triage status**: Complete — F1–F3 fixed; F4 accepted by the user

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — History paging processes the full event stream

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261013000000_offer_history_event_pages.sql:67
- **Detail**: Each request builds JSON payloads for all six event streams, orders and numbers all eligible rows, and only then keeps at most 50. The response is bounded, but database work and memory grow with the entire history on every page, contrary to the plan's bounded-read performance intent.
- **Fix**: Page lightweight event keys using the same ordering tuple and a page-size-plus-one limit, then hydrate payloads only for selected keys.
  - Strength: Bounds payload construction and preserves the existing cursor contract.
  - Tradeoff: Requires a nontrivial RPC rewrite and careful tests for ties and backward navigation.
  - Confidence: HIGH — `to_jsonb`, `row_number`, and `count` run upstream of page filtering.
  - Blind spot: Actual query-plan cost at production history sizes has not been measured.
- **Decision**: FIXED — added `20261014000000_bound_offer_history_event_pages.sql`, which pages lightweight event keys before hydrating selected records; the local migration and offer contract suite pass.

### F2 — Earliest targeted record exposes an empty earlier page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261013000000_offer_history_event_pages.sql:141
- **Detail**: Any targeted lookup sets `has_previous` when `p_target_record_id` is present. Targeting the first event therefore renders an “Earlier events” link whose before-cursor returns no events and shows “No history yet.” The forward-only smoke traversal does not cover this case.
- **Fix**: Set `has_previous` only when an event key precedes the first returned key, and cover an earliest-record target in the contract or smoke test.
- **Decision**: FIXED — the forward migration probes for actual earlier/later event keys, and `scripts/offer-contract.mjs` asserts that targeting the earliest revision has no earlier cursor.

### F3 — Pre-migration undated replacements have no explicit contract fixture

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/offer-contract.mjs:808
- **Detail**: The completed Phase 1 and 2 criteria require proving existing superseded rows retain null `superseded_at` and do not produce dated events. The test only creates new replacements with timestamps; it counts null rows if present but never creates or asserts an old superseded row with a null timestamp. SQL and UI appear to handle that state correctly, but the stated regression coverage is missing.
- **Fix**: Seed a superseded revision and proposal with null `superseded_at`, assert their undated detail state and absence of replacement events, and retain the new-replacement assertions.
- **Decision**: FIXED — `scripts/offer-contract.mjs` now emulates pre-migration null timestamps on superseded revision and proposal rows and checks that their creation details remain visible without dated replacement events; the local contract suite passes.

### F4 — Screenshot-based manual verification is not traceable

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/view-offer-history/plan.md:216
- **Detail**: Progress marks before/after screenshots, desktop and phone review, and screenshot review complete. The phase commits only check those boxes, and no screenshots or review notes for this change are present in its change folder. The manual work may have occurred outside the repository; this review cannot verify it.
- **Fix**: Add the relevant screenshot paths or a brief manual verification note to this change's non-archived folder, including desktop, phone, and focus checks.
- **Decision**: ACCEPTED — the user confirmed they completed the earlier manual checks but did not save screenshots. `reviews/manual-verification-2026-09-28.md` records that confirmation separately from the checks reproduced during this review.

## Verification

| Check | Result | Evidence |
|-------|--------|----------|
| `npm run lint` | PASS | ESLint exited 0. |
| `npm run build` | PASS | Astro build exited 0 and reported complete; Wrangler printed a sandbox log-file EPERM diagnostic during the successful build. |
| `npm run offer-contract` | PASS | After starting local Supabase and applying the forward migration, the suite reported `Offer contract checks passed`. |
| `npm run smoke` | PASS | Local Astro preview and Supabase: all HTTP smoke steps passed, including owner/foreign access, pending anchors, rejection reasons, and multi-page navigation. |
| Local migration | PASS | Local Supabase started; `20261014000000_bound_offer_history_event_pages.sql` applied successfully. |
| Manual criteria | USER CONFIRMED; PARTLY REPRODUCED | The user confirmed the earlier manual checks were performed without saving screenshots. The new verification note records desktop, phone, keyboard, target, and current-state checks reproduced during this review. |

## Triage outcome

F1, F2, and F3 were fixed; F4 was accepted by the user. The original verdict above records the review as found; the local migration, contract suite, HTTP smoke suite, lint, and build now pass. The user confirmed the earlier manual checks but did not save screenshots, as recorded in the manual verification note.

## Scope notes

The changed offer overview and change form route to the exact planned history target. The roadmap edit records slice progress. No prohibited customer portal, pricing, PIN, or active-scope expansion was found. Ownership checks and the authenticated RPC grant match existing boundaries.
