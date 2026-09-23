# Prepare Structured Offer Implementation Plan

## Overview

Let a contractor create an offer with priced, measurable work items and review or correct those items before any change is recorded. This gives the later change estimator a trustworthy item identity, selling rate, and labor-effort baseline while preserving the existing offer total and access boundaries.

## Current State Analysis

- Offer creation records one free-text `base_scope`, aggregate PLN `base_amount_minor`, and deadline through an atomic customer/offer RPC. The browser has no item entry or offer detail view (`src/components/offers/CreateOfferForm.tsx:23-77`, `src/pages/api/offers/index.ts:38-64`, `supabase/migrations/20260922000000_create_client_offer.sql:1-103`).
- `offers` has no work-item relation. Contractor browsing and the token-scoped shared RPC derive the current total from the base amount plus accepted/agreed change deltas (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-30,158-217`, `supabase/migrations/20260923000000_browse_client_offers.sql:43-80`).
- The current creation contract is protected by cookie-backed authentication and owner-scoped database access. Contract tests prove atomic creation and ownership; smoke tests cover scalar offer creation and browsing (`src/lib/supabase.ts:1-20`, `src/middleware.ts:4-24`, `scripts/offer-contract.mjs:136-242`, `scripts/smoke.mjs:136-229`).
- The roadmap's S-08 outcome asks for named work items, quantities, units, specifications, pricing and effort assumptions, calculated line amounts, a total, and a retained contextual description. Its earlier legacy-offer mapping requirement is superseded for this plan by the product owner's decision that current preproduction data can be cleared (`context/foundation/roadmap.md`, S-08; planning decision on 2026-09-23).
- PRD v1 still describes manually entered offer totals and change effects. Its product contract must be aligned with the roadmap's MS-01 before implementing this expanded offer model (`context/foundation/prd.md`, FR-001–FR-003; `context/foundation/roadmap.md`, Open Roadmap Questions).

## Desired End State

A signed-in contractor creates a new offer and customer atomically with at least one complete work item. Each item has a stable ID, name, positive exact-decimal quantity, unit, specification, customer selling rate in PLN, and explicit labor hours per unit. The system calculates each line amount and derives the offer's base total from those lines; the original description and deadline remain available as context. The contractor can open a dedicated offer view and edit the original items only while the offer is pending and **no change row of any status has ever been recorded**. Customer-facing projections contain item scope and selling prices, while labor assumptions remain private. Invalid, foreign, stale, or inconsistent submissions cannot change the offer or create partial records.

### Key Discoveries:

- The existing `create_offer_with_customer` RPC is the atomic boundary for new-customer and offer creation; separate browser writes would reintroduce partial records (`supabase/migrations/20260922000000_create_client_offer.sql:50-103`).
- Existing authenticated table grants allow direct offer writes, so a server-only check would not enforce the new item/total and edit invariants. Database permissions or equivalent constraints must close that path (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:88-133`).
- The shared RPC explicitly constructs its JSON response. It can expose only public item fields without granting anonymous access to the item table or revealing private labor assumptions (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:179-217`).
- The estimation research distinguishes selling price from internal cost and labor effort from schedule impact. This slice supplies the baseline; recipes, complexity, and change calculations belong to S-04 (`context/changes/record-offer-change/research.md`, Architecture Insights; `context/foundation/roadmap.md`, S-04).

## What We're NOT Doing

- Migrating, mapping, or preserving existing text-only test offers. The product owner permits clearing current preproduction data; a controlled reset is a deployment prerequisite, not an automatic migration side effect.
- Internal cost, markup, tax calculation, or tax-inclusive/exclusive switching. Entered rates and totals use the same customer-facing final PLN basis as the existing total.
- Work recipes, trade catalogs, change estimates, progress tracking, schedule calculation, customer approval, or PDF generation. Those belong to later slices.
- A public customer page in this slice. The shared RPC prepares a safe item projection for S-05, while the contractor review view is delivered now.
- Full offer versioning, customer accounts, or a broad client portal.

## Implementation Approach

Extend the current atomic creation RPC to accept and validate a bounded item collection, persist it with the customer and offer, and calculate `base_amount_minor` from rounded line amounts. Add an owner-scoped edit RPC that replaces the proposed item set and recalculates the same total only when status is pending, no `offer_changes` row exists, and the submitted offer revision is current. Keep item IDs stable for retained rows so S-04 can later refer to affected work. Remove direct authenticated writes that could bypass these invariants while retaining owner-scoped reads and the existing PIN/decision RPCs. The form uses a local calculation for immediate feedback; the database result is authoritative. A dedicated contractor detail route reads the saved items and provides review/edit access.

## Critical Implementation Details

### Timing & lifecycle

The creation and edit RPCs must lock the offer and perform item replacement, line rounding, total recomputation, and revision advance in one transaction. For editing, an existing change row of **any** status blocks original-item mutation; a rejected change still means the baseline has entered history. A later shared view must not mistake the offer's initial `pending` status for customer acceptance.

## Phase 1: Product and database contract

### Overview

Align the product contract, define exact item arithmetic and ownership, and establish atomic creation/edit operations before changing the UI.

### Changes Required:

#### 1. Product contract alignment

**Files**: `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: Record the agreed structured-offer requirement and remove the superseded legacy-mapping promise so implementation and later slices have one current product baseline.

**Contract**: Add the itemized baseline and calculation rules to the PRD's Functional Requirements and Business Logic without changing the customer approval guardrail. Revise only S-08's outcome/unknowns and related roadmap notes to state that preproduction data may be reset, newly created offers require items, and S-04 consumes the item baseline; preserve stable IDs and other roadmap statuses.

#### 2. Item schema, arithmetic, and access

**File**: `supabase/migrations/<timestamp>_structured_offers.sql`

**Intent**: Store stable, ordered item identities and exact assumptions, while preventing a separate total from diverging from item prices or private effort data from escaping through table grants.

**Contract**: Add owner-linked `offer_items` with stable UUID, offer ID, contractor ID, display position, required name/specification/unit, quantity `numeric` with a documented three-decimal limit, nonnegative customer selling rate in integer PLN minor units, and nonnegative labor hours per unit with a documented three-decimal limit. Quantity must be positive. Define line amount as quantity × selling rate, rounded once per line to the nearest grosz with halves rounded up; `base_amount_minor` is the sum of those rounded lines, within the existing amount bound. Enforce composite ownership, RLS, and no anonymous table grant. A saved offer must have at least one item. Retain `base_scope` as the contextual description and the existing deadline/status/change tables.

#### 3. Atomic creation and guarded editing

**File**: `supabase/migrations/<timestamp>_structured_offers.sql`

**Intent**: Preserve the existing new-or-owned-customer choice and avoid partial offers, while allowing corrections only before change history begins.

**Contract**: Extend or replace `create_offer_with_customer` with an authenticated entrypoint accepting the existing customer choice, scope description, deadline, and a bounded item payload; derive total server-side and return offer/customer IDs. Add an authenticated owner-scoped item-edit entrypoint with expected revision and complete replacement payload. It may write only when offer status is `pending`, no `offer_changes` row exists for that offer, and revision matches. Preserve IDs of retained items; reject duplicate/foreign item IDs, malformed units/numbers, excessive payloads, invalid totals, and stale revisions. Restrict direct authenticated writes to offer base fields and items so the RPC invariants cannot be bypassed; keep current PIN and customer-decision operations functional. Update `get_shared_offer` to project only item name, quantity, unit, specification, selling rate, line amount, and total—never labor hours, private rates, hashes, or tokens.

### Success Criteria:

#### Automated Verification:

- The structured-offer migration applies to a fresh local Supabase database and the new RPC grants, item RLS, and direct-write restrictions match the contract.
- Database contract tests prove atomic new/existing-customer creation with at least one item, exact line rounding and total derivation, owner isolation, safe shared projection, and invalid-request rollback.
- Database contract tests prove edits succeed only for an owned pending offer with no change rows and a current revision; foreign, stale, and post-change edits preserve the prior items and total.

#### Manual Verification:

- Supabase Studio shows the owner-linked item records and confirms the shared response omits labor effort and other private fields.

---

## Phase 2: Itemized creation and contractor review

### Overview

Replace scalar price entry with a practical item editor, then give the contractor an offer detail page for review and permitted corrections.

### Changes Required:

#### 1. Reusable item calculation and editor

**Files**: `src/lib/offer-items.ts`, `src/components/offers/OfferItemsEditor.tsx`, `src/components/offers/CreateOfferForm.tsx`

**Intent**: Let the contractor add, remove, and correct multiple named work items with immediate line and total feedback, without trusting browser-calculated amounts at save time.

**Contract**: The editor requires at least one item and collects name, positive quantity, supported unit, specification, final PLN selling rate per unit, and explicit labor hours per unit. Show rounded line amounts and their sum, with contextual scope description and deadline still collected in the creation flow. Client validation mirrors the database rules, including empty fields, precision, bounds, and a stale-edit response; controls use the existing `Field` accessibility pattern. Labor hours are labeled as contractor-only. Do not show an independent editable aggregate price.

#### 2. Creation and edit endpoints

**Files**: `src/pages/api/offers/index.ts`, `src/pages/api/offers/[offerId]/items.ts`

**Intent**: Authenticate and validate submitted item payloads, call the atomic database boundary, and return safe feedback without accepting a browser total or contractor ID.

**Contract**: `POST /api/offers` keeps the existing customer selection/duplicate behavior but requires item data and redirects to the created offer detail. `POST /api/offers/[offerId]/items` updates a whole item set with the expected revision; reject unauthenticated, foreign, malformed, stale, and locked requests with a clear user-facing state. Server-side and database validation remain authoritative. Neither route logs submitted item assumptions or credentials.

#### 3. Offer review and navigation

**Files**: `src/pages/offers/[offerId].astro`, `src/pages/offers/index.astro`, `src/pages/offers/new.astro`, `src/components/offers/CreateOfferForm.tsx`

**Intent**: Make a saved offer easy to inspect and correct, and lead the contractor directly to that review after creation.

**Contract**: The protected detail route loads only the signed-in contractor's offer and ordered items, shows contextual description, item specifications, quantities, rates, rounded lines, total, deadline, and private labor assumptions, and offers edit controls only when the database says pending with no change rows. A locked offer remains readable and states why editing is unavailable. The customer offer list links to the detail route; the creation success state links to the created offer. An unavailable/foreign offer reveals no data.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass for the item editor, protected detail page, and endpoints.
- Smoke coverage creates an itemized offer, follows the detail link, checks calculated lines/total, edits before any change, and rejects malformed or unauthenticated submissions without partial records.
- Smoke or contract coverage verifies a foreign contractor cannot view or edit another offer's items and a stale/locked update leaves the stored total unchanged.

#### Manual Verification:

- On phone and desktop, the contractor can enter two differently measured items, review their rounded lines and total, correct an eligible offer, and understand validation and locked states using keyboard and screen-reader labels.

---

## Phase 3: End-to-end verification and handoff

### Overview

Run the full project gates and exercise the item baseline against existing offer and future shared-response contracts.

### Changes Required:

#### 1. Contract and smoke fixtures

**Files**: `scripts/offer-contract.mjs`, `scripts/smoke.mjs`

**Intent**: Update scalar-offer fixtures to the new required-item contract and guard the key success and failure paths without changing the existing PIN and decision behavior.

**Contract**: Contract fixtures create offers through the new atomic entrypoint or controlled admin seeding, and retain customer ownership, RLS, PIN, idempotent decision, accepted/rejected total, and browsing assertions. Add quantity precision, half-grosz rounding, multiple-item sum, post-change edit lock, same-offer stale revision, and public/private field separation cases. Smoke uses local Supabase registration credentials rather than enabling cloud signup.

#### 2. Final release check

**Files**: `context/changes/prepare-structured-offer/plan.md` and implementation files from prior phases

**Intent**: Verify the delivered slice is ready for S-04 without silently changing baseline price, deadline, or history after a change begins.

**Contract**: Run the declared lint, build, offer-contract, and configured local smoke commands; record manual device/browser observations separately. Check that existing PIN management and customer offer browsing still work and that no private labor assumption appears in the anonymous shared RPC result.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run build`, and `npm run offer-contract` pass against the migrated local schema.
- `npm run smoke` passes against a configured local Supabase environment and covers itemized create, review, edit, auth failure, and existing offer/PIN flows.

#### Manual Verification:

- A reviewer verifies the itemized flow and locked state on mobile and desktop in current Chrome, Safari, Edge, and Firefox, including keyboard use and readable price/effort labels.

## Testing Strategy

### Unit Tests:

- Pure item parsing/calculation cases for accepted decimal precision, zero/negative rejection, half-grosz line rounding, sum-after-line-rounding, amount bounds, and multiple units; share the rule with form preview without making that preview authoritative.

### Integration Tests:

- RPC transaction and permission cases: new/existing customer, no-item rejection, owner isolation, duplicate/foreign item IDs, stale revision, change-row lock, direct-write bypass rejection, safe shared projection, and unchanged PIN/decision flows.
- HTTP smoke cases: authenticated creation and detail, edit success, invalid input, foreign/anonymous access, and list navigation.

### Manual Testing Steps:

1. Create an offer with two items of different units, a description, and a deadline; compare every line and the total with the saved detail and offer list.
2. Edit the same pending offer before any change, then verify an offer with any recorded change is readable but cannot have its original items edited.
3. Check form errors, focus, private-effort labeling, and responsive layout on phone and desktop; inspect the anonymous shared projection for public item fields only.

## Performance Considerations

Bound item count and payload size at both HTTP and RPC boundaries. Load item rows for one owner-scoped offer in display order and keep the existing paginated offer list unchanged. The local form preview may recompute a small bounded list; the database calculates authoritative totals once per transaction. No catalog lookup, background task, or broad customer scan is required.

## Migration Notes

The project is not production deployed, and the product owner permits discarding current test offers. Reset only the identified preproduction Supabase database before enforcing the required-item creation contract; do not embed deletion in the migration or silently clear a database. Fresh installs apply the migration normally. Preserve the existing offer/change/decision history schema and aggregate read contracts; the offer base total for every new itemized offer is derived from its items. If a target environment has data that must be retained, use a separate compatibility/migration plan before applying a hard required-item rule. Rollback must restore the prior RPC/grants and schema from the migration boundary, with pre-reset test data treated as intentionally disposable.

## References

- `context/foundation/prd.md` — FR-001–FR-003 and approval guardrails.
- `context/foundation/roadmap.md` — S-08, MS-01, S-04 dependency, and planning unknowns.
- `context/changes/record-offer-change/research.md` — structured baseline and private-estimate guidance.
- `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10-61,88-133,158-217`
- `supabase/migrations/20260922000000_create_client_offer.sql:1-103`
- `supabase/migrations/20260923000000_browse_client_offers.sql:43-80`
- `src/pages/api/offers/index.ts:29-89`
- `src/components/offers/CreateOfferForm.tsx:23-77,115-129,229-275`
- `src/pages/offers/index.astro:12-21,60-80,266-295`
- `scripts/offer-contract.mjs:136-242,435-549`; `scripts/smoke.mjs:136-229,301-415`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Product and database contract

#### Automated

- [x] 1.1 The structured-offer migration applies to a fresh local Supabase database and the new RPC grants, item RLS, and direct-write restrictions match the contract. — a355e69
- [x] 1.2 Database contract tests prove atomic new/existing-customer creation with at least one item, exact line rounding and total derivation, owner isolation, safe shared projection, and invalid-request rollback. — a355e69
- [x] 1.3 Database contract tests prove edits succeed only for an owned pending offer with no change rows and a current revision; foreign, stale, and post-change edits preserve the prior items and total. — a355e69

#### Manual

- [x] 1.4 Supabase Studio shows the owner-linked item records and confirms the shared response omits labor effort and other private fields. — a355e69

### Phase 2: Itemized creation and contractor review

#### Automated

- [x] 2.1 `npm run lint` and `npm run build` pass for the item editor, protected detail page, and endpoints. — d4df3dc
- [x] 2.2 Smoke coverage creates an itemized offer, follows the detail link, checks calculated lines/total, edits before any change, and rejects malformed or unauthenticated submissions without partial records. — d4df3dc
- [x] 2.3 Smoke or contract coverage verifies a foreign contractor cannot view or edit another offer's items and a stale/locked update leaves the stored total unchanged. — d4df3dc

#### Manual

- [x] 2.4 On phone and desktop, the contractor can enter two differently measured items, review their rounded lines and total, correct an eligible offer, and understand validation and locked states using keyboard and screen-reader labels. — d4df3dc

### Phase 3: End-to-end verification and handoff

#### Automated

- [x] 3.1 `npm run lint`, `npm run build`, and `npm run offer-contract` pass against the migrated local schema. — 20d715a
- [x] 3.2 `npm run smoke` passes against a configured local Supabase environment and covers itemized create, review, edit, auth failure, and existing offer/PIN flows. — 20d715a

#### Manual

- [x] 3.3 A reviewer verifies the itemized flow and locked state on mobile and desktop in current Chrome, Safari, Edge, and Firefox, including keyboard use and readable price/effort labels. — 20d715a
