# Record Offer Change Implementation Plan

## Overview

Build an assisted change-recording flow on the structured offer baseline. The contractor reviews a deterministic estimate, confirms commercial and deadline effects, and records a proposal whose content remains stable through customer review.

## Current State Analysis

`offer_items` provides the original item baseline and exact per-line rounding (`supabase/migrations/20260924000000_structured_offers.sql:14-37`; `src/lib/offer-items.ts:218-230`). The shared read adds accepted price and deadline deltas but returns original items (`supabase/migrations/20260924000000_structured_offers.sql:352-399`). The PIN decision RPC finalizes a change without applying item effects (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:239-318`). Authenticated users can still mutate pending and agreed change rows directly (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:111-116`; `supabase/migrations/20260921010000_protect_customer_decisions.sql:11-27`).

The offer detail page shows original totals and items and is the natural contractor entry point (`src/pages/offers/[offerId].astro:39-71`, `:115-203`). Existing API routes provide bounded request parsing and cookie-backed authentication patterns.

## Desired End State

A pending original offer can be replaced by a new, auditable revision that the customer accepts as one offer. Once accepted, proposals contain immutable before/after item effects and estimate evidence. The active item set applies accepted or agreed effects in activation order; pending, rejected, and superseded proposals remain historical. Contractor and shared reads present the same active price and scope, while shared reads exclude labor assumptions.

### Key Discoveries:

- A change can have zero price movement even when quantity changes because rounded before/after line totals can be equal (`src/lib/offer-items.ts:218-230`).
- Original-item editing and change insertion already lock the parent offer, providing a transaction ordering pattern (`supabase/migrations/20260924000000_structured_offers.sql:306-329`; `supabase/migrations/20260924020000_serialize_offer_change_inserts.sql:8-18`).
- `items_revision` tracks original edits, not accepted scope changes; an active-scope revision is required.
- The shared projection deliberately omits `labor_hours_per_unit` (`supabase/migrations/20260924000000_structured_offers.sql:363-374`).

## What We're NOT Doing

No internal cost or margin calculation, tax engine, AI estimate, automatic finish-date prediction, full scheduling graph, inventory, customer account, or full offer snapshot comparison UI. This work prepares customer-facing decision contracts, while S-05 and S-06 deliver the shared screens.

## Implementation Approach

Use controlled database commands for base-offer revision, change publication, and PIN decisions. Revoke direct contractor mutation of change records. Keep original accepted items intact; store immutable item effects and estimate snapshots with each proposal. Calculate suggestions in a shared typed module for preview, then validate authoritative totals and revisions at the database command boundary. Use one effective-scope projection for subsequent estimates and current-offer reads.

## Phase 1: Data and Decision Contract

### Overview

Establish durable revision, supersession, ownership, and activation rules before adding the estimator UI.

### Changes Required:

#### 1. Offer revision and proposal schema

**File**: new migration under `supabase/migrations/`

**Intent**: Preserve each pending base-offer revision and each published change exactly as presented. Prevent direct edits or deletion from erasing history or bypassing approval.

**Contract**: Add a base-offer revision record with revision identity, item snapshot, status, and decision; add an active-scope revision to offers. Extend change records with `superseded` status, proposal revision, supersession linkage, immutable estimate snapshot, item effects, and activation order. Store before/after item values under stable item IDs; removal has no after-state, while addition receives a new ID. Restrict authenticated writes to controlled commands.

#### 2. Transactional commands and PIN decisions

**File**: new migration under `supabase/migrations/`

**Intent**: Make the transition from pending offer to accepted baseline and from proposal to active scope atomic and repeatable.

**Contract**: A base-revision command locks the offer and replaces only an unaccepted offer, retaining the prior revision. A change-publication command checks ownership and expected active-scope revision, validates item identity, arithmetic, nonnegative active total, and confirmed impact, then supersedes any pending proposal under the same lock. Confirmed zero price and date impact becomes `agreed`; any nonzero impact becomes `pending`. PIN decision commands bind to the exact base or change revision, reject superseded IDs, and activate an accepted item effect once. Repeating an already recorded decision returns that decision.

#### 3. Effective item projection

**File**: new migration under `supabase/migrations/`

**Intent**: Make current scope and the next estimate use the same agreed item values.

**Contract**: Project original accepted items plus effects from accepted and agreed changes in persisted activation order. Exclude pending, rejected, and superseded effects. Maintain the original base amount and add only active change deltas; never also rewrite it with the same amendment. Preserve a reconciliation amount for confirmed credits and commercial adjustments.

### Success Criteria:

#### Automated Verification:

- Contract tests prove base replacement history, exact-revision PIN decisions, idempotent activation, and stale-ID rejection.
- Contract tests prove direct pending/agreed mutation and deletion are denied, including foreign-contractor access.
- A deterministic concurrent-transaction test proves publication, original editing, and customer decision serialize on the offer lock.

#### Manual Verification:

- Review the migration on a local database and confirm a superseded customer view cannot decide the current proposal.

**Implementation Note**: Pause after automated checks for manual database-contract review before Phase 2.

---

## Phase 2: Estimation and Templates

### Overview

Calculate explained price and effort suggestions using existing selling rates and contractor-confirmed conditions.

### Changes Required:

#### 1. Exact estimator

**File**: new helpers under `src/lib/`, reusing `src/lib/offer-items.ts`

**Intent**: Provide predictable calculations for additions, omissions, replacements, and quantity or specification changes.

**Contract**: Use supported S-08 units and three-decimal inputs. For each changed item, subtract its rounded before-line amount from its rounded after-line amount; calculate effort from exact quantity × hours-per-unit values and round only for display. Handle signed money with a dedicated formatter and exact serialization. A unit change is a replacement unless the contractor explicitly supplies a conversion.

#### 2. Credits, consequences, and explanations

**File**: new helpers under `src/lib/`

**Intent**: Avoid automatically crediting completed work or charging duplicate consequences.

**Contract**: Record completed quantity and a contractor-confirmed omission credit for partly completed work. Add explicit consequence operations such as removal or restoration, deduplicated by shared operation identity. Present calculated item effects, confirmed credit, and a separate reasoned commercial adjustment; preserve both suggestion and confirmed value. Mark missing measurements, rates, or credit decisions as “needs assessment,” never as zero impact.

#### 3. Reusable templates

**File**: new template data and contractor-owned persistence contract

**Intent**: Speed recurring estimates across painting, tiling, electrical, and plumbing without implying validated market rates.

**Contract**: Starter templates supply names, supported units, condition prompts, and possible companion operations. Contractor rates and person-hours are entered or confirmed before use. Saved contractor templates are reusable; the proposal snapshots their values so later template edits cannot alter it.

### Success Criteria:

#### Automated Verification:

- Calculator tests cover half-grosz before/after subtraction, signed reductions, successive changes, exact effort, zero-hour inputs, and amount bounds.
- Tests cover partial-work credit, override reconciliation, missing inputs, incompatible units, and duplicate consequence suppression.
- Tests prove a saved estimate remains unchanged after its template is edited.

#### Manual Verification:

- A contractor reviews representative cases from all four trades and confirms that prompts reveal missing site facts without presenting example rates as market prices.

**Implementation Note**: Pause for contractor review of template examples before Phase 3.

---

## Phase 3: Contractor Workflow

### Overview

Let the contractor inspect effective work, preview an estimate, confirm its terms, and record a revision or change.

### Changes Required:

#### 1. Recording API

**File**: new routes under `src/pages/api/offers/`

**Intent**: Expose bounded, authenticated preview and publication actions that follow existing route conventions.

**Contract**: Authenticate with the cookie-backed Supabase client; validate bounded payloads and expected revision; return field errors, 409 for stale/superseded state, and no-store responses. The server recomputes or validates every confirmed amount through the controlled database command rather than trusting client totals.

#### 2. Offer detail and change form

**File**: `src/pages/offers/[offerId].astro` and a new component under `src/components/offers/`

**Intent**: Make original versus effective scope clear and guide the contractor through a change.

**Contract**: Show current effective items and total alongside the retained original offer. Select an existing item or add work; collect completed quantity and consequence facts; preview price, person-hours, reasons, and missing inputs. Require confirmation of credits, commercial adjustment reasons, and target date. Derive the contractual signed calendar-day delta from the confirmed date and current active deadline. Before first acceptance, publication creates a new pending base revision; afterward it creates a change proposal. Show supersession before replacing a pending proposal.

### Success Criteria:

#### Automated Verification:

- HTTP tests cover successful recording, malformed and oversized requests, stale revisions, anonymous access, and foreign offers.
- Lint and build pass: `npm run lint` and `npm run build`.

#### Manual Verification:

- On phone and desktop, create a base replacement, a price-changing proposal, and a zero-impact correction; verify clear totals, keyboard access, and actionable errors.

**Implementation Note**: Pause for manual workflow confirmation before Phase 4.

---

## Phase 4: Current Reads and Decision Verification

### Overview

Make every current-offer view consistent with effective scope and prove customer decisions cannot change a newer proposal.

### Changes Required:

#### 1. Contractor and shared reads

**File**: offer read RPCs and `src/pages/offers/[offerId].astro`

**Intent**: Present the same active scope and totals wherever the offer is viewed.

**Contract**: Return effective public item fields, active amount, deadline, and proposal history in stable order. Include customer-facing price explanation and decision status; exclude labor hours, template assumptions, and private assessment notes from the shared projection. Preserve one-offer isolation through the share token.

#### 2. PIN decision integration

**File**: decision RPC migration and contract/HTTP test scripts

**Intent**: Ensure a customer acts on the exact offer or change revision displayed.

**Contract**: The six-digit PIN remains required. A stale or superseded revision returns a conflict and cannot activate effects. Accepted and rejected decisions remain timestamped and idempotent. S-05 and S-06 can call these contracts when their customer screens are built.

### Success Criteria:

#### Automated Verification:

- Contract tests compare exact effective item values and active totals after accepted, agreed, pending, rejected, and superseded proposals.
- Tests prove private fields are absent, shared access stays within one offer, and repeated PIN decisions cannot duplicate effects.
- `npm run lint`, `npm run build`, `npm run offer-contract`, and configured `npm run smoke` pass.

#### Manual Verification:

- Review contractor and shared representations of a successive accepted change, a rejected change, and a superseded open view; confirm scope, price explanation, and deadline agree.

## Testing Strategy

### Unit Tests:

Exercise exact money and quantity arithmetic, signed formatting, effort precision, credit rules, consequence deduplication, and template snapshots.

### Integration Tests:

Extend `scripts/offer-contract.mjs` with real pending exclusion, terminal decision states, full item-value comparison, stale revisions, supersession, and held concurrent transactions. Extend `scripts/smoke.mjs` for the new authenticated API’s success and failure paths.

### Manual Testing Steps:

1. Replace a pending original offer and confirm the prior revision remains visible in history.
2. Accept an original offer, then record and accept a quantity increase; estimate another increase against the newly agreed quantity.
3. Open a pending proposal, publish a newer correction, and verify the older proposal cannot be decided.
4. Compare the contractor and shared views for price, deadline, public items, and private-field isolation.

## Performance Considerations

Index item effects by offer and activation order. Keep one canonical effective-scope query for reads and estimation, and inspect its plan with a representative offer containing many historical changes before release.

## Migration Notes

Migrate existing preproduction structured offers without another reset. Preserve current original items and decisions. Existing change rows without structured effects remain historical price/deadline entries; they do not imply item changes. Include their active deltas in the aggregate amount and deadline, show them as legacy adjustments in the reconciliation, and leave effective item values at the original baseline until later structured effects apply.

## References

- Research: `context/changes/record-offer-change/research.md`
- Product contract: `context/foundation/prd.md`
- Structured offer and shared projection: `supabase/migrations/20260924000000_structured_offers.sql`
- Existing decision contract: `supabase/migrations/20260921000000_minimal_offer_record_contract.sql`
- Existing arithmetic: `src/lib/offer-items.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data and Decision Contract

#### Automated

- [x] 1.1 Contract tests prove base replacement history, exact-revision PIN decisions, idempotent activation, and stale-ID rejection. — 7a4fc9a
- [x] 1.2 Contract tests prove direct pending/agreed mutation and deletion are denied, including foreign-contractor access. — 7a4fc9a
- [x] 1.3 A deterministic concurrent-transaction test proves publication, original editing, and customer decision serialize on the offer lock. — 7a4fc9a

#### Manual

- [x] 1.4 Review the migration on a local database and confirm a superseded customer view cannot decide the current proposal. — 7a4fc9a

### Phase 2: Estimation and Templates

#### Automated

- [x] 2.1 Calculator tests cover half-grosz before/after subtraction, signed reductions, successive changes, exact effort, zero-hour inputs, and amount bounds. — f76d43b
- [x] 2.2 Tests cover partial-work credit, override reconciliation, missing inputs, incompatible units, and duplicate consequence suppression. — f76d43b
- [x] 2.3 Tests prove a saved estimate remains unchanged after its template is edited. — f76d43b

#### Manual

- [x] 2.4 A contractor reviews representative cases from all four trades and confirms that prompts reveal missing site facts without presenting example rates as market prices. — f76d43b

### Phase 3: Contractor Workflow

#### Automated

- [x] 3.1 HTTP tests cover successful recording, malformed and oversized requests, stale revisions, anonymous access, and foreign offers. — 2fc9b36
- [x] 3.2 Lint and build pass: `npm run lint` and `npm run build`. — 2fc9b36

#### Manual

- [x] 3.3 On phone and desktop, create a base replacement, a price-changing proposal, and a zero-impact correction; verify clear totals, keyboard access, and actionable errors. — 2fc9b36

### Phase 4: Current Reads and Decision Verification

#### Automated

- [x] 4.1 Contract tests compare exact effective item values and active totals after accepted, agreed, pending, rejected, and superseded proposals. — 566df81
- [x] 4.2 Tests prove private fields are absent, shared access stays within one offer, and repeated PIN decisions cannot duplicate effects. — 566df81
- [x] 4.3 `npm run lint`, `npm run build`, `npm run offer-contract`, and configured `npm run smoke` pass. — 566df81

#### Manual

- [x] 4.4 Review contractor and shared representations of a successive accepted change, a rejected change, and a superseded open view; confirm scope, price explanation, and deadline agree. — 566df81
