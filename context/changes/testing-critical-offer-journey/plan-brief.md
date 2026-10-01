# Critical offer journey — Plan Brief

> Full plan: `context/changes/testing-critical-offer-journey/plan.md`
> Research: `context/changes/testing-critical-offer-journey/research.md`

## What & Why

Finish test rollout Phase 3 with full accepted-change and rejected-copy browser journeys. Existing tests verify isolated outcomes but bypass several workflow actions through API setup.

## Starting Point

Playwright authentication, seed, local Supabase, and bounded cleanup already exist. Both product branches are built; live exploration will confirm the actual accessible controls.

## Desired End State

Contractor and anonymous customer complete both paths through UI. Reloaded terms and history remain correct, deliberate regressions fail the tests, and all temporary domain records are removed.

## Key Decisions Made

| Decision   | Choice                                                               | Why                                                      | Source          |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------- | --------------- |
| Structure  | Two independent phases/specs                                         | Each branch is independently runnable and reviewable.    | User / Plan     |
| Interview  | MEDIUM, zero substantive questions                                   | Research and test-plan resolve the material choices.     | User / Research |
| Boundaries | Real auth, routes, API and local DB; anonymous customer context      | Preserve the integration signal.                         | Research        |
| Oracles    | Base 100.00 PLN; accepted change 200.00 PLN; copied offer 150.00 PLN | Literal expected outcomes avoid repeating pricing logic. | Research        |
| Delivery   | Delegated generation, primary review, phase checkpoints              | Continue the user's selected implementation mode.        | User            |

## Scope

**In scope:** UI creation/sharing/PIN decisions/change confirmation/copy submission; reload persistence and history; cleanup; cookbook 6.4.

**Out of scope:** Production features, schema/permission changes, CI enforcement, visual baselines, and duplicate arithmetic/API matrices.

## Architecture / Approach

Use the existing authenticated contractor page and an explicitly anonymous customer context. Explore the running accessibility tree, generate from seed/rules, review anti-patterns, and verify green → deliberate red → restored green on fresh builds.

## Phases at a Glance

| Phase                      | What it delivers                                                                                          | Key risk                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Accepted-change journey | UI-created offer, initial acceptance, preview +100.00 PLN, accepted terms 200.00 PLN and updated deadline | Pending changes entering agreed terms or acceptance failing to update them |
| 2. Rejected-copy journey   | Rejection, prefilled fresh proposal at 150.00 PLN, original unchanged at 100.00 PLN                       | Copy inheriting identity/decision or altering the rejected source          |

**Prerequisites:** Running local Supabase/Docker and existing ignored E2E credentials.
**Estimated effort:** Two focused implementation and verification steps.

## Open Risks & Assumptions

- Live controls can differ from source-level research; verify them before generation.
- Failure-path cleanup must include partial creation and both copied offers.
- Preview reuse can hide deliberate breaks; verify on a free port with current builds.

## Success Criteria (Summary)

- Both complete journeys pass independently and in the existing suite.
- Each test catches its named business regression and passes after restoration.
- No journey residue, no secret diagnostics, and static/build gates pass.
