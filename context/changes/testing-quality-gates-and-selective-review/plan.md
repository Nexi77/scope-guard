# Quality gates and selective review Implementation Plan

## Overview

Complete test rollout Phase 4 by wiring shipped tests into CI and reviewing two decision screens where visual judgment adds signal. The user approved MEDIUM complexity, zero additional substantive questions, and this two-phase structure in chat after the native question UI failed to appear. Continue the previously chosen delegated implementation mode.

## Current State Analysis

CI runs lint, Astro check, build, local database contract and Worker smoke. Unit suites and Playwright are absent. Browser fixtures require both ignored environment files and a local authenticated contractor; retry traces can retain API secrets. Existing E2E already verifies business outcomes, so this phase adds enforcement and bounded review rather than new journeys.

## Desired End State

The existing workflow runs the two unit suites and full browser suite against disposable local Supabase without cloud credentials or secret-bearing diagnostic uploads. A documented phone/desktop review of customer and contractor decision views supplies four safe screenshots and concrete observations. Cookbook 6.5 explains the cheapest route/transaction testing pattern and when selective review helps.

### Key Discoveries:

- `.github/workflows/ci.yml:39` already owns a disposable backend suitable for browser verification.
- `tests/e2e/offer-fixture.ts:42` reads `.dev.vars`; `.env` alone is insufficient.
- `playwright.config.ts:28` enables inherited retry traces containing private API setup data.
- `src/pages/shared/[token].astro:179` and `src/pages/offers/[offerId].astro:94` are the bounded review targets.

## What We're NOT Doing

Cloud registration changes, database permission changes, new business tests, UI redesign, screenshot baselines, broad browser matrices, or publishing/pushing without separate authorization. Local verification does not establish a remote Ubuntu/GitHub green run.

## Implementation Approach

Extend existing jobs and commands. Provision a dedicated confirmed contractor on local Supabase, capture backend command output privately, and avoid private browser diagnostics in CI. Verify locally with CI settings while preserving developer environment bytes. Then inspect the two live views with synthetic fixtures and record four curated screenshots, keyboard/error observations and any concrete findings. Keep phase checkpoints and separate commits.

## Critical Implementation Details

### Private local setup

Use legacy SERVICE_ROLE_KEY for the application's decision client, while admin provisioning can use SECRET_KEY with legacy fallback. Validate loopback before provisioning. Generated files must not silently replace existing developer configuration; verification must restore any temporary configuration and delete its dedicated user even after failures. Startup/status output, passwords, PINs and auth state must not enter logs or artifacts.

### Verification boundary

Use fresh preview builds with CI=true to exercise one-worker/retry settings. Local macOS gates validate commands and environment behavior; Ubuntu browser installation and GitHub orchestration remain evidence to collect after authorized publication, never an inferred pass.

## Phase 1: CI test enforcement

### Overview

Wire missing unit and browser gates without duplicating backend infrastructure or requiring cloud secrets.

### Changes Required:

#### 1. Workflow

**File:** `.github/workflows/ci.yml`

**Intent:** Run shipped unit suites in the static job and full Chromium E2E in the existing local-backend job after contract/smoke.

**Contract:** Retain push/pull_request triggers and existing required checks. Install lockfile Playwright Chromium with OS dependencies; use disposable local credentials. Capture Supabase startup failures without raw secret output, remove unnecessary cloud-secret build injections, and retain failure-safe teardown of backend and generated private files. Do not upload unreviewed browser artifacts.

#### 2. Local CI provisioning

**File:** `scripts/ci-e2e-env.mjs` (or an equivalently focused script).

**Intent:** Prepare a dedicated confirmed local test user and matching application/E2E configuration reproducibly, then clean up owned resources.

**Contract:** Capture local backend status internally, validate loopback URL, generate a random password, use existing admin createUser pattern, and write private `.env`/`.dev.vars` with restricted permissions. E2E credentials belong in `.env`; app service-role key stays server-only. Refuse accidental overwrites of existing configuration and provide explicit owned cleanup without deleting unrelated users/files. Errors omit sensitive SDK/command bodies.

#### 3. CI diagnostic privacy

**File:** `playwright.config.ts`

**Intent:** Prevent all CI specs, including API fixtures, from retaining secret-bearing traces or reports.

**Contract:** CI disables trace/screenshot/video and uses list reporting without automatic private artifacts. Preserve existing local defaults, setup project, base URL, browser project and cold webServer behavior.

### Success Criteria:

#### Automated Verification:

- Unit suites pass: `npm run offer-items` and `npm run offer-change-estimator`.
- Provisioning proves loopback enforcement, overwrite refusal, dedicated-user cleanup and byte-preservation of existing local environment files.
- Static checks pass: `npm run lint` and `npm run astro -- check`.
- Existing local backend checks pass: `npm run offer-contract` and `SMOKE_TRANSPORT=harness npm run smoke`.
- Full browser suite passes with CI settings and a fresh build: `CI=true npm run e2e`.
- Workflow inspection maps all required commands to PR jobs; CI configuration retains no trace/screenshot/video/HTML artifacts, and local verification records its remote-run limitation.

#### Manual Verification:

None required for configuration behavior. Review the local evidence and commit at the phase checkpoint; a real GitHub run is subsequent publication verification and must be reported separately.

## Phase 2: Selective decision review and cookbook

### Overview

Review decision clarity at phone and desktop sizes, then document the shipped gate and API patterns.

### Changes Required:

#### 1. Review evidence

**File:** `context/changes/testing-quality-gates-and-selective-review/review.md` and four curated PNGs in a sibling review-assets directory.

**Intent:** Inspect visual hierarchy, wrapping, keyboard focus and actionable next steps beyond existing deterministic functional checks.

**Contract:** Use local synthetic fixtures and 390×844/1440×900 viewports. Customer pending-change view distinguishes current 100.00 PLN/Jan15 from proposed +100.00 PLN/+7 days; capture the rejection confirmation with a harmless reason and empty PIN. Contractor rejected-offer result shows a benign multiline Polish reason and copy/history actions. Record theme/build/scenario, actual observations, intentional item-table scrolling versus whole-page overflow, and empty-submit/focus behavior. Keep generated PINs/credentials outside captures. Significant UI defects require a separately scoped change rather than redesign here.

#### 2. Cookbook and rollout closeout

**File:** `context/foundation/test-plan.md`

**Intent:** Fill cookbook 6.5 with shipped CI commands, cheapest API regression patterns and the selective review rule; mark rollout Phase 4 complete after verification and user review.

**Contract:** Preserve frozen strategy/risk/gate definitions. HTTP route checks extend smoke with persisted success and failure/non-disclosure/non-mutation; transaction invariants extend offer-contract; browser work is reserved for meaningful rendering/navigation boundaries. Explain reviewed screen scope, privacy and remote CI evidence limitations.

### Success Criteria:

#### Automated Verification:

- Four safe review screenshots and review.md identify the two routes, two viewports, scenario/theme/build, concrete observations and keyboard/error checks.
- Synthetic review fixtures are removed with asserted zero residue in the six domain tables.
- Cookbook 6.5 names verified CI commands, HTTP/transaction examples, review scope and privacy rules; rollout status becomes complete after user review.

#### Manual Verification:

- User reviews the curated customer and contractor screenshots and confirms the documented clarity assessment or records required follow-up findings.

## Testing Strategy

### Unit Tests:

Run the existing independent pricing suites; do not create tests that mirror provisioning implementation.

### Integration Tests:

Exercise real local provisioning/cleanup, contract, smoke and full E2E with CI settings. Check rejected setup without mutating developer configuration. Inspect workflow and resolved diagnostic settings instead of assuming local green means remote green.

### Manual Testing Steps:

Review the four curated screenshots alongside concrete observations; confirm clarity or identify follow-up work. Keyboard and error-path inspection stays on the same two routes.

## Performance Considerations

Reuse one local backend job; install Chromium only. Do not introduce browser caches, sharding, baseline suites or another backend without evidence of need.

## Migration Notes

No product-data/schema migration. CI user/configuration is disposable; local verification restores developer configuration and removes its dedicated user.

## References

- `context/changes/testing-quality-gates-and-selective-review/research.md`
- `context/foundation/test-plan.md` — Phase 4 and cookbook 6.5.
- `context/foundation/test-stack.md` — existing Playwright/local backend setup.

## Progress

### Phase 1: CI test enforcement

#### Automated

- [x] 1.1 Unit suites pass: `npm run offer-items` and `npm run offer-change-estimator`. — fdd1792
- [x] 1.2 Provisioning proves loopback enforcement, overwrite refusal, dedicated-user cleanup and byte-preservation of existing local environment files. — fdd1792
- [x] 1.3 Static checks pass: `npm run lint` and `npm run astro -- check`. — fdd1792
- [x] 1.4 Existing local backend checks pass: `npm run offer-contract` and `SMOKE_TRANSPORT=harness npm run smoke`. — fdd1792
- [x] 1.5 Full browser suite passes with CI settings and a fresh build: `CI=true npm run e2e`. — fdd1792
- [x] 1.6 Workflow inspection maps all required commands to PR jobs; CI configuration retains no trace/screenshot/video/HTML artifacts, and local verification records its remote-run limitation. — fdd1792

### Phase 2: Selective decision review and cookbook

#### Automated

- [x] 2.1 Four safe review screenshots and review.md identify the two routes, two viewports, scenario/theme/build, concrete observations and keyboard/error checks.
- [x] 2.2 Synthetic review fixtures are removed with asserted zero residue in the six domain tables.
- [x] 2.3 Cookbook 6.5 names verified CI commands, HTTP/transaction examples, review scope and privacy rules; rollout status becomes complete after user review.

#### Manual

- [x] 2.4 User reviews the curated customer and contractor screenshots and confirms the documented clarity assessment or records required follow-up findings.
