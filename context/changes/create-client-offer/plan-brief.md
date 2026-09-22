# Create client offer — Plan Brief

> Full plan: `context/changes/create-client-offer/plan.md`

## What & Why

This change delivers the first contractor workflow that creates a customer and their initial offer. It turns the completed data foundation into a focused, secure dashboard action without expanding into a customer portal, CRM, or offer-history experience.

## Starting Point

Supabase already has isolated customer and offer records, RLS, and required base-offer fields. The authenticated dashboard currently has no domain UI, and the only form field abstraction is specific to authentication screens.

## Desired End State

A signed-in contractor selects an existing customer or creates a new one, enters original scope, decimal PLN amount, and a deadline no earlier than today, then receives dashboard confirmation that the offer was created. The customer and offer write is atomic, so a failed offer never leaves an orphaned customer.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Customer reuse | Select existing or create new | Supports offer grouping from the first flow without customer administration. | Plan |
| Same-name customer | Explicit reuse or create choice | Names are not identity; the contractor decides rather than the system guessing. | Plan |
| Write consistency | Authenticated atomic RPC | Prevents an offer failure from leaving a newly created customer behind. | Plan |
| Price and currency | Decimal PLN input stored in grosze | Fits the Polish MVP while preserving exact minor-unit storage. | Plan |
| Deadline | Today or later | Prevents a newly created offer from starting with an expired date. | Plan |
| Success state | Dashboard confirmation | Confirms creation without building the later offer-detail/history slice. | Plan |
| Form system | Shared shadcn-style primitives | Auth and product forms receive one accessible, theme-compatible baseline. | Plan |

## Scope

**In scope:**

- Shared Input, Label, Textarea, Select, and field/error primitives; auth-form migration.
- Atomic authenticated RPC for new/existing customer offer creation.
- Protected dashboard form, endpoint, duplicate confirmation, and success state.
- Database contract, smoke, accessibility, and browser verification.

**Out of scope:**

- Customer contacts/accounts/CRM, customer directory management, offer detail/history, PINs, links, decisions, and multi-currency UI.
- Broad form controls not needed by current auth and offer workflows.

## Architecture / Approach

The dashboard loads only the signed-in contractor's customers and posts form data to a protected Astro endpoint. The endpoint validates transport values and calls one authenticated Supabase RPC, which validates ownership or creates a new customer and persists the offer in the same transaction. Shared UI primitives serve both the migrated auth forms and the new offer form.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared form system | Reusable shadcn-style controls and auth migration | Regressing established auth interaction/accessibility |
| 2. Atomic contract | Authenticated creation RPC and contract tests | Partial records or cross-contractor access |
| 3. Contractor flow | Dashboard form, endpoint, and confirmation | Duplicate-name or validation ambiguity |
| 4. Verification | Smoke and cross-browser evidence | Flow works locally but lacks end-to-end proof |

**Prerequisites:** F-01 minimal offer-record contract is complete; local Supabase is available for database and smoke verification.
**Estimated effort:** ~3–4 sessions across four phases.

## Open Risks & Assumptions

- The initial Select is appropriate for the early MVP customer count; a searchable directory is deferred until an actual volume requirement exists.
- Duplicate matching is case-insensitive after trimming but does not establish identity; explicit contractor choice remains required.
- The existing cloud project may reject self-service signup; local Supabase credentials remain the registration-flow test environment.

## Success Criteria (Summary)

- Contractors can atomically create an original offer for a new or owned existing customer.
- Invalid, foreign, duplicate-unconfirmed, or failed submissions do not create partial records.
- Auth and offer forms share accessible controls, and lint, build, contract, smoke, and manual browser checks pass.
