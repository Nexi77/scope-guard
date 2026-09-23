# Manage Offer PIN — Plan Brief

> Full plan: `context/changes/manage-offer-pin/plan.md`  
> Research: `context/changes/manage-offer-pin/research.md`

## What & Why

The contractor needs to set or reset a six-digit PIN for an offer before a customer can make a PIN-protected decision on a proposed change. This plan supplies that contractor capability as roadmap slice S-03, preparing the later shared-offer and customer-decision flows.

## Starting Point

Offers already contain a nullable PIN hash and a separate share token; the decision RPC knows how to verify the hash. New offers have no PIN, and the current offer list has no PIN control or setter endpoint.

## Desired End State

On an offer card, the contractor can generate the first PIN or reset it. The app shows the new PIN once for copying, retains only a hash, and thereafter shows only whether a PIN is configured. Reset invalidates the old PIN without changing the shared link.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| PIN scope | Per offer | Matches the existing hash field and single-offer share boundary. | Research / archived foundation plan |
| PIN value | App generates an unpredictable six-digit value | Avoids contractor-chosen predictable PINs. | Plan interview |
| Initial set | On demand, after offer creation | Keeps the existing creation flow and S-03 separate. | Plan interview |
| Reset and link | Replace PIN; preserve share token | Credential reset and link revocation are separate actions. | Plan interview |
| Contractor entry point | Manage PIN on each offer card, portable to a later detail route | Uses the existing offer navigation now. | Plan interview |
| Reveal | Show once after successful save; no later redisplay | Plaintext should not be stored or leaked through page rendering. | Plan design |

## Scope

**In scope:**

- Owner-scoped database PIN set/reset command and contract coverage.
- Authenticated generation endpoint with a non-cacheable one-time result.
- Offer-card action, configured state, confirmation before reset, copy control, and app smoke coverage.

**Out of scope:**

- Customer-level PINs, PIN delivery by email/SMS, and PIN creation inside the offer-creation form.
- A new offer details route, shared-offer UI, customer decisions, link rotation/revocation, and anonymous decision rate limiting.

## Architecture / Approach

The authenticated Astro endpoint generates the PIN using a secure random source, calls an authenticated database command to hash and save it for the owned offer, then returns the plaintext once with `Cache-Control: no-store`. A small offer-scoped React control displays and copies the result in transient memory. The offer page exposes a boolean configured state, not the hash or token.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Owner-scoped PIN write contract | Database operation plus ownership and reset tests | Hash compatibility and cross-contractor access |
| 2. Authenticated endpoint and offer-card experience | Generation, one-time display, and built-app smoke | Secret leakage or accidental reset |

**Prerequisites:** Existing offer schema, contractor auth, and local Supabase test environment.  
**Estimated effort:** About two implementation sessions across two phases.

## Open Risks & Assumptions

- The existing anonymous decision RPC lacks rate limiting. Its delivery boundary is a later roadmap slice and must be addressed before exposing customer decisions.
- If a contractor closes the one-time result before copying the PIN, they must reset it to obtain a new value; the app cannot recover the prior plaintext.

## Success Criteria (Summary)

- An owner can generate or reset a PIN for one offer; anonymous and other-contractor requests cannot.
- Only the current successful response shows plaintext; stored offer data and later page loads expose only configured state.
- Reset makes the old PIN unusable, keeps the share token unchanged, and passes contract, smoke, lint, Astro check, and build gates.
