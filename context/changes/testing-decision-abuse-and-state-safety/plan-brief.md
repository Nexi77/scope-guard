# Decision Abuse and State Safety Tests — Plan Brief

> Full plan: `context/changes/testing-decision-abuse-and-state-safety/plan.md`  
> Research: `context/changes/testing-decision-abuse-and-state-safety/research.md`

## What & Why

Add regression checks for the two highest-risk customer decision failures: unauthorized decisions through shared links/PIN guessing and inconsistent state from stale or competing decisions. This is the first test rollout phase in the project's risk-first quality strategy.

## Starting Point

The route already validates and rate-limits decision requests, while the database locks offers and enforces decision state. Current contract and Worker smoke scripts cover serial retries, one wrong PIN, and a local 429, but not an opposing same-target race or distinct wrong-PIN attempts with persisted-state checks.

## Desired End State

A failing test identifies if abuse crosses an offer boundary, if retries rewrite a decision, or if competing decisions produce duplicate effects. The PIN/decision cookbook then tells contributors where and how to add the next check.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Test layers | Extend the existing database contract and Worker HTTP smoke scripts | These are the cheapest existing seams that exercise the database and public boundary. | Test plan / Research |
| Race oracle | Accept either winner; require one stored outcome/time and its matching single scope effect | Lock order determines the winner, while the invariant is deterministic. | Research / Plan |
| Retry behavior | Opposite-outcome retry returns the recorded result after valid link and PIN | Current RPCs check stored decisions before freshness and new outcome. | Research |
| PIN budget | Test distinct wrong PINs and a local 429 on a fresh token | A decided-target retry cannot prove guessing resistance; local harness cannot prove a global limit. | Research / Plan |
| Documentation | Fill §6.1 after tests ship | The cookbook must describe actual reference checks. | Test plan |

## Scope

**In scope:** Same-target race, stale and opposite retries, distinct wrong PINs, revoked/foreign link and target isolation, persisted-state assertions, and §6.1 cookbook guidance.

**Out of scope:** Production behavior changes, database migrations, distributed-rate-limit claims, browser e2e, pricing/reason-rendering checks, and CI YAML.

## Architecture / Approach

Contract tests call the current decision RPCs against local Supabase and inspect stored rows and scope revisions. HTTP smoke tests send requests through the Worker decision route using isolated tokens, then inspect the persisted state. Existing CI already runs both scripts.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database decision invariants | Opposite retry, stale pending request, and coordinated same-target race assertions | Duplicate or conflicting decision effects |
| 2. Public PIN and link abuse checks | Wrong-PIN limit and isolation checks through HTTP | Unauthorized decision or disclosure |
| 3. Cookbook and full verification | §6.1 reference pattern and project checks | Tests are hard to repeat or regress |

**Prerequisites:** Local Supabase and Worker harness credentials used by the existing scripts; run Supabase CLI outside the sandbox per `context/foundation/lessons.md`.  
**Estimated effort:** About 2–3 focused implementation sessions across three phases.

## Open Risks & Assumptions

- The Cloudflare binding is location-scoped per the archived design; this plan verifies the local route budget and does not claim a global attempt cap.
- The race winner depends on scheduling. The test must coordinate overlapping requests and assert the persisted invariant for whichever outcome wins.
- If a test exposes a production defect, the correction needs its own scoped review before this phase can be marked complete.

## Success Criteria (Summary)

- Opposing decisions on the same target leave one recorded decision and one matching scope effect.
- Wrong PINs, revoked/foreign links, and throttled requests cannot change or reveal another offer through the public boundary.
- The existing scripts pass and §6.1 describes the shipped test pattern and commands.
