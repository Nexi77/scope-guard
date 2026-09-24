# Prepare Structured Offer — Plan Brief

> Full plan: `context/changes/prepare-structured-offer/plan.md`

## What & Why

Contractors need a measurable, priced record of the original work so later change estimates can compare against agreed items. This slice adds itemized offer preparation and review while retaining the current description, deadline, customer grouping, and approval boundaries.

## Starting Point

Today an offer is created with free-text scope, one PLN total, and a deadline through an atomic Supabase RPC. There is no work-item table or contractor offer detail page, and the shared RPC exposes only the aggregate offer.

## Desired End State

Every new offer is created atomically with at least one named item, quantity, unit, specification, customer selling rate, and labor hours per unit. Rounded item amounts sum to the stored offer total. The contractor can review the saved items and correct them while the offer is pending and no change row has ever been recorded; later customer-facing output contains priced scope but no labor assumptions.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| New-offer entry | Require items during creation and save atomically | Every new baseline is usable for later estimates. | Plan |
| Pricing basis | Customer selling rate per unit in final PLN amounts; no tax calculation | Rates reconcile directly with the agreed price without inventing tax rules. | Plan |
| Effort baseline | Require explicit labor hours per unit, plus name, quantity, unit, and specification | Later price and effort estimates both have a measurable starting point. | Plan |
| Total | Sum rounded item line amounts; no independently entered aggregate price | One authoritative amount prevents silent mismatches. | Plan |
| Legacy offers | Current preproduction data may be cleared; do not build legacy mapping | The product is not production deployed and this slice can establish a clean required-item contract. | Plan |
| Corrections | Permit original-item edits only while pending and before any change row exists | Contractors can fix preparation mistakes without rewriting a baseline used in history. | Plan |
| Customer visibility | Scope and selling prices public later; labor effort contractor-only | Customers can inspect priced scope without seeing private productivity assumptions. | Plan |
| Estimating boundary | Stable item identity now; recipes and change calculations in S-04 | Keeps this slice focused on a reliable source of truth. | Roadmap / Research |

## Scope

**In scope:**

- Owner-linked work items, exact item arithmetic, atomic creation and guarded editing, and safe shared-RPC projection.
- Item editor, protected contractor offer detail, offer-list navigation, product-contract alignment, and contract/smoke coverage.

**Out of scope:**

- Legacy offer conversion, internal cost or markup, tax calculation, estimator recipes, customer approval UI, PDF, and full offer versioning.

## Architecture / Approach

The existing cookie-authenticated form posts the offer and item set to the server; one authenticated Supabase RPC creates customer, offer, and items in a transaction and derives the total. A guarded RPC edits the item set only with an unchanged revision and no recorded change. RLS and grants protect direct table access; the shared RPC returns only public item fields.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Product and database contract | Aligned product rules, item schema, exact calculations, atomic creation/edit operations | Bypass of total or edit invariants through table grants |
| 2. Itemized creation and contractor review | Usable item form, protected detail route, permitted corrections | Form and database calculations disagree |
| 3. End-to-end verification and handoff | Updated fixtures, full project gates, manual UI checks | Existing offer/PIN behavior regresses |

**Prerequisites:** Existing S-01 offer creation and local Supabase; confirm the specific preproduction database before any reset.  
**Estimated effort:** Roughly 3–5 implementation sessions across three phases, plus manual browser review.

## Open Risks & Assumptions

- The approved data reset applies to current preproduction test offers. A data-bearing environment that must retain offers needs a separate compatibility plan before enforcing required items.
- The initial offer is stored as `pending` without a customer baseline-acceptance event. This slice locks original-item editing once any change exists; the later approval flow must define when a baseline becomes agreed.
- Item rates use the same customer-facing final PLN basis as existing totals; the application does not determine tax treatment.

## Success Criteria (Summary)

- A contractor creates and reviews an itemized offer whose rounded lines equal its stored total and can correct it only before any change is recorded.
- Foreign, anonymous, stale, invalid, and locked writes leave items and totals unchanged; the shared response omits private labor assumptions.
- Lint, build, offer-contract, and configured local smoke checks pass, with the item flow reviewed on mobile and desktop.
