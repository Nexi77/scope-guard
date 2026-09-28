# View Offer History Implementation Plan

## Overview

Finish the existing contractor history view so each entry describes what happened at that point in time, future replacements have their own dated events, and long histories remain browsable. Preserve the current offer as the authoritative view of active scope, amount, and deadline.

## Current State Analysis

The contractor already has `/offers/[offerId]` for current state and `/offers/[offerId]/history` for revision snapshots, change proposals, and customer decisions. The history page merges records in time order, but its creation cards display their eventual status, replacement is only a status on the old record, and the loader fetches every revision and change without a page boundary. The current offer excludes pending and rejected effects. Existing replacement links connect an old revision or proposal to its successor, but only change rows have a mutable `updated_at`; neither record has a dedicated replacement time. History uses the same owner-scoped loader as other contractor pages, while the overview explicitly disables caching and history does not.

## Desired End State

A contractor can move between the current offer and a bounded chronological history of revisions, proposals, decisions, and future replacement events. “Review pending change” on the current offer opens the exact proposal details in history and makes the destination apparent. A creation entry states the state at creation; later decisions and replacements have their own entries and link to the affected and successor records. Rejected proposals remain visible but never enter active scope. Existing replacements without an explicit recorded time remain marked as replaced in their details, without a fabricated dated event. A foreign or unavailable offer reveals no history.

### Key Discoveries:

- The roadmap already defines S-07 as a contractor view with a rejection reason, and FR-004 excludes full offer comparison (`context/foundation/roadmap.md`, S-07; `context/foundation/prd.md`, FR-004).
- The current history route already renders revision, proposal, and decision entries but uses final status in creation cards (`src/pages/offers/[offerId]/history.astro:17`, `src/pages/offers/[offerId]/history.astro:146`).
- The owner-scoped loader selects all revisions and changes and then fetches their decisions (`src/lib/contractor-offer-view.ts:174`, `src/lib/contractor-offer-view.ts:214`, `src/lib/contractor-offer-view.ts:268`).
- Replacement links already exist in both record types (`supabase/migrations/20260925000000_offer_change_revisions.sql:16`, `supabase/migrations/20260925000000_offer_change_revisions.sql:38`).
- The offer overview separates agreed values from pending effects (`src/pages/offers/[offerId].astro:25`, `src/pages/offers/[offerId].astro:127`).

## What We're NOT Doing

- A full version comparison or reconstruction of the offer at arbitrary historical times.
- A new customer portal or an expanded shared-link history view.
- Backfilling dated replacement events for replacements that occurred before this change.
- Changing customer decision, PIN, current-scope, or pricing rules.

## Implementation Approach

Add explicit replacement timestamps to the two existing record types and set them in the same transaction that replaces a pending record. Build one owner-scoped, cursor-paged history event read that merges creation, decision, and dated replacement events with stable ordering. Render that stream in the contractor history route, while retaining expandable detail snapshots and clear links to the current offer. Use the existing offer ownership and RLS boundaries and add history-specific contract and smoke coverage.

## Critical Implementation Details

### Timing & lifecycle

PostgreSQL `now()` gives one transaction timestamp, so a replacement and its successor creation can tie. The event read must define a stable same-time order: replacement before successor creation, then a stable record ID. A replacement timestamp is written only when a replacement actually occurs; existing null timestamps are not inferred or backfilled.

## Phase 1: Record Future Replacement Times

### Overview

Make revision and proposal replacement an explicitly dated, atomic fact while preserving existing rows and authorization.

### Changes Required:

#### 1. Replacement data contract

**File**: new `supabase/migrations/*.sql`

**Intent**: Store the time at which a pending revision or proposal was superseded so the history can render a real event. Keep earlier replacements undated as agreed.

**Contract**: Add nullable `superseded_at` to `offer_revisions` and `offer_changes`; future replacement mutations set `status`, `superseded_by`, and `superseded_at` atomically. Accepted, rejected, and agreed records must not receive a replacement time. Keep existing owner RLS and read grants intact. Do not backfill prior rows.

#### 2. Database contract coverage

**File**: `scripts/offer-contract.mjs`

**Intent**: Prove the new timestamp follows the replacement lifecycle and cannot imply a replacement that never happened.

**Contract**: Cover initial-offer revision replacement and pending proposal replacement, successor linkage, unchanged historical null timestamps, and non-replacement decisions; preserve the existing ownership and active-scope assertions.

### Success Criteria:

#### Automated Verification:

- Local migration applies and `npm run offer-contract` passes with dated future replacements and undated existing records.
- `npm run lint` and `npm run build` pass after the schema and contract changes.

#### Manual Verification:

- Inspect a replaced revision and proposal in the local database: each new replacement has one successor and a timestamp, while earlier fixtures retain null replacement times.

---

## Phase 2: Read and Present a Bounded Event Timeline

### Overview

Give the contractor an accurate chronological timeline that remains navigable when the offer has many records.

### Changes Required:

#### 1. Owner-scoped event read

**File**: new `supabase/migrations/*.sql`, `src/lib/contractor-offer-view.ts` or a dedicated `src/lib/offer-history.ts`

**Intent**: Read a bounded page of history events without silently losing records at the Supabase row limit. Preserve one neutral unavailable result for missing and foreign offers.

**Contract**: The history read accepts an offer ID, an optional cursor, and a bounded page size; returns creation, customer decision, and dated replacement events plus enough saved snapshot/detail data to render each page. Preserve the existing earliest-to-latest presentation: order by event timestamp, event priority for ties, and stable ID; the cursor uses the same tuple and exposes whether a later page exists. Scope every read to the authenticated contractor and the requested offer. An undated old replacement is available as metadata on its old record, never as a dated event. Keep general overview reads limited to their existing sections.

#### 2. Contractor history page

**File**: `src/pages/offers/[offerId]/history.astro`, `src/components/offers/OfferDetailNav.astro` if navigation needs adjustment

**Intent**: Show the history as events with clear state-at-event labels and a way to browse the complete record while keeping existing proposal details and rejection reasons accessible.

**Contract**: Revision creation says recorded/pending; a paid or deadline-affecting change creation says proposed/pending; a zero-impact correction says agreed at creation. Decision events show their recorded outcome and rejection comment. Future replacement events identify both old and successor records with stable in-page or page links. Old replacements without a timestamp carry an undated “replaced” note in their details. The existing `Review pending change` link and post-record redirect must resolve the exact `#change-<id>` target, load its page if needed, open its details, and give the target visible focus or emphasis; refresh and browser Back must still reach that target. Page controls have usable keyboard focus and preserve the offer ID and cursor. Set `Cache-Control: no-store` on the history response.

### Success Criteria:

#### Automated Verification:

- `npm run offer-contract` verifies owner isolation, stable tie ordering, cursor continuity without duplicates or missing events, and no dated event for old null timestamps.
- `npm run smoke` verifies contractor history access, chronological event labels, decision reasons, replacement links, pending anchors, and complete navigation across more than one page.
- `npm run lint` and `npm run build` pass.

#### Manual Verification:

- On desktop and phone, browse an offer with several pages: creation, decision, replacement, and zero-impact correction remain understandable and every page is reachable by keyboard.
- Check that pending and rejected effects do not change the amount, deadline, or work shown on the current offer; capture before/after screenshots for the UI change.
- From the current offer, activate “Review pending change” and confirm the exact proposal details open with a visible target, including when the proposal is outside the first history page and after refresh or Back.

---

## Phase 3: Verify History and Current-State Boundaries

### Overview

Exercise the complete contractor journey and protect the security and current-scope invariants that make the timeline trustworthy.

### Changes Required:

#### 1. End-to-end regression coverage

**File**: `scripts/smoke.mjs`, `scripts/offer-contract.mjs`

**Intent**: Ensure the new event read reflects actual decisions and replacements without broadening access or activating rejected work.

**Contract**: Test pending, accepted, rejected, agreed, and superseded records; exact rejection reason and decision time; same-time replacement ordering; owner/foreign/anonymous access; long-history page boundaries; and current offer values after pending, accepted, and rejected changes. Retain the existing idempotent decision checks.

#### 2. Final UI and documentation check

**File**: `src/pages/offers/[offerId]/history.astro`, `context/changes/view-offer-history/plan.md`

**Intent**: Confirm the delivered history matches this plan and the roadmap outcome without expanding the shared-link view.

**Contract**: Keep offer and history navigation clear, verify empty/unavailable states and accessible focus, and record completion only through the canonical Progress section during implementation.

### Success Criteria:

#### Automated Verification:

- `npm run offer-contract`, `npm run smoke`, `npm run lint`, and `npm run build` pass against a configured local Supabase environment.
- Existing anonymous and foreign offer checks still return the established redirect or neutral unavailable response without exposing another contractor's history.

#### Manual Verification:

- Follow the current offer → history → proposal details → current offer journey on desktop and phone, including a rejected change reason and an old undated replacement.
- Review screenshots for readable event order, page controls, empty state, and visible keyboard focus.

---

## Testing Strategy

### Unit Tests:

- Test event projection and cursor ordering at equal timestamps, including replacement before successor creation and stable ID ties.
- Test labels for pending proposals, agreed zero-impact corrections, decisions, and old undated replacements.

### Integration Tests:

- Extend database contract coverage for atomic timestamp and successor linkage, RLS, page continuity, and unchanged active scope.
- Extend local HTTP smoke coverage for contractor access, cross-page navigation, rejection reasons, stable anchors, and no history leakage.

### Manual Testing Steps:

1. Open a pending initial offer, replace it, and inspect both the dated replacement and the new revision in history.
2. Accept an offer, publish and replace a pending change, reject a later change with a reason, and confirm the current amount and deadline exclude pending/rejected effects.
3. Navigate a long history with keyboard and on a narrow phone viewport; check the links between old and successor records.
4. Inspect an offer containing a pre-migration replacement: it is marked replaced without a fabricated dated event.

## Performance Considerations

Use a fixed maximum page size and a deterministic cursor across all event types. Return only the event page and its associated snapshots; avoid the current all-record load and preserve the overview's selective reads. A history link to a specific proposal must resolve even when that proposal is outside the first page.

## Migration Notes

Apply the additive migration before deploying a history page that reads replacement timestamps or the new event contract. Preexisting rows keep null `superseded_at` by design. Rollback of the application can continue reading existing tables; removal of the additive columns or event read should occur only after the new application path is retired. No existing decision or offer data is cleared.

## References

- Product contract: `context/foundation/prd.md` (FR-004, FR-005, Business Logic, Non-Goals).
- Roadmap slice: `context/foundation/roadmap.md` (S-07).
- Existing contractor routes: `src/pages/offers/[offerId].astro:21`, `src/pages/offers/[offerId]/history.astro:9`.
- Owner-scoped loader: `src/lib/contractor-offer-view.ts:112`.
- Existing replacement schema and mutation pattern: `supabase/migrations/20260925000000_offer_change_revisions.sql:5`, `supabase/migrations/20260927000000_match_item_effects_to_active_snapshot.sql:139`, `supabase/migrations/20261003000000_lock_replacement_after_change_history.sql:40`.
- Existing browser paging pattern: `src/pages/offers/index.astro:8`.
- Verification scripts: `scripts/offer-contract.mjs`, `scripts/smoke.mjs`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Record Future Replacement Times

#### Automated

- [x] 1.1 Local migration applies and `npm run offer-contract` passes with dated future replacements and undated existing records. — 3c9f198
- [x] 1.2 `npm run lint` and `npm run build` pass after the schema and contract changes. — 3c9f198

#### Manual

- [x] 1.3 Inspect a replaced revision and proposal in the local database: each new replacement has one successor and a timestamp, while earlier fixtures retain null replacement times. — 3c9f198

### Phase 2: Read and Present a Bounded Event Timeline

#### Automated

- [x] 2.1 `npm run offer-contract` verifies owner isolation, stable tie ordering, cursor continuity without duplicates or missing events, and no dated event for old null timestamps. — 18967bb
- [x] 2.2 `npm run smoke` verifies contractor history access, chronological event labels, decision reasons, replacement links, pending anchors, and complete navigation across more than one page. — 18967bb
- [x] 2.3 `npm run lint` and `npm run build` pass. — 18967bb

#### Manual

- [x] 2.4 On desktop and phone, browse an offer with several pages: creation, decision, replacement, and zero-impact correction remain understandable and every page is reachable by keyboard. — 18967bb
- [x] 2.5 Check that pending and rejected effects do not change the amount, deadline, or work shown on the current offer; capture before/after screenshots for the UI change. — 18967bb
- [x] 2.6 From the current offer, activate “Review pending change” and confirm the exact proposal details open with a visible target, including when the proposal is outside the first history page and after refresh or Back. — 18967bb

### Phase 3: Verify History and Current-State Boundaries

#### Automated

- [x] 3.1 `npm run offer-contract`, `npm run smoke`, `npm run lint`, and `npm run build` pass against a configured local Supabase environment.
- [x] 3.2 Existing anonymous and foreign offer checks still return the established redirect or neutral unavailable response without exposing another contractor's history.

#### Manual

- [ ] 3.3 Follow the current offer → history → proposal details → current offer journey on desktop and phone, including a rejected change reason and an old undated replacement.
- [ ] 3.4 Review screenshots for readable event order, page controls, empty state, and visible keyboard focus.
