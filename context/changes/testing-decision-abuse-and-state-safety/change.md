---
change_id: testing-decision-abuse-and-state-safety
title: Decision abuse and state safety tests
status: implemented
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`.

Risks covered:
- #1 PIN guessing or shared-link abuse permits an unauthorized decision or reveals another customer's offer.
- #2 Concurrent, stale, or repeated decisions produce duplicate effects or an invalid offer status.

Planned test types: database contract and HTTP integration.

Research should verify the actual public request boundary, rate-limit state and deployment scope, token scope, PIN failure responses, persisted decision state, locking, revision, and idempotency rules. Challenge whether a 429 in one process proves a distributed limit. Prove retries are idempotent and racing or stale opposite decisions preserve one valid outcome; do not rely on serial happy-path-only checks.
