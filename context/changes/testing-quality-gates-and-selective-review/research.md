---
date: 2026-10-01T21:24:02+02:00
researcher: Codex
git_commit: 003e5f770014d515f79c06ece588c0348413e442
branch: master
repository: ScopeGuard
topic: "Missing CI gates and bounded decision-screen review"
tags: [research, ci, testing, selective-review]
status: complete
last_updated: 2026-10-01
last_updated_by: Codex
---

# Research: Quality gates and selective review

**Date:** 2026-10-01T21:24:02+02:00

**Researcher:** Codex

**Git Commit:** `003e5f770014d515f79c06ece588c0348413e442`

**Branch:** master

**Repository:** ScopeGuard

## Research Question

Which remaining gates and bounded review actions complete rollout Phase 4 without duplicating existing protection or exposing local test credentials?

## Summary

The inspected workflow runs static/build checks and local contract/smoke checks, but not the shipped unit suites or Playwright suite (`.github/workflows/ci.yml:18–25`, `:39–61`; `package.json:14–16`). Extend those existing jobs, provision a dedicated user on disposable local Supabase, and keep private setup/diagnostics out of CI logs. Selective review should examine the customer pending-change decision and contractor rejected-offer result at phone and desktop sizes; existing E2E already proves their business values, so review adds visual hierarchy, readability, focus and decision clarity rather than another arithmetic oracle.

## Detailed Findings

### CI integration and local provisioning

- Add the existing `offer-items` and `offer-change-estimator` commands to the static job; add Chromium installation and full E2E after the existing smoke step, reusing local Supabase (`.github/workflows/ci.yml:10–61`). Official installation guidance supports `npx playwright install --with-deps chromium` ([Playwright CI](https://playwright.dev/docs/ci), checked 2026-10-01).
- Playwright loads `.env` and rejects nonlocal backends; fixture setup separately reads `.dev.vars` (`playwright.config.ts:6–12`; `tests/e2e/offer-fixture.ts:42–49`). The current workflow writes `.env` but not `.dev.vars` (`.github/workflows/ci.yml:49–52`). Provision matching private app files and E2E credentials in `.env`.
- A local-only provisioning helper can capture Supabase status internally, validate loopback URL, create a confirmed dedicated user with a random password, and write environment files without printing secrets. Existing contract provisioning uses admin user creation (`scripts/offer-contract.mjs:330`). Admin access can use `SECRET_KEY ?? SERVICE_ROLE_KEY`; application decision RPCs require the legacy `SERVICE_ROLE_KEY` assigned to server-only `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase.ts:32`). Do not change cloud registration or database permissions.
- Current `supabase start` prints its output directly before status redirection (`.github/workflows/ci.yml:41–42`). Capture startup stdout/stderr privately and provide a sanitized failure. Keep cleanup under `always()`, remove generated credentials/auth state, and stop the disposable backend (`:60–61`). A local verification must preserve existing ignored developer environment files.
- In the inspected API fixture, authentication, PIN setup and decisions carry private data (`tests/e2e/offer-fixture.ts:61–68`, `:102–107`, `:115–135`). Those specs inherit retry tracing (`playwright.config.ts:28`); journey/setup overrides do not cover them. CI diagnostics should disable trace/screenshot/video and use list-only reporting, with no upload of private artifacts. The completed Phase 3 documents ordinary fill-title leakage and its private-input fix (`tests/e2e/private-input.ts:3–6`).
- Keep `pull_request` execution; do not execute contributed code under `pull_request_target`. Local E2E provisioning needs no cloud secrets. Static build fields are optional server secrets (`astro.config.mjs:19–21`), so existing cloud-secret injections can be removed from the build job. This improves fork-PR independence ([GitHub secrets guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)).
- Local macOS verification can establish helper behavior, cold preview, checks and cleanup; it cannot establish Ubuntu system dependency installation or actual GitHub job orchestration. Record that limitation explicitly until a real remote run occurs.

### Bounded selective review

- Review exactly two routes at proposed viewports 390×844 and 1440×900, producing four curated screenshots. These dimensions define the review scope, not a new browser-support contract.
- Customer `/shared/{token}`: accepted base at 100.00 PLN/2099-01-15 with pending +100.00 PLN/+7 days. Inspect separation of current agreement and proposed consequences, accept/reject selection, required reason, confirmation, wrapping, keyboard focus and empty-submit errors (`src/pages/shared/[token].astro:108`, `:179–192`; `src/components/offers/SharedOfferDecisionForm.tsx:192`, `:232–313`). Screenshot the rejection confirmation form with a harmless synthetic reason and empty PIN.
- Contractor `/offers/{id}`: rejected base with a benign multiline Polish reason. Inspect prominence/readability of rejection and reason, copy/history next steps, proposed versus agreed terms, mobile fit and focus (`src/pages/offers/[offerId].astro:94–116`, `:140`). Deliberate table-contained horizontal scrolling exists at `:188`; distinguish that from whole-page overflow.
- API fixtures are suitable for this review because full UI journeys already exist. Use explicit anonymous storage, clear PIN generation output before capture, disable secret-bearing diagnostics, and apply the existing token-scoped nested cleanup (`tests/e2e/accepted-change-journey.spec.ts:48`; `tests/e2e/rejected-copy-journey.spec.ts:245`; `tests/e2e/offer-fixture.ts:164–201`). Capture synthetic data only.
- Record build reference, fixture states, viewport/theme, screenshot links and concrete observations in a short review artifact. Separate actual defects from subjective suggestions. Significant UI work becomes a separately scoped change; do not expand this maintenance phase into redesign or screenshot baselines.

### Cookbook for a new API endpoint

- Prefer existing smoke HTTP integration when the risk lives at the route boundary: owner success plus persisted effect, malformed payload, anonymous denial, foreign-owner non-disclosure, hostile-Origin denial, and unchanged state around rejected mutations. The request/cookie helper and denied-edit snapshot patterns already exist (`scripts/smoke.mjs:61`, `:180`, `:841–857`, `:1178–1204`).
- Use database contract tests for transactional/RPC invariants and cookbook 6.1 for public PIN/token/stale/idempotent decisions. Browser E2E is warranted when navigation/session/rendering adds signal; do not copy the HTTP matrix into the browser. Assert effect/non-mutation and cleanup, not status alone (`scripts/smoke.mjs:258`, `:461`; `context/foundation/test-plan.md:95`).

## Code References

- `.github/workflows/ci.yml:39` — reusable disposable backend job.
- `playwright.config.ts:28` — inherited diagnostic settings.
- `tests/e2e/offer-fixture.ts:42` — second credential-file dependency.
- `src/pages/shared/[token].astro:179` — customer pending proposal.
- `src/pages/offers/[offerId].astro:94` — contractor rejection result.

## Architecture Insights

Reuse existing commands and jobs instead of adding another backend instance or cloud credentials. Keep CI provisioning a local-only test concern. Separate CI enforcement from the bounded visual review so each has independently reviewable evidence.

## Historical Context

Supported: Phase 3 completed both full UI journeys and private-input report protection (`context/changes/testing-critical-offer-journey/plan.md`; `rejected-live-flow.md`). Its privacy fix does not claim to cover API-fixture retry traces; the global configuration still enables those. Phase 4 remains the strategy's enforcement and selective-review step.

## Related Research

`context/changes/testing-critical-offer-journey/research.md` — local fixtures and real UI boundaries.

## Open Questions

No unresolved product choices. Live review remains execution work, and a remote Ubuntu/GitHub run remains verification evidence to obtain after publication is authorized. Static research does not establish visual quality or a remote green CI result.
