# Active terms and safe reasons — Plan Brief

> Full plan: `context/changes/testing-active-terms-and-safe-reasons/plan.md`
> Research: `context/changes/testing-active-terms-and-safe-reasons/research.md`

## What & Why

Close rollout Phase 2 by protecting agreed terms, exact pricing, and customer rejection reasons. Extend gaps found in existing tests, using the strategy already accepted in test-plan.

## Starting Point

Database contracts and Worker smoke already cover many state transitions. Node estimator tests and a real Playwright active-terms regression also exist. Fractional base totals have independent database expectations.

## Desired End State

Tests detect rounding errors and improper activation of proposed terms. The intended contractor sees the exact rejection explanation as inert text; foreign viewers cannot obtain it. Cookbook examples make these patterns reusable.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Scope | Risks 3, 4, 6; gaps only | Preserve existing useful coverage | Test-plan / Research |
| Arithmetic | Literal independent oracles | Detect copied implementation mistakes | PRD / Research |
| State | Existing contracts and smoke | Cheapest evidence for persistence/actions | Research |
| Text safety | Focused real-DOM Playwright check | Escaped HTML substrings cannot prove inert rendering | Research |
| Gates | Existing runners; CI changes later | Enforcement belongs to rollout Phase 4 | Test-plan |
| Structure | Three implementation steps; no further scope interview | Material decisions already settled | User approval |

## Scope

**In scope:**

- Half-grosz boundaries, line sums, and fractional estimator deltas.
- Active deadline/revision expectations, fractional approval effects, and missing action states.
- Comment input boundaries, exact persistence, DOM safety, and ownership non-disclosure.
- Phase 2 cookbook and rollout status.

**Out of scope:**

- Product/schema changes, broad journeys, CI wiring, and visual review.
- Repeated state matrices or another browser framework.

## Architecture / Approach

Node protects helper arithmetic; local Supabase contracts protect effective state; Worker smoke protects HTTP/actions; installed Playwright checks stored text in the actual contractor DOM. Fixtures use real local authentication and guaranteed cleanup.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Rounding | Literal line/total and +1 fractional delta cases | Incorrect monetary oracle |
| 2. Active terms | Deadline/revision, actions, fractional lifecycle | Unapproved effects activate |
| 3. Safe reasons | API/storage/DOM and cookbook | Executable or wrongly disclosed text |

**Prerequisites:** Existing Node scripts, local Supabase/Docker, configured local test credentials and installed Playwright Chromium.
**Estimated effort:** Three bounded implementation steps; browser fixtures and local infrastructure are the main uncertainty.

## Open Risks & Assumptions

- Research is static; implementation must verify runtime behavior and cleanup.
- Limiter-sensitive validation cases require isolated tokens.
- A nontrivial product defect revealed by tests needs its own scoped change.

## Success Criteria (Summary)

- Independent expected amounts match helper and approved database effects.
- Pending/rejected effects preserve active terms and permitted actions.
- Exact rejection text remains inert and owner-scoped after reload.

## References

- `context/foundation/test-plan.md`
- `context/foundation/prd.md`
- `context/changes/testing-active-terms-and-safe-reasons/research.md`
