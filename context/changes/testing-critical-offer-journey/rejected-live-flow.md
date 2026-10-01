# Rejected-copy live browser discovery

Verified on 2026-10-01 against a fresh local build at port 4350 using named `playwright-cli` session `scopeguard-copy`. Contractor loaded the ignored setup storage state; customer used an explicitly empty storage state. Creation, PIN generation, rejection, and copy submission were actual UI actions. No journey action was seeded through API.

## Observed controls and outcomes

- Creation uses the same hydrated role/label controls as the accepted journey: customer name, original scope, deadline, and item name/quantity/unit/specification/rate/private labor. `Create offer` navigates directly to the new detail route.
- Anonymous `Reject offer` reveals `Why are you rejecting this proposal? required`, `Six-digit offer PIN required`, and `Confirm rejection`. After rejection and reload, contractor region `Customer rejected this offer` includes `Reason: Please prepare a separate revised proposal`; region `Rejected offer` retains 100,00 zł and 15 Jan 2099.
- `Create new offer from this one` navigates to `/offers/new?source=<original-id>`. Hydrated `Existing customer required` combobox displays the same fixture customer. Scope/date/item fields retain Agreed wall painting, 2099-01-15, Painted wall, quantity 1, Piece (pc), White finish, rate 100.00, and labor 1.
- Editing only rate to 150.00 and submitting creates a distinct offer and share link. Region `Offer awaiting acceptance` shows 150,00 zł and 15 Jan 2099; `Customer PIN: Not configured` confirms the fresh proposal needs its own PIN.
- Original history retains `Customer rejected version 1`, its reason, and `View version details`.

## Generation contract and review

Generate one independent risk #5/#4 spec from `context/foundation/test-plan.md`, using `tests/e2e/seed.spec.ts` as exemplar. Preserve real UI actions and explicit anonymous customer storage. Assert all hydrated prefill fields before editing, literal 100/150 totals after reload, independent offer/share/item/revision identity, pending copy with null decision/comment/time, and unchanged original full item/offer/revision snapshots. Authenticated reads corroborate identity/state only. Use role locators, state waits, a unique annotated customer token, and bounded six-table cleanup in nested `finally`.

The five anti-patterns were reviewed: business assertions cover the copy/rejection contract; locators use accessible roles/text; each test creates its own customer; there are no fixed waits; cleanup is asserted and runs after failures. Trace, screenshot, and video are off. PIN capture is private, immediately followed by reload in `finally`; private input uses the native HTMLInputElement value setter and bubbling input event through an accessible locator, because Playwright fill metadata retains values in HTML reports even when tracing is off. Generic failures omit sensitive details. The auth setup uses the same helper for credentials and disables retained artifacts.

## Exploration hygiene

Exploration generated a PIN once, then reset it privately because CLI run-code globals do not persist between invocations. Reset requires the observed `Reset PIN` confirmation dialog. The generated spec avoids that incidental reset and generates once. No credentials or PIN values were emitted. Original and copied exploration records were deleted using their exact unique customer token; the combined six-table residue count was zero. Browser and preview were stopped before focused verification.

## Primary review and verification

- Focused cold-build run on port 4351: setup and copy journey passed. Primary review strengthened unchanged-source assertions to compare full item fields plus source scope/deadline, rather than identifiers alone.
- Local report inspection found ordinary Playwright `fill` includes private values in step titles. Added `private-input.ts` native setter/input events to both journeys and setup credentials; setup artifacts are disabled too. Removed earlier ignored sensitive reports. Updated focused cold-build run on port 4353: 2 passed (5.9s).
- Deliberate copy-prefill regression on port 4352 changed only source scope prefill. The test failed specifically with expected `Agreed wall painting`, received `Incorrect copied scope`. Cleanup passed after failure; independent customer-token count was zero.
- Production `src/pages/offers/new.astro` restored byte-for-byte (SHA-256 `bc8d8f5d178ab261f632a5ab0924e4102717f5509288cc4009b6a2a95c6bba8f`).
- Final restored cold-build suite on port 4354: 7 passed (6.7s); webServer completed `npm run build`. Lint passed; Astro check reported 86 files, zero errors/warnings/hints. Every domain fixture's six-table cleanup passed.
- Private inspection of the final HTML report found no retained setup password and zero six-digit value-bearing fill titles. No private value was printed during inspection.
