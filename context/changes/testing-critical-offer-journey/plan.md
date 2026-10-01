# Critical offer journey Implementation Plan

## Overview

Close rollout Phase 3 with two independent browser journeys across contractor authentication, navigation, forms, anonymous customer decisions, API, and local database persistence. The user approved MEDIUM complexity, zero additional substantive questions, and the two-phase structure.

## Current State Analysis

Playwright setup and seed are complete. Existing active-terms and safe-reasons specs seed key actions through API fixtures, leaving UI creation, acceptance/change submission, and rejected-copy submission uncovered as complete journeys. Research maps the built routes and controls; execution must verify them against the running accessibility tree.

## Desired End State

Two independently runnable specs prove accepted-change and rejected-copy paths through real UI. Literal business assertions survive reload, each test fails on a named deliberate regression, and cleanup leaves no journey records after green or red runs.

### Key Discoveries:

- `tests/e2e/offer-fixture.ts:64` bundles API creation with bookkeeping; reuse cleanup without bypassing UI creation.
- `src/components/offers/ManageOfferPin.tsx:105` exposes PIN generation; customer contexts must be explicitly anonymous and PINs must stay out of diagnostics.
- `src/pages/offers/new.astro:110` copies fields without source item IDs; the new offer must have independent identity and decisions.

## What We're NOT Doing

Production feature changes, schema/permission changes, duplicate unit or API matrices, Playwright scaffolding, CI enforcement, and visual baselines. CI and selective visual review remain rollout Phase 4.

## Implementation Approach

Use 10x-e2e's live exploration → generation → anti-pattern review → green/red verification loop, with the existing seed and quality rules. Keep contractor setup authentication, real internal boundaries, and a separate anonymous browser context. Delegate generation as previously chosen by the user; the primary agent reviews the diff and verification evidence. One focused test per branch, one commit per phase after the required user checkpoint.

## Critical Implementation Details

### Fixture lifecycle

Use a unique, annotated customer token and bounded local-only cleanup, including offers that reuse that customer during copy. Cleanup must run after partial creation and assertion failures, verify all six domain tables, and remain compatible with existing specs. Capture PINs privately; avoid value-bearing PIN assertions, logs, or retained artifacts exposing the generated PIN.

### Verification builds

Stop exploration servers before verification and use a free preview port so the runner rebuilds deliberate regressions. Restore production bytes immediately after the red check and run green again.

## Phase 1: Accepted-change journey

### Overview

Protect risk #5's accepted branch and risk #3's approval boundary by driving offer creation, sharing, initial acceptance, change preview/publication, and customer acceptance through UI.

### Changes Required:

#### 1. UI-created fixture support

**File:** `tests/e2e/offer-fixture.ts` and, if needed, a focused helper under `tests/e2e/`.

**Intent:** Support bookkeeping and cleanup of offers created through the browser while retaining existing API fixture callers.

**Contract:** Real authenticated reads may corroborate state; setup APIs must not perform journey actions. Anonymous contexts close in failure-safe cleanup, and no credentials/PINs enter output.

#### 2. Accepted-change spec

**File:** `tests/e2e/accepted-change-journey.spec.ts`

**Intent:** Prove the built workflow integrates across both actors and preserves original history.

**Contract:** Start from dashboard navigation; create quantity 1 at 100.00 PLN with deadline 2099-01-15, generate PIN and capture shared URL through UI, and accept anonymously. Propose quantity 2 with deadline 2099-01-22 through the form; preview must show +100.00 PLN. Pending terms stay 100.00 PLN/quantity 1/Jan 15. After anonymous acceptance and reload, both views show 200.00 PLN/quantity 2/Jan 22. History retains accepted original version 1 and accepted change proposal 1 with their corresponding terms.

### Success Criteria:

#### Automated Verification:

- Accepted-change spec passes independently: `npm run e2e -- tests/e2e/accepted-change-journey.spec.ts`.
- A deliberate regression to post-approval terms fails the business assertion; production is restored and the spec passes again.
- Token-scoped cleanup verifies zero journey residue after green and deliberate-red runs.
- Existing specs pass after shared-helper changes: `npm run e2e`.
- Static checks pass: `npm run lint` and `npm run astro -- check`.

#### Manual Verification:

None required: deterministic browser assertions cover this functional branch. Phase-end confirmation reviews the automated evidence and proposed commit.

## Phase 2: Rejected-copy journey

### Overview

Protect risk #5's rejected-copy branch and risk #4's independence contract by driving rejection, prefill, and copy submission through UI.

### Changes Required:

#### 1. Rejected-copy spec

**File:** `tests/e2e/rejected-copy-journey.spec.ts`

**Intent:** Prove a rejected offer can become a fresh proposal without changing its original decision or terms.

**Contract:** Independently create quantity 1 at 100.00 PLN with deadline 2099-01-15; anonymously reject with a literal reason and PIN. Contractor sees rejection/reason after reload and opens the copy action. Assert hydrated customer/scope/deadline/item prefill, edit rate to 150.00 PLN and submit through UI. Copy has a different offer/share/item/revision identity, the same customer, pending state, 150.00 PLN, and no inherited decision/comment/timestamp. Original remains rejected at 100.00 PLN with its reason and history. Cleanup covers both offers.

#### 2. Cookbook and rollout status

**File:** `context/foundation/test-plan.md`

**Intent:** Document verified journey coverage and commands in cookbook 6.4 and close rollout Phase 3 after verification.

**Contract:** Preserve frozen risk strategy and quality gates; Phase 4 remains pending.

### Success Criteria:

#### Automated Verification:

- Rejected-copy spec passes independently: `npm run e2e -- tests/e2e/rejected-copy-journey.spec.ts`.
- A deliberate copy-prefill or independence regression fails the business assertion; production is restored and the spec passes again.
- Token-scoped cleanup verifies zero residue for original and copy after green and deliberate-red runs.
- Complete browser suite passes: `npm run e2e`.
- Static/build checks pass: `npm run lint`, `npm run astro -- check`, and `npm run build`.
- Cookbook 6.4 records verified specs/commands and rollout Phase 3 is complete.

#### Manual Verification:

None required: this branch is functional and deterministic. Selective visual review belongs to rollout Phase 4.

## Testing Strategy

### Unit Tests:

Reuse the completed Phase 2 oracle coverage; add no duplicate arithmetic implementation.

### Integration Tests:

Use real browser forms, PIN decisions, SSR reloads, and local persistence. Authenticated reads corroborate copy identity rather than replacing visible outcomes. Review Naive assertion, Brittle selector, Shared state, Hardcoded wait, and No cleanup anti-patterns before each red check.

### Manual Testing Steps:

None required. Show green/red evidence at each phase checkpoint.

## Performance Considerations

Two focused specs with unique fixtures. Do not grow this into a test-per-page suite or repeat full builds after unchanged checks pass.

## Migration Notes

No schema or production-data migration. Local journey fixtures must be removed even after failed verification.

## References

- `context/changes/testing-critical-offer-journey/research.md`
- `context/foundation/test-plan.md` — rollout Phase 3 and risks #3/#4/#5/#6.
- `context/foundation/test-stack.md` — configured local Playwright setup.
- `.agents/skills/10x-e2e/references/e2e-quality-rules.md`

## Progress

### Phase 1: Accepted-change journey

#### Automated

- [x] 1.1 Accepted-change spec passes independently: `npm run e2e -- tests/e2e/accepted-change-journey.spec.ts`. — 55ae0ca
- [x] 1.2 A deliberate regression to post-approval terms fails the business assertion; production is restored and the spec passes again. — 55ae0ca
- [x] 1.3 Token-scoped cleanup verifies zero journey residue after green and deliberate-red runs. — 55ae0ca
- [x] 1.4 Existing specs pass after shared-helper changes: `npm run e2e`. — 55ae0ca
- [x] 1.5 Static checks pass: `npm run lint` and `npm run astro -- check`. — 55ae0ca

### Phase 2: Rejected-copy journey

#### Automated

- [x] 2.1 Rejected-copy spec passes independently: `npm run e2e -- tests/e2e/rejected-copy-journey.spec.ts`. — 7001dfa
- [x] 2.2 A deliberate copy-prefill or independence regression fails the business assertion; production is restored and the spec passes again. — 7001dfa
- [x] 2.3 Token-scoped cleanup verifies zero residue for original and copy after green and deliberate-red runs. — 7001dfa
- [x] 2.4 Complete browser suite passes: `npm run e2e`. — 7001dfa
- [x] 2.5 Static/build checks pass: `npm run lint`, `npm run astro -- check`, and `npm run build`. — 7001dfa
- [x] 2.6 Cookbook 6.4 records verified specs/commands and rollout Phase 3 is complete. — 7001dfa
