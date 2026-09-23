<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Prepare Structured Offer

- **Plan**: context/changes/prepare-structured-offer/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — RPC accepts units outside the supported editor list

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260924000000_structured_offers.sql:128-136
- **Detail**: The browser parser restricts units to `piece`, `set`, `m`, `m²`, `m³`, `kg`, `l`, and `hour`, but the database RPC checks only that `unit` is a nonempty string of at most 40 characters. Authenticated callers can invoke the RPC directly with values the editor does not support. Contract fixtures use `item`, which is also outside the editor list. This leaves persisted item data inconsistent with the UI and the structured baseline expected by later estimation.
- **Fix**: Added the `offer_items_unit_supported` constraint in `20260924010000_enforce_supported_offer_item_units.sql`, changed invalid contract fixtures to use `piece`, and added a direct-RPC rejection case for `item`.
  - Verification: The migration applied locally, `npm run offer-contract` passed, and `npm run lint` passed.
- **Decision**: FIXED

### F2 — Change insertion can race with item editing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260924000000_structured_offers.sql:305-316
- **Detail**: `edit_offer_items` locks the offer, checks that no `offer_changes` row exists, then replaces items. Authenticated users still have direct insert permission on `offer_changes` from the original contract migration (line 132), and that insert does not acquire the offer-row lock. A concurrent insert can therefore race after the existence check while item replacement is in progress, violating the rule that an offer is locked once change history starts.
- **Fix**: Serialize change-row creation against edits by acquiring the same offer-row lock in the change-creation database boundary, and add a concurrent edit/change contract case.
  - Strength: Enforces the lifecycle invariant at the database boundary.
  - Tradeoff: Requires coordination with the future change-recording path or a trigger before that path is implemented.
  - Confidence: MED — the direct grant and edit lock are confirmed; the concurrent interleaving needs a focused database test.
  - Blind spot: No change-creation API exists in this slice.
- **Decision**: FIXED — Added `lock_offer_before_change_insert` in `20260924020000_serialize_offer_change_inserts.sql`; the local contract suite passed with existing change-insert and post-insert edit-lock coverage. The suite does not hold concurrent database transactions, so it does not deterministically exercise the interleaving itself.

### F3 — HTTP item payloads have no request-size limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision. Fix is obvious and narrowly scoped.
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/offers/index.ts:38-50; src/pages/api/offers/[offerId]/items.ts:26-45
- **Detail**: Both endpoints parse the complete form body and `items_json` before item-count and field validation. The database bounds normalized item payloads, but oversized multipart bodies or JSON strings are already buffered and parsed before those limits apply. This misses the plan's HTTP payload-size bound.
- **Fix**: Reject oversized requests before form parsing and enforce a maximum `items_json` length before `JSON.parse`.
  - Strength: Bounds memory and parsing work at the HTTP boundary as well as in the database.
  - Tradeoff: Adds a small request-size policy that must stay aligned with the 100-item limit.
  - Confidence: HIGH — the current endpoints have no pre-parse size check.
  - Blind spot: The deployment adapter's own request cap was not independently measured.
- **Decision**: FIXED — Added bounded stream parsing for 512 KiB request bodies and a 256 KiB `items_json` cap to create/edit endpoints. Smoke coverage rejects oversized create and edit submissions; lint, build, and smoke passed.

### F4 — Branch includes unrelated change-planning files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision. Fix is obvious and narrowly scoped.
- **Dimension**: Scope Discipline
- **Location**: context/changes/record-offer-change/change.md; context/changes/record-offer-change/research.md
- **Detail**: The branch diff against the refreshed `origin/master` contains these two files from the separate `record-offer-change` plan/research change. They are outside the prepare-structured-offer plan and would be included if this branch were integrated as one unit.
- **Fix**: Keep the `record-offer-change` planning files out of the structured-offer integration diff, or deliberately split the branch work before integration.
  - Strength: Preserves the plan's one-change-per-PR scope and keeps the archive history attributable.
  - Tradeoff: Requires separating the unrelated planning commit from this branch's integration.
  - Confidence: HIGH — both paths are present in `origin/master...HEAD` and absent from this plan's file list.
  - Blind spot: No implementation PR is recorded in the change folder.
- **Decision**: SKIPPED — User chose to leave the unrelated change-planning files in the branch.

### F5 — Create and edit routes lack an explicit Origin check

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision. Fix is obvious and narrowly scoped.
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/offers/index.ts:29-38; src/pages/api/offers/[offerId]/items.ts:20-28
- **Detail**: These cookie-authenticated mutations do not explicitly compare the request Origin with the app origin. The PIN mutation route does, while the smoke suite exercises Origin rejection only for PIN requests. Astro may already reject cross-origin form submissions globally, so this is a consistency gap rather than a confirmed bypass.
- **Fix**: Confirm the framework's Origin protection covers both routes and document that boundary, or apply the same explicit Origin validation used by the PIN endpoint.
  - Strength: Makes the CSRF boundary explicit and consistent across mutations.
  - Tradeoff: A duplicate check may be unnecessary if Astro's configured guard already covers the request types.
  - Confidence: MED — endpoint code lacks the check; framework behavior is a possible mitigating control.
  - Blind spot: No cross-origin smoke case targets offer creation or item editing.
- **Decision**: SKIPPED — User chose to make no additional Origin changes.

### F6 — Creation redirects through a confirmation page

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision. Fix is obvious and narrowly scoped.
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/offers/index.ts:104-106; src/components/offers/CreateOfferForm.tsx:101-109
- **Detail**: The endpoint redirects to `/offers/new?created=1…`, then the confirmation view offers a “Review this offer” link. The plan's endpoint contract says creation redirects to the detail route directly. The implemented confirmation state still provides the planned detail link and customer-list navigation, so the outcome remains reachable with an extra click.
- **Fix**: Decide whether the confirmation step is intentional; if so, update the endpoint contract in a future plan revision, otherwise redirect directly to the offer detail route.
  - Strength: Resolves the small mismatch between route behavior and the stated contract.
  - Tradeoff: Direct redirect removes the explicit creation confirmation state.
  - Confidence: HIGH — actual redirect and confirmation link are both present.
  - Blind spot: No usability evidence compares the two navigation paths.
- **Decision**: FIXED — Successful offer creation now redirects directly to `/offers/<offerId>`. Updated smoke coverage verifies direct redirects for new and reused customers and foreign-contractor isolation. `npm run lint` and the local Supabase smoke suite passed.

## Success Criteria Evidence

- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run offer-contract` against the migrated local Supabase schema — PASS.
- `BASE_URL=http://127.0.0.1:4321 npm run smoke` against local Supabase — PASS; all smoke steps passed.
- Manual Phase 3 checklist — user confirmed completion across mobile and desktop browsers, keyboard use, and price/effort labels.
- Earlier phase migration, database, smoke, and manual checks are marked complete in Progress; the full plan has no pending rows.
