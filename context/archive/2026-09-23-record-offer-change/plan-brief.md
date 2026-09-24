# Record Offer Change — Plan Brief

> Full plan: `context/changes/record-offer-change/plan.md`  
> Research: `context/changes/record-offer-change/research.md`

## What & Why

Enable a contractor to estimate and record a change against the current agreed work. The system will suggest a customer price adjustment and labor effort, explain the calculation, and preserve the exact proposal on which the customer decides.

## Starting Point

Structured original offer items already have stable IDs, quantities, selling rates, and private labor assumptions. Current reads still show the original items after changes; accepted price deltas do not update an effective item baseline.

## Desired End State

The contractor can replace an unaccepted offer with a traceable new revision. Once the original offer is accepted, the contractor can propose item changes against current agreed items, confirm credits and a deadline, and submit an explained proposal. Accepted changes update effective scope; rejected and superseded proposals remain in history without affecting it.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Pricing | Customer selling price and labor hours; no internal cost model | These inputs already exist in structured offers | Research / Plan |
| Before initial acceptance | Replace the pending offer with a new revision | The customer makes one decision on the current offer | Plan |
| Zero price and deadline impact | Record as an agreed correction | Matches the PRD business rule | PRD / Plan |
| Partial-work credit | Suggest a credit; require contractor confirmation or correction with a reason | Completed work cannot be valued from quantity alone | Plan |
| Price explanation | Show itemized effects and a separate commercial adjustment | The confirmed total remains explainable | Plan |
| Templates | Painting, tiling, electrical, and plumbing examples with contractor-confirmed rates and hours | Covers the requested trades without presenting market rates as facts | Plan |
| Deadline | Calculate effort; contractor confirms the date | The offer lacks capacity and scheduling inputs | Research / Plan |
| Pending proposal | Automatically supersede it when a newer edit or correction is published | A stale customer view must never decide the new proposal | Plan |

## Scope

**In scope:** controlled offer revisions and change commands; effective item projection; deterministic price and effort calculations; reusable contractor templates; contractor recording UI; shared-read and PIN-decision contracts; contract and HTTP tests.

**Out of scope:** internal cost and margin, AI estimates, market-rate catalogs, full offer versioning, crew scheduling, inventory, and customer accounts. The customer-facing link and decision screens remain in their roadmap slices; this plan supplies and verifies the data and RPC contracts they consume.

## Architecture / Approach

A database command locks the offer, verifies the expected revision, validates the confirmed calculation, and writes an immutable proposal snapshot. Before original acceptance it creates a new base-offer revision. After acceptance it records item effects against the effective agreed items. PIN decisions activate an accepted proposal exactly once. Contractor and shared reads use the same effective item projection, with private labor fields excluded from shared output.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data and decision contract | Revisions, immutable proposals, supersession, and activation | Races with an open customer view |
| 2. Estimation and templates | Exact calculations and explained suggestions | Credits for partly completed work |
| 3. Contractor workflow | Preview, confirmation, and recording | Confusing original and effective scope |
| 4. Reads and verification | Consistent current scope and tested decisions | Price and item projection divergence |

**Prerequisites:** S-08 structured offers and local Supabase test credentials.  
**Estimated effort:** roughly 6–9 focused implementation and verification sessions.

## Open Risks & Assumptions

- Starter templates need review against real contractor cases before their prompts are treated as useful defaults. Their monetary rates and labor hours are supplied or confirmed by the contractor.
- An existing pending proposal is retained as `superseded` when a newer proposal is published. A decision against its old ID fails without affecting the newer proposal.
- An original offer can be revised before acceptance, including after rejection. Its previous revision and decision remain auditable.

## Success Criteria (Summary)

- Successive accepted changes use the latest agreed item values; pending, rejected, and superseded proposals do not alter them.
- Customer-facing price and deadline values reconcile with the item effects and visible adjustments, without exposing labor assumptions.
- PIN decisions remain idempotent, and stale proposal decisions cannot activate a superseded revision.
