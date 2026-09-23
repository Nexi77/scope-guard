<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manage Offer PIN

- **Plan**: context/changes/manage-offer-pin/plan.md
- **Scope**: Full plan (2 phases)
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Unexpected database failures are reported as missing offers

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/offers/[offerId]/pin.ts:39
- **Detail**: After the same-PIN collision case, the endpoint maps every RPC error and an unexpected non-true result to HTTP 404. A database outage, missing migration, or permission failure therefore appears to be an unavailable offer, obscuring an operational failure and giving the client the wrong retry signal. The existing offer creation endpoint distinguishes expected RPC messages from unknown failures.
- **Fix**: Return 404 only for the known `Offer is unavailable` RPC error; return a sanitized 5xx response for unexpected RPC errors and result shapes.
- **Decision**: FIXED — the endpoint now reserves 404 for `Offer is unavailable` and returns a sanitized 503 for unexpected RPC failures or result shapes. Verified with `npm run lint`, `npm run build`, and local `npm run smoke` on 2026-09-23.

### F2 — HTTP reset smoke test does not verify the replacement PIN

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:282
- **Detail**: The Phase 2 smoke contract requires a reset that yields a different usable PIN. The current test checks six-digit format and inequality but does not call the decision verifier with the previous and replacement PINs. The Phase 1 database contract separately proves this for direct RPC calls, so the HTTP path remains unverified. The manual progress item records user verification of old/new authorization.
- **Fix**: Extend the built-app smoke test to verify old-PIN rejection and replacement-PIN acceptance through separate pending decisions after the HTTP reset.
  - Strength: Covers the exact route-to-database behavior promised by Phase 2.
  - Tradeoff: Requires additional decision fixtures and cleanup in an already broad smoke test.
  - Confidence: HIGH — the direct RPC contract test demonstrates the verifier and fixture pattern.
  - Blind spot: The local smoke run does not independently establish whether the recorded manual check used the same decision path.
- **Decision**: ACCEPTED — old/new PIN behavior will be covered in a future end-to-end test; no smoke-test expansion requested.

### F3 — Offer-list privacy cleanup was outside the PIN plan

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/offers/index.astro:207
- **Detail**: Commit `28facf1` removes the visible customer record UUID from the offer list. This is a benign privacy improvement but was not described in the Manage Offer PIN plan or its required files.
- **Fix**: Record the privacy cleanup as an implementation addendum so future reviews can account for it.
- **Decision**: FIXED — documented commit `28facf1` and its scope in the plan's Implementation Addendum on 2026-09-23.

## Verification

- `npm run lint`: PASS.
- `npx astro check`: PASS, 0 errors, 0 warnings, 0 hints.
- `npm run build`: PASS; Astro completed the server build. Wrangler emitted a sandbox log-file permission warning but the command exited 0.
- `npm run offer-contract`: PASS against local Supabase; `Offer contract checks passed`.
- `BASE_URL=http://127.0.0.1:4322 npm run smoke`: PASS against the local preview and Supabase; all smoke steps passed, including anonymous and foreign-offer rejection, generation, reset, and no-secret rendering.
- Manual progress items 1.3 and 2.3–2.6 are checked in the plan. The Phase 1 grant shape and Phase 2 AlertDialog are observable in source; the desktop/phone, copy, keyboard, Escape, and link-validity actions are recorded as user-verified in Progress, not independently repeated in this review.
