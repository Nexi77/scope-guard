# Offer Flow — Plan Brief

> Full plan: `context/changes/offer-flow/plan.md`
> Research: `context/changes/offer-flow/research.md`
> UI proposal: `context/changes/offer-flow/proposal.md`

## What & Why

ScopeGuard currently spreads related offer tasks across long pages and a two-column browse view. This plan gives the contractor a grouped customer/offer table, a clearer creation form, and stable pages for current state, history, change proposals, and pending-offer correction. It preserves customer approval and the separation between proposed and active scope.

## Starting Point

The application already has offer records, structured items, change estimates, revisions, PIN management, and protected contractor routes. The detail page renders most of these at once; the list has cursor paging without totals; the creation form separates templates from item cards. Authenticated before screenshots have not yet been captured.

## Desired End State

The contractor can find a customer's offer in a responsive grouped list with numbered pages, create an offer through ordered sections, and open a concise current-state view. History, change proposals, and pending corrections each have their own bookmarkable route. A waiting or rejected change never inflates the active amount or deadline.

## Key Decisions Made

| Decision                 | Choice                                                              | Why                                                            | Source   |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Scope                    | Details, grouped list, and creation form in one plan                | Covers the whole UI flow raised in the research                | Plan     |
| Detail navigation        | Current state, History, separate change/edit task pages             | Each route answers one contractor question                     | Proposal |
| Pending edit eligibility | Pending offer with no change history, enforced by page and mutation | Keeps visible action and server contract aligned               | Plan     |
| Rejected initial offer   | Show decision/reason and links to history and offers                | Uses existing actions without expanding approval rules         | Plan     |
| Customer activity        | Latest `offers.updated_at` for that customer's offers               | Gives the table a clear and bounded query rule                 | Plan     |
| PIN management           | Offer overview                                                      | Keeps access management next to its offer                      | Plan     |
| List pages               | Numbered customer and selected-customer offer pages                 | Makes position and total pages visible                         | Proposal |
| Creation form            | One page; per-item templates; new item at top                       | Keeps work near the fields it affects without draft navigation | Proposal |

## Scope

**In scope:**

- Owner-checked shared offer loading and status-eligible task routes.
- Current-state overview, decision history, change page, edit page, and PIN control placement.
- Ordered creation sections, per-item templates, stable item keys, required fields, and error focus.
- Customer/offer counts, activity, deterministic numbered pages, grouped desktop table, and compact mobile rows.
- Local contract/smoke checks and comparable desktop/mobile before and after screenshots.

**Out of scope:**

- Customer accounts or portal, altered customer decision rules, new filters, draft wizard, PDF, full-version comparison, CRM, or AI estimates.

## Architecture / Approach

The Astro routes share an owner-scoped server loader; existing Supabase RPCs remain the source of current agreed work. A migration tightens the replacement mutation, and count-aware owner-scoped queries feed the new grouped list. Existing React forms and semantic UI primitives are adapted for the dedicated tasks and item cards.

## Phases at a Glance

| Phase                           | What it delivers                                | Key risk                               |
| ------------------------------- | ----------------------------------------------- | -------------------------------------- |
| 1. Baseline and shared contract | Before screenshots, shared loader, edit guard   | Local data and mutation parity         |
| 2. Current state and history    | Accurate overview, PIN controls, timeline       | Confusing pending with active scope    |
| 3. Change and edit tasks        | Separate guarded form routes                    | Deep-link status bypass                |
| 4. Creation form                | Ordered sections and per-item templates         | Losing item identity or entered values |
| 5. List queries                 | Counts, activity, deterministic pages           | Ownership and page drift               |
| 6. Grouped list                 | Desktop table, mobile rows, final visual review | Responsive and keyboard behavior       |

**Prerequisites:** Local Supabase and an authenticated test account with representative offer states; `npm` dependencies are installed. Supabase CLI commands need outside-sandbox approval per `context/foundation/lessons.md`.

**Estimated effort:** Several focused implementation sessions across six phases; the migration, state fixtures, and manual visual gates are the main cost.

## Open Risks & Assumptions

- `offers.updated_at` is the agreed activity signal, even if publishing a pending proposal does not advance it. Verify mutation behavior; do not silently redefine the column as the latest event.
- The research has no authenticated screenshots. Capture them before UI edits with local data, then use comparable viewports and states for the final review.
- Local Supabase is needed for `offer-contract` and `smoke`; the cloud project's disabled self-registration is intentional.

## Success Criteria (Summary)

- An owner can navigate the grouped list, creation flow, current state, history, and eligible task routes on desktop and mobile; foreign or unknown offers remain unavailable.
- Pending/rejected proposals remain visible in history but do not change the active scope, amount, or deadline without the required customer decision.
- Lint, build, local contract checks, and smoke checks pass; manual screenshots and keyboard/state checks confirm the UI improvement.
