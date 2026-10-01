---
date: 2026-10-01T20:04:15+02:00
researcher: Codex
git_commit: dc606e4f91bd32448c25a2ae959a1bcc7ea128f5
branch: master
repository: ScopeGuard
topic: "Phase 2 missing coverage: active terms, safe reasons, and rounding"
tags: [research, codebase, tests, active-terms, rejection-reasons, pricing]
status: complete
last_updated: 2026-10-01
last_updated_by: Codex
---

# Research: Active terms and safe rejection reasons

**Date:** 2026-10-01T20:04:15+02:00  
**Researcher:** Codex  
**Git Commit:** `dc606e4f91bd32448c25a2ae959a1bcc7ea128f5`  
**Branch:** master  
**Repository:** ScopeGuard

## Research Question

Which missing tests would close rollout Phase 2, risks 3, 4, and 6, while preserving the strategy in `context/foundation/test-plan.md` and reusing existing tests?

## Summary

The inspected contract, smoke, estimator, and Playwright tests already cover substantial active-scope behavior. Extend their gaps rather than recreate the state matrix: independent deadline/revision expectations, rejected-base and agreed action eligibility, hostile rejection text across persistence and real DOM rendering, and fractional pricing at helper and approval boundaries. This is a static coverage assessment; no tests were executed during research.

## Detailed Findings

### Active terms and contractor actions

- `verifyCurrentReads` checks effective items and amount and compares customer/contractor deadline projections. Its revision assertion requires a positive integer, rather than a specified expected revision (`scripts/offer-contract.mjs:100–138`). The pending/superseded/rejected sequence reuses that helper (`scripts/offer-contract.mjs:1530–1573`), but its independent deadline assertion precedes the sequence (`scripts/offer-contract.mjs:1498`). Give the proposal a nonzero deadline effect and assert literal expected deadline and scope revision through these transitions.
- Existing rendered smoke checks cover pending without history, pending with history, and accepted actions (`scripts/smoke.mjs:1146`, `:1268`, `:1331`, `:1832`). In the inspected action checks, rejected-base and agreed offer states lack the corresponding eligibility assertions. The loader enables edit for pending without changes, and proposals for accepted/agreed (`src/lib/contractor-offer-view.ts:306–307`). Extend existing fixtures with the missing states and direct-edit denial.
- The browser regression already proves pending/rejected changes preserve agreed amount, deadline, item details, and actions after reload (`tests/e2e/active-terms.spec.ts:21–56`). Repeating those assertions in another browser journey would add little signal.

### Safe rejection reasons

- The public endpoint requires rejected comments to be strings with trimmed length 1–1000, and forwards trimmed text (`src/pages/api/shared/[token]/decision.ts:85–87`, `:120`). Database decision functions store trimmed base/change comments (`supabase/migrations/20261007000000_guard_customer_decisions.sql:30–31`, `:65–66`).
- Contractor base detail and base/change history use Astro text expressions (`src/pages/offers/[offerId].astro:102–103`; `src/pages/offers/[offerId]/history.astro:192–193`, `:382–383`). This suggests safe escaping; actual DOM inspection is needed to establish inert rendering.
- The inspected smoke sequence proves ordinary change-comment persistence, history, timestamps and retries (`scripts/smoke.mjs:2102–2185`). Base rejection rendering is seeded by admin writes rather than the decision API (`scripts/smoke.mjs:944–1018`). The inspected contract/smoke scripts lack hostile-comment DOM verification and comment-length boundary cases.
- Owner-scoped offer and decision queries protect contractor reads (`src/lib/contractor-offer-view.ts:142–145`, `:277–284`). Existing foreign/anonymous history checks are generic (`scripts/smoke.mjs:927–941`); add non-disclosure of a unique stored reason marker.
- Use independent base/change fixtures, real decision requests, exact trimmed persistence assertions, and Playwright DOM checks on applicable contractor detail/history surfaces. Include HTML/script/event syntax, quotes, ampersands, newline and Polish text; assert text, no payload-created nodes/attributes, and an untouched execution sentinel after navigation/reload. Reuse the installed browser and local cleanup helper (`tests/e2e/offer-fixture.ts:109`, `:157`), without introducing a new runner or broad journey.

### Independent rounding oracles

- Fractional base DB coverage already exists: quantities 1.25, 0.005, 0.005 at rates 9876, 100, 100 grosz yield expected total 12347 and lines 12345, 1, 1 (`scripts/offer-contract.mjs:506–525`, `:547`, `:1640–1648`). Preserve it.
- Item helpers round individual lines using integer arithmetic before summing (`src/lib/offer-items.ts:219–232`). No direct item-helper test was found in the inspected `scripts/*.test.ts` inventory. Add literal expectations: 0.004/0.005/0.006 at 100 grosz produce 0/1/1; 0.333 at 101 produces 34; two half-grosz lines sum to 2. Reject a quantity with four decimal places.
- The existing estimator half-grosz delta case is zero (`scripts/offer-change-estimator.test.ts:48–54`). Add a discriminator: before 0.499 at 101 grosz rounds to 50; after 0.500 rounds to 51; expected delta +1. Rounding the raw quantity difference would incorrectly yield zero. Production subtracts rounded lines (`src/lib/offer-change-estimator.ts:60–71`).
- SQL independently reconciles rounded before/after line amounts (`supabase/migrations/20261012000000_record_replacement_times.sql:164`, `:192–196`). Add a fractional lifecycle fixture: two 0.005 items at 100 grosz total 2; first item increased to 0.015 produces line 2 and delta +1. Pending total remains 2, accepted total becomes 3, a subsequent rejected proposal preserves 3. Reject an incorrectly supplied zero delta with unchanged persisted state. Expectations must be literal, not derived from production helpers.

## Code References

- `scripts/offer-contract.mjs:100` — projection comparison helper and DB fixture seam.
- `scripts/smoke.mjs:927` — access checks; `:2102` — rejection persistence/HTTP seam.
- `src/lib/contractor-offer-view.ts:306` — action eligibility contract.
- `src/lib/offer-items.ts:219` — line and total helpers.
- `scripts/offer-change-estimator.test.ts:48` — existing estimator oracle.
- `tests/e2e/offer-fixture.ts:109` — real decision fixture seam with local cleanup.
- `src/pages/offers/[offerId]/history.astro:192` — base reason rendering; `:382` — change reason rendering.

## Architecture Insights

Database contracts should protect persisted active terms and reconciled monetary effects. Node unit tests provide cheap independent helper oracles. HTTP tests cover input and ownership boundaries. Installed Playwright provides a focused rendered-page integration test for executable-content risk; this does not complete the broader Phase 3 journey. No production refactor is justified solely to test the loader's boolean predicates.

## Historical Context

Phase 1's archived research describes decision/access test seams (`context/archive/2026-09-29-testing-decision-abuse-and-state-safety/research.md`). Its historical statement about missing opposing retries is superseded by the shipped Phase 1 cookbook (`context/foundation/test-plan.md:93`). The recent active-terms browser test supplies additional risk 3 coverage, while Phase 2 and the broader Phase 3 remain separate rollout work (`tests/e2e/active-terms.spec.ts:21`; `context/foundation/test-plan.md:56–58`).

## Related Research

`context/archive/2026-09-29-testing-decision-abuse-and-state-safety/research.md` — established boundary and fixture architecture.

## Open Questions

No unresolved product or architecture choices within this scoped phase. Proposed additions have not been executed; implementation must verify the local runtime and fixture cleanup. CI enforcement remains assigned to Phase 4 (`context/foundation/test-plan.md:87–89`).
