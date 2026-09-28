# Decide Offer and Change by PIN Implementation Plan

## Overview

Let a customer approve or reject the current initial offer or a pending change from the shared offer link after reviewing its terms and entering the offer's six-digit PIN. Deliver the decision through a rate-limited server endpoint, retain the database's atomic and idempotent decision record, and stop a decision when the page's offer state has changed since the customer reviewed it.

## Current State Analysis

The shared page displays the current offer and a separate pending proposal but has no customer decision controls (`src/pages/shared/[token].astro:145-176`). Its typed view drops the base revision and change IDs already present in the guarded database projection (`src/lib/shared-offer-view.ts:21-26,96-117`; `supabase/migrations/20261001000000_shared_current_base_revision.sql:1-22`; `supabase/migrations/20260928000000_current_offer_reads.sql:121-149`). The database already validates the PIN, binds decisions to an offer and exact revision/change, records rejection comments and timestamps, and returns a prior decision on retry (`supabase/migrations/20260929000000_revision_decision_conflicts.sql:2-98`). Both decision RPCs are still directly executable by `anon` (`supabase/migrations/20260925000000_offer_change_revisions.sql:516-519`), so a new HTTP-only limit would be bypassable. Current smoke tests call those RPCs directly rather than a customer endpoint (`scripts/smoke.mjs:1237-1275,1461-1484`).

## Desired End State

On the permanent shared link, a customer sees the exact pending base offer or change consequences, chooses accept or reject, supplies the six-digit PIN, and supplies a nonblank comment when rejecting. The customer sees the persisted outcome; a repeated or opposite-outcome submission reports the original decision without changing it. When the displayed offer state changes, an inline status message and accessible toast block submission until the customer refreshes and reviews the new view. A rate-limited public endpoint is the only callable decision path for the customer, and PINs never enter URLs, logs, or rendered HTML.

### Key Discoveries:

- The PRD's US-01 covers the initial offer, while FR-007 and roadmap S-06 cover pending changes; this plan includes both per the product decision (`context/foundation/prd.md:50-61,84-87`; `context/foundation/roadmap.md`, S-06).
- The existing database decision functions serialize changes under an offer lock and return a recorded decision before checking pending state; preserve that order when adding stale-view checks (`supabase/migrations/20260929000000_revision_decision_conflicts.sql:20-41,65-95`).
- An archived security follow-up assigns attempt limiting and removal of direct anonymous decision execution to this slice (`context/archive/2026-09-21-minimal-offer-record-contract/follow-ups/review-fixes.md:7-9`).

## What We're NOT Doing

- Customer accounts, a broader portal, customer-authored changes, notifications, PDF generation, or full offer version comparison.
- Allowing a customer to revise or undo a recorded decision through the shared link.
- Automatically applying a replacement proposal to an old open page.
- Changing the contractor's existing offer, PIN, or link-management flows except where tests must use the new decision boundary.

## Implementation Approach

Keep the existing guarded shared read. Add a narrow public POST endpoint that requires same-origin submission, validates a bounded body, checks a Cloudflare Worker rate-limit binding keyed by the shared offer, and invokes decision RPCs using a separate server-only Supabase service credential. A migration removes `anon`/`authenticated` execute grants on the old decision functions and exposes only service-role decision entrypoints that compare the customer's displayed base/scope revisions under the offer lock. Existing decisions still return the original recorded result before stale-version rejection. The shared page receives only customer-safe target IDs and version fields, displays a review-and-PIN form for the one pending decision, polls on focus and at a modest interval for changes, and handles stale, limited, invalid-PIN, and settled responses without losing the reviewed terms. Cloudflare's Worker binding is location-scoped, so the plan uses a short per-offer limit and records that distributed attempts require a later global control if threat levels rise.

## Critical Implementation Details

The stale comparison belongs inside the locked database decision transaction: a page poll and an endpoint read alone leave a race before the decision write. Check an already-recorded target decision before comparing the displayed version, so an opposite-outcome retry still shows the original result. Revoke direct anonymous RPC execution in the same deployment as the new endpoint; otherwise callers bypass the limiter.

## Phase 1: Secure Decision Endpoint

### Overview

Provide one bounded, rate-limited server path for initial-offer and change decisions while preserving the current database invariants and idempotent outcome.

### Changes Required:

#### 1. Guarded decision contract

**File**: `supabase/migrations/<next>_guard_customer_decisions.sql`

**Intent**: Make the reviewed offer state part of the atomic decision check and close the direct public RPC bypass. Preserve existing decision rows, rejection comments, timestamps, active-scope calculations, and the rule that a decided target returns its original outcome.

**Contract**: Service-role-only decision entrypoints accept share token, exact base revision or change ID, expected base and active-scope revisions, PIN, outcome, and optional rejection comment. Under the offer lock, validate the PIN and target; return any recorded decision before requiring a new rejection comment or comparing versions; otherwise reject a changed displayed revision or a stale/superseded target with a conflict before writing. Extend the guarded shared projection with the current active-scope revision. Revoke `anon` and `authenticated` execute on every old and new decision entrypoint; retain guarded anonymous read access to `get_shared_offer`.

#### 2. Server credentials and rate limit

**Files**: `astro.config.mjs`, `src/lib/supabase.ts`, `wrangler.jsonc`, `src/env.d.ts`

**Intent**: Give only the decision endpoint access to the service-role command and bound repeated PIN guesses before they reach Supabase. Keep all credentials server-only.

**Contract**: Add a distinct server-secret Supabase service credential, never reuse it for cookie-backed contractor or anonymous read clients. Configure a Worker rate-limit binding for at most six decision submissions per shared offer per 60 seconds, returning HTTP 429 when exceeded. Local development and preview must supply an equivalent binding; absent binding or credential fails closed for decisions with a safe 503 response.

#### 3. Public decision API

**File**: `src/pages/api/shared/[token]/decision.ts`

**Intent**: Accept only the customer's reviewed decision, with clear safe responses for malformed input, unavailable offers, stale views, invalid PINs, throttling, and completed decisions.

**Contract**: `POST /api/shared/:token/decision` requires exact same-origin `Origin`, a valid token UUID, a bounded JSON body with target kind/ID, displayed revision values, `accepted` or `rejected`, a six-digit PIN, and a trimmed nonblank rejection comment of at most 1,000 characters when rejected. No PIN may appear in a URL, response, log, analytics event, or HTML. Use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; map stale state to 409, limit to 429, and bad credentials to a generic non-enumerating response. Return the persisted outcome and timestamp, including on a conflicting retry.

#### 4. Database and endpoint verification

**Files**: `scripts/offer-contract.mjs`, `scripts/smoke.mjs`

**Intent**: Prove that the newly exposed boundary cannot be bypassed and does not alter decision history on retries or stale submissions.

**Contract**: Update direct decision fixtures to call the service-role-only contract where appropriate; assert `anon` cannot execute decisions, while guarded reads still work. Cover base and change accept/reject, exact target ownership, wrong and malformed PIN, missing/blank rejection comment, stale or superseded version, revoked link, same- and opposite-outcome retries, one decision row, unchanged active scope after rejection, same-origin enforcement, oversized input, and HTTP 429 without logging secrets.

### Success Criteria:

#### Automated Verification:

- The migration applies locally and `npm run offer-contract` proves service-role-only decisions, stale protection, PIN validation, and idempotent base/change outcomes.
- `npm run smoke` exercises the public decision endpoint's success, conflict, invalid-input, wrong-PIN, and rate-limit responses.
- `npm run lint` and `npm run build` pass with the new route, server secret declaration, and Worker binding.

#### Manual Verification:

- With local Supabase and Worker preview configured, a revoked link and repeated wrong PIN attempts cannot reach a customer decision; no PIN or service credential appears in the browser network response, URL, or application logs.

---

## Phase 2: Customer Review and Stale-View Experience

### Overview

Give the customer a mobile-friendly review-and-decision form for the initial offer and pending changes, and visibly stop decisions from an outdated open page.

### Changes Required:

#### 1. Customer-safe decision target

**File**: `src/lib/shared-offer-view.ts`

**Intent**: Retain only the identities and version values needed to bind a decision to the offer state actually displayed. Keep contractor-only estimate and PIN data outside the shared view.

**Contract**: Validate and expose the current base revision ID, base revision number, active-scope revision, and pending change ID from the guarded projection. An unavailable or malformed projection remains unavailable; never serialize the raw database JSON to the browser.

#### 2. Decision form and status feedback

**Files**: `src/pages/shared/[token].astro`, `src/components/offers/SharedOfferDecisionForm.tsx`

**Intent**: Present the price/deadline consequences immediately above the customer's choice and PIN field. Make rejection comment mandatory, show the recorded outcome and timestamp, and keep settled or nonpending items read-only.

**Contract**: Offer one current decision target: the pending base revision when the initial offer awaits acceptance, otherwise the pending change when present. The form sends only a POST body to the new endpoint, never stores the PIN, and clears it after each response. Success or an idempotent retry renders the persisted result; an opposite-outcome retry does not offer a second decision. Controls and error/status text work on phone and desktop, with keyboard and screen-reader access independent of color.

#### 3. Open-page freshness guard

**Files**: `src/pages/shared/[token].astro`, `src/components/offers/SharedOfferDecisionForm.tsx`, `src/pages/api/shared/[token]/state.ts`

**Intent**: Tell the customer that a page left open no longer represents the current offer and prevent its form from deciding new terms without review.

**Contract**: A no-store, no-referrer, token-scoped customer-safe state check runs when the page regains focus and periodically while open, comparing the displayed base/scope revisions and current target identity. On mismatch, disable submit and show an accessible inline message plus toast with a refresh action; do not silently replace the reviewed figures. A 409 from the decision endpoint triggers the same blocked state even if polling missed the race. After refresh, the customer must review the newly rendered terms before submitting.

#### 4. End-to-end customer and contractor checks

**Files**: `scripts/smoke.mjs`, `scripts/offer-contract.mjs`

**Intent**: Verify that actual customer pages and HTTP actions, rather than direct anonymous RPC calls, complete both approval journeys and leave correct contractor-visible history.

**Contract**: Replace direct anonymous decision smoke steps with the endpoint, check rendered base and change controls plus read-only settled states, and verify acceptance changes active scope exactly once. Verify rejection preserves scope, records its comment/timestamp, and appears in contractor history. Cover stale open views after base replacement or proposal supersession and confirm refreshed review is required. Preserve tests for shared-offer isolation and exclusion of private labor assumptions.

### Success Criteria:

#### Automated Verification:

- `npm run offer-contract` passes for base/change decisions, stale conflicts, one-time activation, rejected history, and anonymous access isolation.
- `npm run smoke` passes through the shared page and public endpoint for both initial-offer and change decisions, including refresh after stale state and the contractor-visible result.
- `npm run lint` and `npm run build` pass after the shared UI and state check are added.

#### Manual Verification:

- On phone and desktop, accept and reject from a shared link with the PIN; rejection requires a comment, the result is understandable without color, and keyboard and screen-reader focus reaches errors and the outcome.
- Leave an offer or change decision page open, alter the offer as contractor, and confirm the page warns and blocks submission until refresh; then review and decide the new state.

---

## Phase 3: Create a New Offer from a Rejected Offer

### Overview

Let the contractor reuse a rejected offer's details as a starting point for a new proposal, without editing or erasing the rejected offer or its decision history.

### Changes Required:

#### 1. Rejected-offer follow-up action

**Files**: `src/pages/offers/[offerId].astro`, `src/components/offers/OfferActionsMenu.tsx` (or the existing offer-detail action surface)

**Intent**: Give contractors a clear path from a rejected offer to a fresh draft.

**Contract**: Show a “Create new offer from this one” action only to the authenticated contractor who owns the offer, and only when its status is `rejected`. The action opens the normal create-offer flow with a source-offer reference; it must never reopen the rejected record for editing or imply that its old link or PIN applies to the new draft.

#### 2. Authorized prefill and independent draft

**Files**: `src/pages/offers/new.astro`, `src/components/offers/CreateOfferForm.tsx`, `src/pages/api/offers/index.ts` only if needed

**Intent**: Reuse editable proposal data while keeping the new offer independent from the rejected decision.

**Contract**: Resolve the source offer server-side under the signed-in contractor's existing access checks; do not trust query-string offer fields. Prefill the existing customer and editable offer details supported by the normal form (scope/description, line items, price, and deadline where present). Submitting uses the ordinary create-offer path and creates a distinct pending offer with a new share link. Its PIN remains unset until the contractor explicitly sets a fresh PIN through the normal offer PIN flow; the old PIN is never reused. Do not copy decision rows, rejection comments, timestamps, or the old share token/PIN. The rejected offer and its history remain unchanged. Invalid, missing, or inaccessible source IDs fail safely and do not disclose another contractor's data.

#### 3. Copy-flow verification

**Files**: `scripts/smoke.mjs`, `scripts/offer-contract.mjs` only if database-level coverage is needed

**Intent**: Prove the new draft is a useful copy and the rejected record remains immutable history.

**Contract**: Verify the action is available for an owned rejected offer and absent for other statuses; the authorized create page preloads source details; creating from it yields a distinct pending offer with a fresh share link and a fresh PIN set through the normal PIN flow; and the original remains rejected with its original decision/comment/history. A malformed, missing, foreign, or otherwise inaccessible source ID must not prefill or create an offer from that source. Show a clear unavailable notice and keep ordinary blank manual offer creation available.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` covers the authorized rejected-offer copy flow, prefilled fields, separate new offer credentials/state, unchanged source history, and invalid/foreign source IDs showing the blank manual fallback without source prefill.
- `npm run offer-contract` passes if database-level behavior or ownership checks are changed.
- `npm run lint` and `npm run build` pass.

#### Manual Verification:

- From a rejected offer, create a new offer, confirm its customer and terms are prefilled, adjust a value, and submit it; verify the new offer has its own PIN/link and pending status while the original remains rejected with its decision history intact.

---

## Testing Strategy

### Unit Tests:

- Add focused validation tests only if request parsing or view-version comparison is extracted into a reusable helper; do not mirror the handler implementation.

### Integration Tests:

- Use `npm run offer-contract` for database grants, target binding, exact revision checks, idempotency, timestamps, and active-scope invariants.
- Use `npm run smoke` against configured local Supabase and Worker preview for public HTTP and rendered-page flows, including bad PIN, 429, 409, revoked links, and both decision targets. Local Supabase credentials remain the registration-flow test environment.

### Manual Testing Steps:

1. Set a PIN, share a pending initial offer, review its terms on a phone-sized page, and accept it; verify the contractor sees the accepted status.
2. Publish a price- or deadline-affecting change, review the proposed impact, reject with a comment, and verify the current amount and deadline stay unchanged while history records the reason and time.
3. Publish another change, accept it, retry the same and opposite outcomes, and verify only the original outcome appears and the scope activates once.
4. Keep a decision page open while replacing its offer revision or pending change. Verify the warning blocks submission, then refresh, review the new terms, and decide.
5. Try a revoked link, wrong PINs until limited, keyboard-only interaction, and Chrome, Safari, Edge, and Firefox at phone and desktop widths.

## Performance Considerations

The shared page performs a small no-store state check on focus and at a modest interval (for example, 30 seconds) only while visible. Avoid fetching the full offer for each poll; return just target and version fields. The Worker rate limiter runs before the Supabase decision call, and the database remains the source of truth for concurrent writes. The binding is local to each Cloudflare location, so its six-per-minute threshold is a practical MVP brake rather than a global attempt cap.

## Migration Notes

Configure the server secret and Worker binding, deploy and verify the endpoint, then apply the grant-revoking migration in the same release before sharing decision links. The existing `SUPABASE_KEY` remains the restricted server-side publishable/anon credential for contractor and public read clients; the new service credential is confined to the decision module. Existing offers, PIN hashes, revisions, and decisions require no data migration. Rollback must keep public direct decision execution revoked; restore the previous route only after an equivalent limited delivery path exists. Update local and preview secrets/bindings as deployment prerequisites, never commit them.

## References

- Product rules: `context/foundation/prd.md` (US-01, FR-007, Non-Functional Requirements), `context/foundation/roadmap.md` (S-06).
- Existing shared view: `src/pages/shared/[token].astro:145-214`, `src/lib/shared-offer-view.ts:21-26,96-117`.
- Current decision contract: `supabase/migrations/20260929000000_revision_decision_conflicts.sql:2-98`; guarded projection: `supabase/migrations/20260928000000_current_offer_reads.sql:121-149` and `supabase/migrations/20261001000000_shared_current_base_revision.sql:1-22`.
- Deferred security finding: `context/archive/2026-09-21-minimal-offer-record-contract/follow-ups/review-fixes.md:7-9`.
- Deployment constraint: [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/); credential privilege boundary: [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Secure Decision Endpoint

#### Automated

- [x] 1.1 The migration applies locally and `npm run offer-contract` proves service-role-only decisions, stale protection, PIN validation, and idempotent base/change outcomes. — bf7056e
- [x] 1.2 `npm run smoke` exercises the public decision endpoint's success, conflict, invalid-input, wrong-PIN, and rate-limit responses. — bf7056e
- [x] 1.3 `npm run lint` and `npm run build` pass with the new route, server secret declaration, and Worker binding. — bf7056e

#### Manual

- [ ] 1.4 With local Supabase and Worker preview configured, a revoked link and repeated wrong PIN attempts cannot reach a customer decision; no PIN or service credential appears in the browser network response, URL, or application logs. — Rechecked 2026-09-28: revoked link unavailable; wrong PIN left the decision pending and the field cleared; PIN absent from URL. Network response and application log inspection remain pending.

### Phase 2: Customer Review and Stale-View Experience

#### Automated

- [x] 2.1 `npm run offer-contract` passes for base/change decisions, stale conflicts, one-time activation, rejected history, and anonymous access isolation. — 310d2db
- [x] 2.2 `npm run smoke` passes through the shared page and public endpoint for both initial-offer and change decisions, including refresh after stale state and the contractor-visible result. — 310d2db
- [x] 2.3 `npm run lint` and `npm run build` pass after the shared UI and state check are added. — 310d2db

#### Manual

- [ ] 2.4 On phone and desktop, accept and reject from a shared link with the PIN; rejection requires a comment, the result is understandable without color, and keyboard and screen-reader focus reaches errors and the outcome. — Rechecked 2026-09-28 on desktop: accept/reject, required comment, keyboard order, error-summary focus, and recorded outcomes verified. Phone viewport and actual screen-reader announcement remain pending.
- [x] 2.5 Leave an offer or change decision page open, alter the offer as contractor, and confirm the page warns and blocks submission until refresh; then review and decide the new state. — 310d2db

### Phase 3: Create a New Offer from a Rejected Offer

#### Automated

- [x] 3.1 The rejected-offer action and authorized create page prefill only data belonging to the signed-in contractor. — 21657bd
- [x] 3.2 Creating from a rejected offer produces an independent pending offer with a fresh share link and no PIN until the contractor sets a new one through the normal PIN flow; the original decision and history remain unchanged. — 21657bd
- [x] 3.3 `npm run smoke` covers valid, malformed, unknown, pending, and foreign source IDs; invalid sources show the blank manual fallback without source prefill. `npm run offer-contract` runs if database-level behavior changes; `npm run lint` and `npm run build` pass. — 21657bd

#### Manual

- [x] 3.4 From a rejected offer, create a new draft, verify prefilled editable details, submit it, set a fresh PIN through the normal PIN flow, and confirm the new and original offers retain separate status, credentials, and history. — 21657bd

#### Manual Recheck Record — 2026-09-28

- Local desktop browser: accepted the initial offer and a refreshed replacement change; rejected an initial offer with a comment and verified the contractor history retained the reason and rejected status.
- Keyboard/accessibility tree: Tab reached accept/reject and form fields in order. Submitting a rejection without a comment focused the error summary; its link returned focus to the field. Recorded outcomes appeared in a polite status region. The browser accessibility tree exposed labels and statuses; no separate screen reader was run.
- Stale view: left the customer page open, superseded its pending change as contractor, observed disabled decision controls and the inline warning/toast, refreshed, reviewed the replacement terms, and accepted it.
- Rejected-offer copy: opened the owner action, verified editable prefilled details, changed scope and price, created a distinct pending offer and link, set a fresh PIN separately, and accepted it. The source remained rejected with its original reason and terms.
- Revoked link: revoked the test offer's link and confirmed the shared page showed “Offer unavailable.”
- Scope limits: these checks used the local preview at desktop size. Phone viewport, actual assistive-technology output, and browser network/application log inspection were not available in this pass; items 1.4 and 2.4 remain unchecked for those parts.
