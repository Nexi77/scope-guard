# Offer Flow Implementation Plan

## Overview

Make offer browsing, creation, and review easier to navigate. The contractor will see customers and their offers in a grouped list, create an offer in clearly ordered sections, and use separate pages for current state, history, proposing a change, and correcting a pending offer. Preserve the existing ownership, approval, pricing, and PIN contracts.

## Current State Analysis

`src/pages/offers/[offerId].astro` loads current scope, revisions, change history, templates, and editing forms in one long page. It shows a base-offer section even when the active agreed scope differs. `src/pages/offers/index.astro` uses separate customer and offer columns, cursor-based offer paging, and PIN controls in each offer card. `src/components/offers/CreateOfferForm.tsx` places template selectors above the item editor, while `OfferItemsEditor.tsx` appends new items and keys unsaved items by index. `Field` has no shared required marker.

The UI research in `research.md` did not capture an authenticated baseline screenshot. Local Supabase and application credentials are configured in uncommitted environment files; the implementation must verify that they point to a usable local stack before visual or smoke testing. Do not print their contents.

## Desired End State

`/offers` shows a responsive customer table with expandable offer groups, row actions, search, and numbered customer and per-customer offer pagination. `/offers/new` follows Customer → Scope and deadline → Items → Summary; item templates sit inside item cards. `/offers/[offerId]` shows the actual current state and eligible actions. Stable `/history`, `/changes/new`, and `/edit` routes each serve one task. Status and ownership checks run on the server, and a change waiting for approval never changes the displayed active amount or deadline.

### Key Discoveries:

- Middleware protects `/offers*`, but each offer lookup must still filter by `contractor_id` and return the same unavailable state for foreign and unknown IDs (`src/middleware.ts:4`, `src/pages/offers/[offerId].astro:80`).
- The replacement RPC currently checks `pending` only; the agreed edit rule is `pending` **and no recorded change history**. The page, API, and database mutation must agree (`supabase/migrations/20260925000000_offer_change_revisions.sql:378`, `src/pages/api/offers/[offerId]/revision.ts:67`).
- `list_customer_offers` is cursor based and returns no count, so it cannot supply numbered offer pages (`supabase/migrations/20260923000000_browse_client_offers.sql:1`).
- The current offer RPC and effective-item RPC already exclude pending and rejected changes from active work (`src/pages/offers/[offerId].astro:109`, `supabase/migrations/20260925000000_offer_change_revisions.sql:135`).
- Existing semantic tokens, `Button`, `Field`, and `DropdownMenu` are the design-system base (`src/styles/global.css:6`, `src/components/ui/button.tsx:1`, `src/components/ui/field.tsx:12`).

## What We're NOT Doing

- Customer accounts, a broad client portal, billing, CRM, or AI estimates.
- Changing the customer approval or PIN decision flow, or letting rejected changes enter active scope.
- New list filters beyond customer-name search.
- A multistep creation wizard or draft autosave.
- Full-version comparison, PDF work, or unrelated visual restyling.

## Implementation Approach

Capture the logged-in before view first. Extract a server-side offer loader used by the detail routes, then enforce the agreed edit eligibility in the mutation contract. Split the detail tasks into routes while keeping shared navigation and status language consistent. Improve the creation form through the existing components. Add count-aware, owner-scoped list queries before replacing the browse UI. Finish with route/state smoke coverage and desktop/mobile screenshots using the current semantic tokens.

## Critical Implementation Details

### Timing & lifecycle

Capture the authenticated desktop and mobile baseline of the existing offer detail, creation, and list views **before changing their markup**. The final screenshots must use comparable data and viewport sizes. Run Supabase CLI commands outside the sandbox with user approval, per `context/foundation/lessons.md`.

### State sequencing

Offer `updated_at` is the agreed customer-row activity signal. Confirm which existing mutations advance it and document that a pending proposal may not move the row's activity date; do not silently replace this decision with a broader event aggregate. For the history timeline, sort recorded events by timestamp and ID so ties are stable, while current-scope calculations remain sourced from the existing active-scope contract.

## Phase 1: Visual Baseline and Shared Offer Contract

### Overview

Record the before state, centralize owner-scoped reads for the detail routes, and make pending-offer replacement eligibility consistent through the server mutation boundary.

### Changes Required:

#### 1. Authenticated baseline

**File**: `context/changes/offer-flow/` (screenshots or a linked evidence note)

**Intent**: Capture desktop and mobile views for a representative logged-in offer detail, creation form, and offers list before editing UI markup. Record the offer states and viewport sizes used so the final comparison is reproducible.

**Contract**: Evidence is local to this change; exclude credentials and PIN values. If the local stack has no suitable records, create local test data only.

#### 2. Shared detail loader

**File**: `src/lib/contractor-offer-view.ts` (new), `src/pages/offers/[offerId].astro`

**Intent**: Reuse one owner-checked server read across overview, history, edit, and change pages. Load only the data each page needs, with typed current, revision, item, and pending-change records.

**Contract**: Validate `offerId`, require the authenticated contractor, filter the offer by `contractor_id`, and give unknown/foreign IDs the same 404/unavailable result. Derive `canEdit` from `pending && no offer_changes`, and `canProposeChange` from `accepted || agreed`; retain the existing effective-scope RPC as the active-work source.

#### 3. Replacement mutation guard

**File**: new `supabase/migrations/*.sql`, `src/pages/api/offers/[offerId]/revision.ts`, `scripts/smoke.mjs`

**Intent**: Prevent a direct request from replacing a pending offer after any change history exists. Preserve the current owner, stale-revision, validation, and item-identity guarantees.

**Contract**: The database replacement function rejects recorded change history within its transaction; the API maps that condition to a conflict response. Smoke coverage includes authorized success and the history-locked failure, plus foreign/unauthenticated behavior.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the loader, API, migration-adjacent code, and smoke changes.
- `npm run build` passes with the shared loader.
- `npm run offer-contract` passes against local Supabase after the migration is applied.
- `npm run smoke` passes against the local stack, including replacement success and history-locked failure.

#### Manual Verification:

- Before-view desktop and mobile screenshots of detail, creation, and list are captured with viewport and state notes, without secrets or PIN values.
- An owner can still view an offer; a foreign or nonexistent offer uses the neutral unavailable state.

**Implementation Note**: Capture the baseline before the first markup edit. Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Phase 2: Current State and History

### Overview

Turn the detail page into an accurate current-state overview and move revisions, changes, and decisions to a dedicated history page.

### Changes Required:

#### 1. Current-state overview and PIN controls

**File**: `src/pages/offers/[offerId].astro`, `src/components/offers/OfferDetailNav.astro` (new)

**Intent**: Show status, active scope, current amount, deadline, and items first; move PIN management here from the list. Offer clear navigation to Current state and History.

**Contract**: A pending initial offer is labelled as awaiting acceptance, not agreed work. Accepted/agreed offers show effective values only. A pending change gets a separate notice linked to its history entry and does not alter current totals. A rejected initial offer shows the decision and rejection reason, with links to history and `/offers`.

#### 2. Decision history page

**File**: `src/pages/offers/[offerId]/history.astro`, shared loader in `src/lib/contractor-offer-view.ts`

**Intent**: Make previous offer revisions, changes, decisions, and rejection reasons findable without scrolling through the overview.

**Contract**: Owner-scoped route with the same neutral 404 behavior. Render a chronological timeline ordered by recorded timestamp and ID; expand full revision scope, items, change details, and explanation on demand. Each pending-change notice links to a stable entry anchor.

#### 3. Overview route checks

**File**: `scripts/smoke.mjs`

**Intent**: Catch status or data leakage regressions introduced by splitting the page.

**Contract**: Cover pending, accepted/agreed, rejected, pending-change, foreign, unknown, and anonymous navigation; assert that pending/rejected changes are absent from active totals.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the overview, history, and shared navigation.
- `npm run build` passes for both detail routes.
- `npm run smoke` passes with current-state and history route assertions.

#### Manual Verification:

- Desktop and mobile overview/history show the right amount, deadline, and actions in pending, agreed, rejected, and pending-change states.
- Keyboard focus reaches Current state, History, PIN controls, and expandable history details; empty and unavailable states are understandable.

**Implementation Note**: Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Phase 3: Dedicated Change and Edit Tasks

### Overview

Move the existing forms to stable task routes and enforce status eligibility when those routes are requested directly.

### Changes Required:

#### 1. Change proposal page

**File**: `src/pages/offers/[offerId]/changes/new.astro`, `src/components/offers/OfferChangeForm.tsx`, shared loader

**Intent**: Give the estimate, consequences, and confirmation flow its own page, reached from the overview and history where eligible.

**Contract**: Only `accepted` or `agreed` offers render the form. Keep `scopeRevision`, effective items/deadline, pending proposal ID, templates, preview-before-record, and supersession confirmation behavior. Direct requests in other states receive a neutral unavailable/forbidden task state without data leakage.

#### 2. Pending-offer correction page

**File**: `src/pages/offers/[offerId]/edit.astro`, `src/components/offers/ReplacePendingOfferForm.tsx`, `src/pages/offers/[offerId].astro`

**Intent**: Present one replacement form for scope, deadline, and items; remove the competing separate item-correction UI from the overview.

**Contract**: Render only for `pending` offers with no change history. Preserve replacement revision checking, item IDs, previous revision history, and the post-save success path back to current state. Remove the standalone `EditOfferItemsForm` entry point from this flow without weakening the server guard.

#### 3. Task-route checks

**File**: `scripts/smoke.mjs`

**Intent**: Verify deep links and direct access enforce the same rules as visible buttons.

**Contract**: Cover eligible and ineligible status/history combinations, anonymous and foreign IDs, and both success and error paths for the existing form endpoints.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the task pages and form integration.
- `npm run build` passes for the new routes.
- `npm run smoke` passes with direct-route and endpoint success/failure checks.

#### Manual Verification:

- Eligible edit and change pages work from links and bookmarks; ineligible direct URLs do not expose forms.
- Preview, pending-proposal replacement confirmation, validation errors, disabled/busy states, and successful navigation remain usable on desktop and mobile.

**Implementation Note**: Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Phase 4: Creation Form and Item Cards

### Overview

Make the creation form easier to scan and keep template selection with the item it changes, without changing the offer pricing contract.

#### Visual review note

- `src/components/offers/OfferItemsEditor.tsx:342`: the empty total used the same visual weight as a calculated amount and the placeholder did not explain when a total would appear. Use the existing muted surface token and a short explanation while incomplete; show the formatted amount only after all items validate.
- Keep this view on the existing semantic tokens from `src/styles/global.css`; no new shared primitive or palette is needed for the total summary.

### Changes Required:

#### 1. Ordered creation sections

**File**: `src/components/offers/CreateOfferForm.tsx`, `src/pages/offers/new.astro`

**Intent**: Organize one-page entry as Customer → Scope and deadline → Items → Summary and save. Keep the calculated total and save action easy to find at the bottom.

**Contract**: Existing customer/new customer and duplicate-name confirmation behavior remain. Form POST payload and server validation stay compatible with `/api/offers`.

#### 2. Template and item-card behavior

**File**: `src/components/offers/CreateOfferForm.tsx`, `src/components/offers/OfferItemsEditor.tsx`

**Intent**: Put each template selector and its prompts inside the item card, immediately above the fields it fills. Add new creation items at the top with stable UUID keys and focus the new template selector or name. Keep earlier items compact but editable.

**Contract**: A template fills only its own item. Applying a different template over nonempty user-entered values requires explicit overwrite confirmation. Template choice remains optional; item identity and saved position are retained through add, edit, remove, and submit. Any new editor option must preserve existing edit/change form behavior.

#### 3. Required-field semantics and errors

**File**: `src/components/ui/field.tsx`, `src/components/offers/OfferItemsEditor.tsx`, `src/components/offers/CreateOfferForm.tsx`

**Intent**: Mark required fields before submission and move focus to a concise form error summary when validation fails.

**Contract**: `Field` accepts an optional `required` contract, renders a visible asterisk with screen-reader text, and passes `required`/`aria-required` to its control. Mark customer, scope, deadline, and all item fields required by `parseOfferItemDrafts`; keep template optional. Preserve field-level errors and the existing validation rules in `src/lib/offer-items.ts`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the form and shared field/editor changes.
- `npm run build` passes for `/offers/new`.
- `npm run smoke` passes for valid and invalid offer creation, including item totals and customer selection.

#### Manual Verification:

- On desktop and mobile, a new item appears at the top with focus, stable entered values, a local template selector, and an accurate summary total.
- Overwrite confirmation, required markers, screen-reader labels, focus after invalid submit, and saved success state work with keyboard navigation.

**Implementation Note**: Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Phase 5: Count-Aware Customer and Offer Pages

### Overview

Provide the grouped list with owner-scoped counts, activity, and deterministic numbered pages before changing its presentation.

### Changes Required:

#### 1. Customer summary and offer page queries

**File**: new `supabase/migrations/*.sql`, `src/pages/offers/index.astro`

**Intent**: Return customer offer counts, last activity, total matching customer rows, and a numbered page of a selected customer's offers with its total count.

**Contract**: Customer activity is `max(offers.updated_at)` for that customer, with an empty value when the customer has no offers. Keep owner isolation at every query boundary. Sort customers by `(name, id)` and offers by `(created_at DESC, id DESC)`; totals include only accessible matching records. Offer amounts and deadlines include only accepted/agreed changes, as the current list does. Use 1-based `page` and `offerPage` URL values and clamp invalid/out-of-range values without leaking another customer's data.

#### 2. URL state and query tests

**File**: `src/pages/offers/index.astro`, `scripts/smoke.mjs`, `scripts/offer-contract.mjs`

**Intent**: Make search and pagination links stable across refresh and bookmarks.

**Contract**: Use `q`, `page`, `customer`, `offerPage`. Selecting a different customer resets `offerPage`; changing search resets `page` and closes the group. Cover empty, first, middle, last, out-of-range, malformed, and foreign-customer requests, plus stable ordering for equal timestamps.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the new query callers and contract checks.
- `npm run build` passes with the numbered-page route data.
- `npm run offer-contract` passes for owner-scoped counts, active amounts, and deterministic pages.
- `npm run smoke` passes for search and customer/offer page navigation.

#### Manual Verification:

- Search, customer choice, and both paginations survive refresh and back/forward navigation without losing or crossing customer data.

**Implementation Note**: Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Phase 6: Grouped Offers Table and Visual Review

### Overview

Replace the two-column browse layout with the agreed grouped table and compact mobile presentation, then compare all three views to the before captures.

### Changes Required:

#### 1. Customer groups and offer rows

**File**: `src/pages/offers/index.astro`, `src/components/offers/` (only if a shared interactive row component is needed)

**Intent**: Show Customer / Offer count / Last activity / Actions in customer rows, and Scope / Status / Current amount / Deadline / Created / Actions for the expanded customer's offers. Use accessible expansion and compact mobile rows/cards with the same information.

**Contract**: The expand control is a button with `aria-expanded`; the whole row is not a click target. The offer title opens its overview. Customer and offer pagers show current page, total pages, previous/next, and clear empty states. Avoid horizontal scrolling on mobile.

#### 2. Eligible row actions and design-system states

**File**: `src/pages/offers/index.astro`, existing `src/components/ui/dropdown-menu.tsx`, `src/components/ui/button.tsx` as needed

**Intent**: Use existing UI primitives for row actions and preserve a predictable keyboard path.

**Contract**: `…` includes Open and History; Propose change appears only for accepted/agreed offers; Edit appears only for pending offers without change history. Remove PIN controls from list rows because they now live in offer details. Use semantic tokens for default, hover, focus, disabled, error, empty, and loading states.

#### 3. Final comparison and regression coverage

**File**: `scripts/smoke.mjs`, `context/changes/offer-flow/` (after screenshots or evidence note)

**Intent**: Compare the implemented list, creation, and detail tasks against the captured baseline and product rules.

**Contract**: Add route/action checks where needed for grouped visibility and eligibility. Capture comparable desktop/mobile after views and record any remaining visual limitation; screenshots contain no PINs or credentials.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes for the complete offer-flow change.
- `npm run build` passes for all affected routes.
- `npm run offer-contract` passes against local Supabase.
- `npm run smoke` passes against the local stack, including list actions and offer state regressions.

#### Manual Verification:

- Desktop and mobile after screenshots show readable grouped rows, creation cards, overview, history, and task pages compared with the same before-state data.
- Hover, focus, disabled, error, empty, loading, and keyboard states are checked on the three views; no horizontal mobile table scroll or PIN value appears in list rows.
- Pending, accepted/agreed, rejected, and pending-change paths preserve their eligible actions and active-scope values end to end.

**Implementation Note**: Pause after automated checks for manual confirmation as required by `/10x-implement`.

---

## Testing Strategy

### Unit Tests:

- Keep amount and item validation contracts in `src/lib/offer-items.ts`; add focused tests only if new pure pagination or eligibility logic warrants them.
- Verify new or changed tests fail when their protected behavior is deliberately broken, following `/10x-implement`.

### Integration Tests:

- Extend `scripts/offer-contract.mjs` for migration-backed ownership, count, sort, and edit-eligibility rules.
- Extend `scripts/smoke.mjs` for authenticated/anonymous/foreign deep links, success and failure status paths, creation, and pagination. Use local Supabase; the configured cloud project has registration disabled intentionally.

### Manual Testing Steps:

1. Capture the existing logged-in desktop and mobile state before markup changes, then compare matching after views.
2. Navigate every offer status and pending-change state through overview, history, edit, and change routes using mouse and keyboard.
3. Create an offer with multiple items, change a template over entered values, trigger required errors, and confirm focus and totals.
4. Search and paginate customers and offers on desktop and mobile, including empty and invalid selections.

## Performance Considerations

Fetch offer rows only for the expanded customer and one bounded page at a time. Count queries must be owner-scoped and use deterministic ordering. The shared detail loader should request only data needed by each route; avoid loading full history and templates for the overview. No new polling or client-side cache is required.

## Migration Notes

Add migrations rather than editing applied migrations. Preserve existing cursor RPC callers until the numbered-page route is fully migrated. The replacement guard tightens accepted behavior for pending offers with change history; smoke and contract checks must cover that deliberate change. Run migrations against local Supabase before contract/smoke gates. Do not clear production data.

## References

- UI research: `context/changes/offer-flow/research.md`
- Approved flow proposal: `context/changes/offer-flow/proposal.md`
- Product contract: `context/foundation/prd.md`
- Existing offer detail: `src/pages/offers/[offerId].astro`
- Existing list and creation: `src/pages/offers/index.astro`, `src/components/offers/CreateOfferForm.tsx`
- Existing current-scope and replacement contracts: `supabase/migrations/20260925000000_offer_change_revisions.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Visual Baseline and Shared Offer Contract

#### Automated

- [x] 1.1 `npm run lint` passes for the loader, API, migration-adjacent code, and smoke changes. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 1.2 `npm run build` passes with the shared loader. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 1.3 `npm run offer-contract` passes against local Supabase after the migration is applied. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 1.4 `npm run smoke` passes against the local stack, including replacement success and history-locked failure. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 1.5 Before-view desktop and mobile screenshots of detail, creation, and list are captured with viewport and state notes, without secrets or PIN values. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 1.6 An owner can still view an offer; a foreign or nonexistent offer uses the neutral unavailable state. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

### Phase 2: Current State and History

#### Automated

- [x] 2.1 `npm run lint` passes for the overview, history, and shared navigation. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 2.2 `npm run build` passes for both detail routes. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 2.3 `npm run smoke` passes with current-state and history route assertions. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 2.4 Desktop and mobile overview/history show the right amount, deadline, and actions in pending, agreed, rejected, and pending-change states. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 2.5 Keyboard focus reaches Current state, History, PIN controls, and expandable history details; empty and unavailable states are understandable. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

### Phase 3: Dedicated Change and Edit Tasks

#### Automated

- [x] 3.1 `npm run lint` passes for the task pages and form integration. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 3.2 `npm run build` passes for the new routes. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 3.3 `npm run smoke` passes with direct-route and endpoint success/failure checks. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 3.4 Eligible edit and change pages work from links and bookmarks; ineligible direct URLs do not expose forms. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 3.5 Preview, pending-proposal replacement confirmation, validation errors, disabled/busy states, and successful navigation remain usable on desktop and mobile. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

### Phase 4: Creation Form and Item Cards

#### Automated

- [x] 4.1 `npm run lint` passes for the form and shared field/editor changes. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 4.2 `npm run build` passes for `/offers/new`. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 4.3 `npm run smoke` passes for valid and invalid offer creation, including item totals and customer selection. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 4.4 On desktop and mobile, a new item appears at the top with focus, stable entered values, a local template selector, and an accurate summary total. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 4.5 Overwrite confirmation, required markers, screen-reader labels, focus after invalid submit, and saved success state work with keyboard navigation. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

### Phase 5: Count-Aware Customer and Offer Pages

#### Automated

- [x] 5.1 `npm run lint` passes for the new query callers and contract checks. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 5.2 `npm run build` passes with the numbered-page route data. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 5.3 `npm run offer-contract` passes for owner-scoped counts, active amounts, and deterministic pages. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 5.4 `npm run smoke` passes for search and customer/offer page navigation. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 5.5 Search, customer choice, and both paginations survive refresh and back/forward navigation without losing or crossing customer data. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

### Phase 6: Grouped Offers Table and Visual Review

#### Automated

- [x] 6.1 `npm run lint` passes for the complete offer-flow change. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 6.2 `npm run build` passes for all affected routes. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 6.3 `npm run offer-contract` passes against local Supabase. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 6.4 `npm run smoke` passes against the local stack, including list actions and offer state regressions. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4

#### Manual

- [x] 6.5 Desktop and mobile after screenshots show readable grouped rows, creation cards, overview, history, and task pages compared with the same before-state data.
- [x] 6.6 Hover, focus, disabled, error, empty, loading, and keyboard states are checked on the three views; no horizontal mobile table scroll or PIN value appears in list rows. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
- [x] 6.7 Pending, accepted/agreed, rejected, and pending-change paths preserve their eligible actions and active-scope values end to end. — e56366419206b4794dda2d16f1f7b35bb4c1c8d4
