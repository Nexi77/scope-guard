# Manage Offer PIN Implementation Plan

## Overview

Let an authenticated contractor generate or reset a six-digit PIN for one owned offer. Show the generated PIN once so the contractor can copy and deliver it; store only its hash. This completes roadmap slice S-03 and prepares the later customer decision flow without implementing sharing or decisions here.

## Current State Analysis

The foundation schema already stores a nullable `offers.pin_hash` beside a per-offer `share_token`; the existing anonymous decision RPC checks a six-digit PIN against that hash (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-29,221-256`). Offer creation leaves the hash null (`supabase/migrations/20260922000000_create_client_offer.sql:85-101`). The contractor currently creates and browses offers, but the offer cards have no PIN action (`src/pages/offers/index.astro:221-275`). Research and the archived foundation brief establish per-offer scope despite the PRD also permitting a customer-level PIN (`context/changes/manage-offer-pin/research.md`; `context/archive/2026-09-21-minimal-offer-record-contract/plan-brief.md:19-27`).

## Desired End State

From an offer card, the contractor can generate the first PIN on demand or reset it later. The app creates an unpredictable six-digit PIN server-side, saves a compatible hash on that owned offer, and shows the plaintext in the current UI session only after the write succeeds. Reset invalidates the previous PIN for decisions but leaves the offer's share token and link unchanged. Refreshing or reopening the UI shows whether a PIN is configured, never its value.

### Key Discoveries:

- The decision RPC uses `extensions.crypt(p_pin, pin_hash)` and rejects a null or mismatched hash (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:239-256`).
- `offers` has authenticated owner-scoped RLS, while `anon` lacks table access (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:88-133`). The new write contract must still check the signed-in owner explicitly and grant execution only to `authenticated`.
- The existing offer browser reads customer-scoped summaries and can host a portable per-offer action (`src/pages/offers/index.astro:41-79,221-275`).
- CI runs the database offer contract, app smoke, lint, Astro check, and build (`.github/workflows/ci.yml:1-43`).

## What We're NOT Doing

- Customer-level PINs, customer accounts, or a customer portal.
- Shared-offer view, link revocation/rotation, customer decision UI, or rate limiting of the anonymous decision RPC; those belong to S-05/S-06 (`context/foundation/roadmap.md:140-160`; `context/archive/2026-09-21-minimal-offer-record-contract/follow-ups/review-fixes.md:7-9`).
- PIN generation during offer creation or a new offer details route. The per-offer action should be movable to that route when it is built.
- Persisting or redisplaying plaintext PINs, sending PINs by email/SMS, or adding broad customer administration.

## Implementation Approach

Use the existing per-offer storage and PostgreSQL bcrypt-compatible verification. Add an authenticated database command that validates the six-digit input, verifies ownership, and hashes it before replacing `pin_hash`; it returns success without returning the hash. An Astro POST endpoint generates the PIN using a cryptographically secure, unbiased random source, calls that command with the contractor's cookie-backed Supabase session, and returns the plaintext only in a non-cacheable success response. The offer-card control displays it once in client memory with a copy action, then discards it when dismissed. The browser receives only offer ID and configured/unconfigured state on page load, never `pin_hash`.

## Critical Implementation Details

### State sequencing

Do not reveal the new PIN until the database write succeeds. On failed or ambiguous writes, show an error without revealing a candidate; the contractor can retry with a fresh PIN. Keep `share_token` and `share_link_revoked_at` untouched during reset, and verify the previous PIN stops matching while the new one matches before treating reset as complete.

## Phase 1: Owner-scoped PIN write contract

### Overview

Add the narrow database operation and prove its ownership, hash, and reset behavior independently of the UI.

### Changes Required:

#### 1. Authenticated PIN command

**File**: `supabase/migrations/<next_timestamp>_manage_offer_pin.sql`

**Intent**: Provide one transactionally applied PIN set/reset operation for an owned offer. Validate exact six-digit input and hash within the database using a format compatible with the existing decision RPC; reject unauthenticated and foreign-offer calls without disclosing whether an offer exists.

**Contract**: An authenticated-only RPC taking `offer_id` and plaintext `pin`, returning a minimal success result. It updates only `offers.pin_hash` (and `updated_at` if the existing convention requires), scopes by `auth.uid()`, uses a fixed safe `search_path`, and does not return the PIN or hash. Revoke default/public/anonymous execution grants.

On reset, the command rejects a candidate matching the current hash so the previous PIN cannot remain valid by random collision; the caller generates another candidate.

#### 2. Database contract coverage

**File**: `scripts/offer-contract.mjs`

**Intent**: Verify the write contract against local Supabase before the HTTP flow is added.

**Contract**: Cover missing/invalid PIN, unauthenticated and foreign-offer rejection, initial set, reset, same-PIN rejection, old-PIN rejection and new-PIN acceptance through the existing decision verifier, unchanged share token, and no plaintext/hash in the RPC result. Use distinct offers or pending changes where the decision RPC's idempotence would otherwise mask a credential check.

### Success Criteria:

#### Automated Verification:

- Local Supabase migration applies and `npm run offer-contract` passes the new ownership, PIN-format, reset, and token-stability cases.
- `npm run lint` and `npm run build` pass after the migration and contract-test change.

#### Manual Verification:

- Review the new RPC grants and return shape to confirm anonymous callers cannot set a PIN or retrieve its hash.

---

## Phase 2: Authenticated endpoint and offer-card experience

### Overview

Expose on-demand generation and one-time display through the contractor offer list, then cover the built app flow.

### Changes Required:

#### 1. PIN generation endpoint

**File**: `src/pages/api/offers/[offerId]/pin.ts`

**Intent**: Generate a secure six-digit PIN only for an authenticated contractor request, persist it through the Phase 1 RPC, and reveal it only after success. Handle malformed IDs, missing sessions, foreign or missing offers, and database failures without exposing PINs, hashes, or sensitive error details.

**Contract**: `POST /api/offers/:offerId/pin` returns a single generated PIN on successful set/reset with `Cache-Control: no-store`; failed responses contain no candidate PIN. The endpoint uses `createClient` and `auth.getUser()` as the existing offer POST does (`src/pages/api/offers/index.ts:29-36`), rejects cross-origin POSTs, and retries secure generation if the candidate matches the previous PIN. No PIN is placed in URLs, redirects, logs, or cookies.

#### 2. Offer-card action and transient result

**Files**: `src/pages/offers/index.astro`, `src/components/offers/ManageOfferPin.tsx`

**Intent**: Place a Manage PIN action on each offer card. Show whether a PIN is configured, distinguish initial generation from reset, confirm replacement in an accessible in-app Radix AlertDialog, provide a copy control and clear one-time display, and discard the plaintext when the result closes or the page reloads. Keep the component offer-scoped so it can move to an offer details route later.

**Contract**: The card passes only the offer ID and a boolean configured state to the client component. Obtain that boolean through an authenticated owner-scoped server read and do not serialize `pin_hash` or `share_token` to the browser. Existing offer browsing, pagination, and customer isolation remain intact.

#### 3. App smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Verify the built route and page behavior across success and failure paths, including contractor isolation.

**Contract**: Add cases for anonymous POST rejection, invalid and foreign offer IDs, initial generation, reset yielding a different usable PIN, no secret in offer-list HTML after refresh, and the configured-state UI. Do not print the generated PIN in test output.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, and `npm run build` pass.
- With local Supabase configured, `npm run offer-contract` and `npm run smoke` pass, including anonymous, foreign-offer, initial-set, reset, and no-secret-render cases.
- Reset confirmation uses the app's Radix AlertDialog; Cancel and Escape do not reset the PIN, while Confirm starts the reset.

#### Manual Verification:

- On desktop and phone widths, generate and copy a PIN from an offer card, close the result, and confirm the plaintext cannot be redisplayed after reopening or refreshing.
- Reset a configured PIN, confirm the replacement warning and one-time display, and confirm the same offer link remains valid while the old PIN no longer authorizes a decision.
- Keyboard users can open, operate, and close the PIN control; status and errors are understandable without relying on color.
- Reset confirmation is an accessible app dialog: Cancel and Escape leave the PIN unchanged, and focus returns to the trigger after closing.

---

## Testing Strategy

### Unit Tests:

- No separate implementation-mirroring unit suite is needed. The database contract and built-app smoke cover the security boundaries and observable flow.

### Integration Tests:

- Extend `scripts/offer-contract.mjs` for authenticated RPC behavior and verification through the existing decision contract.
- Extend `scripts/smoke.mjs` for route authentication, ownership, one-time response, reset, and rendered page secrecy. Run against local Supabase because configured cloud registration is intentionally disabled (`AGENTS.md`).

### Manual Testing Steps:

1. Create an offer, open its Manage PIN action, and generate the first PIN.
2. Copy it, close the result, reopen and refresh; confirm only configured state remains.
3. Reset it; confirm the in-app warning, then test Cancel and Escape leave the PIN unchanged and return focus to the trigger. Confirm reset, copy the new PIN, and verify the old PIN fails while the new PIN works against the contract path.
4. Check mobile layout, keyboard operation, and focus behavior in the reset dialog.

## Performance Considerations

PIN generation and hashing occur on demand, not while listing offers. Keep the offer-list configured-state read bounded to the visible offer page and continue using the existing pagination (`src/pages/offers/index.astro:65-79`). Do not add a per-card database request.

## Migration Notes

Existing offers retain null `pin_hash` until the contractor generates a PIN. The migration adds a command rather than changing existing offer rows or share tokens. If rolling back the application, installed hashes remain valid for the later decision RPC; if rolling back the migration, remove only its new function/grants after dependent app code is withdrawn.

## References

- Research: `context/changes/manage-offer-pin/research.md`
- Product contract: `context/foundation/prd.md:81-110`
- Roadmap slice: `context/foundation/roadmap.md:116-126`
- Existing storage and verifier: `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-29,221-256`
- Existing offer API and browser: `src/pages/api/offers/index.ts:29-90`; `src/pages/offers/index.astro:41-79,221-275`
- Prior security follow-up: `context/archive/2026-09-21-minimal-offer-record-contract/follow-ups/review-fixes.md:7-9`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Owner-scoped PIN write contract

#### Automated

- [x] 1.1 Local Supabase migration applies and `npm run offer-contract` passes the new ownership, PIN-format, reset, and token-stability cases. — febff26
- [x] 1.2 `npm run lint` and `npm run build` pass after the migration and contract-test change. — febff26

#### Manual

- [x] 1.3 Review the new RPC grants and return shape to confirm anonymous callers cannot set a PIN or retrieve its hash. — febff26

### Phase 2: Authenticated endpoint and offer-card experience

#### Automated

- [x] 2.1 `npm run lint`, `npx astro check`, and `npm run build` pass. — afc4656
- [x] 2.2 With local Supabase configured, `npm run offer-contract` and `npm run smoke` pass, including anonymous, foreign-offer, initial-set, reset, and no-secret-render cases. — afc4656

#### Manual

- [x] 2.3 On desktop and phone widths, generate and copy a PIN from an offer card, close the result, and confirm the plaintext cannot be redisplayed after reopening or refreshing. — manually verified by user
- [x] 2.4 Reset a configured PIN, confirm the replacement warning and one-time display, and confirm the same offer link remains valid while the old PIN no longer authorizes a decision. — manually verified by user
- [x] 2.5 Keyboard users can open, operate, and close the PIN control; status and errors are understandable without relying on color. — manually verified by user
- [x] 2.6 Reset uses an accessible Radix AlertDialog; Cancel and Escape do not reset the PIN and return focus to the trigger, while Confirm initiates reset and focus returns to the trigger. — afc4656; manually verified in the local browser
