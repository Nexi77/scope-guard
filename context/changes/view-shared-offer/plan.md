# View Shared Offer Implementation Plan

## Overview

Give a customer a permanent, offer-specific link for read-only viewing of the current offer and its status. Give the contractor controls to copy, revoke, and later replace that link. Preserve the boundary between agreed work and a pending proposal, and keep private estimating data out of the customer page.

## Current State Analysis

The roadmap defines S-05 as the shared read-only offer view; PIN-protected decisions belong to S-06, and the contractor decision-history view to S-07 (`context/foundation/roadmap.md`, S-05–S-07). The PRD requires a customer to revisit the assigned offer at any time, see change states, and lose access when the contractor revokes the link (`context/foundation/prd.md`, FR-005–FR-007 and Non-Functional Requirements).

The database already stores a unique per-offer `share_token` and `share_link_revoked_at` (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-26`). The anonymous `get_shared_offer` RPC returns only a non-revoked offer's customer-safe projection (`supabase/migrations/20261001000000_shared_current_base_revision.sql:28-42`). It includes public item prices, active total/deadline, change states, and current base-revision status, but no labor assumptions, owner ID, PIN hash, or share token (`supabase/migrations/20260928000000_current_offer_reads.sql:74-149`). There is no public page or owner control to obtain/revoke the link. `/offers` is protected by middleware, and the existing contractor detail view loads private fields (`src/middleware.ts:4-21`; `src/lib/contractor-offer-view.ts:112-217`).

## Desired End State

The contractor sees and copies the active link on the owned offer page, can revoke it, and can create a fresh link after revocation. A customer opening the active URL without an account or PIN sees only that offer. The page distinguishes current agreed totals from any pending price/deadline proposal and lists earlier changes with customer-facing effects and their statuses. Invalid, revoked, and replaced URLs expose no offer data. Viewing never records a decision.

### Key Discoveries:

- The existing token-read RPC supplies the right read boundary; direct anonymous table access remains revoked (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:125-135,332-336`).
- Authenticated clients cannot currently update offer share fields directly after structured-offer grants; lifecycle actions need an owner-scoped database contract (`supabase/migrations/20260924000000_structured_offers.sql:56-59`).
- `get_shared_offer` is granted to `anon`, while `createClient` forwards auth cookies; the public route needs an explicitly anonymous server-side client so it also works when a signed-in contractor opens the URL (`src/lib/supabase.ts:1-20`; `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:332-336`).
- The current shared projection carries price breakdown data; the page must render only the agreed customer summary fields rather than pass through the raw object (`supabase/migrations/20260928000000_current_offer_reads.sql:102-149`).

## What We're NOT Doing

- Customer accounts, a general customer portal, or access to other offers.
- PIN entry, offer/change acceptance, rejection, or decision mutation (S-06).
- A separate contractor decision-history redesign or full offer version comparison (S-07).
- Sharing by email/SMS, PDF generation, or analytics.

## Implementation Approach

Keep the existing token-scoped read RPC and add a narrow, authenticated owner action for revocation and token rotation. Expose the active link only on the owner page. Serve `/shared/<token>` through a separate public Astro route using a server-only anonymous Supabase client. Map the read projection to an explicit customer view model; do not reuse the contractor page or expose the full RPC payload in client props. Treat unknown, revoked, and rotated tokens alike, and prevent caching or referrer leakage of token-bearing pages.

## Critical Implementation Details

### Token lifecycle

Revocation makes the current URL unusable immediately. A later re-share generates a new token atomically and clears revocation; it never reactivates the old token. PIN reset remains independent and must not rotate the link. The owner action must check ownership inside the database transaction and remain unavailable to anonymous callers.

## Phase 1: Contractor Sharing Controls and Token Lifecycle

### Overview

Make the offer link available to its owner and provide a safe revoke/re-share lifecycle.

### Changes Required:

#### 1. Owner-scoped share access contract

**File**: `supabase/migrations/20261006000000_shared_offer_access.sql` (new)

**Intent**: Add an authenticated owner-only operation to revoke an active link and issue a new token for a revoked offer. Keep anonymous table access closed and preserve the offer's PIN and decisions.

**Contract**: A bounded RPC accepting offer ID and lifecycle action verifies `auth.uid()` owns the offer; revoke stamps `share_link_revoked_at`, while re-share atomically replaces `share_token` with a fresh UUID and clears revocation. Repeated revoke is safe; re-share is allowed only while revoked. Grant execution only to `authenticated`, set a safe `search_path`, and return an owner-safe result without PIN material.

#### 2. Authenticated API and offer loader

**Files**: `src/pages/api/offers/[offerId]/share.ts` (new), `src/lib/contractor-offer-view.ts`

**Intent**: Connect the owner action and active token to the existing offer detail without widening access to other contractors or anonymous users.

**Contract**: The API accepts only explicit revoke or re-share actions for a valid offer ID, checks same-origin requests and session ownership, maps invalid/foreign offers to an unavailable response, and sends `Cache-Control: no-store`. The offer loader selects token and revocation state only for the owned offer and exposes them only to the contractor view.

#### 3. Contractor share control

**Files**: `src/pages/offers/[offerId].astro`, `src/components/offers/ManageOfferShare.tsx` (new)

**Intent**: Let the contractor copy the full link, revoke access with confirmation, and create a replacement after revocation. Make the current access state legible without displaying a PIN.

**Contract**: The active state shows an absolute `/shared/<token>` URL and copy action; the revoked state hides the old URL and offers a re-share action. A successful replacement updates the shown URL. Copy failure leaves selectable link text. Owner response and page must use `no-store` for token-bearing content.

### Success Criteria:

#### Automated Verification:

- Local migration and `npm run offer-contract` verify owner-only revoke/rotation, old-token invalidation, new-token access, foreign/anonymous denial, and unchanged PIN behavior.
- `npm run smoke` covers authenticated share controls and API success/failure paths when local Supabase is configured.
- `npm run lint` and `npm run build` pass.

#### Manual Verification:

- On an owned offer, copy the URL, revoke it, and re-share; the visible URL changes and the old URL remains unusable.
- A contractor cannot see or manage another contractor's offer link.

---

## Phase 2: Public Read-Only Offer View

### Overview

Render the token-scoped customer page with clear current, pending, and past change states.

### Changes Required:

#### 1. Anonymous shared-offer loader

**Files**: `src/lib/supabase.ts`, `src/lib/shared-offer-view.ts` (new)

**Intent**: Read the existing `get_shared_offer` RPC without attaching a contractor session and convert its output to a limited customer view model.

**Contract**: The loader validates UUID-shaped tokens, calls only `get_shared_offer`, returns a single unavailable result for malformed, unknown, revoked, or replaced tokens, and selects only public offer fields, items, statuses, descriptions, and customer-facing price/deadline effects. It never emits labor assumptions, PIN/hash, owner identifiers, share token, or raw estimate breakdowns to rendered client data.

#### 2. Customer route and presentation

**File**: `src/pages/shared/[token].astro` (new)

**Intent**: Show the customer a usable mobile and desktop offer card without sign-in. Make pending initial offers and rejected offers explicit; for an accepted offer with a pending change, show agreed totals separately from the proposed impact.

**Contract**: Render current scope, public item quantities/unit prices/amounts, total, deadline, and offer status. Render a pending proposal with its description and proposed price/deadline effect without adding it to agreed totals. Show a concise list of earlier changes with pending, accepted, rejected, agreed, or superseded status and their customer-facing effects; omit private estimate internals. Invalid/revoked/replaced links return the same unavailable view/status. Send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and no-index metadata for token-bearing pages; include no PIN or decision controls.

#### 3. Public-route coverage

**Files**: `scripts/smoke.mjs`, `scripts/offer-contract.mjs` (where database contract coverage is needed)

**Intent**: Prove the HTTP page follows the existing RPC authorization boundary and keeps offer state separate from proposed changes.

**Contract**: Add smoke cases for valid anonymous access, a signed-in browser opening the same link, malformed/foreign/unknown/revoked/rotated tokens, per-offer isolation, absence of private fields and decision controls, and current-versus-pending totals. Preserve existing database contract checks for anonymous table denial.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` covers public-page success and failure states, token isolation, private-field absence, and agreed-versus-pending values with local Supabase.
- `npm run offer-contract` confirms the shared RPC still excludes private fields and revoked/rotated tokens cannot read an offer.
- `npm run lint` and `npm run build` pass.

#### Manual Verification:

- On mobile and desktop, the shared page clearly separates agreed terms, a pending proposal, and earlier change statuses; keyboard access and non-color status cues work.
- A customer can revisit an active link without a PIN, while unknown, revoked, and replaced links show the same unavailable state.

---

## Testing Strategy

### Unit Tests:

- Keep view mapping small and explicit; test unusual projection states only if the mapping adds nontrivial behavior beyond the HTTP smoke cases.

### Integration Tests:

- Extend local database contract coverage for owner-only lifecycle transitions and old/new token behavior.
- Extend the HTTP smoke flow for owner controls and the public page, including authenticated and anonymous visits, access isolation, safe unavailable responses, and pending-versus-agreed amounts.

### Manual Testing Steps:

1. Create an offer, open its contractor detail, copy the shared link, and open it in a private browser on a phone-sized viewport.
2. Accept a base offer in the existing local test flow, publish a pending change, and confirm the shared page keeps agreed totals separate from the proposal and labels prior changes.
3. Revoke and re-share; verify the old URL cannot load the offer and the new one can. Inspect page source/network responses for private fields and token leakage to third-party requests.

## Performance Considerations

The public page uses one existing token-scoped RPC per request and no client polling. Do not cache token-bearing content; the current projection should remain fast enough for ordinary offer sizes. Revisit query/index cost only if local smoke or a real offer reveals a measurable delay.

## Migration Notes

The new owner action works with existing `share_token` and `share_link_revoked_at` columns; no data backfill is needed. Existing active links remain stable until the owner revokes them. A revoked link is restored only through rotation to a new token. Apply and test the migration against local Supabase before deployment.

## References

- Product contract: `context/foundation/prd.md` (FR-005–FR-007, Non-Functional Requirements, Access Control).
- Slice boundary: `context/foundation/roadmap.md` (S-05–S-07).
- Token and RLS contract: `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-26,88-135,332-336`.
- Current shared projection: `supabase/migrations/20260928000000_current_offer_reads.sql:74-167`; `supabase/migrations/20261001000000_shared_current_base_revision.sql:28-42`.
- Existing owner and test patterns: `src/lib/contractor-offer-view.ts:112-217`; `src/pages/api/offers/[offerId]/pin.ts:19-48`; `scripts/offer-contract.mjs:1287-1297,1443-1453`; `scripts/smoke.mjs:1049-1077`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Contractor Sharing Controls and Token Lifecycle

#### Automated

- [x] 1.1 Local migration and `npm run offer-contract` verify owner-only revoke/rotation, old-token invalidation, new-token access, foreign/anonymous denial, and unchanged PIN behavior.
- [x] 1.2 `npm run smoke` covers authenticated share controls and API success/failure paths when local Supabase is configured.
- [x] 1.3 `npm run lint` and `npm run build` pass.

#### Manual

- [x] 1.4 On an owned offer, copy the URL, revoke it, and re-share; the visible URL changes and the old URL remains unusable.
- [x] 1.5 A contractor cannot see or manage another contractor's offer link.

### Phase 2: Public Read-Only Offer View

#### Automated

- [ ] 2.1 `npm run smoke` covers public-page success and failure states, token isolation, private-field absence, and agreed-versus-pending values with local Supabase.
- [ ] 2.2 `npm run offer-contract` confirms the shared RPC still excludes private fields and revoked/rotated tokens cannot read an offer.
- [ ] 2.3 `npm run lint` and `npm run build` pass.

#### Manual

- [ ] 2.4 On mobile and desktop, the shared page clearly separates agreed terms, a pending proposal, and earlier change statuses; keyboard access and non-color status cues work.
- [ ] 2.5 A customer can revisit an active link without a PIN, while unknown, revoked, and replaced links show the same unavailable state.
