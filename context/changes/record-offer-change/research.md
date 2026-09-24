---
date: 2026-09-23T17:29:53Z
researcher: Codex
git_commit: ac6ac9a5db45a53fcc8492bed590f55d1d42d509
branch: feat/record-offer-change
repository: ScopeGuard
topic: Assisted estimation of offer-change complexity, cost, and time
tags: [research, offer-changes, estimating, business-logic]
status: complete
last_updated: 2026-09-24
last_updated_by: Codex
last_updated_note: Revalidated against implemented S-08; appended current S-04 recommendations and superseded findings.
last_research_at: 2026-09-24T07:03:05Z
last_research_git_commit: c94f974b4dac4324801a28e29fd8526520bcd895
---

# Research: assisted estimation of offer changes

## Current recommendation after S-08

**Use the implemented offer items as the original baseline. Build S-04 around explained customer-price and labor-effort changes, reusable consequence templates, and an accepted item-change history. Keep the original items intact once history starts.**

S-08 now supplies quantities, units, specifications, customer selling rates, private labor-hours assumptions, exact line rounding, and guarded original-item editing. The earlier recommendations to introduce those fields and map legacy text offers are superseded. Internal costs and markup are not part of the implemented pricing model. Sources: `supabase/migrations/20260924000000_structured_offers.sql:14–37`, `:306–329`; `context/archive/2026-09-23-prepare-structured-offer/plan-brief.md:21–28`.

The remaining core problem is how accepted changes alter the next estimate's baseline. Current shared reads combine original items with accepted descriptions and aggregate deltas; they do not produce revised item quantities. S-04 needs an effective item projection, immutable proposal inputs, and a revision for active scope. Source: `supabase/migrations/20260924000000_structured_offers.sql:352–398`.

Read [the post-S-08 findings](#follow-up-2026-09-24--fit-to-implemented-s-08) for the current planning handoff, arithmetic examples, and outstanding decisions. The original investigation below is retained as historical evidence; the follow-up adjudicates its conclusions individually.

## Original investigation — 2026-09-23

## Research Question

How can ScopeGuard help a contractor estimate the complexity, cost, and time of a change relative to previously agreed work, rather than merely record manually entered results? Compare algorithms and rules engines, favoring an MVP-sized solution while identifying worthwhile additional work.

The user clarified that general renovation and electrical/plumbing work should fit, with room for more trades. This research therefore recommends a shared calculation model with trade-specific templates. It does not choose a single trade or implement changes.

## Summary

**Recommend a deterministic change estimator: reusable work recipes, structured before/after inputs, and explicit rules for consequential work. Implement the bounded MVP rules as typed functions and data, without a general rules-engine dependency.**

The valuable automation is to reuse the contractor's rates and productivity assumptions, calculate changed quantities, add relevant work such as removal or restoration, suggest price and effort, identify missing facts, and generate an explanation. Contractor judgment supplies site facts and confirms the proposal; the system performs the repeatable reasoning and arithmetic.

The inspected offer path stores free-text scope, a total price, and a deadline, not quantities, unit rates, or task duration (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10`, `:32`; `src/pages/api/offers/index.ts:39`). Those inputs cannot uniquely determine labor or materials. Structured inputs are the necessary investment; changing the algorithm alone will not resolve the information gap.

Treat complexity as an explanation of work conditions and uncertainty, not a universal score that multiplies price. Separate internal cost, customer price, labor effort, and calendar impact. Preserve the existing customer approval contract. The recommendation expands the manual classification described in the PRD, while retaining contractor confirmation and the exclusion of AI-generated estimates (`context/foundation/prd.md:99`, `:121`). Product documents have not been changed by this research.

## Detailed Findings

### Evidence from estimating practice and existing products

- **Quantity/rate valuation:** RICS describes valuing additions and omissions using relevant existing rates, adjusting when conditions differ, and resource/time valuation when a suitable rate is unavailable. Its contract-specific discussion also values omissions against the original contract analysis. These are useful estimating patterns; the UK contract provisions are not Polish charging rules. [RICS, Valuing change, printed pp. 4 and 23](https://www.rics.org/content/dam/ricsglobal/documents/standards/Valuing-change_1st-edition_120325.pdf).
- **Recipes and arithmetic:** Procore documents catalog inputs for quantities, material costs, labor per unit, labor rates, and markup. This supports a data-driven calculator. Its page describes difficulty inconsistently as people count and complexity; ScopeGuard should define person-hours and capacity separately. [Procore estimate fields](https://support.procore.com/faq/what-fields-are-in-an-estimate-and-how-are-they-calculated).
- **Reusable change items:** Buildertrend supports itemized change-order costs and catalog groups. This is product precedent for reusable bundles, not evidence that descriptions alone can be priced. Its optional contractor approval on behalf of clients does not fit ScopeGuard's required PIN decision flow. [Buildertrend change-order overview](https://buildertrend.com/help-article/change-order-overview/).
- **Effort and completion date differ:** Resources, calendars, dependencies, and float affect scheduling. GAO's guide separates effort and duration and explains critical-path analysis. This supports keeping schedule assumptions explicit; a full scheduling system is unnecessary for the proposed MVP. [GAO Schedule Assessment Guide, printed pp. 49–50, 66, 75, 89](https://www.gao.gov/assets/gao-16-89g.pdf).

These sources support the model structure. This investigation did not establish calibrated Polish trade rates, productivity norms, universal complexity multipliers, or measured accuracy for ScopeGuard.

### What currently exists

- The offer schema stores `base_scope`, `base_amount_minor`, currency, and `base_deadline`. Changes store a description plus signed price and integer day deltas. No recipe, work-item identity, execution progress, or estimate snapshot exists in these definitions (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:10–55`).
- Shared and contractor reads add accepted/agreed deltas to the baseline. The date arithmetic adds **calendar days**; active scope is baseline text plus change descriptions, not structured revised quantities (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:158–177`, `:206–216`; `supabase/migrations/20260923000000_browse_client_offers.sql:63–79`).
- The change constraint represents confirmed no-impact changes with null deltas and `agreed`; nonzero impacts use `pending`, `accepted`, or `rejected`. The partial index permits one pending impacting change per offer (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:47–61`). Null currently means no impact, so an unknown estimate must not be serialized as null and immediately agreed.
- The decision RPC checks the PIN, locks the offer/change, and returns the existing decision on retry (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:239–286`). A later trigger blocks authenticated contractors from directly finalizing or modifying accepted/rejected changes (`supabase/migrations/20260921010000_protect_customer_decisions.sql:3–27`).
- Creation is PLN-only and parses nonnegative amounts into exact integer minor units. A signed adjustment parser and decimal quantity arithmetic need separate treatment (`supabase/migrations/20260922000000_create_client_offer.sql:40–46`; `src/lib/pln.ts:1–17`).

### Options and recommendation

| Approach                                    | Useful capability                                        | Limitation for this request                                                                 | Recommendation                                                     |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Manual totals with automatic summation      | Cheap integration with existing deltas                   | Contractor still performs the estimating                                                    | Insufficient as the main product experience                        |
| Quantity × saved unit price                 | Strong automation for unchanged specifications           | Misses fixed setup, replacements, and consequential work                                    | Include as a simple recipe                                         |
| Resource recipes + consequence rules        | Explains materials, effort, rework, omissions, and price | Requires structured inputs and contractor-owned defaults                                    | Recommended core                                                   |
| Generic rules engine / DMN                  | External rule authoring and conflict policies            | Does not supply trade knowledge; introduces rule governance                                 | Reconsider when non-developers need to author interacting policies |
| Text diff / AI estimate                     | Could assist extraction in a future product              | Text changes do not establish execution state or rates; AI estimates are currently excluded | Exclude from this MVP                                              |
| Historical prediction                       | Could suggest productivity from similar completed jobs   | No actual-outcome dataset was established in the inspected path                             | Later, after collecting comparable actuals                         |
| Dependency graph / critical-path scheduling | Models interacting tasks and waits                       | Needs a maintained schedule beyond current offer data                                       | Later if confirmed date suggestions prove insufficient             |

For rule tooling, [JsonLogic](https://jsonlogic.com/) provides serializable decisions over supplied data. [Camunda DMN](https://docs.camunda.io/docs/components/modeler/dmn/decision-table-hit-policy/) defines policies such as UNIQUE and COLLECT for overlapping rule matches. Neither provides renovation estimating knowledge. The recommendation for ordinary TypeScript functions is an architectural judgment based on this repository and bounded scope, not a performance benchmark.

### Proposed contractor experience

1. Select the affected work item, or add new work. Choose increase, decrease, replace, or correction.
2. Reuse the accepted item's quantities/specification and rates. For an unstructured existing offer, capture the affected item once and explicitly confirm its baseline; do not claim it was extracted from the description.
3. Enter the new quantity/specification and answer relevant condition questions: completed quantity, accessibility, removal/restoration, material commitments, and waiting or dependent work.
4. Review a generated breakdown of additions, omission credits, labor hours, price adjustment, schedule assumptions, and unresolved facts.
5. Confirm or override the proposal with a reason. A price/deadline change enters the customer approval flow; a confirmed no-impact correction follows the agreed-correction path.

Reusable defaults make subsequent estimates less manual. A custom job still needs contractor input; the product should retain its calculations and offer to save a reusable recipe rather than present an unsupported answer.

### Shared model, trade-specific recipes

Proposed recipe data: stable identifier/version, trade, output unit, required questions, labor operations in person-hours per unit, material quantities per output unit, fixed setup/visit operations, optional consequence operations, and elapsed waits. Rates belong to the contractor. Recipe structure can ship without pretending its example rates are validated market prices.

Illustrative starter coverage, to validate with contractors:

| Trade      | Input examples                                                  | Consequences a recipe can propose                  |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Painting   | Area, coats, substrate, occupied room                           | Protection, preparation, extra coat, return visit  |
| Tiling     | Area, tile specification, substrate, completed quantity         | Removal, substrate repair, disposal, curing wait   |
| Electrical | Point count, route length, wall/access type, installation stage | Chasing, cable replacement, making good, testing   |
| Plumbing   | Fixture count, pipe length/material, access, installation stage | Isolation, removal, fittings, testing, restoration |

These are proposed estimating prompts, not installation instructions or compliance checklists. An electrical point or plumbing fixture cannot share a generic price across unknown routes and conditions. An unsupported combination returns “needs assessment.” Cross-trade consequences should reference reusable operations: restoration requested by both a plumbing and tiling item needs review for shared work rather than duplicate charging.

Prefer explicit operations to broad multipliers. For example, selecting an occupied room can add protection labor/materials; selecting installed tiles can add removal and disposal. If a contractor uses a calibrated productivity factor, restrict it to named labor operations, record its basis, and avoid applying the same difficulty again as an added operation.

### Proposed estimation algorithm

**A. Establish the comparison baseline.** Use current accepted/agreed structured work, excluding pending and rejected proposals. Give affected items stable IDs; descriptions are not identity. Record baseline revision/fingerprint and progress as of estimation. For a partially completed item, split completed and remaining quantities rather than applying a vague completion percentage to a mixed bundle.

**B. Expand the changed scope into operations.** Unchanged work remains untouched. Additions generate new operations; omissions identify avoidable work and a proposed contractual credit; replacements combine omissions with new work and consequential operations. Deduplicate shared setup by explicit job/visit/area identity. Material waste and package rounding apply to incremental procurement, considering reusable material explicitly supplied by the contractor; this does not require an inventory module.

**C. Calculate effort and internal cost.** Suggested equations, under compatible units and explicitly supplied rates:

```text
operation person-hours = quantity × person-hours per unit + applicable fixed hours
operation cost = person-hours × internal hourly cost
                 + incremental materials + equipment + subcontract cost
incremental remaining cost = new/consequential future costs
                            − avoided old future costs − recoveries
```

Separate completed/sunk cost from remaining cost. Treat a refundable purchase either as a recovery or an avoided cost according to its state, not both. Existing committed costs retained by the old agreement do not become new charges simply because a material is nonreturnable.

**D. Calculate the proposed customer adjustment.** A recipe can use agreed unit selling prices, or internal cost plus a contractor-defined markup. Choose and label the pricing basis; avoid adding a markup again to an already marked-up selling rate.

```text
proposed price delta = selling price of new and consequential work
                     − agreed omitted-scope credit
                     + explicit commercial adjustment
```

An omission credit refers to the original agreed value of the omitted component, including an accepted allocation for partially completed work. It is not automatically equal to the contractor's avoided internal cost. An unknown allocation requires confirmation. Discounts or absorbed rework remain visible commercial adjustments; the calculator does not decide entitlement to payment. Define a consistent tax-inclusive/exclusive price basis before implementation; the inspected offer path does not establish one.

**E. Classify complexity and readiness.** Proposed ordered rules:

- **Needs assessment:** a required measurement, rate, progress state, omission allocation, or consequential operation is unresolved.
- **Additional work:** inputs are sufficient and the recipe identifies removal, restoration, special access, or coordination work.
- **Routine:** supported quantity/specification change without identified consequential work.

Attach reasons such as “installed material requires removal.” These labels are a proposed UX policy, not an industry scale. Readiness should also be shown separately for cost, effort, and schedule: known labor with an unknown delivery date is not a complete deadline estimate. Do not invent percentage confidence without calibration data.

**F. Preserve the estimate.** Snapshot facts, template/rule versions, rates, units, baseline identity, generated operations, calculated outputs, confirmed outputs, and override reasons. Later catalog edits should affect future estimates, not silently rewrite a pending or accepted proposal.

### Time: useful automation without pretending to have a full schedule

Recommended MVP output: calculated person-hours plus a conditional working-duration estimate. Ask for effective available person-hours per working day, a working calendar, material readiness, blocking waits, and whether spare capacity absorbs the change. Save a contractor-confirmed target date and derive the existing calendar-day delta from it.

For a contractor-confirmed serial affected work sequence, compare the old remaining sequence with the new sequence using the same capacity/calendar assumptions. Place delivery and curing waits at their relevant positions. Overlapping waits should not simply be summed. A reduction in effort does not by itself commit to an earlier finish.

If those assumptions are unavailable, mark deadline impact unresolved and ask the contractor to set it before submission. The calculation still supplies effort and cost. Unknown schedule impact is not zero impact.

Keep a full dependency graph as an upgrade: represent tasks and prerequisites, recalculate projected completion before/after, then compare finish dates. It becomes worthwhile when contractors need reliable automatic date changes across interacting work. That is a larger product capability than storing offer deltas.

### Worked examples — hypothetical inputs, not trade benchmarks

The following figures are invented to demonstrate the proposed algorithm. They exclude tax and are not recommended commercial rates.

**Additional painting area:** assume an extra 12 m², 0.25 person-hours/m², an additional setup visit of 1 person-hour, internal labor cost of PLN 80/hour, materials of PLN 12/m² with no additional waste/rounding, and 25% markup on this added cost. Effort is `12 × 0.25 + 1 = 4 person-hours`; internal added cost is `4 × 80 + 12 × 12 = PLN 464`; proposed addition is `464 × 1.25 = PLN 580`. If the original setup still covers the addition, the setup charge must be removed. A deadline cannot be inferred from this arithmetic alone.

**Replacement before versus after installation:** assume 10 m², original agreed installed selling price of PLN 80/m², replacement installed selling price of PLN 120/m², and removal/disposal selling price of PLN 200 for that area. Before starting, with the full old component eligible for omission credit and no other consequences, the delta is `1,200 − 800 = PLN 400`. After completion, assuming no old-work credit and removal now required, it is `1,200 + 200 = PLN 1,400`. These are different site facts, not different complexity multipliers. Partial completion requires the corresponding split and confirmed credit.

**Successive quantity changes:** assume an original 20 m² item and an accepted increase to 30 m². A proposal to reach 35 m² adds `35 − 30 = 5 m²`, not `35 − 20 = 15 m²`. If the earlier increase was rejected, the comparison remains against 20 m². Pricing the marginal work still needs setup/material rules.

**Working day versus stored date delta:** assume a Friday contractual finish, eight extra person-hours that must follow it, available capacity of eight person-hours/day, a Monday–Friday calendar, and no holidays, waits, or spare capacity. The new finish is Monday: one working day but a stored delta of three calendar days. If those hours fit into confirmed spare capacity, the deadline may remain unchanged.

## Architecture Insights and Planning Handoff

The existing final deltas are a useful integration boundary. Proposed estimate data sits behind them; it should not replace the customer decision model.

- Introduce stable affected work items and reusable recipe/rate records. For existing text-only offers, model the affected fragment lazily and explicitly confirm its relationship to the agreed scope. Full offer snapshots or a complete bill of quantities are not required for this initial bridge. Automation coverage is limited to modeled items.
- A shared pure calculator can produce an interactive preview; the authenticated server recomputes/validates the submitted result. Use exact decimal/rational quantity handling with an explicit rounding rule and integer minor-unit money serialization. Client-supplied totals are not authoritative.
- Save the baseline identity, estimate snapshot, confirmed deltas, and proposal in a transaction with ownership and freshness checks. The current pending-change index does not prevent base-offer or pending-payload edits. Customer approval should bind to the exact proposal revision shown; payload edits require refreshed review. That integration concern spans the future customer-decision slice.
- On an accepted proposal, update the modeled active item state consistently with the decision. Rejected and pending proposals must not advance its quantities. Protect accepted/agreed snapshots and structured state from direct edits that bypass approval.
- Keep incomplete estimates separate from the existing `agreed` representation. Once the contractor confirms zero price and zero deadline impact, normalize zero deltas to null. Any confirmed nonzero price or deadline adjustment, including a reduction, takes the approval path. Do not allow an impact checkbox to contradict calculated/confirmed values.
- Keep private costs and markup out of shared-link responses; expose the approved customer-facing price breakdown and explanation deliberately. The existing shared RPC uses an explicit field projection (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:179–216`).
- Validate negative adjustments against the projected active total and valid date range. The existing base amount check does not constrain the sum after reductions (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:15`, `:215`).

Worth the extra MVP work: reusable recipes, affected-item identity, explicit execution progress, generated explanations, and estimate snapshots. These directly support repeat automation and correct successive changes. Defer a visual rule editor, broad purchased rate catalogs, machine learning, and full resource scheduling until usage establishes their value.

Before release, evaluate proposed recipes against real contractor change cases across the supported trades. Compare generated operations, estimate overrides/reasons, and estimating time; collect actual hours/material use separately from customer acceptance. Acceptance is not evidence that the predicted effort was accurate. A later calibration feature can suggest revised defaults from comparable actual jobs without rewriting old proposals.

### Verification targets for a future implementation

Proposed cases: repeated changes against the accepted baseline; rejected/pending exclusion; partial completion; committed/nonreturnable materials; shared setup deduplication; unit mismatch; missing rates; negative totals; rounding; weekend date conversion; stale-baseline submission; repeated customer decisions; and isolation of private costs.

Existing contract tests cover decision retries and rejected exclusion (`scripts/offer-contract.mjs:435–475`) and accepted price aggregation (`:523–531`). The test labeled as pending exclusion rejects its seeded change before reading totals (`:532–549`); add a true outstanding-pending assertion. The inspected seed helper sets price impact rather than deadline impact (`:101–113`). Tests/builds were not run because this task researches behavior and changes documentation only.

## Historical Context and Related Research

- The foundation plan proposed baseline-plus-accepted-delta aggregation and a single pending impacting change (`context/archive/2026-09-21-minimal-offer-record-contract/plan.md:33`, `:53`). Those claims are supported by the inspected migrations. Its immutable-record intent is only partly realized: accepted/rejected changes are protected by the later trigger, while pending payloads and base offers remain editable. Preserve this distinction when planning snapshot integrity.
- Shaping notes parked templates/automatic classification for later (`context/foundation/shape-notes.md:155–157`). This request brings assisted estimation into current research; it does not silently amend the PRD or roadmap.
- The roadmap identifies S-04 as recording/classifying impact (`context/foundation/roadmap.md:48`). Its historical baseline claiming no domain tables is outdated relative to the inspected migrations; that does not invalidate the S-04 outcome.
- No earlier estimating research was found in the inspected active change. Archived research filenames concern UI and PIN work, so they were not expanded as estimating evidence.

## Open Questions and Limits

The investigation answers the approach and integration question; recipe accuracy remains unvalidated. Before an implementation plan is finalized, settle:

1. Which initial recipes receive contractor validation across renovation, electrical, and plumbing? The user wants these trades supported, not a single-trade product.
2. Will pricing primarily use agreed selling rates or internal cost plus markup? How will an old lump-sum component receive a confirmed omission-credit allocation?
3. What tax-inclusive/exclusive basis matches existing offer totals? This research makes no tax-law recommendation.
4. Is conditional schedule assistance plus contractor confirmation sufficient for MVP? Recommended: yes; automatic cross-trade finish prediction requires more scheduling data.
5. Should structured items be introduced at offer creation, or lazily for affected work? Recommended initial bridge: lazy capture, with explicit limitations and reuse on subsequent changes.
6. How should first-offer acceptance interact with changes? Creation currently produces a pending offer without a base-offer decision row (`supabase/migrations/20260922000000_create_client_offer.sql:85–101`; base status default at `20260921000000_minimal_offer_record_contract.sql:18`). Do not infer customer acceptance merely from the existence of a baseline. Resolve eligibility to submit amendments in the approval-flow plan.

Research coverage: main-agent review of PRD, shaping notes, roadmap, lessons, current change, decisive SQL/API paths, and primary web sources; parallel read-only investigation of current schema/routes/tests and external estimating methods. No deployment or live database verification, market-rate validation, or implementation-effort benchmark was performed.

## Follow-up 2026-09-24 — fit to implemented S-08

### Scope and evidence

Revalidated on branch `feat/record-offer-change`, commit `c94f974b4dac4324801a28e29fd8526520bcd895`, at `2026-09-24T07:03:05Z`. The worktree was clean before this documentation update. The main investigation inspected the updated PRD, archived S-08 brief, item helpers/editor/detail/API paths, and decisive migration code. Read-only parallel investigations covered the migration/decision contracts and archived plan/review versus actual test assertions.

This is a source-based research update, not a fresh deployment verification or implementation review. No database reset, application changes, builds, or test suites were run. The earlier external estimating research remains background; this follow-up does not claim to refresh vendor documentation or validate market rates.

### What S-08 settled — and what earlier conclusions it supersedes

- **Structured baseline is implemented.** `offer_items` supplies stable IDs, ordering, quantities, units, specifications, selling rates, and effort assumptions. Creation derives the base total from the submitted items. New offers no longer depend on a manually entered aggregate amount (`supabase/migrations/20260924000000_structured_offers.sql:14–37`, `:275–284`; `src/pages/api/offers/index.ts:65–94`). The old “text-only offer” finding is historical.
- **Pricing basis is settled for this implementation.** Use customer selling rates in final PLN amounts; internal cost, markup, and tax calculation were excluded from S-08 (`context/archive/2026-09-23-prepare-structured-offer/plan-brief.md:22`, `:39`; `context/foundation/prd.md:71`, `:102`). S-04 should label its result “price adjustment.” A rate multiplied by quantity cannot establish contractor cost or profit. The earlier cost-plus-markup suggestion is an optional future extension, not the default S-04 algorithm.
- **Legacy mapping is out of the current scope.** The adopted preproduction approach requires an empty offers table before the structured migration (`supabase/migrations/20260924000000_structured_offers.sql:1–7`). The approved brief explicitly excludes legacy conversion (`context/archive/2026-09-23-prepare-structured-offer/plan-brief.md:25`, `:39`). Do not add the earlier lazy text-to-items bridge to S-04, and do not interpret that historical reset choice as authorization for another reset.
- **Rounding and units are implemented.** Under the item RPC, quantities and effort inputs have up to three fractional digits; quantities are positive and effort is nonnegative. Each nonnegative line is rounded half-up to a grosz before summing. Supported units are `piece`, `set`, `m`, `m²`, `m³`, `kg`, `l`, and `hour` (`supabase/migrations/20260924000000_structured_offers.sql:20–28`, `:130–160`; `supabase/migrations/20260924010000_enforce_supported_offer_item_units.sql:1–3`; `src/lib/offer-items.ts:54–61`, `:124–150`). Reuse this contract, rather than choosing another precision scheme for offers.
- **Original edits are guarded, with a bounded guarantee.** Direct authenticated writes to original offers/items are revoked. The edit RPC locks the owned offer, checks pending status, absence of a currently existing change row, and expected `items_revision`, then advances that revision (`supabase/migrations/20260924000000_structured_offers.sql:43–55`, `:306–329`). Change insertion now acquires the same parent lock (`supabase/migrations/20260924020000_serialize_offer_change_inserts.sql:8–18`). This supersedes the earlier finding that original offers remain directly editable by contractors; it does not establish a permanent “history has ever existed” flag.
- **Private effort is already excluded from sharing.** The shared RPC explicitly selects public item fields without labor assumptions (`supabase/migrations/20260924000000_structured_offers.sql:363–374`). Preserve that projection boundary when adding explanations.

Still valid: deterministic templates, explained consequence rules, contractor confirmation, no automatic deadline inference from hours alone, rejection exclusion, and PIN-protected idempotent decisions. The initial-offer acceptance question remains unresolved; creating structured items still does not record a customer baseline decision (`context/archive/2026-09-23-prepare-structured-offer/plan-brief.md:59`; `supabase/migrations/20260924000000_structured_offers.sql:275–284`).

### Revised S-04 business logic

The following is a recommendation for planning, not existing behavior.

**Start from the effective item state.** Select an item by ID and show its current agreed quantity, specification, selling rate, and private effort rate. Offer operations to change quantity, replace specification, remove remaining work, or add new work. Copy existing inputs as defaults; require confirmation of changed assumptions. A generic `set` or free-text specification does not reveal whether materials, disposal, or testing are included. Capture those inclusions before proposing extra charges.

**Automate uncomplicated amendments immediately.** When the affected work is unstarted, its omitted portion is fully creditable, and no consequential work or commercial override applies:

```text
line(q, r) = round_half_up(q × r)       # r is an integer number of grosz
price_delta = line(new_quantity, new_rate) − line(old_quantity, old_rate)
effort_delta = new_quantity × new_hours_per_unit
             − old_quantity × old_hours_per_unit
```

Apply this to affected effective items, not repeatedly to original items. Removed work has no after-state; it should not be passed as a zero-quantity original item because S-08 rejects such quantities. Adding work creates a new stable item identity. Changing a unit requires an explicit conversion or a replacement operation; the existing unit list contains no conversion model.

**Rounding example derived from the implemented rule:** assume the same item changes from `0.500` to `1.000` units at `1` grosz per unit. Its before/after amounts are both `1` grosz, so the price delta is `0`. Rounding `(1.000 − 0.500) × 1` independently produces `1` grosz and would overstate this line's adjustment. For line-preserving amendments, subtract rounded totals. Source rule: `src/lib/offer-items.ts:218–230`; SQL equivalent at `supabase/migrations/20260924000000_structured_offers.sql:157–160`.

**Practical example with hypothetical contractor inputs:** an unstarted painting item changes from `20.000` to `25.000 m²`, with an unchanged final selling rate of PLN `40.00/m²` and `0.250` labor hours/m². With no setup or other consequences, price increases by `PLN 1,000 − PLN 800 = PLN 200`; estimated effort increases by `6.250 − 5.000 = 1.250 hours`. After this is accepted, increasing to `30.000 m²` compares against `25.000`, yielding another PLN `200` and `1.250 hours`. Pending or rejected proposals leave the comparison at the previously active quantity. These are illustrative inputs, not validated rates.

**Handle executed work separately.** Ask how much affected work is completed and whether an omitted component is still creditable. A partly executed bundle may need its remaining work and credit allocated by the contractor; quantity and a bundled selling rate alone do not determine that allocation. Add explicit removal, disposal, restoration, extra visits, or other consequence lines when applicable:

```text
proposed price delta = new work selling amount
                     + consequential work selling amounts
                     − confirmed omission credit
                     + explicit commercial adjustment
```

Preserve completed work's agreed value unless a separate concession changes it. Do not credit its whole original price merely because the desired final specification changes. Retained charges and concessions need visible reconciliation so the customer-facing breakdown still explains the aggregate offer price. Record both the computed suggestion and any contractor override with its reason.

**Keep useful reusable templates within S-04.** Templates can prefill an operation's name, supported unit, specification prompts, contractor selling rate, and labor hours per unit, plus conditional companion operations. Painting, tiling, electrical, and plumbing can share this format. Start with contractor-confirmed templates and reuse an existing item's inputs; do not infer trade-specific prices from its name. A full resource-cost catalog is unnecessary. Selecting installed work, for example, can prompt removal/restoration operations, while missing route length or unknown substrate marks the estimate as needing assessment. Avoid duplicate setup/restoration across companion operations.

**Complexity remains reason-based.** Use routine / additional work / needs assessment with explicit reasons and missing inputs. Do not multiply the customer selling rate by a universal complexity score. Separate price readiness, effort readiness, and deadline readiness. Zero hours is a valid explicit S-08 input, not a missing-input sentinel (`src/lib/offer-items.ts:104–105`; `supabase/migrations/20260924000000_structured_offers.sql:25–26`).

**Calculate effort; confirm the deadline.** The stored labor-hours field is a contractor planning assumption, with no captured crew/capacity/calendar semantics. Define its use as person-hours before adding duration conversion. Multiplying quantities and per-unit hours may yield finer precision than either input; preserve calculation precision and round display separately. Show effort changes immediately, but derive a contractual calendar-day delta from a contractor-confirmed target date and the current active deadline. Capacity, delivery, curing, overlap, and spare time remain missing scheduling facts. Source for existing calendar-day aggregation: `supabase/migrations/20260924000000_structured_offers.sql:352–361`.

### Integration needed beyond the estimator form

**Preserve original items and project accepted item effects.** Recommended model: keep S-08's original item records; attach immutable before/after item effects and estimate evidence to change proposals. Produce a canonical effective item set by applying accepted/agreed effects in a persisted activation order. This is item-level change history, not full offer versioning. New items introduced by accepted changes must remain targetable by subsequent changes. Use the same effective projection for estimation and later current-offer views.

Today `get_shared_offer` returns stored original items under `active_scope.items`, while price incorporates accepted/agreed aggregate deltas. The decision RPC updates decision/status records but neither items nor item revision (`supabase/migrations/20260924000000_structured_offers.sql:352–398`; `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:290–318`). That is the decisive S-04 integration gap. Do not rewrite `offer_items`/`base_amount_minor` on acceptance while also adding the same change delta to the base: that would count the amendment twice. Current item values and retained-charge/override adjustments must reconcile with the base-plus-deltas price.

**Separate scope freshness from original-item edit revision.** `items_revision` currently advances on original edits, not accepted changes (`supabase/migrations/20260924000000_structured_offers.sql:323–329`). Introduce an active-scope revision or explicitly extend revision semantics. Capture it when estimating, compare under the offer lock when recording and activating a change, and advance it when accepted/agreed item effects become active. A single pending impacting proposal does not prevent a no-impact correction from changing its baseline. Prefer blocking active corrections while an impacting proposal is pending for MVP, or explicitly invalidate and regenerate the pending proposal; do not silently apply a stale proposal.

**Enforce calculation and history contracts at the database command boundary.** Authenticated direct change writes remain granted, while the decision-protection trigger freezes accepted/rejected rows but not agreed rows (`supabase/migrations/20260921000000_minimal_offer_record_contract.sql:111–116`, `:132`; `supabase/migrations/20260921010000_protect_customer_decisions.sql:11–27`). Pending/agreed deletion can remove the row that currently locks original edits. The new insert trigger serializes insertion, but does not validate estimates or protect updates/deletions. S-04 should restrict direct mutations and use controlled commands, with ownership, proposal identity, revision, arithmetic, and projected-total validation. Preserve durable agreed corrections as well as customer decisions. Keep unfinished drafts separate from final no-impact corrections; unknown impact must not become `agreed` via null deltas.

**Reuse existing components selectively.** Reuse the item input types, supported units, validation, and line arithmetic from `src/lib/offer-items.ts`, plus `OfferItemsEditor` where its form fits. Use the original-detail screen as the entry point, but label original versus effective scope: it deliberately reads and displays the base amount/items today (`src/pages/offers/[offerId].astro:42–66`, `:117–182`). Follow the existing bounded request parsing in creation/edit routes (`src/pages/api/offers/index.ts:49–74`; `src/pages/api/offers/[offerId]/items.ts:32–58`). Do not call `apply_offer_items` for a draft amendment: it deletes omitted baseline rows and writes original items (`supabase/migrations/20260924000000_structured_offers.sql:106–112`, `:187–200`).

**Adapt signed money and serialization deliberately.** Item validators accept nonnegative inputs; change adjustments may be negative. `formatMinorAmount` uses a signed remainder directly, so it is not a suitable signed-adjustment formatter without adaptation (`src/lib/offer-items.ts:234–237`). The HTTP helper restricts numeric rates to safe JSON integers, while SQL permits a larger bigint bound (`src/lib/offer-items.ts:50–51`, `:99–102`; `supabase/migrations/20260924000000_structured_offers.sql:23–24`). Define exact serialization for totals and signed deltas instead of extending the preview through unchecked floating-point arithmetic.

### Evidence-backed validation targets

The existing suites contain assertions for per-line half-grosz rounding, item-derived totals, retained IDs/revisions, stale/foreign edit rejection, rollback of invalid creation, and private-field exclusion (`scripts/offer-contract.mjs:168–356`, `:525–536`). HTTP tests cover successful edits, malformed/stale requests, and anonymous/foreign access (`scripts/smoke.mjs:322–388`, `:558–570`). These are inspected assertions, not test runs performed in this follow-up.

Relevant limitations to address while implementing S-04:

- The fixtures named accepted/rejected in the item-lock test are still pending at that point; decisions occur later (`scripts/offer-contract.mjs:445–486`, `:669–705`). Test the terminal outcomes explicitly and compare full item inputs, not just the current `id,name` subset.
- The test labeled pending-total exclusion rejects the row before reading (`scripts/offer-contract.mjs:772–789`). Add an outstanding-pending assertion for both effective quantities and price.
- The shared projection test checks item count and absence of private field names, not exact public amounts (`scripts/offer-contract.mjs:525–536`). Verify effective public item values and explanation privacy.
- The archived review states that the insert/edit concurrency fix was not exercised with held concurrent transactions (`context/archive/2026-09-23-prepare-structured-offer/reviews/impl-review.md:47`). Add a deterministic race check for estimate submission versus baseline editing/activation.

Estimator-specific coverage should prove rounded-before/after subtraction, signed reductions, successive accepted changes, rejected/pending exclusion, zero-price but changed-scope corrections, partial completion and credit allocation, duplicate consequence prevention, idempotent activation, stale proposal rejection, and preservation of saved estimates after template edits. Test effort separately from calendar dates and prevent an unknown deadline from being treated as zero impact.

### Current planning handoff and unresolved choices

S-04 no longer needs another structured-offer prerequisite. Build on S-08: effective item projection and controlled change recording, before/after estimation, reusable consequence templates, and explained contractor confirmation. The customer-decision and shared/history slices must consume that same proposal contract; a recording-only UI cannot by itself establish correctness after acceptance.

Before finalizing a plan, settle these remaining product choices:

1. **Initial acceptance:** how is the original offer accepted, and when may the contractor propose amendments? Preserve the PIN/customer contract rather than treating item creation as acceptance.
2. **Price versus internal cost:** recommended S-04 scope is selling-price and effort assistance using the adopted model. If internal cost estimation remains required, it needs separate cost inputs; it cannot be inferred from selling rates.
3. **Executed-work credits and overrides:** which allocations require explicit confirmation, and how are retained charges/concessions displayed alongside current work?
4. **Template coverage and schedule assumptions:** validate initial recipes across the requested trades; retain a needs-assessment path for unsupported conditions. Confirm whether labor inputs represent person-hours and whether conditional scheduling plus a contractor-confirmed date is sufficient.
5. **Pending proposal policy:** decide whether to freeze published proposals and block intervening active corrections, or support explicit invalidation/reissue with a new proposal revision. Recommendation for MVP: freeze the published proposal and serialize active changes.

The earlier open questions about introducing itemization, selecting the baseline pricing basis, and building legacy mapping are resolved by S-08. The roadmap's detailed S-08 entry is marked done, but its handoff still recommends planning S-08 and its open questions still describe pricing/conversion as undecided (`context/foundation/roadmap.md:133–144`, `:203–215`). Treat those individual entries as stale; this research does not modify roadmap lifecycle or archived artifacts.
