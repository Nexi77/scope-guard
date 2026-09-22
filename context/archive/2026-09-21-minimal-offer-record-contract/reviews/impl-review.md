<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Minimalny kontrakt oferty i decyzji — Implementation Plan

- **Plan**: context/changes/minimal-offer-record-contract/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification

| Command | Result | Evidence |
|---------|--------|----------|
| `npm run lint` | PASS | ESLint completed with exit code 0. |
| `npx astro check` | PASS | 0 errors, 0 warnings, 0 hints. |
| `npm run build` | PASS | Astro production build completed with exit code 0. |
| `npm run offer-contract` with local Supabase credentials | PASS | `Offer contract checks passed`. |

## Manual verification

All four manual Progress items are marked complete. The migration and contract test provide observable evidence for the Phase 1/2 table, RLS, index, PIN-projection, and RPC-grant claims; the implementation diff contains no `src/pages/` route or UI additions, supporting Phase 3. No manual item appears rubber-stamped from the available evidence.

## Findings

### F1 — Direct contractor writes bypass customer approval

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260921000000_minimal_offer_record_contract.sql:111
- **Detail**: The authenticated `FOR ALL` policies and `insert`/`update` grants let an owning contractor directly change `offer_changes.status` to `accepted`, insert a `change_decisions` record, or update `offers.status`. That bypasses `decide_shared_offer_change` and its PIN validation, and a directly accepted price/deadline change immediately enters the active values returned by `get_shared_offer` (lines 175-177). This violates the product rule that a price- or deadline-affecting change needs customer approval. The contract test confirms cross-contractor isolation but does not attempt these prohibited direct writes.
- **Fix A ⭐ Recommended**: Make decision-controlled transitions database-enforced: deny direct writes to decision rows and transition-controlled fields, and allow only the decision RPC/controlled database path to create a decision or transition a pending change.
  - Strength: Enforces the customer-approval invariant even if a future route or client is buggy.
  - Tradeoff: Requires carefully defining which contractor edits remain permitted and adding coverage for attempted bypass writes.
  - Confidence: HIGH — the existing RPC already provides the intended atomic transition path.
  - Blind spot: The plan does not specify which pre-decision contractor edits should remain available.
- **Fix B**: Add a trigger that rejects direct decision/status transitions unless performed through a narrowly scoped database context established by the RPC.
  - Strength: Retains broader future contractor CRUD grants while protecting the invariant.
  - Tradeoff: More implicit and easier to misuse than privilege-based boundaries.
  - Confidence: MEDIUM — viable PostgreSQL pattern, but not present elsewhere in this repository.
  - Blind spot: Must be designed so the SECURITY DEFINER RPC cannot leave the bypass context set.
- **Decision**: FIXED — narrowed invariant: contractors may continue to create and revise pending changes, but cannot directly create, mutate, or delete customer decisions or transition a pending change to `accepted`/`rejected`. Implemented in `20260921010000_protect_customer_decisions.sql` and covered by `scripts/offer-contract.mjs`.

### F2 — Public PIN decision endpoint has no abuse limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260921000000_minimal_offer_record_contract.sql:221
- **Detail**: The anonymous decision RPC accepts an unlimited number of six-digit PIN attempts (lines 239-255) and is directly executable by `anon` (lines 332-336). Bcrypt slows each attempt, but there is no rate limit, lockout, or attempt accounting. If a share URL leaks, its PIN can be brute-forced without an application boundary to throttle it.
- **Fix A ⭐ Recommended**: Expose the decision operation through a rate-limited server endpoint and revoke anonymous direct execution of the RPC.
  - Strength: Applies robust abuse controls at the public boundary and makes them unavoidable.
  - Tradeoff: Expands this database-only slice with a server route that the plan explicitly deferred.
  - Confidence: HIGH — rate limiting is effective only when callers cannot bypass the boundary.
  - Blind spot: A suitable rate-limit store and deployment-specific client-IP handling have not been selected.
- **Fix B**: Add database-side failed-attempt tracking and a time-bounded lockout keyed to the offer/token.
  - Strength: Keeps the current public-RPC architecture intact.
  - Tradeoff: Adds domain state and recovery policy beyond the planned contract.
  - Confidence: MEDIUM — works for basic throttling but needs careful concurrency and privacy design.
  - Blind spot: This does not provide network-level distributed-attack controls.
- **Decision**: ACCEPTED AS FOLLOW-UP — no endpoint or rate-limit subsystem will be added to this database-contract slice. Database-side attempt tracking is possible, but would introduce attempt-window, expiry/reset, and abuse-policy state without providing network-level throttling. Address this when the public customer-decision delivery boundary is implemented.
