# Decide Offer and Change by PIN — Plan Brief

> Full plan: `context/changes/decide-change-by-pin/plan.md`

## What & Why

Customers can view an offer through a permanent link but cannot decide it in the app. This plan gives them a PIN-protected way to accept or reject the current initial offer or a pending change, while preserving an exact, durable record and preventing a decision on terms that changed in an open page.

## Starting Point

The shared page already separates agreed work from pending proposal impact. Database functions already validate the six-digit PIN, serialize decisions, record rejection comments and times, and return a prior result on retry. Those functions are still directly callable by anonymous clients, and the page has no decision form.

## Desired End State

A customer reviews the current offer or change impact, enters the PIN, and accepts or rejects; rejection requires a comment. A changed open page shows an accessible warning and blocks submission until refresh. The customer sees the recorded outcome, and the contractor sees the resulting status and reason in history.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Decision scope | Initial offer and pending changes | Both require a complete customer-facing approval path. |
| Decision step | Review visible terms, enter PIN, then submit | The customer should act on the exact price and deadline consequences shown. |
| Changed open page | Warn and block until refresh and renewed review | A customer must not approve unseen replacement terms. |
| Repeat or opposite request | Show the original recorded decision | Decisions remain idempotent and cannot be overwritten through the link. |
| PIN attempts | Server-side limit of six submissions per offer per 60 seconds | Makes repeated guessing slower without adding a customer account. |
| Delivery boundary | Public rate-limited endpoint; revoke direct anonymous decision RPC access | A direct RPC call must not bypass attempt limiting. |

## Scope

**In scope:** decision controls for the initial offer and pending change, exact target and displayed-version checks, PIN and rejection-comment validation, accessible stale-view feedback, server-side attempt limiting, safe outcome/error responses, database/HTTP tests, and mobile/desktop verification.

**Out of scope:** customer accounts or portal, customer-authored changes, undoing a decision, automatic acceptance of a replacement, notifications, and full offer version comparison.

## Architecture / Approach

The shared page retains customer-safe target IDs and version fields from the guarded read. A public POST endpoint validates the request, checks a Cloudflare Worker rate-limit binding, and invokes service-role-only database decision commands through a separate server-secret client. The database compares the displayed version while holding the offer lock and preserves the first recorded outcome. The page checks freshness on focus and periodically, shows a toast and inline refresh prompt on change, and also blocks on a server conflict.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Secure Decision Endpoint | Limited HTTP path, locked stale checks, restricted RPC grants | A direct RPC bypass or service credential leak would weaken PIN protection. |
| 2. Customer Review and Stale-View Experience | Review/PIN form for both targets, stale warning, full flow tests | A changed page could allow a decision before the customer reviews new terms. |

**Prerequisites:** Configured local Supabase, a server-only service credential, and a Cloudflare rate-limit binding for local/preview/production; the existing share link and PIN flows.

**Estimated effort:** About two implementation sessions, one per phase, plus manual browser and device checks.

## Open Risks & Assumptions

- Cloudflare's Worker limiter is per location, so six submissions per minute is not a global cap. Direct anonymous database execution must be revoked; a stronger global control may be needed if distributed guessing becomes credible.
- The service credential bypasses ordinary row policies. It must stay server-only and be used solely by the narrow decision route; rollout requires secret configuration before customer decisions are enabled.
- The page's periodic freshness check improves early notice, while the locked database comparison remains the final guard against races.

## Success Criteria (Summary)

- Customers can accept or reject the current initial offer and pending changes using the correct six-digit PIN; rejection records a comment and time.
- A changed open page warns and blocks until refresh, while repeat or opposite submissions show the original result without another decision or scope activation.
- Anonymous direct RPC calls cannot decide; limited endpoint, database contract, smoke, lint, build, and manual accessibility checks pass.
