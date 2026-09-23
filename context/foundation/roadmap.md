---
project: ScopeGuard
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-23
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-validated-change-approval
milestone_seq: 1
milestone_status: open
---

# Roadmap: ScopeGuard

> Derived from `context/foundation/prd.md` + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First working change-approval flow** — Status: open

- **Intent:** Deliver a complete, secure flow for the contractor and their customer to formally confirm a scope change and its impact on price and deadline. The result must appear in the current offer and its history.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-008, US-01.

## Vision recap

ScopeGuard gathers agreements about changes raised during a renovation or installation in one place, so the contractor and customer do not interpret the original price and deadline differently. The product records the customer's decision on the proposed change and its consequences while retaining the current scope and decision history.

## North star

**S-06: Customer can approve or reject a pending change through a permanent link and PIN.** This is the earliest complete capability that verifies the product's primary success criterion.

> The north-star slice is the smallest end-to-end flow whose successful delivery proves the product's core value; it is placed as early as its prerequisites allow.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | minimal-offer-record-contract | (foundation) durable offer, change, and decision records safely separate contractor and customer access | — | FR-001–FR-008; Non-Functional Requirements | done |
| S-01 | create-client-offer | create a customer and an offer assigned to that customer | F-01 | FR-001 | done |
| S-02 | browse-client-offers | browse a customer's offers with status, price, and delivery deadline | S-01 | FR-002 | done |
| S-03 | manage-offer-pin | set or reset a PIN for a customer or offer | S-01 | FR-008 | proposed |
| S-04 | record-offer-change | add a change, describe it, and classify its price and deadline impact | S-01 | FR-003 | proposed |
| S-05 | view-shared-offer | use a permanent link to see only the assigned offer and its current status | S-01, S-04 | FR-005, FR-006 | proposed |
| S-06 | decide-change-by-pin | use a permanent link and PIN to approve or reject a pending change | S-03, S-04, S-05 | US-01, FR-007 | proposed |
| S-07 | view-offer-history | see the current offer plus the history of changes and customer decisions | S-04, S-06 | FR-004, FR-005 | proposed |

## Streams

Navigation aid — groups items that share a prerequisite chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Customer decision | `F-01` → `S-01` → `S-03` → `S-06` → `S-07` | The critical path for fast launch; `S-06` also joins the result of Stream B. |
| B | Change and sharing | `S-04` → `S-05` | Runs in parallel after `S-01` and joins Stream A at `S-06`. |
| C | Offer browsing | `S-02` | An independent contractor capability after the first offer exists. |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro, React, and Tailwind; public, authentication, and dashboard views exist (`astro.config.mjs`, `src/pages/`, `src/components/auth/`).
- **Backend / API:** partial — only authentication endpoints and middleware exist; no domain endpoints for offers or changes (`src/pages/api/auth/`, `src/middleware.ts`).
- **Data:** absent — Supabase configuration exists, but there are no migrations, schema, seeds, or domain data access (`supabase/config.toml`).
- **Auth:** present — server-side Supabase client, cookie sessions, and a protected contractor dashboard (`src/lib/supabase.ts`, `src/middleware.ts`).
- **Deploy / infra:** present — Cloudflare deployment and quality-checking CI are configured (`wrangler.jsonc`, `.github/workflows/ci.yml`).
- **Observability:** partial — worker observability is enabled, but the application has no dedicated error monitoring (`wrangler.jsonc`).

## Foundations

### F-01: Minimal durable offer and decision contract

- **Outcome:** (foundation) durable offer, change, and customer-decision records have the minimal ownership and access boundaries needed to safely execute the first flows.
- **Change ID:** minimal-offer-record-contract
- **PRD refs:** FR-001–FR-008; Non-Functional Requirements (offer isolation, durable decision record, idempotent decision); Access Control
- **Unlocks:** S-01, S-02, S-03, S-04, S-05, S-06, S-07
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the smallest shared contract needed to store and verify a decision; modelling too much upfront would delay the first flow.
- **Status:** done

## Slices

### S-01: Create a customer and offer

- **Outcome:** contractor can create a customer and an offer assigned to that customer with the original scope.
- **Change ID:** create-client-offer
- **PRD refs:** FR-001
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This starts every later capability; keep its scope narrow so customer administration does not grow beyond offer grouping.
- **Status:** done

### S-02: Browse a customer's offers

- **Outcome:** contractor can browse a customer's offers with their status, price, and delivery deadline.
- **Change ID:** browse-client-offers
- **PRD refs:** FR-002
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This capability is independent from customer decisions and should not delay the change-approval path.
- **Status:** done

### S-03: Manage an offer PIN

- **Outcome:** contractor can set or reset a six-digit PIN for a customer or offer.
- **Change ID:** manage-offer-pin
- **PRD refs:** FR-008; US-01; Access Control
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A PIN is required for a secure customer decision, so it precedes the approval action.
- **Status:** proposed

### S-04: Record an offer change

- **Outcome:** contractor can add a change, describe it, and classify its impact on price and deadline.
- **Change ID:** record-offer-change
- **PRD refs:** FR-003; Business Logic
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The impact classification determines whether the customer must decide; that rule must work in the actual flow, not only in documentation.
- **Status:** proposed

### S-05: View a shared offer

- **Outcome:** customer can use a permanent link to see only the assigned offer and its current status.
- **Change ID:** view-shared-offer
- **PRD refs:** FR-005, FR-006; Non-Functional Requirements (access isolation)
- **Prerequisites:** S-01, S-04
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The permanent link must limit viewing to one offer; broader customer access is outside the MVP scope.
- **Status:** proposed

### S-06: Customer decision by PIN

- **Outcome:** customer can use a permanent link and six-digit PIN to approve a pending change or reject it with a comment.
- **Change ID:** decide-change-by-pin
- **PRD refs:** US-01, FR-007; Non-Functional Requirements (PIN, decision timestamp, idempotent decision); Business Logic
- **Prerequisites:** S-03, S-04, S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This capability proves the product's value; retrying the same decision must not alter history or create inconsistent status.
- **Status:** proposed

### S-07: View the current offer and decision history

- **Outcome:** contractor can see the current offer and the history of changes and customer decisions, including a rejection reason.
- **Change ID:** view-offer-history
- **PRD refs:** FR-004, FR-005, US-01; Business Logic
- **Prerequisites:** S-04, S-06
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The view must distinguish pending, approved, and rejected changes without introducing full offer versioning, which is excluded from the MVP.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | minimal-offer-record-contract | Minimal durable offer and decision contract | yes | Unlocks the full first flow. |
| S-01 | create-client-offer | Create a customer and offer | no | Requires F-01. |
| S-02 | browse-client-offers | Browse a customer's offers | no | Requires S-01. |
| S-03 | manage-offer-pin | Manage an offer PIN | no | Requires S-01. |
| S-04 | record-offer-change | Record an offer change | no | Requires S-01. |
| S-05 | view-shared-offer | View a shared offer | no | Requires S-01 and S-04. |
| S-06 | decide-change-by-pin | Customer decision on a change by PIN | no | Requires S-03, S-04, and S-05. |
| S-07 | view-offer-history | View current offer and decision history | no | Requires S-04 and S-06. |

## Open Roadmap Questions

None — the PRD has no open questions relevant to sequencing.

## Parked

- **Customer account and portal** — Why parked: PRD §Non-Goals limits the customer to access through a shared offer.
- **Contractor social sign-in** — Why parked: PRD §Non-Goals.
- **Full offer versioning and comparison** — Why parked: PRD §Non-Goals requires only a history of changes and decisions.
- **Offer PDF generation** — Why parked: secondary success criterion, outside the critical path for fast MVP launch.
- **Invoicing, payments, inventory, purchasing, and CRM** — Why parked: PRD §Non-Goals.
- **PWA, offline work, multi-person organizations, and advanced roles** — Why parked: PRD §Non-Goals.
- **AI, accounting integrations, broad notifications, and analytics** — Why parked: PRD §Non-Goals.

## Milestone History

## Done

- **F-01: (foundation) durable offer, change, and customer-decision records have the minimal ownership and access boundaries needed to safely execute the first flows.** — Archived 2026-09-22 → `context/archive/2026-09-21-minimal-offer-record-contract/`. Lesson: —.
- **S-01: contractor can create a customer and an offer assigned to that customer with the original scope.** — Archived 2026-09-22 → `context/archive/2026-09-22-create-client-offer/`. Lesson: —.
- **S-02: contractor can browse a customer's offers with their status, price, and delivery deadline.** — Archived 2026-09-23 → `context/archive/2026-09-23-browse-client-offers/`. Lesson: —.
