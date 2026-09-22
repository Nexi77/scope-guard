<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create client offer Implementation Plan

- **Plan**: context/changes/create-client-offer/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | FAIL |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Dashboard creation flow was replaced with an unplanned offer browser

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard.astro:32
- **Detail**: Phase 3 requires the dashboard to load the contractor's customers, render `CreateOfferForm`, and return success there. Instead it only links to `/offers`; the implementation moves creation to the unplanned `/offers/new` route and adds `/offers`, which lists prior offers, status, scope, price, and deadline. This is both a route-flow drift and an explicit breach of the plan's "no offer detail/history view" boundary.
- **Fix A ⭐ Recommended**: Restore the customer query and `CreateOfferForm` to the dashboard, redirect the endpoint back to its dashboard states, and remove the unplanned offer-list/new routes.
  - Strength: Meets the reviewed plan exactly and keeps the MVP's creation-only boundary intact.
  - Tradeoff: Removes the currently implemented offer browsing experience.
  - Confidence: HIGH — the plan specifies the dashboard flow and explicitly excludes browsing/history.
  - Blind spot: None significant.
- **Fix B**: Amend the plan and product scope to authorize the multi-route offer list and creation flow.
  - Strength: Retains implemented UI if offer browsing is an intentional product decision.
  - Tradeoff: Expands the MVP and requires revisiting the stated scope guardrails and verification expectations.
  - Confidence: MEDIUM — product intent beyond the reviewed plan has not been confirmed.
  - Blind spot: Whether stakeholders approved this expansion.
- **Decision**: FIXED — dedicated `/offers/new` creation route retained; unplanned `/offers` browse route removed and the plan amended to reserve browsing for `browse-client-offers`.

### F2 — Offer list fetches and renders an unbounded result set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/offers/index.astro:8
- **Detail**: The unplanned offer-list page selects every contractor offer and maps every result into the server-rendered page. As offer history grows, response size and rendering time grow without a bound.
- **Fix**: If the offer list is retained, use a deterministic bounded query and pagination/load-more before presenting a complete history.
- **Decision**: FIXED — resolved by F1; the unplanned offer-list route was removed.

### F3 — Smoke flow does not cover existing-customer offer creation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:98
- **Detail**: Phase 3 and 4 require the authenticated browser flow to create an offer with a new customer and reuse an existing customer. The smoke script creates only through `customer_name`; no request submits `customer_id`. The database-contract script covers RPC reuse, but not the endpoint/form transport path.
- **Fix**: Add an authenticated smoke step that reuses the customer created by the successful new-customer submission and asserts success without creating a duplicate customer.
- **Decision**: FIXED — smoke now extracts the created customer identifier from the authenticated offer form and submits a second offer using `customer_id`.

## Verification

| Command | Result | Evidence |
|---------|--------|----------|
| `npm run lint` | PASS | ESLint completed with exit code 0. |
| `npm run build` | PASS | Astro build completed with exit code 0. Wrangler emitted sandbox log-write warnings only. |
| `npm run offer-contract` | NOT VERIFIED | Required `API_URL`/`SUPABASE_URL`, anon key, and service-role key were unavailable in this environment. |
| `npm run smoke` | PASS | Re-run after cloud signup was enabled; all 14 route, authentication, and offer-creation smoke steps passed. |
