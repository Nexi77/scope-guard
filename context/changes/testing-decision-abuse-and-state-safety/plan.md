# Decision Abuse and State Safety Tests Implementation Plan

## Overview

Add risk-focused database contract and Worker HTTP regression checks for shared customer decisions. The tests must show that PIN and link abuse cannot change another offer, and that stale, repeated, or simultaneous opposite decisions leave one valid persisted outcome. This is Phase 1 of the quality rollout in `context/foundation/test-plan.md`.

## Current State Analysis

The public decision route validates and limits requests before invoking service-role RPCs. The database RPCs check active share token and PIN, lock the offer and target, compare revisions for a new decision, and return a prior decision unchanged on retry (`src/pages/api/shared/[token]/decision.ts:48-138`; `supabase/migrations/20261007000000_guard_customer_decisions.sql:11-71`). Existing `scripts/offer-contract.mjs` checks serial same-outcome retries and lock blocking on different offers; `scripts/smoke.mjs` checks one wrong PIN and a local 429 reached by retrying a decided target (`context/changes/testing-decision-abuse-and-state-safety/research.md`). The missing signal is a same-target opposite race with persisted-state assertions, an opposite-outcome retry, and distinct wrong-PIN attempts through the public route.

## Desired End State

`npm run offer-contract` fails if same-target opposing decisions create a duplicate row, change the recorded outcome/time on retry, or apply the active-scope effect more than once. `SMOKE_TRANSPORT=harness npm run smoke` fails if distinct wrong PINs, foreign/revoked links, or throttled requests can decide or disclose the wrong offer. The test plan's §6.1 documents where these checks live and how to add similar tests.

### Key Discoveries:

- A decided target returns its stored outcome/time before stale revision or opposite-outcome validation, after active token and PIN checks (`supabase/migrations/20261007000000_guard_customer_decisions.sql:11-28,47-64`). A losing opposite request should therefore report the winner's result, rather than necessarily returning 409.
- `decisionRpc` refreshes the expected revisions, so an explicit stale-value test must use a direct RPC call or a helper that preserves supplied revisions (`scripts/offer-contract.mjs:44-58`).
- The configured Worker limit is six requests per 60 seconds keyed by share token, and the archived design records it as location-scoped (`wrangler.jsonc:19-24`; `context/archive/2026-09-28-decide-change-by-pin/plan.md:210-212`). A local harness 429 cannot prove a distributed limit.
- CI already runs the database contract and Worker smoke scripts with local Supabase (`.github/workflows/ci.yml:38-59`); this phase can extend those scripts without introducing a runner or CI workflow.

## What We're NOT Doing

- Changing production decision, PIN, link, rate-limit, or database rules unless a new test exposes a real defect; a discovered defect requires a separately scoped correction before declaring the phase complete.
- Claiming global throttling across Cloudflare locations or verifying a live deployed binding from a local Worker harness.
- Adding browser e2e, visual, pricing, reason-rendering, CI wiring, or other rollout-phase coverage.
- Adding a new test framework, migration, or GitHub Actions YAML.

## Implementation Approach

Extend the current local Supabase contract for the database invariants, then extend the Worker harness smoke script for the public request boundary. Use independent seeded offers/tokens so rate-limit state and previous decisions cannot mask the assertion under test. Assert persisted rows, outcome/time, and active-scope revision after each critical sequence, not just HTTP status or RPC success. Finish by replacing the §6.1 cookbook placeholder with the resulting test pattern and run commands.

## Critical Implementation Details

### State sequencing

Capture displayed revisions before sending competing requests. Coordinate both requests against the same pending target and offer; the existing held-offer-lock harness can provide an overlap signal, whereas two uncoordinated serial completions cannot prove the race. After the first decision commits, the second valid-token/PIN request may return the first outcome and timestamp regardless of its requested outcome (`scripts/offer-contract.mjs:155-229`; `supabase/migrations/20261007000000_guard_customer_decisions.sql:18-20,54-55`).

## Phase 1: Database decision invariants

### Overview

Make the stored decision and active-scope effect the oracle for retries, stale requests, and an opposing same-target race.

### Changes Required:

#### 1. Contract fixtures and decision calls

**File**: `scripts/offer-contract.mjs`

**Intent**: Add isolated pending base and change fixtures for opposite-outcome retries and a same-change race. Preserve the submitted expected revisions in test calls that intentionally exercise stale values, so the helper's fresh shared read cannot erase the condition.

**Contract**: Existing `decisionRpc` behavior remains available for its current callers. New test calls use the current `decide_customer_offer_revision` and `decide_customer_offer_change` RPC signatures with captured `p_expected_base_revision` and `p_expected_active_scope_revision` values (`scripts/offer-contract.mjs:44-58`; `supabase/migrations/20261007000000_guard_customer_decisions.sql:2-5,37-40`).

#### 2. Persisted outcome and race assertions

**File**: `scripts/offer-contract.mjs`

**Intent**: Check opposite retries for both target kinds, a stale request to a still-pending target, and two opposing requests racing on one pending change. Verify the one recorded result and its side effects after the requests settle; accept either race winner but require both responses to describe that winner.

**Contract**: For a decided target, the recorded outcome and `decided_at` stay fixed on valid-PIN retry. For a pending stale target, the RPC returns `PT409` without a decision. For the raced change, `change_decisions` contains one row, the change status matches it, and `active_scope_revision` advances exactly once if accepted and not at all if rejected (`supabase/migrations/20261007000000_guard_customer_decisions.sql:18-34,54-71`; `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:63-79`).

### Success Criteria:

#### Automated Verification:

- `npm run offer-contract` proves valid-PIN opposite-outcome retries for base and change return the original persisted outcome and timestamp without a second decision effect.
- `npm run offer-contract` proves a stale request for a still-pending target fails with `PT409` and leaves that target undecided.
- `npm run offer-contract` proves two overlapping opposite decisions on one pending change yield one stored outcome/time and its matching single active-scope effect.

#### Manual Verification:

None required; persisted database assertions are the verification for this phase.

---

## Phase 2: Public PIN and link abuse checks

### Overview

Check the real HTTP boundary with fresh tokens, distinct wrong PIN submissions, and persisted-state assertions after throttling.

### Changes Required:

#### 1. HTTP abuse fixtures and assertions

**File**: `scripts/smoke.mjs`

**Intent**: Add a separate pending offer/token for PIN-attempt testing so prior smoke requests do not consume its budget or decide its target. Exercise a sequence of distinct six-digit wrong PINs through `/api/shared/[token]/decision`, then verify the configured local limiter denies a further valid request and leaves the target pending.

**Contract**: Wrong six-digit PINs produce the route's generic decision failure; the locally bound limiter returns 429 after its configured budget. The check asserts persisted decision count/status before and after the denied request and does not infer a cross-location budget (`src/pages/api/shared/[token]/decision.ts:74-138`; `wrangler.jsonc:19-24`).

#### 2. Token and target isolation

**File**: `scripts/smoke.mjs`

**Intent**: Complete the public-route matrix for revoked and foreign links and a target belonging to another offer. Check that the response does not reveal the foreign offer and no decision row or status change is written for either offer; reuse existing shared-page isolation checks where they already give the needed signal.

**Contract**: A valid token scopes the decision RPC to its own offer and target; revoked/invalid links cannot decide. Assert the endpoint's documented neutral response class rather than a body copied from a private SQL error (`src/pages/api/shared/[token]/decision.ts:125-138`; `supabase/migrations/20261007000000_guard_customer_decisions.sql:11-17,47-53`; `scripts/smoke.mjs:839-873`).

### Success Criteria:

#### Automated Verification:

- `SMOKE_TRANSPORT=harness npm run smoke` proves distinct wrong six-digit PIN attempts are denied and a further valid request receives local 429 without creating a decision.
- `SMOKE_TRANSPORT=harness npm run smoke` proves revoked/foreign token and cross-offer target attempts do not disclose the other offer or create a decision.
- `SMOKE_TRANSPORT=harness npm run smoke` preserves the existing successful decision, stale 409, and same-outcome retry checks.

#### Manual Verification:

None required; HTTP responses and persisted-state assertions are the verification for this phase.

---

## Phase 3: Cookbook and full verification

### Overview

Make the shipped patterns reusable and run the project checks against the complete test addition.

### Changes Required:

#### 1. PIN and decision cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 placeholder with the actual locations, fixture rules, named reference checks, and commands for PIN, isolation, stale, opposite-retry, and race coverage. Explain the local limiter's scope so future tests do not overstate its guarantee.

**Contract**: Update §6.1 only; preserve the strategy and rollout sections (§1–§5) and the other cookbook placeholders (`context/foundation/test-plan.md:91-109`).

### Success Criteria:

#### Automated Verification:

- `npm run offer-contract` and `SMOKE_TRANSPORT=harness npm run smoke` pass with local Supabase credentials and the Worker harness.
- `npm run lint`, `npx astro check`, and `npm run build` pass after the test changes.
- `context/foundation/test-plan.md` §6.1 names the shipped reference checks, test locations, fixture pattern, and run commands without claiming a distributed limit.

#### Manual Verification:

None required; this phase updates a test cookbook and runs the existing checks.

## Testing Strategy

### Database contract:

- Use local Supabase fixtures and direct RPC calls to test stale expected revisions, opposite retries, and same-target opposing decisions under an overlapping lock window.
- Read decision rows, target status/timestamp, and `active_scope_revision` after each critical sequence. Derive expected scope movement from which outcome actually won the race, not from request dispatch order.

### HTTP integration:

- Use the existing Worker harness and a fresh token for the wrong-PIN budget. Check generic failure responses, local 429, cross-offer isolation, and the database state after denied attempts.
- Keep a valid token for another offer outside the abused token's budget to show token-key isolation without asserting distributed state.

### Manual Testing Steps:

No browser/manual step is needed for these test-only changes; the later critical-journey rollout owns browser verification.

## Performance Considerations

Reuse the current local Supabase and Worker harness. Keep new fixtures bounded, and coordinate the database race with an observable overlap rather than long arbitrary sleeps. The HTTP limit check needs its own token so suite ordering does not determine its result.

## Migration Notes

No schema migration or production deployment change is planned. Run Supabase CLI commands outside the sandbox as required by `context/foundation/lessons.md`; use local Supabase credentials, not the configured cloud project's disabled registration flow.

## References

- Research: `context/changes/testing-decision-abuse-and-state-safety/research.md`
- Quality rollout: `context/foundation/test-plan.md:40-58,91-109`
- Existing contract helper and lock harness: `scripts/offer-contract.mjs:44-58,155-229`
- Existing HTTP decision smoke: `scripts/smoke.mjs:1481-1565,1898-1972`
- Decision transaction: `supabase/migrations/20261007000000_guard_customer_decisions.sql:11-71`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database decision invariants

#### Automated

- [x] 1.1 `npm run offer-contract` proves valid-PIN opposite-outcome retries for base and change return the original persisted outcome and timestamp without a second decision effect. — 4ca1069
- [x] 1.2 `npm run offer-contract` proves a stale request for a still-pending target fails with `PT409` and leaves that target undecided. — 4ca1069
- [x] 1.3 `npm run offer-contract` proves two overlapping opposite decisions on one pending change yield one stored outcome/time and its matching single active-scope effect. — 4ca1069

### Phase 2: Public PIN and link abuse checks

#### Automated

- [x] 2.1 `SMOKE_TRANSPORT=harness npm run smoke` proves distinct wrong six-digit PIN attempts are denied and a further valid request receives local 429 without creating a decision.
- [x] 2.2 `SMOKE_TRANSPORT=harness npm run smoke` proves revoked/foreign token and cross-offer target attempts do not disclose the other offer or create a decision.
- [x] 2.3 `SMOKE_TRANSPORT=harness npm run smoke` preserves the existing successful decision, stale 409, and same-outcome retry checks.

### Phase 3: Cookbook and full verification

#### Automated

- [ ] 3.1 `npm run offer-contract` and `SMOKE_TRANSPORT=harness npm run smoke` pass with local Supabase credentials and the Worker harness.
- [ ] 3.2 `npm run lint`, `npx astro check`, and `npm run build` pass after the test changes.
- [ ] 3.3 `context/foundation/test-plan.md` §6.1 names the shipped reference checks, test locations, fixture pattern, and run commands without claiming a distributed limit.
