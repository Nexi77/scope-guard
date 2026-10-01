# Active terms and safe rejection reasons — Implementation Plan

## Overview

Close test-rollout Phase 2, risks 3, 4, and 6, by extending existing test seams with independent pricing expectations, active-state invariants, and safe rejection-reason rendering.

## Current State Analysis

Existing contract/smoke scripts cover most state transitions and integer pricing. Fractional base totals already have independent database expectations. Playwright is configured with real local authentication and an active-terms regression. Missing coverage is documented in `research.md`; no production defect was established during static research.

## Desired End State

Regression checks detect incorrect line rounding and approval effects, pending/rejected deadline or revision leakage, incorrect contractor actions, and lost, executable, or wrongly disclosed rejection comments. The Phase 2 cookbook names runnable examples and the rollout status reflects verified completion.

### Key Discoveries:

- `scripts/offer-contract.mjs:100` compares projections without an independently expected deadline/revision through the pending/rejected sequence.
- `src/lib/contractor-offer-view.ts:306` permits edit for pending without history and proposals for accepted/agreed.
- `src/lib/offer-items.ts:219` rounds individual lines before summing; `scripts/offer-change-estimator.test.ts:48` has a half-grosz case but lacks a fractional nonzero delta discriminator.
- `src/pages/offers/[offerId]/history.astro:192` and `:382` render base/change reasons through separate text expressions.

## What We're NOT Doing

- Changing product behavior, database permissions, schema, or the strategy/gates in test-plan sections 1–5.
- Repeating the existing active-terms browser regression or completing the broader Phase 3 journey.
- Adding CI wiring, a new test framework, broad snapshots, or refactors made solely to expose boolean predicates to unit tests.

## Implementation Approach

Use Node tests for arithmetic, existing Supabase contracts for persisted state, existing Worker smoke checks for HTTP boundaries/actions, and installed Playwright for focused real-DOM rejection rendering. Expected amounts are literal values derived from PRD examples rather than production functions. Any revealed nontrivial production defect gets a separate scoped change.

## Critical Implementation Details

Browser fixtures must use local Supabase, keep credentials/PINs out of output, and clean up isolated records even after failure. Service-role table reads are restricted in this schema; use authenticated owner reads and the existing local Docker cleanup seam. Install an execution sentinel before navigation and check the DOM as well as persisted text; an HTML substring test alone is insufficient.

## Phase 1: Independent rounding tests

### Overview

Protect line rounding, summed totals, and fractional before/after change calculations with cheap independent oracles.

### Changes Required:

#### 1. Item helper tests and run command

**Files:** `scripts/offer-items.test.ts` (new), `package.json`

**Intent:** Add direct coverage for PRD rounding at quantity precision boundaries. Expose the suite through an `offer-items` script using the existing Node strip-types test convention.

**Contract:** `calculateOfferItemLine`, `calculateOfferItemsTotal`, and quantity validation: quantities 0.004/0.005/0.006 at 100 grosz yield 0/1/1; 0.333 at 101 yields 34; two 0.005 lines at 100 yield total 2; four-decimal quantity is rejected. Assertions use literal bigint expectations.

#### 2. Estimator fractional delta

**File:** `scripts/offer-change-estimator.test.ts`

**Intent:** Detect rounding a raw quantity difference instead of subtracting rounded before/after lines.

**Contract:** At rate 101 grosz, quantity 0.499 rounds to 50 and 0.500 to 51; estimator item and final price deltas equal the literal string `1`.

### Success Criteria:

#### Automated Verification:

- Independent item helper cases pass: `npm run offer-items`.
- Estimator regression suite passes: `npm run offer-change-estimator`.
- Lint passes: `npm run lint`.
- Astro typecheck passes: `npm run astro -- check`.
- Build passes: `npm run build`.

No manual product check is needed for this arithmetic-only phase. The implementation workflow's deliberate-break gate must prove the new assertions detect a rounding regression before commit.

## Phase 2: Active terms and action contracts

### Overview

Strengthen existing state fixtures and connect fractional pricing with actual approval effects.

### Changes Required:

#### 1. Projection and fractional lifecycle checks

**File:** `scripts/offer-contract.mjs`

**Intent:** Add independent expected deadline and scope revision to existing pending/superseded/rejected projection checks. Add one isolated fractional lifecycle fixture to prove reconciled prices activate after acceptance.

**Contract:** A pending proposal with nonzero deadline delta leaves the independently expected active date and revision unchanged through supersession/rejection. Two base items of quantity 0.005 at 100 grosz total 2; increasing the first to 0.015 gives delta +1, pending total 2, accepted total 3, first active line 2. A subsequent rejected proposal preserves total 3 and accepted items. An incorrectly supplied delta zero is rejected without persisted change or active-state mutation. Cleanup follows the script's established fixture lifecycle.

#### 2. Missing action states

**File:** `scripts/smoke.mjs`

**Intent:** Extend existing rejected-base and agreed fixtures with action availability and direct-edit checks.

**Contract:** Rejected base permits neither edit nor proposal; agreed state permits proposal but not base edit. Direct edit cannot mutate either forbidden state. Preserve existing pending/accepted checks.

### Success Criteria:

#### Automated Verification:

- Database invariants pass against local Supabase: `npm run offer-contract`.
- HTTP/action checks pass against local Supabase: `SMOKE_TRANSPORT=harness npm run smoke`.
- Unit suites pass: `npm run offer-items` and `npm run offer-change-estimator`.
- Static checks pass: `npm run lint` and `npm run astro -- check`.

No additional manual product check is required; state/action assertions are deterministic. Prove a newly protected active-state invariant goes red on a deliberate regression before commit.

## Phase 3: Safe rejection reasons and rollout handoff

### Overview

Prove hostile reasons survive the real input/storage/render path as inert text, remain owner-scoped, and document shipped patterns.

### Changes Required:

#### 1. Input validation and non-disclosure

**File:** `scripts/smoke.mjs`

**Intent:** Extend real decision requests with rejection-comment boundaries and unique-reason non-disclosure checks.

**Contract:** Reject blank/whitespace, non-string, and 1001-character comments without recording a decision; accept exactly 1000 trimmed characters. Use isolated targets/tokens so limiter consumption cannot invalidate later happy paths. Foreign-contractor and anonymous requests disclose no unique stored reason marker.

#### 2. Real DOM reason verification

**Files:** `tests/e2e/safe-reasons.spec.ts` (new), `tests/e2e/offer-fixture.ts`

**Intent:** Reuse real local fixtures for independent base/change rejections and allow supplied rejection text while preserving existing fixture defaults.

**Contract:** Submit hostile text containing script/HTML/event syntax, quotes, ampersands, newline, and Polish characters through the decision API. Authenticated reads equal the exact trimmed stored reason. Base detail/base history and change history render the exact intended text after reload; payload-created elements/attributes are absent and a pre-navigation execution sentinel remains unchanged. Fixture cleanup runs in a finally block and verifies no residue. The existing risk 3 test remains green.

#### 3. Cookbook and status

**File:** `context/foundation/test-plan.md`

**Intent:** Fill cookbook sections 6.2/6.3 with verified test locations, independent oracle guidance, safe fixture/render rules, and commands. Advance Phase 2's rollout status after its verified completion.

**Contract:** Preserve frozen strategy and quality gates; Phase 3's broad journey remains pending.

### Success Criteria:

#### Automated Verification:

- Comment-boundary and disclosure checks pass: `SMOKE_TRANSPORT=harness npm run smoke`.
- Focused DOM regressions and existing browser coverage pass: `npm run e2e`.
- Database and unit checks pass: `npm run offer-contract`, `npm run offer-items`, and `npm run offer-change-estimator`.
- Static/build checks pass: `npm run lint`, `npm run astro -- check`, and `npm run build`.
- Cookbook sections 6.2/6.3 reference verified commands and Phase 2 status is complete after all verification.

The deliberate-break gate must demonstrate unsafe reason rendering fails the new DOM test, then restore production bytes before commit. No separate human visual review is required for this deterministic text-safety phase.

## Testing Strategy

### Unit Tests:

Use literal PRD-derived bigint/string amounts; avoid a duplicate rounding implementation as the expected-value generator.

### Integration Tests:

Exercise real local RPCs and HTTP decisions, persisted state, ownership denial, and browser DOM boundaries. Keep each limiter-sensitive scenario on an isolated token and retain cleanup even when assertions fail.

### Manual Testing Steps:

None required in this rollout phase. Selective visual review remains assigned to rollout Phase 4.

## Performance Considerations

Reuse existing runners and bounded fixtures. Restrict browser work to surfaces whose executable-content behavior needs a real DOM.

## Migration Notes

No schema or production-data migration. Local test fixtures must be removed after verification.

## References

- `context/changes/testing-active-terms-and-safe-reasons/research.md`
- `context/foundation/test-plan.md` — Phase 2 and risks 3/4/6.
- `context/foundation/prd.md` — rounding, approval, history, and ownership contracts.

## Progress

### Phase 1: Independent rounding tests

#### Automated

- [x] 1.1 Independent item helper cases pass: `npm run offer-items`. — 1b15be9
- [x] 1.2 Estimator regression suite passes: `npm run offer-change-estimator`. — 1b15be9
- [x] 1.3 Lint passes: `npm run lint`. — 1b15be9
- [x] 1.4 Astro typecheck passes: `npm run astro -- check`. — 1b15be9
- [x] 1.5 Build passes: `npm run build`. — 1b15be9

### Phase 2: Active terms and action contracts

#### Automated

- [x] 2.1 Database invariants pass against local Supabase: `npm run offer-contract`. — cb94923
- [x] 2.2 HTTP/action checks pass against local Supabase: `SMOKE_TRANSPORT=harness npm run smoke`. — cb94923
- [x] 2.3 Unit suites pass: `npm run offer-items` and `npm run offer-change-estimator`. — cb94923
- [x] 2.4 Static checks pass: `npm run lint` and `npm run astro -- check`. — cb94923

### Phase 3: Safe rejection reasons and rollout handoff

#### Automated

- [x] 3.1 Comment-boundary and disclosure checks pass: `SMOKE_TRANSPORT=harness npm run smoke`. — 068f01b
- [x] 3.2 Focused DOM regressions and existing browser coverage pass: `npm run e2e`. — 068f01b
- [x] 3.3 Database and unit checks pass: `npm run offer-contract`, `npm run offer-items`, and `npm run offer-change-estimator`. — 068f01b
- [x] 3.4 Static/build checks pass: `npm run lint`, `npm run astro -- check`, and `npm run build`. — 068f01b
- [x] 3.5 Cookbook sections 6.2/6.3 reference verified commands and Phase 2 status is complete after all verification. — 068f01b
