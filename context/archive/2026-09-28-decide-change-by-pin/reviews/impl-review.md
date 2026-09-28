<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Decide Offer and Change by PIN

- **Plan**: context/changes/decide-change-by-pin/plan.md
- **Scope**: Full plan (3 of 3 phases)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation
- **Git range**: 1105de0..f716d4d

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Anonymous shared RPC exposes internal price breakdown

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007000000_guard_customer_decisions.sql:89
- **Detail**: `get_shared_offer` remains callable by `anon` and returns the raw `current_offer_projection`. That projection includes `price_breakdown.commercial_adjustment_reason`, credit reconciliation, and other estimate fields for each change (supabase/migrations/20260928000000_current_offer_reads.sql:102-136). The shared page filters these fields in `shared-offer-view.ts`, but a holder of the shared token can call the Supabase RPC directly. This behavior predates the reviewed branch; the new migration retains it while the plan calls the shared projection customer-safe.
- **Fix**: Add a customer-specific SQL projection for `get_shared_offer`, omitting internal estimate keys while retaining the IDs, versions, terms, and history required by the shared page.
  - Strength: Applies the customer data boundary at the public RPC, including direct Supabase callers.
  - Tradeoff: Requires a new migration and contract coverage for the exact public JSON shape.
  - Confidence: HIGH — the current anonymous grant and returned JSON are explicit in the migrations.
  - Blind spot: The intended visibility of every breakdown field has not been separately documented in the PRD.
- **Decision**: FIXED — added migration `20261009000000_customer_safe_shared_projection.sql` to return an allowlisted public projection and added offer-contract assertions that anonymous reads omit estimate breakdown fields. Local migration applied; `npm run offer-contract` and `npm run lint` pass.

### F2 — Copied offer has no PIN when created

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/offers/CreateOfferForm.tsx:248
- **Detail**: Phase 3 says submitting a copied offer creates a distinct pending offer with a new PIN and share link. The new offer does get an independent link, but the form tells the contractor to set its PIN afterward. `scripts/smoke.mjs:1018` calls the separate PIN endpoint after creation, so the test does not prove the planned submit result.
- **Fix A ⭐ Recommended**: Amend Phase 3 to describe the existing separate PIN setup and check that the new offer cannot be decided until that setup is complete.
  - Strength: Matches the established create-offer flow and the explicit instruction already shown in the form.
  - Tradeoff: The contractor performs an additional step before sharing the new offer.
  - Confidence: HIGH — creation and PIN setup are separate in the current route and smoke test.
  - Blind spot: Whether immediate PIN creation was a deliberate product requirement is not recorded outside this plan.
- **Fix B**: Generate a fresh PIN in the copied-offer creation flow and present it once to the contractor.
  - Strength: Delivers the plan's literal one-step result.
  - Tradeoff: Changes the ordinary creation boundary and one-time secret delivery, requiring additional security and UI verification.
  - Confidence: MEDIUM — feasible, but no existing create-flow pattern does this.
  - Blind spot: The desired one-time PIN display after a redirect has not been designed.
- **Decision**: FIXED — updated Phase 3 contract, automated criterion, and manual check to reflect a new share link on creation and fresh PIN setup as a separate contractor step.

### F3 — Invalid copy source falls back to ordinary creation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/offers/new.astro:194
- **Detail**: Phase 3 verification says a foreign or malformed source ID cannot prefill data or create an offer. The route correctly withholds prefill, but it displays an active normal creation form and explicitly invites manual entry. The create API does not receive or validate the source ID. This is a plan-contract mismatch, not evidence of foreign data disclosure.
- **Fix A ⭐ Recommended**: Clarify the plan criterion to say an invalid source cannot prefill or create *from that source*, and add a smoke assertion for the safe manual fallback.
  - Strength: Preserves an intentional-looking, useful fallback without weakening owner-scoped prefill.
  - Tradeoff: Accepts normal creation when a source URL is invalid.
  - Confidence: HIGH — the page explicitly describes this fallback and renders the standard form.
  - Blind spot: No separate product decision records whether malformed source URLs should block creation entirely.
- **Fix B**: Hide or disable creation whenever a `source` parameter was supplied but could not be authorized.
  - Strength: Satisfies the plan's literal no-create criterion.
  - Tradeoff: Prevents legitimate manual creation until the contractor removes the bad query parameter.
  - Confidence: HIGH — the page can identify this state before rendering the form.
  - Blind spot: Existing users may rely on the fallback.
- **Decision**: FIXED — clarified the plan that invalid, missing, pending, or foreign source IDs cannot prefill or create from the source, while blank manual creation stays available; added smoke assertions for the warning, normal form, and absence of prefilled source data. `npm run smoke` and `npm run lint` pass.

### F4 — Manual completion marks lack reviewable evidence

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/decide-change-by-pin/plan.md:240
- **Detail**: The original manual completion marks had no reviewable evidence. A desktop local-preview recheck is now recorded in the plan: accept/reject flows, required comment and focus behavior, stale-view blocking/refresh, rejected-offer copy, and revoked-link unavailability were observed. Phone viewport, actual screen-reader output, and browser network/application log inspection were unavailable; the corresponding portions of 1.4 and 2.4 are now unchecked.
- **Fix**: Add a brief dated manual verification note with devices/browsers, focus results, stale-page result, and a redacted log/network check, or leave the manual items pending until rechecked.
- **Decision**: FIXED — added a dated desktop recheck record and marked the unverified phone, screen-reader, network, and application-log portions pending. The remaining manual checks still need the corresponding device/tooling.

## Verification

- `npm run lint` — PASS (exit 0) after triage fixes.
- `npm run build` — PASS (exit 0); Wrangler emitted a log-file permission warning during the sandboxed build, but Astro completed.
- Local Supabase startup — PASS; the configured local instance accepted the migrations.
- `npm run offer-contract` — PASS (`Offer contract checks passed`).
- `npm run smoke` — PASS outside the sandbox (`All smoke steps passed`), covering the local preview and Supabase, including the invalid-source manual fallback assertion. The initial sandboxed attempt could not connect to localhost (EPERM); rerunning with network permission passed.

The automated checks were run once for all three completed phases; the Phase 3 database check was run even though that phase made no database change. Manual checks were re-performed in the local desktop browser after the review; outstanding device and log checks are listed in the plan's dated manual recheck record.
