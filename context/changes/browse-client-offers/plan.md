# Browse client offers Implementation Plan

## Overview

Give the signed-in contractor a protected place to browse each customer's offers with current status, price, and delivery deadline. Connect the dashboard, offer list, and existing creation page through a shared sidebar while keeping the dashboard free of offer data.

## Current State Analysis

- `src/pages/dashboard.astro:23-38` has a creation link but no offer data or navigation to a list. Creation already lives at `/offers/new` (`src/pages/offers/new.astro:7-13`). There is no browsing or offer-detail route.
- `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:1-30` stores contractor-owned customers and offers. An offer has no title; it has original scope, base price and deadline, status, and creation time. Customer names can repeat by explicit choice in the creation flow (`supabase/migrations/20260922000000_create_client_offer.sql:67-82`).
- The shared-offer contract calculates current price and deadline from accepted or agreed changes, excluding pending and rejected changes (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:158-177,206-216`). No contractor list query currently returns those values.
- RLS limits authenticated table reads to the owning contractor (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:88-109`), and middleware protects `/dashboard` and `/offers` (`src/middleware.ts:4-22`). The previous implementation review rejected an unbounded offer list (`context/archive/2026-09-22-create-client-offer/reviews/impl-review.md:24-51`).

## Desired End State

The contractor uses the shared sidebar to enter `/offers`, sees a bounded alphabetical list of distinct customer groups, and expands a group to see its offers newest first. Each offer row identifies the offer by an original-scope excerpt and creation date and shows stored offer status plus current price and deadline. Rows are informational. A newly created offer's confirmation links to its customer's expanded group, even when that customer is outside the first customer page. Empty, invalid, expired-session, and failed-load states are clear and do not reveal another contractor's data.

### Key Discoveries:

- FR-002 and roadmap S-02 require per-customer browsing with status, cost, and deadline (`context/foundation/prd.md:65-70`; `context/foundation/roadmap.md:104-114`).
- The creation RPC already returns both `offer_id` and `customer_id`; the POST route currently discards them (`supabase/migrations/20260922000000_create_client_offer.sql:10,103`; `src/pages/api/offers/index.ts:49-75`).
- `src/lib/supabase.ts:1-21` supplies the cookie-backed server client; the browser must use the contractor session and existing RLS, with no service-role key.
- The offer status is stored on `offers`; a rejected change can leave a previously accepted offer accepted (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:309-318`). List status must come from `offers.status`, not the latest change.

## What We're NOT Doing

- An offer detail page, editing, history, customer decisions, PIN management, or shared customer links; those belong to later roadmap slices.
- Customer accounts, customer administration, CRM fields, or merging customers with matching names.
- Offer data on the dashboard. The dashboard remains an entry point with a creation option and sidebar navigation.
- Showing original and current amounts side by side, full scope text, or changes in the list.

## Implementation Approach

Add a contractor-only, bounded read contract for one selected customer's offers. It computes the same current amount and deadline as the existing shared-offer contract, while RLS and an explicit owner predicate restrict results. The `/offers` Astro page fetches a bounded customer page ordered by name and ID, then fetches one expanded customer's bounded offer page ordered by creation time and ID. Query parameters preserve the selected group and pagination; an owned customer can be resolved directly for a post-creation deep link. A shared contractor sidebar links the dashboard, offer list, and creation page. The creation POST uses its existing RPC result to build a safe confirmation link to the owned customer group.

## Critical Implementation Details

### Performance constraints

Compute change aggregates only after selecting the bounded offer page, so a customer with many offers does not cause an unbounded join or render. Keep amounts as exact integer minor units through the read contract and formatter; the creation contract permits values above JavaScript's safe integer range (`src/lib/pln.ts:1-18`).

### User experience spec

The selected customer may be outside the current alphabetical page. A direct `?customer=<uuid>` link must still show that owned customer's expanded group. Unknown or foreign IDs must show a safe unavailable state without falling back to another customer's offers.

## Phase 1: Bounded contractor offer read

### Overview

Establish the secure, paginated data contract that the browser can render without loading every offer or losing current-value accuracy.

### Changes Required:

#### 1. Current-value list contract

**File**: `supabase/migrations/<timestamp>_browse_client_offers.sql`

**Intent**: Return one page of an owned customer's offer summaries with current price and deadline, so browsing remains accurate after later accepted changes and stays bounded as data grows.

**Contract**: Add an authenticated, security-invoker read function taking a customer ID, a bounded page limit, and an optional stable `(created_at, id)` cursor. Require `auth.uid()` to own the customer and offers; return offer ID, original-scope excerpt source, status, currency, current amount as exact minor-unit text, current deadline, creation time, and a next-page cursor or enough data to derive it. Order offers by `created_at DESC, id DESC`; sum price and deadline deltas only for `accepted` and `agreed` changes after selecting the page. Return no share token, PIN material, or other customer's records. Add an index only if the final query plan requires it.

#### 2. Read-contract coverage

**File**: `scripts/offer-contract.mjs`

**Intent**: Prove ownership, current-value math, deterministic pagination, and excluded-change behavior at the database boundary.

**Contract**: Cover own-customer pages, equal-timestamp tie ordering, next-page continuation without repeats, unknown/foreign customer IDs, anonymous execution denial, and totals after accepted/agreed versus pending/rejected changes. Preserve existing creation, RLS, PIN, and decision checks.

### Success Criteria:

#### Automated Verification:

- The browse migration applies and `npm run offer-contract` passes with a configured local Supabase environment.
- Contract checks prove bounded stable offer pages, contractor isolation, and current values that exclude pending and rejected changes.

#### Manual Verification:

- The read function exposes no share token or PIN material and grants execution only to authenticated callers.

---

## Phase 2: Customer groups and contractor navigation

### Overview

Render the offer browser and connect it to the dashboard and creation flow through a consistent protected sidebar.

### Changes Required:

#### 1. Protected navigation shell

**Files**: `src/components/dashboard/ContractorNavigation.astro`, `src/pages/dashboard.astro`, `src/pages/offers/new.astro`, `src/pages/offers/index.astro`

**Intent**: Give contractors a stable way to reach the dashboard, offer list, and offer creation. Keep the dashboard as a simple entry point with no offer records.

**Contract**: A shared responsive sidebar or compact mobile navigation links `/dashboard`, `/offers`, and `/offers/new`, indicates the current destination without color alone, and preserves keyboard access and visible focus. The dashboard may retain a direct creation action but renders no customer or offer list.

#### 2. Bounded customer-group browser

**Files**: `src/pages/offers/index.astro`, `src/lib/offer-list.ts` (if a small read/format helper keeps the page focused)

**Intent**: Let the contractor find a customer by name and inspect that customer's offers, including separate records with the same name, without an unbounded initial fetch.

**Contract**: `/offers` reads a bounded customer page through the cookie-backed client and RLS, ordered by `name ASC, id ASC`, with a deterministic next-page action. Expanding a group fetches only that owned customer's bounded offer page; a direct customer query parameter resolves an owned customer even outside the current page. Offer pages have a next-page action, preserve the selected group, and order `created_at DESC, id DESC`. Display a distinct record marker when customer names collide; each offer row shows a scope excerpt, creation date, stored status, current PLN price, and current deadline. Use exact minor-unit formatting and date-only display. Provide no-offers, no-customers, loading/navigation, failed-read, invalid-customer, and expired-session states. Rows do not navigate to a detail page.

#### 3. Creation handoff

**Files**: `src/pages/api/offers/index.ts`, `src/pages/offers/new.astro`, `src/components/offers/CreateOfferForm.tsx`

**Intent**: Let the contractor verify a newly created offer in its customer's group without moving offer creation onto the dashboard.

**Contract**: After successful `create_offer_with_customer`, carry the returned customer ID through the existing confirmation redirect; the confirmation includes a link to `/offers?customer=<id>` that opens the owned group. Keep the existing create-another action and server-side validation. Do not put the offer ID or customer ID into a trust boundary without ownership checks at the browse read.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass for the protected routes, shared navigation, and creation redirect.
- Authenticated browsing renders only owned customer groups and bounded offer pages, including a direct link to a customer outside the first page.
- The creation success redirect carries the new customer ID to a working browse link without exposing foreign data.

#### Manual Verification:

- On mobile and desktop, keyboard users can reach the offer list and creation page through visible, clearly labeled navigation; the dashboard shows no offer records.
- Duplicate customer names remain distinguishable, and offer rows clearly show status, current PLN price, deadline, and a concise original-scope identity.
- Empty, unavailable, failed-load, and expired-session states are understandable without exposing another contractor's data.

---

## Phase 3: End-to-end browsing verification

### Overview

Extend runnable route coverage and review the finished browser against the agreed flow.

### Changes Required:

#### 1. Application smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Catch regressions in protected browsing and the path from successful creation to an expanded customer group.

**Contract**: Add anonymous `/offers` redirect, signed-in empty/list states, new and reused customer's offers, current status/price/deadline rendering, creation confirmation link, and safe invalid or foreign customer handling. Reuse local Supabase test credentials; do not enable cloud self-service registration for smoke testing.

#### 2. Delivery review

**Files**: `context/changes/browse-client-offers/plan.md`, implementation files from earlier phases

**Intent**: Check the route, data, and UI contracts before handoff.

**Contract**: Run the repository's lint and build gates, plus offer-contract and smoke commands when local Supabase is configured. Record manual responsive and accessibility findings separately from command results.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass.
- `npm run offer-contract` and `npm run smoke` pass with configured local Supabase and cover protected browsing, pagination, current values, and creation handoff.

#### Manual Verification:

- The dashboard, offer list, and creation page form a usable sidebar flow in light and dark themes on phone and desktop.
- Current Chrome, Safari, Edge, and Firefox show correct offer status, price, deadline, grouping, and pagination without color-only cues.

## Testing Strategy

### Unit Tests:

- Test exact minor-unit PLN formatting and date-only rendering only if these are extracted as reusable helpers; avoid tests that merely mirror markup.

### Integration Tests:

- Extend the live database contract for owner filtering, change-state aggregation, and stable pagination.
- Extend the application smoke flow for authentication, creation-to-browser navigation, selected customer isolation, and visible list values.

### Manual Testing Steps:

1. Sign in, use the sidebar from the dashboard to `/offers`, and verify that no offers appear on the dashboard itself.
2. Create an offer for a new customer, use the confirmation link, and verify the customer's group opens with the new offer. Repeat for an existing customer.
3. Create same-named customer records, enough customers and offers for multiple pages, and offers with equal timestamps; verify grouping and deterministic order.
4. Check pending, accepted, rejected, and agreed statuses and changes; verify only accepted/agreed changes affect current values.
5. Navigate by keyboard on phone and desktop widths in both themes; inspect empty, invalid-customer, error, and signed-out states.

## Performance Considerations

Bound both customer and offer queries and select only display fields. The offer read aggregates changes for the selected offer page, not every offer owned by the contractor. Deterministic tie-breaks prevent unstable pagination; avoid cache or global preloads until usage demonstrates a need.

## Migration Notes

The read contract is additive and requires no backfill. Apply it after the existing offer migrations. Rollback removes only the new read function and any index added for its query; existing offer data, RLS, and creation behavior remain intact.

## References

- `context/foundation/prd.md` — FR-001, FR-002, current-offer rule, and MVP boundaries.
- `context/foundation/roadmap.md` — S-02 outcome and sequencing.
- `context/archive/2026-09-22-create-client-offer/plan.md` — creation flow and reserved browse slice.
- `context/archive/2026-09-22-create-client-offer/reviews/impl-review.md` — unbounded-list finding.
- `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:1-30,88-109,158-177,206-216,309-318`
- `supabase/migrations/20260922000000_create_client_offer.sql:10,67-103`
- `src/pages/dashboard.astro:23-38`; `src/pages/offers/new.astro:7-51`; `src/pages/api/offers/index.ts:49-75`
- `src/middleware.ts:4-22`; `src/lib/supabase.ts:1-21`; `scripts/offer-contract.mjs:240-266`; `scripts/smoke.mjs:90-180`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bounded contractor offer read

#### Automated

- [x] 1.1 The browse migration applies and `npm run offer-contract` passes with a configured local Supabase environment. — ee65712
- [x] 1.2 Contract checks prove bounded stable offer pages, contractor isolation, and current values that exclude pending and rejected changes. — ee65712

#### Manual

- [x] 1.3 The read function exposes no share token or PIN material and grants execution only to authenticated callers. — ee65712

### Phase 2: Customer groups and contractor navigation

#### Automated

- [x] 2.1 `npm run lint` and `npm run build` pass for the protected routes, shared navigation, and creation redirect. — 10dc93b
- [x] 2.2 Authenticated browsing renders only owned customer groups and bounded offer pages, including a direct link to a customer outside the first page. — 10dc93b
- [x] 2.3 The creation success redirect carries the new customer ID to a working browse link without exposing foreign data. — 10dc93b

#### Manual

- [x] 2.4 On mobile and desktop, keyboard users can reach the offer list and creation page through visible, clearly labeled navigation; the dashboard shows no offer records. — 10dc93b
- [x] 2.5 Duplicate customer names remain distinguishable, and offer rows clearly show status, current PLN price, deadline, and a concise original-scope identity. — 10dc93b
- [x] 2.6 Empty, unavailable, failed-load, and expired-session states are understandable without exposing another contractor's data. — 10dc93b

### Phase 3: End-to-end browsing verification

#### Automated

- [x] 3.1 `npm run lint` and `npm run build` pass. — 8bf0d2c
- [x] 3.2 `npm run offer-contract` and `npm run smoke` pass with configured local Supabase and cover protected browsing, pagination, current values, and creation handoff. — 8bf0d2c

#### Manual

- [x] 3.3 The dashboard, offer list, and creation page form a usable sidebar flow in light and dark themes on phone and desktop. — 8bf0d2c
- [x] 3.4 Current Chrome, Safari, Edge, and Firefox show correct offer status, price, deadline, grouping, and pagination without color-only cues. — 8bf0d2c
