<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Record Offer Change

- **Plan**: `context/changes/record-offer-change/plan.md`
- **Scope**: Full plan (4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-24
- **Verdict**: REJECTED
- **Triage**: COMPLETE — F1–F9 fixed; F10 skipped for now. The verdict above records the original implementation review before these fixes.
- **Post-triage verification**: Lint, Astro check (0 errors), build, estimator tests, offer-contract, and local smoke passed across the fixes. Astro check's five previously observed type errors were corrected before handoff.
- **Findings**: 2 critical, 7 warnings, 1 observation
- **Implementation range**: `c94f974..315a755`

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | FAIL |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Verification

| Criterion | Result | Evidence |
|-----------|--------|----------|
| `npm run offer-change-estimator` | PASS | 12/12 tests passed. |
| `npm run lint` | PASS | ESLint exited 0. |
| `npm run build` | PASS | Astro exited 0. Wrangler emitted a sandbox log-file permission warning. |
| `npm run offer-contract` | PASS | Local Supabase: `Offer contract checks passed`. |
| `BASE_URL=http://localhost:4322 npm run smoke` | PASS | Local preview and Supabase: all smoke steps passed. Preview selected port 4322 because 4321 was occupied. |

All four phase Progress sections mark their manual criteria complete. The diff does not contain screenshots, a case log, or database inspection notes that corroborate the phone/desktop, four-trade, and shared-view manual checks; see F10.

## Findings

### F1 — Pending item edits overwrite a retained base revision

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260925000000_offer_change_revisions.sql:78`
- **Detail**: The offer page still permits `edit_offer_items` while an offer is pending (`src/pages/offers/[offerId].astro:318`). That command edits `offer_items` in place and updates the base amount (`20260924000000_structured_offers.sql:323-329`); the new trigger then updates the existing pending `offer_revisions` row. A presented revision's prior item values can disappear, contrary to Phase 1's immutable revision history.
- **Fix A ⭐ Recommended**: Route every pending offer edit through `replace_pending_offer_revision` so it creates a new revision.
  - Strength: Uses the new lock and history contract already implemented.
  - Tradeoff: The old item-correction UI/API must be removed or redirected, and its callers and tests updated.
  - Confidence: HIGH — the replacement command already persists a superseding snapshot.
  - Blind spot: Check whether any external client calls the old item-edit endpoint.
- **Fix B**: Make `edit_offer_items` itself create and supersede a base revision atomically.
  - Strength: Preserves the existing correction endpoint.
  - Tradeoff: Duplicates revision behavior across two commands and needs stronger parity tests.
  - Confidence: MED — feasible under the same offer lock, but the command contract would diverge.
  - Blind spot: Existing item-revision callers may assume only `items_revision` advances.
- **Decision**: FIXED via Fix A — `edit_offer_items` now delegates to `replace_pending_offer_revision` in `20260930000000_route_pending_item_edits_through_revisions.sql`; the form explains replacement, and a contract assertion confirms the old snapshot remains intact. Lint, build, local offer-contract, and smoke passed.

### F2 — Shared read cannot identify the displayed base revision

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260928000000_current_offer_reads.sql:142`
- **Detail**: `get_shared_offer` returns the current projection without `offer_revisions.id`, while `decide_shared_offer_revision` requires `p_offer_revision_id` (`20260929000000_revision_decision_conflicts.sql:2-4`). Anonymous callers cannot select from `offer_revisions` (`20260925000000_offer_change_revisions.sql:55-57`). The planned customer screen therefore cannot decide the exact revision it displays.
- **Fix**: Add the current base revision ID and decision status to the share-token-scoped projection, and test that a displayed stale ID conflicts after replacement.
  - Strength: Keeps revision lookup behind the existing one-offer shared-read boundary.
  - Tradeoff: Changes the public JSON contract and requires contract-test updates.
  - Confidence: HIGH — the projection already loads the offer and can look up its current revision.
  - Blind spot: The future customer screen is not yet implemented.
- **Decision**: FIXED — `20261001000000_shared_current_base_revision.sql` adds the current revision ID, number, and status to guarded shared and contractor reads. Contract tests use the displayed ID for acceptance, reject the previously displayed ID after replacement, confirm decided status, and deny direct anonymous access to the helper. Lint, build, and local offer-contract passed.

### F3 — A second tab can silently supersede a pending proposal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260927000000_match_item_effects_to_active_snapshot.sql:139`
- **Detail**: Publication checks `active_scope_revision`, but a pending publication does not advance that revision. The command supersedes any pending change unconditionally. Two tabs opened before either publishes can therefore record sequentially; the second tab never saw the first pending proposal and never showed the UI confirmation (`OfferChangeForm.tsx:684-709`).
- **Fix**: Send the pending proposal ID, or explicit absence, that the contractor saw and require it to match under the offer lock before superseding.
  - Strength: Makes the confirmation correspond to the proposal actually being replaced.
  - Tradeoff: Adds a request/RPC parameter and a concurrent-publication test.
  - Confidence: HIGH — the current lock serializes the operations but does not check the observed pending state.
  - Blind spot: None significant.
- **Decision**: FIXED — `20261002000000_confirm_pending_change_supersession.sql` checks the expected pending ID and explicit confirmation under the offer lock; the unguarded publication RPC is no longer executable by authenticated clients. The form and API submit the observed ID. Contract tests cover stale tabs, missing confirmation, direct-call denial, and confirmed replacement. Lint, build, offer-contract, and smoke passed. The five type errors found by an additional Astro check were corrected during final verification.

### F4 — Credit edits can publish a price different from the ready preview

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/offers/OfferChangeForm.tsx:445`
- **Detail**: Completed quantity, confirmed omission credit, and description edits do not clear a ready estimate (`:445-475`). After a credit edit, “Confirm and record change” remains enabled (`:705-709`), and `send("record")` submits the new values (`:211-254`). The server recalculates and can publish a price the contractor did not preview.
- **Fix**: Clear the ready estimate on every input change that affects the submitted proposal; verify the published payload still matches the previewed payload.
- **Decision**: FIXED — the form clears the preview when completed quantity, omission credit, or description changes and ties every displayed ready estimate to the current submitted-input values. A late response for earlier values cannot re-enable recording. Lint and build passed.

### F5 — The form cannot remove work or preserve replacement identity

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/components/offers/OfferChangeForm.tsx:219`
- **Detail**: The form always sends a non-null `after` item (`:225-229`), so Phase 2's complete removal cannot be recorded through the UI. A unit change keeps the same item ID and sets only `replacementConfirmed`, although the plan requires replacement with a new ID unless a conversion is explicitly supplied.
- **Fix**: Add explicit remove and replace operations in the form; send `after: null` for removal and a removal plus new-ID addition for replacement, with estimator/API coverage.
  - Strength: Matches the effect contract and makes identity changes auditable.
  - Tradeoff: Expands the form state and requires positive HTTP coverage.
  - Confidence: HIGH — the estimator and effect schema already support removal and addition.
  - Blind spot: Confirm the desired UX for completed work when removing an item.
- **Decision**: FIXED — the contractor form now offers remove and replace actions. Removal sends `after: null`; replacement sends a removal of the original ID and addition under a stable new ID. A unit change follows the replacement path. The estimator test covers full removal and new-identity replacement, and the database contract suite covers replacement activation. Estimator tests, lint, build, and offer-contract passed. Positive HTTP publication coverage remains tracked in F9.

### F6 — Omission credit is neither explicitly confirmed nor explained in preview

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/components/offers/OfferChangeForm.tsx:50`
- **Detail**: Completed quantity and omission credit default to zero and are submitted on a quantity reduction without an explicit credit decision (`:211-230`). The preview shows only aggregate price and effort (`:656-682`), omitting the estimator's suggested credit, confirmed credit, reconciliation, and separate commercial adjustment. This misses the Phase 2/3 confirmation and explanation contract.
- **Fix**: Require an explicit credit decision for reductions and show suggested, confirmed, and reconciled amounts in the preview before enabling publication.
  - Strength: Makes retained completed-work value visible at the decision point.
  - Tradeoff: Adds UI state and cases for zero-credit confirmation.
  - Confidence: HIGH — the estimator already returns the underlying amounts.
  - Blind spot: Contractor wording for partial-work credits needs manual review.
- **Decision**: FIXED — completed quantity and omission credit start blank, so the preview identifies either missing decision instead of silently submitting zero. Recording a reduction or removal requires an explicit confirmation after a ready preview, including for zero values; changing either input clears it. The preview now shows completed quantity, suggested and confirmed credit, completed-work reconciliation, consequential work, separate commercial adjustment, and the final price delta. Lint, build, and estimator tests passed.

### F7 — Earlier base revisions are stored but absent from offer history

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/offers/[offerId].astro:78`
- **Detail**: The page loads change history but never reads or renders `offer_revisions`. Its replacement form says the previous revision remains in history, and the plan's manual step calls for confirming that history is visible. The stored earlier base offer cannot be inspected on this page.
- **Fix**: Query the owner's base revisions in stable order and render their status, item snapshot, amount, and deadline in the offer history.
- **Decision**: FIXED — the owner-only offer detail now loads base revisions through the existing contractor RLS policy and renders them in a separate "Offer version history" section, newest first. Each version exposes its status, saved scope, item snapshot with rates and private effort, total, deadline, and decision details. The latest version is expanded by default. Smoke coverage confirms both the superseded and current snapshots remain visible; lint, build, and smoke passed.

### F8 — Out-of-range estimate input can return HTTP 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/offer-change-api.ts:79`
- **Detail**: The request parser accepts any string or number for `commercial_adjustment_minor` (`offer-change-request.ts:138-140`). The estimator throws for an out-of-range amount (`offer-change-estimator.ts:82-88`), and `prepareChange` does not catch that validation error. An authenticated malformed preview or publication returns a server error instead of the planned 400 field error.
- **Fix**: Validate the signed amount bounds before estimation and return a 400 field error; cover the case in HTTP tests.
- **Decision**: FIXED — the request parser now checks `commercial_adjustment_minor` against the estimator's shared signed amount bound before estimation and returns a field-specific HTTP 400 error for malformed or out-of-range values. Smoke tests exercise positive overflow on preview and negative overflow on publication. Lint, build, and smoke passed.

### F9 — HTTP tests do not publish a post-acceptance change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `scripts/smoke.mjs:645`
- **Detail**: Phase 3's HTTP success criterion calls for successful change recording plus malformed, stale, anonymous, and foreign paths. The smoke suite records a pending base revision (`:589-600`) and tests change-preview failures (`:645-693`), but has no successful `POST /api/offers/:offerId/changes/` or its failure-path coverage. The SQL contract suite exercises publication below the HTTP boundary.
- **Fix**: In smoke, accept a local test base offer, publish a change through HTTP, and test malformed/stale/anonymous/foreign publication responses.
  - Strength: Covers the endpoint, session, parsing, estimator, and RPC mapping together.
  - Tradeoff: Adds a customer-decision setup step to the smoke fixture.
  - Confidence: HIGH — the existing suite already creates offers and signs in contractors.
  - Blind spot: Keep the test restricted to local Supabase registration/decisions.
- **Decision**: FIXED — the local smoke suite now accepts the exact current base revision with the six-digit PIN through the anonymous customer RPC, then publishes a price-changing proposal through the contractor HTTP endpoint. It also covers malformed effect input, stale scope revision, anonymous publication, and a foreign offer. The test uses only local Supabase URL and anon credentials supplied by the runner; CI and README now configure those inputs. Lint, build, and full local smoke passed.

### F10 — Completed manual checks lack reviewable evidence

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/record-offer-change/plan.md:248`
- **Detail**: All four manual Progress items are marked complete, but the change diff includes no screenshots or case notes for the four-trade prompt review, phone/desktop workflow, or contractor/shared comparison. This review cannot verify those assertions from source and automated tests alone; it does not establish that they were skipped.
- **Fix**: Attach concise case notes and phone/desktop screenshots or test artifacts to the change folder or review handoff.
- **Decision**: SKIPPED for now — the user chose to defer attaching manual case notes and screenshots. The original manual completion claims remain unverified by reviewable artifacts.
