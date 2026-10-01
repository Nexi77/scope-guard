# Quality gates and selective review — Plan Brief

> Full plan: `context/changes/testing-quality-gates-and-selective-review/plan.md`
> Research: `context/changes/testing-quality-gates-and-selective-review/research.md`

## What & Why

Complete test rollout Phase 4 by enforcing shipped regression checks in CI and reviewing decision clarity on the two critical views.

## Starting Point

Static, contract and smoke CI already exists; unit and browser suites are local only. Existing E2E protects business outcomes, but API retry traces can retain private setup data.

## Desired End State

CI runs all shipped suites on disposable local Supabase without cloud credentials or secret-bearing diagnostics. Four curated screenshots and a short review document cover customer and contractor clarity on phone and desktop.

## Key Decisions Made

| Decision    | Choice                                                   | Why                                                                | Source          |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------ | --------------- |
| Structure   | CI enforcement, then selective review/cookbook           | Separate verification and commits.                                 | User            |
| Interview   | MEDIUM, zero substantive questions                       | Scope is settled in test-plan/research.                            | User            |
| Backend     | Reuse local CI Supabase job and dedicated confirmed user | Avoid cloud signup changes and duplicated infrastructure.          | Research        |
| Diagnostics | CI list reporter; no trace/screenshot/video uploads      | Private API setup data must stay out of artifacts.                 | Research        |
| Review      | Two routes, 390×844 and 1440×900                         | Focus judgment where deterministic tests do not establish clarity. | User / Research |

## Scope

**In scope:** Existing unit/E2E CI gates; private local provisioning and teardown; bounded visual review; cookbook 6.5.

**Out of scope:** Product/schema/permission changes, UI redesign, pixel baselines, cloud signup, and unapproved publication.

## Architecture / Approach

Extend existing workflow jobs, provision disposable local credentials, verify locally with CI settings, and inspect synthetic decision states. Preserve developer environment bytes and record the separate remote-run verification boundary.

## Phases at a Glance

| Phase                  | What it delivers                                     | Key risk                                                |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 1. CI test enforcement | Unit and full E2E PR gates with private local setup  | Missing credentials, skipped checks or secret retention |
| 2. Selective review    | Four screenshots, concrete observations and cookbook | Ambiguous decision/result presentation                  |

**Prerequisites:** Local Docker/Supabase and existing installed Playwright/browser.
**Estimated effort:** Two focused implementation/verification steps.

## Open Risks & Assumptions

- Local macOS green does not prove Ubuntu dependencies or actual GitHub orchestration; remote evidence follows authorized publication.
- Existing private developer environment files must survive setup and failure cleanup unchanged.
- Significant visual defects require separate scoped follow-up work.

## Success Criteria (Summary)

- Existing suites pass locally with CI settings and workflow maps them to PR checks.
- No private logs/artifacts or leftover provisioned resources.
- User reviews bounded visual evidence and cookbook closes rollout Phase 4.
