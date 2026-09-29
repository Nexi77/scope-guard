<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Decision Abuse and State Safety Tests Implementation Plan

- **Plan**: `context/changes/testing-decision-abuse-and-state-safety/plan.md`
- **Scope**: Full plan (3 of 3 phases complete)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Race test can mistake unrelated database waits for overlap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/offer-contract.mjs:218-228`
- **Detail**: The opposing-decision race test counts every blocked session in `pg_stat_activity` and proceeds when the count reaches the number of commands under test. It does not verify that those sessions are the decision RPC requests or that the test's lock holder blocks them. Unrelated blocked local database sessions could satisfy the gate, allowing the test to pass without proving the two decisions overlapped as required by the plan.
- **Fix**: Correlate blocked sessions with the specific decision RPC requests and the test lock holder before treating the overlap as established.
  - Strength: Keeps the race assertion tied to the requests whose behavior the contract is intended to prove.
  - Tradeoff: Requires a small synchronization/query change in the local test harness.
  - Confidence: MEDIUM — the current aggregate count is uncorrelated; the exact correlation mechanism needs to fit Supabase/PostgREST session visibility.
  - Blind spot: This review did not test the false-positive case with unrelated blocked database sessions.
- **Decision**: FIXED — Fix now. The helper now waits for the named RPC sessions and follows their blocking PID chains to the unique advisory lock held by this test.

## Verification

- `npm run offer-contract` — PASS (`Offer contract checks passed`).
- `SMOKE_TRANSPORT=harness npm run smoke` — PASS (all smoke steps passed).
- `npm run lint` — PASS.
- `npx astro check` — PASS (75 files, 0 errors, 0 warnings, 0 hints).
- `npm run build` — PASS. Wrangler reported a sandbox log-file permission warning and the sitemap integration skipped because `site` is unset; the build completed successfully.
- After triage, `npm run offer-contract` — PASS with the correlated blocker check, and `npm run lint` — PASS.

The database checks used local Supabase credentials. No manual verification was required by the reviewed phases.
