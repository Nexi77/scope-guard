---
date: 2026-09-23T15:46:58+02:00
researcher: Codex
git_commit: 9f6af0f1751daa84ac3194a968e9088d531613d3
branch: feat/manage-offer-pin
repository: ScopeGuard
topic: "Manage offer PIN"
tags: [research, codebase, offers, pin, access-control]
status: complete
last_updated: 2026-09-23
last_updated_by: Codex
---

# Research: Manage offer PIN

**Date**: 2026-09-23T15:46:58+02:00  
**Researcher**: Codex  
**Git Commit**: 9f6af0f1751daa84ac3194a968e9088d531613d3  
**Branch**: feat/manage-offer-pin  
**Repository**: ScopeGuard

## Research Question

For the `manage-offer-pin` change, what product contract, existing PIN storage and verification path, contractor UI/API, and prior decisions should guide planning?

## Summary

The PRD requires the contractor to set and reset a six-digit PIN assigned to a customer or job; viewing a shared offer uses its link, while accepting or rejecting a change also requires the PIN ([prd.md:83-92](../../foundation/prd.md), [prd.md:107-111](../../foundation/prd.md)). The archived foundation plan chose a per-offer hash, and the current schema stores `pin_hash` on `offers` ([plan-brief.md:19-27](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md), [migration:10-29](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). In the inspected offer routes and components, the contractor can create and browse offers but has no PIN management control or API; new offers leave that hash null ([new.astro:8-15](../../../src/pages/offers/new.astro), [index.astro:221-275](../../../src/pages/offers/index.astro), [offer API:29-90](../../../src/pages/api/offers/index.ts), [creation migration:85-101](../../../supabase/migrations/20260922000000_create_client_offer.sql)).

## Detailed Findings

### Product boundary and sequence

- FR-008 permits a PIN tied to either a customer or job. FR-006 limits the shared link to its assigned offer, and FR-007 requires the six-digit PIN for a decision ([prd.md:81-87](../../foundation/prd.md)). The shared viewing and decision flows are later roadmap slices S-05 and S-06; S-03 is the contractor's set/reset capability ([roadmap.md:116-160](../../foundation/roadmap.md)).
- The PRD requires the contractor to be able to revoke customer access and requires repeated submission of the same decision to avoid duplicate or inconsistent state ([prd.md:89-96](../../foundation/prd.md)). Those requirements constrain later shared-access and decision slices, even though S-03 is scoped to PIN management ([roadmap.md:116-160](../../foundation/roadmap.md)).

### Data and authorization

- The inspected schema places a nullable `pin_hash` and a unique `share_token` on each offer. Offer rows are scoped to `contractor_id` by authenticated RLS, while anonymous table access is revoked ([migration:10-29](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql), [migration:88-133](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). The creation RPC inserts an offer without setting `pin_hash`, so offers created by that path start without a PIN ([creation migration:85-101](../../../supabase/migrations/20260922000000_create_client_offer.sql)).
- For the current anonymous decision RPC, a request must provide exactly six digits, an unrevoked share token, and a PIN whose `extensions.crypt` result matches the stored hash. A null hash fails that check ([migration:221-256](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). The RPC locks relevant rows and returns the prior decision when one exists ([migration:245-283](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)).
- The current public shared-offer read is an RPC rather than anonymous table access; its returned JSON projection ends with active scope, amount, deadline, and changes, without the PIN hash ([migration:135-217](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql), [migration:125-133](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). The anonymous role has direct execute permission on the read and decision RPCs ([migration:332-336](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)).

### Contractor surface and verification

- The inspected `/offers` page queries owned customers and offer summaries, then renders offer cards with scope, status, price, and deadline; no PIN action appears in that rendering path ([index.astro:41-79](../../../src/pages/offers/index.astro), [index.astro:221-275](../../../src/pages/offers/index.astro)). The offer creation page renders `CreateOfferForm`, and its POST endpoint accepts customer, scope, price, and deadline inputs, without a PIN input ([new.astro:8-15](../../../src/pages/offers/new.astro), [offer API:29-63](../../../src/pages/api/offers/index.ts)).
- The middleware protects paths beginning `/offers` and loads the signed-in user from a cookie-backed Supabase client ([middleware.ts:4-24](../../../src/middleware.ts), [supabase.ts:1-21](../../../src/lib/supabase.ts)). The existing offer POST also checks `auth.getUser()` ([offer API:29-36](../../../src/pages/api/offers/index.ts)).
- The existing database contract script seeds an offer with `pin_hash`, checks a wrong PIN fails, and checks that repeating an accepted decision retains its original result ([offer-contract.mjs:79-95](../../../scripts/offer-contract.mjs), [offer-contract.mjs:316-346](../../../scripts/offer-contract.mjs)). The inspected app smoke steps cover offer creation, browsing, and cross-contractor customer isolation; they do not exercise a PIN setter ([smoke.mjs:103-300](../../../scripts/smoke.mjs)).

## Architecture Insights

The existing per-offer hash matches the archived plan's single-offer share boundary ([plan-brief.md:19-27](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md), [migration:10-29](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). A contractor-facing setter needs to validate the PIN and write its hash through an authenticated, owner-scoped path; the current schema supplies storage and ownership policy but no such application flow ([migration:104-109](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql), [offer API:29-90](../../../src/pages/api/offers/index.ts)). This is an implementation implication, not a decision between database-side and server-side hashing.

## Historical Context

- **Supported:** The foundation brief chose “per offer, hash only,” despite the PRD allowing customer or job scope; the offer schema implements that narrower choice ([plan-brief.md:19-27](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md), [prd.md:85-87](../../foundation/prd.md), [migration:10-29](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)). The brief explicitly left UI, Astro endpoints, and PIN management outside the foundation slice ([plan-brief.md:29-39](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md)).
- **Supported, still deferred:** The foundation review follow-up records that the anonymous decision RPC has no rate limit or lockout and calls for a rate-limited delivery endpoint and revocation of direct anonymous decision execution when the customer-decision boundary is implemented ([review-fixes.md:7-9](../../archive/2026-09-21-minimal-offer-record-contract/follow-ups/review-fixes.md)). That exposure is present in the inspected migration grant ([migration:332-336](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql)).

## Related Research

No prior research artifact in the inspected archived offer-contract, offer-creation, or offer-browsing changes addresses the contractor PIN management flow; the relevant prior decision is the foundation plan brief ([plan-brief.md:19-39](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md)).

## Open Questions

- Should the contractor enter a chosen six-digit PIN or receive a generated one? The PRD specifies set/reset authority, while the inspected contractor form and archived plan brief do not settle the input or reveal behavior ([prd.md:85-87](../../foundation/prd.md), [plan-brief.md:19-39](../../archive/2026-09-21-minimal-offer-record-contract/plan-brief.md), [CreateOfferForm.tsx:229-289](../../../src/components/offers/CreateOfferForm.tsx)).
- Should reset leave the existing share token usable for viewing? PIN and token are separate offer fields, and the decision RPC checks both independently; the PRD also requires a way to revoke customer access ([migration:20-22](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql), [migration:245-255](../../../supabase/migrations/20260921000000_minimal_offer_record_contract.sql), [prd.md:89-92](../../foundation/prd.md)).
- Which contractor surface should identify the offer for setting/resetting its PIN? The current offer browser shows cards but has no offer detail route or action in the inspected rendering path ([index.astro:221-275](../../../src/pages/offers/index.astro)).
