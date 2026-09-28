# View Shared Offer — Plan Brief

> Full plan: `context/changes/view-shared-offer/plan.md`

## What & Why

Customers need a permanent link to inspect their assigned offer and its current status without creating an account. The contractor needs to copy that link, revoke it, and issue a fresh one if access must be restored. The page must make clear which work and totals are agreed and which proposal still awaits approval.

## Starting Point

Each offer already has a unique share token, a revocation field, and a guarded anonymous read RPC that returns a customer-safe offer projection. The app has no public shared page or contractor control to obtain and revoke the link; the existing offer page is private and includes contractor-only data.

## Desired End State

The contractor can copy an active link, revoke it, and later replace it with a new URL that leaves the old one invalid. Anyone with the active URL can view only that offer without a PIN. The customer sees current terms, a separate pending proposal when present, and a concise list of earlier changes and their statuses.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Slice boundary | Read-only customer view; decisions stay in S-06 | Matches the roadmap and prevents approval behavior from slipping into this slice. |
| Contractor controls | Copy and revoke on the owned offer page | The contractor must obtain the URL and be able to disable access. |
| Re-share | Rotate to a new token after revocation | A leaked old URL must stay unusable. |
| Pending proposal | Show agreed values separately from proposed impact | Proposed price or deadline must not look approved. |
| Earlier changes | Summary list with description, status, and customer-facing effects | Customers can understand change states without private estimate details. |
| Public read | Existing token-scoped RPC through an anonymous server client | Reuses the tested one-offer boundary even if an owner opens the shared URL while signed in. |

## Scope

**In scope:** owner link controls, owner-only revoke/rotation contract, public mobile-friendly offer page, current and pending terms, summary of earlier changes, token-safe unavailable states, and contract/HTTP smoke coverage.

**Out of scope:** customer accounts, PIN decisions, full history/version comparison, email/SMS sending, PDF, and private estimating data.

## Architecture / Approach

An authenticated owner action manages the offer's token and revocation state. The owner detail page builds the absolute URL from the owned token. A separate `/shared/<token>` Astro page uses an explicitly anonymous server-side Supabase client to call `get_shared_offer`, maps only public fields to the page, and responds without caching or referrer leakage. Invalid, revoked, and replaced URLs share one unavailable result.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contractor sharing controls and token lifecycle | Copy, revoke, and rotate an owned offer link | An old token accidentally remains usable or another owner can manage it. |
| 2. Public read-only offer view | Safe customer page with current, pending, and earlier change states | Private data leaks or a pending proposal looks agreed. |

**Prerequisites:** Existing offer/token schema and `get_shared_offer` RPC; local Supabase for migration and smoke checks.

**Estimated effort:** Roughly two implementation sessions, one per phase, plus manual mobile/desktop verification.

## Open Risks & Assumptions

- The shared projection includes price-breakdown fields, so the page must explicitly select customer-facing fields rather than serialize the raw RPC result.
- The shared RPC is granted to `anon`; a cookie-backed contractor client may lack that grant. The public route must use an anonymous server client.
- Existing offers retain their current URL until revoked; rotation is an owner action after revocation, not an automatic change on page load.

## Success Criteria (Summary)

- An active link opens only its assigned offer without a PIN; an old or revoked URL shows no offer data.
- The customer can distinguish agreed values from a pending proposal and see each earlier change's state and public effects.
- The owner can copy, revoke, and replace the link; local contract tests, smoke tests, lint, and build pass.
