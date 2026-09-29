---
date: 2026-09-29T00:06:45+02:00
researcher: Codex
git_commit: f1b4063eabe215959a1f9b898fdb4e8ede676917
branch: master
repository: ScopeGuard
topic: "Decision abuse and state safety tests"
tags: [research, codebase, shared-offer, decisions, testing]
status: complete
last_updated: 2026-09-29
last_updated_by: Codex
---

# Research: Decision abuse and state safety tests

**Date**: 2026-09-29T00:06:45+02:00  
**Researcher**: Codex  
**Git Commit**: `f1b4063eabe215959a1f9b898fdb4e8ede676917`  
**Branch**: `master`  
**Repository**: ScopeGuard

## Research Question

For Phase 1 of the test rollout, what do the current public decision boundary and database rules guarantee about shared-link access, PIN attempts, retries, stale requests, and racing decisions, and which signals are missing from the existing tests? The change brief and risk response define the scope ([change.md:10-20](change.md), [test-plan.md:40-43](../../foundation/test-plan.md)).

## Summary

The public POST endpoint validates origin, token shape, body size, request schema, and PIN shape before a token-keyed Worker limit; an accepted request calls a service-role decision RPC. The configured limit is six calls per 60 seconds per token. Current source and the local Worker smoke test establish this route behavior, but neither proves one global attempt budget across deployed Cloudflare locations ([decision.ts:48-110](../../../src/pages/api/shared/%5Btoken%5D/decision.ts), [wrangler.jsonc:19-24](../../../wrangler.jsonc), [smoke.mjs:1898-1972](../../../scripts/smoke.mjs)).

The database decision functions lock the matching offer, check its unrevoked token and PIN, and lock an offer-scoped target. A previously decided target returns its stored outcome and timestamp before revision comparison, including when the new request asks for the opposite outcome. A new decision requires matching displayed revisions and a pending target. For an accepted change, the function creates a decision and increments active scope once; a uniqueness constraint guards the decision row ([guard_customer_decisions.sql:11-34](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [guard_customer_decisions.sql:47-71](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [minimal_offer_record_contract.sql:63-79](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)).

Existing contract and HTTP checks cover serial same-outcome retries, several stale/invalid cases, one wrong PIN, and one local 429. Within the inspected scripts, they do not exercise two opposing decisions against the same target at the same time, an opposite-outcome retry, or a series of distinct PIN guesses. The current lock test dispatches commands against different offers; the 429 check retries an already rejected request ([offer-contract.mjs:692-703](../../../scripts/offer-contract.mjs), [offer-contract.mjs:1013-1033](../../../scripts/offer-contract.mjs), [offer-contract.mjs:2149-2195](../../../scripts/offer-contract.mjs), [smoke.mjs:1898-1972](../../../scripts/smoke.mjs)).

## Detailed Findings

### Public access and request boundary

- Shared routes are outside the middleware's contractor-route protection; this inspected middleware protects `/dashboard` and `/offers`, while the decision endpoint is under `/api/shared` ([middleware.ts:4-24](../../../src/middleware.ts), [decision.ts:48-52](../../../src/pages/api/shared/%5Btoken%5D/decision.ts)). The shared read uses an anonymous RPC, while the decision route creates a server-side decision client ([shared-offer-view.ts:59-70](../../../src/lib/shared-offer-view.ts), [decision.ts:97-121](../../../src/pages/api/shared/%5Btoken%5D/decision.ts)).
- At this POST boundary, wrong Origin yields 403, malformed token 404, oversized body 413, and invalid JSON/schema or non-six-digit PIN 400 before the limiter. Missing/failed limiter or service client yields 503; limiter denial yields 429. The route maps database `PT409` to 409 and other RPC errors to a generic 400 ([decision.ts:48-138](../../../src/pages/api/shared/%5Btoken%5D/decision.ts)). Thus those pre-limit invalid requests do not consume this endpoint's configured token budget.
- The binding uses the share token as its key and is configured for six calls per 60 seconds ([decision.ts:91-109](../../../src/pages/api/shared/%5Btoken%5D/decision.ts), [wrangler.jsonc:19-24](../../../wrangler.jsonc)). The archived decision plan calls the binding location-scoped, and the present smoke assertion reaches 429 in a local Worker harness; this is evidence of a local brake, not a verified distributed/global cap ([archived decision plan:28-34](../../archive/2026-09-28-decide-change-by-pin/plan.md), [archived decision plan:210-212](../../archive/2026-09-28-decide-change-by-pin/plan.md), [smoke.mjs:1938-1972](../../../scripts/smoke.mjs)). Deployment binding/state was not inspected live.
- The current shared-read RPC returns null for an unknown or revoked token and builds an allowlisted customer projection from the matching offer ([customer_safe_shared_projection.sql:14-48](../../../supabase/migrations/20261009000000_customer_safe_shared_projection.sql)). The HTTP smoke script checks matching 404 behavior for malformed, unknown, and revoked links and reads a separate valid offer by its own token ([smoke.mjs:839-873](../../../scripts/smoke.mjs)).

### Persisted decisions and concurrency

- Each current decision RPC first locks the offer selected by the active share token, verifies the bcrypt PIN, then locks a target constrained by that offer's ID ([guard_customer_decisions.sql:11-17](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [guard_customer_decisions.sql:47-53](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql)). Direct `anon` and `authenticated` execution of those RPCs is revoked; `service_role` is granted execution ([guard_customer_decisions.sql:74-79](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql)).
- If the target already has a decision, either RPC returns the stored outcome/time before comparing the submitted outcome or expected revisions. Therefore, after a valid token and PIN reach the RPC, an opposite-outcome retry is expected to return the first persisted decision rather than a conflict. A request for a still-pending target with stale base or active-scope revision raises `PT409` ([guard_customer_decisions.sql:18-28](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [guard_customer_decisions.sql:54-64](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql)).
- For a new change decision, the accepted branch inserts one decision row, marks the change accepted, assigns activation order, and increments `active_scope_revision` by one; the rejected branch stores a decision without that increment. The table's `unique (offer_change_id)` is an additional row-level guard ([guard_customer_decisions.sql:65-71](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [minimal_offer_record_contract.sql:63-79](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). The offer row lock makes same-offer decisions serialize in the database, but the current tests do not directly show the result of simultaneous opposing submissions.
- PIN reset and share revoke/rotation also lock the offer row before changing the credential or token, so those writes and a decision take a serialized order in the inspected SQL paths ([manage_offer_pin.sql:19-39](../../../supabase/migrations/20260923010000_manage_offer_pin.sql), [shared_offer_access.sql:18-41](../../../supabase/migrations/20261006000000_shared_offer_access.sql), [guard_customer_decisions.sql:11-16](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql)).

### Current test signal and planning seam

- `npm run offer-contract` uses direct Supabase clients/RPCs, while `npm run smoke` uses an HTTP Worker harness. CI runs both against local Supabase after lint, Astro check, and build ([offer-contract.mjs:6-21](../../../scripts/offer-contract.mjs), [smoke.mjs:16-31](../../../scripts/smoke.mjs), [ci.yml:18-25](../../../.github/workflows/ci.yml), [ci.yml:38-59](../../../.github/workflows/ci.yml)).
- Contract checks already cover direct anonymous decision-RPC denial, serial base/change retries and preserved timestamp, a single decision row, unchanged scope after accepted retry, stale decisions, and held-offer-lock blocking ([offer-contract.mjs:625-703](../../../scripts/offer-contract.mjs), [offer-contract.mjs:1000-1033](../../../scripts/offer-contract.mjs), [offer-contract.mjs:1831-1857](../../../scripts/offer-contract.mjs), [offer-contract.mjs:2149-2195](../../../scripts/offer-contract.mjs)). The helper reads fresh shared revisions before each call, overriding explicit expected revisions when that read succeeds; a deliberate stale-revision check needs a direct RPC call or a helper variant ([offer-contract.mjs:44-58](../../../scripts/offer-contract.mjs)).
- HTTP smoke checks wrong Origin, oversized/invalid bodies, one wrong PIN, stale 409, successful decision, revoked/foreign shared reads, serial rejected retry, and a later local 429 ([smoke.mjs:839-873](../../../scripts/smoke.mjs), [smoke.mjs:1481-1565](../../../scripts/smoke.mjs), [smoke.mjs:1898-1972](../../../scripts/smoke.mjs)). The local 429 follows repeated submissions for a decided target, so it does not establish how distinct wrong PIN attempts are bounded or whether a throttled request leaves persisted state unchanged.
- The smallest Phase 1 test additions implied by these gaps are a database contract race on one pending target with opposite outcomes and persisted row/scope/timestamp assertions, plus HTTP integration checks for a sequence of wrong PIN attempts, isolation, and throttling at the public route. This is a planning implication from the existing test seams, not a claim that the implementation already passes those cases ([offer-contract.mjs:44-58](../../../scripts/offer-contract.mjs), [offer-contract.mjs:2149-2195](../../../scripts/offer-contract.mjs), [smoke.mjs:1898-1972](../../../scripts/smoke.mjs)).

## Architecture Insights

The HTTP route provides request validation and a per-token Worker limit; the database owns authorization, target binding, revision checks, and the final serialized write. HTTP 200 on a retry describes the recorded decision, which can differ from the outcome newly requested ([decision.ts:110-138](../../../src/pages/api/shared/%5Btoken%5D/decision.ts), [guard_customer_decisions.sql:18-28](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [guard_customer_decisions.sql:54-71](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql)).

## Historical Context

- **Supported:** The archived decision plan says existing decisions return the recorded result before freshness rejection and calls for opposite-retry checks; current SQL follows that ordering, while inspected tests cover same-outcome serial retries only ([archived decision plan:28-34](../../archive/2026-09-28-decide-change-by-pin/plan.md), [archived decision plan:202-208](../../archive/2026-09-28-decide-change-by-pin/plan.md), [guard_customer_decisions.sql:18-28](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [offer-contract.mjs:692-703](../../../scripts/offer-contract.mjs)).
- **Supported as design intent, unverified in deployment:** The archived plan describes the Worker limiter as location-scoped and a practical MVP brake. Current configuration specifies its threshold, but this research did not inspect live Cloudflare state ([archived decision plan:210-212](../../archive/2026-09-28-decide-change-by-pin/plan.md), [wrangler.jsonc:19-24](../../../wrangler.jsonc)).

## Related Research

Not applicable; this change has no earlier research artifact.

## Open Questions

- Does the deployed Cloudflare binding exist and what attempt budget applies across locations/environments? The repository configuration and local Worker smoke cannot answer that operational question ([wrangler.jsonc:19-24](../../../wrangler.jsonc), [archived decision plan:210-212](../../archive/2026-09-28-decide-change-by-pin/plan.md)). Phase 1 can test the local route contract without claiming a global budget.
- Under simultaneous opposing requests on one pending target, which outcome wins is schedule-dependent; the intended invariant to verify is one stored outcome/time and its corresponding single scope effect ([guard_customer_decisions.sql:47-71](../../../supabase/migrations/20261007000000_guard_customer_decisions.sql), [minimal_offer_record_contract.sql:63-79](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)).
