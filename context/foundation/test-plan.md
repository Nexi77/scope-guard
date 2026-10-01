# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-29

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic visual diff that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in what the contractor fears breaking carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what could fail* and *why we believe it's likely* — drawn from documents, interview, and codebase *signal* (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `scripts/`, `supabase/migrations/` (14 scoped commits/30d; changed-file appearances: migrations 26, offer components 21, API routes 20, scripts 20). Excluded docs, fixtures, archive, vendored and build output.

## 2. Risk Map

Risks are user or business failures, ordered by impact × likelihood. Sources are evidence that raised a risk, not claims about where a defect lives.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
| --- | --- | --- | --- | --- |
| 1 | PIN guessing or shared-link abuse permits an unauthorized decision or reveals another customer's offer. | High | High | Interview Q1, Q4; PRD Access Control and Non-Functional Requirements; roadmap S-05–S-06 |
| 2 | Concurrent, stale, or repeated decisions produce duplicate effects or an invalid offer status. | High | High | Interview Q2, Q4; PRD Non-Functional Requirements and FR-007; archived decision slice |
| 3 | A pending or rejected change enters active scope, price, or deadline, or enables the wrong contractor action. | High | High | Interview Q1, Q4; PRD Business Logic and FR-004–FR-005; hot-spot dir `src/components/offers/` (21 changed-file appearances/30d) |
| 4 | A rejection reason is lost, exposed to the wrong viewer, or rendered as executable content. | High | Medium | Interview Q1–Q2, Q4; PRD US-01 and Access Control; archived history slice |
| 5 | The create, share, decide, then change or copy journey fails across boundaries although isolated checks pass. | High | Medium | Interview Q4; PRD Success Criteria and FR-001–FR-008; roadmap S-01–S-07 |
| 6 | Itemized totals or change effects differ from the agreed offer after approval. | High | Medium | PRD FR-009 and Business Logic; archived structured-offer and change slices |

Impact is **High** for unauthorized access, unsafe content, wrong decisions, or incorrect agreed terms; **Medium** for a degraded flow with a workaround; **Low** for cosmetic defects. Likelihood is **High** for repeatedly changed or previously troublesome behavior, **Medium** for occasionally changed behavior, and **Low** for stable behavior. Protect High × High first. Cloud outages belong to operational monitoring, not a padded test row.

### Risk Response Guidance

These are hypotheses for `/10x-research` to verify against current behavior, not code anchors.

| Risk | What would prove protection | Must challenge | Context research must ground | Likely cheapest layer | Anti-pattern to avoid |
| --- | --- | --- | --- | --- | --- |
| #1 | Wrong PINs are bounded; revoked or foreign links disclose nothing and cannot decide. | A 429 in one process proves a distributed limit. | Public request boundary, limit state, token scope, PIN failure responses. | Contract + HTTP integration | Testing only one invalid PIN. |
| #2 | Retries are idempotent; racing or stale opposite decisions preserve one valid outcome. | A final 200 proves no duplicate side effect. | Persisted state, locking, revision and idempotency rules. | Database contract + HTTP integration | Serial happy-path requests only. |
| #3 | Pending/rejected effects stay out of active terms and contractor actions match the decided state. | Correct status text implies correct actions and totals. | Effective-state projection, action eligibility, offer transitions. | Contract + focused journey | Assertions copied from current implementation. |
| #4 | Hostile reason text remains inert and the intended contractor sees the exact safe explanation. | Escaped storage implies safe rendering everywhere. | Input validation, storage, output rendering, access paths. | Integration + rendered-page check | A string-only test with no render boundary. |
| #5 | A seeded contractor completes both accepted-change and rejected-copy branches from creation through sharing. | Passing endpoint tests proves navigation and session continuity. | Auth/session shape, fixtures, critical pages, external boundaries. | Focused e2e | A broad click-through with weak business assertions. |
| #6 | Totals and accepted effects match PRD rounding and active-scope rules. | Current calculated output is the correct oracle. | Price units, rounding, revision state, persisted effects. | Database contract + unit | Deriving expectations from production logic. |

## 3. Phased Rollout

Each phase opens one change folder. Only Status and Change folder advance here; the response intent above guides research and planning.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Decision abuse and state safety | Prove PIN boundaries, isolation, retries, and racing decisions preserve one valid outcome. | #1, #2 | contract + HTTP integration | complete | testing-decision-abuse-and-state-safety |
| 2 | Active terms and safe reasons | Prove decisions affect active terms and actions correctly, while rejection text stays safe. | #3, #4, #6 | unit + contract + rendered-page integration | complete | testing-active-terms-and-safe-reasons |
| 3 | Critical offer journey | Prove the contractor and customer can complete accepted-change and rejected-copy branches. | #3, #4, #5, #6 | focused e2e | complete | testing-critical-offer-journey |
| 4 | Quality gates and selective review | Enforce shipped checks in CI and inspect the two critical decision-result screens where human judgment adds signal. | #1–#6 | CI gates + selective AI-assisted visual review | implementing | testing-quality-gates-and-selective-review |

Status vocabulary: `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

Test base: **sparse** — one Node test file and two substantial contract/smoke scripts; no dedicated unit or e2e runner config. The scripts already cover parts of the risks, so each phase must first identify the missing signal. CI currently runs lint, Astro check, build, local Supabase contract, and Worker smoke checks.

| Layer | Tool | Version | Notes |
| --- | --- | --- | --- |
| Existing unit | Node test runner; checked: 2026-09-29 | CI Node 22 | One estimator test file; not currently a CI step. |
| Existing database/API | Supabase CLI and project scripts; checked: 2026-09-29 | manifest `^2.23.4` | Local contract and Worker smoke scripts run in CI. |
| Proposed e2e | Playwright; checked: 2026-09-29 | none yet — see Phase 3 | Use one bounded business journey; Astro lists it as a supported option. |
| AI-native review | Browser-assisted visual review; checked: 2026-09-29 | session capability | Limit to customer decision and contractor result screens. **When NOT to use:** deterministic assertions or screenshots already show the defect. |

**Stack grounding tools (current session):**
- Docs: Astro/Supabase/Node docs MCP not available in current session; official [Astro testing](https://docs.astro.build/en/guides/testing/) and [Supabase testing](https://supabase.com/docs/guides/local-development/cli/testing-and-linting) pages checked through web search; checked: 2026-09-29.
- Search: web search available; used to find official guidance, not code anchors; checked: 2026-09-29.
- Runtime/browser: computer-use browser available; Playwright MCP not available in current session; no browser run used for this strategy; checked: 2026-09-29.
- Provider/platform: GitHub connector available; not used because local CI file provides gate evidence. Cloudflare and Supabase provider MCPs not available in current session; checked: 2026-09-29.

## 5. Quality Gates

Each required gate is either wired today or assigned to Phase 4. Phase 3 creates the critical e2e signal; Phase 4 enforces it.

| Gate | Where | Required? | Catches |
| --- | --- | --- | --- |
| Lint and Astro typecheck | local + CI | required now; wired | Static and type drift. |
| Local Supabase contract and Worker smoke | CI | required now; wired | Data and HTTP behavior. |
| Unit and integration regression checks from Phases 1–2 | local + CI | required after §3 Phase 4 | Decision and pricing regressions. |
| Critical journey e2e | CI on PR | required after §3 Phase 4 | Broken cross-page offer and decision flows. |
| Selective AI-assisted visual review | local review | recommended after §3 Phase 4 | Decision clarity or layout issues on two critical screens. |

## 6. Cookbook Patterns

These become concrete locations, naming rules, reference tests, and run commands as phases ship.

### 6.1 PIN and decision contract

Reference checks live in `scripts/offer-contract.mjs` and `scripts/smoke.mjs`. The database contract covers service-only decision access and revoked links; a stale still-pending target remains undecided; an opposing accept/reject race records one winner and applies its scope effect once; and opposite-outcome retries of accepted base and change decisions return the original result without repeating effects. These checks are grouped around the `stale pending decision`, `opposing decision race`, `opposite base retry`, and `opposite change retry` fixtures. The Worker smoke checks exercise six distinct wrong PINs on a fresh offer token, verify the offer remains pending and the next valid attempt is throttled, then check generic failures for revoked links and cross-offer targets across two contractors.

For abuse coverage, create a per-run isolated offer and share token, generate its PIN through the contractor PIN route, and read the pending target and revisions through the shared-offer read. Keep foreign-link cases on a separately authenticated contractor's offer with its own PIN. Wrong-PIN guesses must be distinct six-digit values and exclude the actual PIN; do not spend attempts on a token used by later happy-path checks. The smoke fixture seeds its isolated offer through the authenticated `create_offer_with_customer` RPC and then uses the HTTP route for PIN generation and decision requests.

Run `npm run offer-contract` and `SMOKE_TRANSPORT=harness npm run smoke` with local Supabase credentials. The public decision route uses the Cloudflare `DECISION_LIMITER` binding keyed by share token; the smoke assertion demonstrates the configured local Worker behavior for that fixture. Treat it as a per-binding, per-token throttle check, not proof of a globally coordinated or distributed rate limit.

### 6.2 Active offer and pricing rules

Reference unit checks live in `scripts/offer-items.test.ts` and `scripts/offer-change-estimator.test.ts`. Use literal PRD-derived expectations: quantities 0.004/0.005/0.006 at 100 grosz round to 0/1/1; two half-grosz lines total 2. A change from 0.499 to 0.500 at 101 grosz has delta 1 because the rounded lines are 50 and 51. Do not generate expected amounts by calling the production helper or duplicating its arithmetic.

`scripts/offer-contract.mjs` extends `verifyCurrentReads` with independent expected active deadline and scope revision. Its pending/superseded/rejected sequence uses a nonzero proposed deadline effect, which must remain inactive. The isolated fractional lifecycle starts at 2 grosz, remains 2 while pending, becomes 3 after acceptance, and stays 3 after a later rejection. Invalid price reconciliation must leave no proposal or active-state mutation. `scripts/smoke.mjs` checks rejected/agreed action availability and snapshots owner-visible offer, item, and revision state around forbidden edit requests. Read items through an authenticated owner; service-role fixture access does not grant item-table SELECT.

Run `npm run offer-items`, `npm run offer-change-estimator`, and `npm run offer-contract`; run `SMOKE_TRANSPORT=harness npm run smoke` against local Supabase for action/API checks. Keep monetary units in grosz, assert persisted effects rather than HTTP status alone, and clean up isolated fixtures. The browser regression in `tests/e2e/active-terms.spec.ts` additionally checks agreed terms and actions after reload.

### 6.3 Safe rejection reasons

`scripts/smoke.mjs` contains isolated base/change rejection-comment boundary fixtures. Blank/whitespace, non-string, and 1001-character comments must return 400 without changing the pending target or recording a decision; exactly 1000 characters after trimming must survive persistence. Check the owning contractor's positive read before asserting that foreign detail/history routes return 404 and anonymous routes redirect without revealing the unique reason marker. Keep each target on its own share token, and verify cleanup of customer, offer, items, revisions, changes, and decisions.

`tests/e2e/safe-reasons.spec.ts` is the real-DOM reference for hostile text. It submits script/event syntax, quotes, ampersands, a newline, and Polish text through the actual decision API, then compares exact trimmed database content with `textContent` on base detail, base history, and change history after reload. Install an execution sentinel before navigation; assert that it remains unchanged and that payload-created elements/attributes are absent. Do not replace this with an escaped-string or HTML-substring assertion. `OfferFixture.decide` accepts a reason while preserving its existing default; owner reads use real local authentication and its `finally` cleanup verifies no fixture residue.

Run `SMOKE_TRANSPORT=harness npm run smoke` with local Supabase credentials, then `npm run e2e` for browser assertions. For a focused run, use `npm run e2e -- tests/e2e/safe-reasons.spec.ts`. This is rendered-page integration for risk #4; the full create/share/decide/change-or-copy journey remains rollout Phase 3.

### 6.4 Critical offer journey

`tests/e2e/accepted-change-journey.spec.ts` drives UI creation, PIN generation/sharing, anonymous base acceptance, change preview/publication, and anonymous change acceptance. Its literal oracle starts with quantity 1 at 100.00 PLN and deadline 2099-01-15; quantity 2 previews +100.00 PLN with target 2099-01-22. Both reloaded views stay at the original terms while pending, then show 200.00 PLN/quantity 2/new deadline after approval. History retains the original accepted version and accepted proposal effects.

`tests/e2e/rejected-copy-journey.spec.ts` independently creates and anonymously rejects an offer through UI, checks its reason, and opens the copy action. Assert every hydrated prefill before changing the rate from 100.00 to 150.00 PLN. The new pending proposal has independent offer/share/item/revision identity and null decision/comment/time. Reloaded original views and full owner-readable offer/item/revision snapshots retain the rejected 100.00 PLN source and its history. Authenticated reads corroborate state; they do not perform journey actions.

Use the seed's accessible locators and hydration wait, an explicitly anonymous customer context, and a unique annotated fixture token. `OfferFixture.cleanup` removes all offers for that exact customer, including the copy, and asserts zero residue in all six domain tables; nested `finally` preserves cleanup even if context closure fails. Never mock internal auth/API/database boundaries or generate expectations from production pricing helpers.

PIN generation output is captured privately and immediately cleared by reload. Both journey specs and auth setup disable trace/screenshot/video. Playwright's ordinary `fill` retains the value in HTML step titles even with tracing off: `tests/e2e/private-input.ts` enters PINs and setup credentials with native input events through an accessible locator, without value-bearing titles. Do not log private values or assert them with value-bearing diagnostics. Inspect retained reports privately when changing this helper.

Run `npm run e2e -- tests/e2e/accepted-change-journey.spec.ts` or `npm run e2e -- tests/e2e/rejected-copy-journey.spec.ts`; full suite: `npm run e2e`. Require local Docker/Supabase and ignored credentials as documented in `test-stack.md`. Stop exploration previews and use a free `E2E_PORT` so webServer rebuilds current code. Deliberate regressions were caught on post-approval 200.00 PLN and copied scope prefill; production was restored and all seven setup/browser tests passed. Keep CI enforcement and selective visual review assigned to Phase 4.

### 6.5 New API endpoints and gates

TBD — see §3 Phase 4 for the cheapest API pattern, CI command, and selective review rule.

## 7. What We Deliberately Don't Test

- Low-risk screens such as the offer list get only checks needed to support the critical journey; do not build broad UI snapshot coverage. Re-evaluate if a new business rule makes a screen critical. (Interview Q5.)
- Generated or decorative UI changes receive no dedicated tests without a user-visible failure scenario. Re-evaluate when they affect a decision or access boundary. (Interview Q5; cost × signal.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-29
- Stack versions last verified: 2026-09-29
- AI-native tool references last verified: 2026-09-29

Refresh (`/10x-test-plan --refresh`) when a new top-three risk surfaces, a tool's `checked:` date is older than three months, the stack changes, or §7 no longer matches the team's intent.
