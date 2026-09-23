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

> Derived from `context/foundation/prd.md`, the assisted-estimation research, and the user's structured-offer request + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. IDs remain stable when a new prerequisite is inserted. The "At a glance" table is the index.

## Milestone

**M-1: First working change-approval flow** — Status: open

- **Intent:** Deliver a complete, secure flow in which the contractor prepares a structured offer, receives assistance estimating a scope change, and obtains the customer's confirmation of its price and deadline impact. The result must appear in the current offer and its history.
- **Source materials:** `context/foundation/prd.md` (v1); `context/changes/record-offer-change/research.md`; user's request to support automated estimation across renovation, electrical, and plumbing work and introduce the required structured offer model.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-008, US-01; the following additions from the user's request extend the manual-entry scope of PRD v1:
  - MS-01: Contractor can prepare and review an itemized offer with the quantities, units, specifications, pricing basis, and effort assumptions required to estimate later changes.
  - MS-02: System helps the contractor estimate and explain a change's complexity, cost, and time against the current agreed work, with reusable trade-specific inputs and contractor confirmation before customer approval.

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
| S-03 | manage-offer-pin | set or reset a PIN for a customer or offer | S-01 | FR-008 | done |
| S-08 | prepare-structured-offer | prepare and review an itemized offer that provides a reliable baseline for change estimates | S-01 | FR-001, FR-002; MS-01 | ready |
| S-04 | record-offer-change | estimate a change against agreed work and confirm its explained price and deadline impact | S-01, S-08 | FR-003; Business Logic; MS-02 | proposed |
| S-05 | view-shared-offer | use a permanent link to see only the assigned offer and its current status | S-01, S-04 | FR-005, FR-006 | proposed |
| S-06 | decide-change-by-pin | use a permanent link and PIN to approve or reject a pending change | S-03, S-04, S-05 | US-01, FR-007 | proposed |
| S-07 | view-offer-history | see the current offer plus the history of changes and customer decisions | S-04, S-06 | FR-004, FR-005 | proposed |

## Streams

Navigation aid — groups items that share a prerequisite chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Customer decision | `F-01` → `S-01` → `S-03` → `S-06` → `S-07` | The critical path for fast launch; `S-06` also joins the result of Stream B. |
| B | Structured offer, change estimation, and sharing | `S-08` → `S-04` → `S-05` | Starts after `S-01` and joins Stream A at `S-06`. |
| C | Offer browsing | `S-02` | An independent contractor capability after the first offer exists. |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

Update from the assisted-estimation research on `2026-09-23`: offer creation, browsing, PIN management, and durable change/decision records now exist. Offers still contain free-text scope and a total price/deadline; structured work items and an estimator are absent from the inspected application path. The layer inventory below is the original milestone baseline, not a statement that those completed slices are missing today.

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
- **Status:** done

### S-08: Prepare a structured offer

- **Outcome:** contractor can prepare and review an itemized offer with named work items, quantities and units, specifications, pricing inputs, and labor-effort assumptions, see calculated line amounts and the offer total, and retain a description for context. Existing text-only offers remain readable; the contractor can explicitly map their scope into items without silently changing the agreed price, deadline, or history.
- **Change ID:** prepare-structured-offer
- **PRD refs:** FR-001, FR-002; MS-01
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - How should the contractor reconcile item amounts with an existing lump-sum offer while preserving its agreed total and making any allocation explicit? — Owner: team and contractor. Block: no; resolve during planning before implementation.
  - Which minimum pricing and effort inputs are required for an item to be marked ready for estimation, and how are incomplete items presented? — Owner: team and contractor. Block: no; resolve during planning before implementation.
- **Risk:** This slice must deliver usable offer preparation and a trustworthy baseline; expanding it into a full estimating catalog or silently repricing existing agreements would obscure that outcome.
- **Status:** ready

### S-04: Estimate and record an offer change

- **Outcome:** contractor can select affected agreed work, describe the proposed change, reuse trade-specific work templates and rates, and review suggested complexity reasons, cost, labor effort, and conditional deadline impact. The contractor confirms the explained customer price and deadline adjustment before it enters the existing approval or no-impact correction flow.
- **Change ID:** record-offer-change
- **PRD refs:** FR-003; Business Logic; MS-02
- **Prerequisites:** S-01, S-08
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Which initial trade templates and contractor-supplied rates are validated, and which site conditions require assessment rather than an automatic estimate? — Owner: team and contractor. Block: no; resolve during planning before implementation.
- **Risk:** Estimates must use current agreed work and execution progress, distinguish cost from customer price and effort from deadline movement, and keep unresolved impact out of the no-impact correction path.
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
| S-08 | prepare-structured-offer | Prepare a structured offer | yes | Next: `/10x-plan prepare-structured-offer`; S-01 is done. |
| S-04 | record-offer-change | Estimate and record an offer change | no | Requires S-08; reuse the existing research and keep change-specific calculations here. |
| S-05 | view-shared-offer | View a shared offer | no | Requires S-01 and S-04. |
| S-06 | decide-change-by-pin | Customer decision on a change by PIN | no | Requires S-03, S-04, and S-05. |
| S-07 | view-offer-history | View current offer and decision history | no | Requires S-04 and S-06. |

## Open Roadmap Questions

1. **Align the product contract with assisted estimation.** PRD v1 describes manual classification; MS-01 and MS-02 record the user's expanded scope without implying that the PRD already specifies it. Carry these additions into the PRD before implementation. — Owner: product owner and team. Block: implementation of S-08 and S-04, not planning S-08.
2. **Choose a consistent pricing basis.** Settle whether item inputs primarily represent selling prices or internal cost plus markup, how old lump-sum allocations work, and whether amounts include tax. Preserve existing agreed totals during conversion. — Owner: product owner and contractor. Block: implementation of S-08 and S-04; resolve while planning S-08.
3. **Confirm baseline acceptance and amendment eligibility.** Determine when an initial offer is considered agreed and eligible for estimated changes; itemization must not imply customer acceptance or bypass approval for price/deadline changes. — Owner: product owner and team. Block: implementation of the amendment/approval flow in S-04 and S-06.

Slice boundary: S-08 delivers itemized offer preparation and review, including the transition for existing offers. S-04 introduces reusable change recipes, execution-progress questions, before/after calculations, omission credits, rework consequences, and estimate explanations. The existing approval and history slices consume the confirmed proposal. Keep full offer versioning, a visual rules editor, and a complete scheduling system outside this milestone.

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
- **S-03: contractor can set or reset a six-digit PIN for a customer or offer.** — Archived 2026-09-23 → `context/archive/2026-09-23-manage-offer-pin/`. Lesson: —.
