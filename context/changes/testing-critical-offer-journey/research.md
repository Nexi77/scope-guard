---
date: 2026-10-01T20:44:15+02:00
researcher: Codex
git_commit: 6e4d06b861b26d0bcbae4207e91ebc7630b879ac
branch: master
repository: ScopeGuard
topic: "Missing browser coverage for accepted-change and rejected-copy journeys"
tags: [research, codebase, e2e, offer-journey]
status: complete
last_updated: 2026-10-01
last_updated_by: Codex
---

# Research: Critical offer journey

**Date:** 2026-10-01T20:44:15+02:00  
**Researcher:** Codex  
**Git Commit:** `6e4d06b861b26d0bcbae4207e91ebc7630b879ac`  
**Branch:** master  
**Repository:** ScopeGuard

## Research Question

Which browser interactions and independent business assertions close rollout Phase 3's accepted-change and rejected-copy branches without repeating Phase 2's isolated checks?

## Summary

In the inspected browser suite, seed checks navigation/validation without creating an offer, while active-terms and safe-reasons use API fixtures for creation and decisions (`tests/e2e/seed.spec.ts:6`; `tests/e2e/active-terms.spec.ts:21`; `tests/e2e/safe-reasons.spec.ts:23`, `:50`). The missing signal is two independently runnable journeys whose creation, sharing, customer decisions, and change/copy submission use the actual UI. Existing Playwright authentication, hydration waiting, and local cleanup are reusable.

## Detailed Findings

### Accepted-change branch

- Create through `/offers/new`: `Add new customer`, customer/scope/deadline fields, item name/quantity/unit/specification/rate/labor fields, and `Create offer`. Success exposes `Review this offer` (`src/components/offers/CreateOfferForm.tsx:190–201`, `:313–470`; `src/components/offers/OfferItemsEditor.tsx:213–312`). Begin from the dashboard navigation exemplar and wait for hydration (`tests/e2e/seed.spec.ts:6–19`; `tests/e2e/ready.ts:3`).
- Detail provides `Generate PIN` and a `New PIN` output, plus readonly `Shared offer URL` (`src/components/offers/ManageOfferPin.tsx:105–117`; `src/components/offers/ManageOfferShare.tsx:87`). Capture the PIN internally without printing it or using value-bearing failure diagnostics.
- Customer context must explicitly start with empty storage state, because the configured Chromium project inherits contractor authentication (`playwright.config.ts:36–39`). Customer uses `Accept offer`, `Six-digit offer PIN`, `Confirm acceptance`, then sees the recorded result (`src/components/offers/SharedOfferDecisionForm.tsx:183–204`, `:245–370`). Internal auth/routing/API/database remain real.
- Contractor opens `Offer actions` → `Start change proposal`. The form exposes `Quantity`, `What is changing?`, `Confirmed target date`, `Preview estimate`, and `Confirm and record change`; publishing navigates to targeted history (`src/components/offers/OfferActionsMenu.tsx:64`; `src/components/offers/OfferChangeForm.tsx:368`, `:623`, `:766`, `:814–899`).
- Independent scenario oracle: base quantity 1 at 100.00 PLN and deadline 2099-01-15; quantity changed to 2 and deadline 2099-01-22 implies preview +100.00 PLN. Pending agreed terms stay 100.00 PLN/quantity 1/Jan 15; after anonymous `Accept change` they become 200.00 PLN/quantity 2/Jan 22 after reload. These literal inputs follow PRD quantity×rate and approval rules; rendered terms are in `src/pages/offers/[offerId].astro:140–164` and `src/pages/shared/[token].astro:117–135`.
- History distinguishes `Customer accepted version 1` from `Customer accepted change proposal 1` (`src/pages/offers/[offerId]/history.astro:189`, `:379`). Assert original terms and accepted proposal, rather than just the history heading.

### Rejected-copy branch

- Customer uses `Reject offer`, `Why are you rejecting this proposal?`, PIN and `Confirm rejection`; reload shows `Offer rejected`. Contractor overview exposes the reason and `Create new offer from this one` (`src/components/offers/SharedOfferDecisionForm.tsx:285–370`; `src/pages/shared/[token].astro:76–89`; `src/pages/offers/[offerId].astro:94–112`).
- `/offers/new?source=<id>` reads an owner-scoped rejected offer and maps its customer, scope, deadline, and item fields into prefill. Item identifiers are omitted; submit uses normal creation (`src/pages/offers/new.astro:82–127`; `src/components/offers/CreateOfferForm.tsx:55–67`; `src/pages/api/offers/index.ts:128`).
- Verify prefill in hydrated controls, edit the copied rate to a literal new value, and save through UI. For quantity 1, changing rate from 100.00 to 150.00 PLN gives independent copied total 150.00 PLN. New offer is pending with a different ID/share URL and the same customer. Original remains rejected at 100.00 PLN with the same reason and history after reload. Authenticated reads can corroborate distinct item/revision identities and no inherited decision/time/comment on the new revision.
- Existing smoke tests cover copy source fallback, prefill and database independence, but seed rejection through admin writes and do not drive browser submission (`scripts/smoke.mjs:1254–1263`, `:1336–1441`). Existing hostile-reason browser tests decide through API (`tests/e2e/safe-reasons.spec.ts:31–32`). These are reusable evidence, not the missing full UI branch.

### Fixture and verification constraints

- `OfferFixture.create()` combines API creation, authentication, PIN setup and private bookkeeping (`tests/e2e/offer-fixture.ts:64–107`); invoking it would bypass the first UI leg. Add focused support for UI-created fixtures or a separate bounded helper, preserving current callers. Read authoritative IDs after observable navigation; do not let setup APIs substitute for journey actions.
- Current token-scoped cleanup captures offers for the uniquely named customer, including a copied offer reusing that customer. It deletes offers before customer and checks customers/offers/items/revisions/changes/decisions (`tests/e2e/offer-fixture.ts:171–217`). Reuse that narrow local-only strategy; cleanup must work even if a test fails after creation or midway through copy. Close the anonymous context in `finally` without revoking shared contractor setup auth.
- Prefer role/label locators, explicit anonymous storage, hydration/state waits, independent fixture tokens, and real internal boundaries (`context/foundation/test-stack.md:5–20`; `.agents/skills/10x-e2e/references/e2e-quality-rules.md`). Prove each new branch red on its named business regression, restore production immediately, and verify residue after both red and green runs. Use a free port so preview rebuilds rather than serving stale output (`context/foundation/test-stack.md:34`).

## Code References

- `src/components/offers/CreateOfferForm.tsx:313` — create/copy controls.
- `src/components/offers/OfferChangeForm.tsx:814` — estimate and confirmation.
- `src/components/offers/SharedOfferDecisionForm.tsx:118` — real decision submission and settled result.
- `src/pages/offers/new.astro:110` — copy prefill without inherited IDs.
- `tests/e2e/offer-fixture.ts:171` — local fixture cleanup seam.

## Architecture Insights

Use two browser contexts within each test: authenticated contractor and an explicitly anonymous customer. Browser actions provide the missing cross-boundary signal; authenticated database reads corroborate independent copy identity and persistence. Keep business paths separate and self-contained so one branch cannot depend on another test's outcome.

## Historical Context

Supported: Phase 2 supplies independent pricing/state and hostile-text checks, while its plan excludes completing the broader journey (`context/changes/testing-active-terms-and-safe-reasons/plan.md`). The archived Phase 1 plan has completed Progress and archived metadata, supporting correction of its stale rollout status (`context/archive/2026-09-29-testing-decision-abuse-and-state-safety/plan.md`; sibling `change.md`).

## Related Research

`context/changes/testing-active-terms-and-safe-reasons/research.md` — existing coverage and local fixture restrictions.

## Open Questions

No unresolved product choices. Discovery here inspected source, not the running accessibility tree; the E2E execution phase must explore and verify actual controls before generating tests. CI enforcement remains rollout Phase 4.
