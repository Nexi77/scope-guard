# Create client offer Implementation Plan

## Overview

Deliver the first contractor-facing ScopeGuard workflow: create an offer with its original scope, price, deadline, and assigned customer. The flow must let a contractor reuse an existing customer or deliberately create a same-named customer, while keeping a new customer and offer write atomic.

## Current State Analysis

- The completed foundation provides contractor-owned `customers` and `offers`, including RLS, a composite customer/contractor foreign key, and required offer base fields; it deliberately did not add creation UI or routes.
- The protected dashboard is only an authenticated header, and the established HTTP pattern is a cookie-aware Supabase client plus POST-and-redirect handlers.
- `src/components/auth/FormField.tsx` is an auth-specific text-input wrapper. The project has no reusable input, label, textarea, select, or shared field/error primitives for product forms.
- Existing contract coverage proves the database ownership boundary, while `scripts/smoke.mjs` currently covers only authentication.

## Desired End State

A signed-in contractor can open the dashboard, choose an existing customer or enter a new customer name, supply the original scope, a decimal PLN amount, and a delivery date today or later, then create the offer. A successful submission confirms creation on the dashboard; invalid or unauthorized submissions do not create partial records or expose another contractor's customer.

### Key Discoveries:

- `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:1-30` already defines the required ownership and base-offer fields, including exact minor-unit amounts and a same-contractor composite foreign key.
- `src/lib/supabase.ts:5-20` and `src/middleware.ts:4-24` provide the session-backed server client and protect `/dashboard` routes.
- `src/components/auth/FormField.tsx:5-64` is the only reusable form-field abstraction, and it is unsuitable for textarea, select, and date controls.
- `scripts/offer-contract.mjs:59-85` demonstrates the required customer-then-offer shape; the application flow must improve that two-step sequence to an atomic database contract.

## What We're NOT Doing

- Customer accounts, contacts, CRM fields, customer administration, or a customer directory.
- Offer detail, offer history, changes, PIN management, shared links, or customer decisions.
- Full currency selection or currency conversion; this MVP persists PLN only.
- Automatic merging of same-named customers or a global duplicate-customer uniqueness constraint.
- A broad catalog of future controls such as combobox, checkbox, radio-group, or calendar/date-picker components.

## Implementation Approach

First establish the reusable form baseline needed by both existing auth and new product forms. Add one authenticated database RPC that either validates a selected customer belongs to the session contractor or creates a named customer, then creates the offer in the same transaction. The protected dashboard reads only that contractor's customers, renders the form, submits it to a server-side POST route, and returns to the dashboard with either a safe form error or a success confirmation.

## Critical Implementation Details

The atomic RPC is required even though RLS permits ordinary inserts: a route that inserts a customer and then an offer can leave an orphan customer when validation or the second write fails. The RPC must derive ownership from `auth.uid()`, accept exactly one customer source, and repeat duplicate-name protection so client-side matching cannot be bypassed or become stale.

## Phase 1: Shared form-system foundation

### Overview

Replace auth-only field composition with a small, app-wide shadcn-style form-control baseline before building the first domain form.

### Changes Required:

#### 1. Reusable form primitives

**Files**: `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx`, `src/components/ui/field.tsx`, `package.json`

**Intent**: Add accessible, theme-compatible primitives for the control types required by sign-in, sign-up, and offer creation. Keep the catalog intentionally narrow so a concrete feature, rather than speculation, drives future controls.

**Contract**: `Input` forwards standard input props for email, password, text, number-like text, and native date use; `Textarea` and `Label` expose their standard semantic relationships; `Select` follows the project's shadcn/Radix conventions; and `Field` consistently renders label, hint, validation error, and accessible error association. Add only the Radix dependency needed by the Select primitive.

#### 2. Auth-form migration

**Files**: `src/components/auth/FormField.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SubmitButton.tsx`

**Intent**: Refactor the existing authentication forms to consume the shared primitives, proving that the form system is global rather than an offer-only abstraction.

**Contract**: Preserve all current sign-in/sign-up fields, client validation, server-error display, password visibility controls, pending button behavior, form actions, and accessible focus/error behavior. Remove or reduce the auth-only wrapper only after its responsibilities are represented by the shared primitives.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass with the new primitives and migrated auth forms.
- Existing sign-in and sign-up form validation remains covered by the app smoke flow without changed route contracts.

#### Manual Verification:

- Sign-in and sign-up controls retain visible labels, keyboard focus, inline errors, password toggles, and responsive layout in light and dark themes.

---

## Phase 2: Atomic customer and offer creation contract

### Overview

Introduce the database boundary that creates the initial offer safely for either a new or an existing customer.

### Changes Required:

#### 1. Authenticated creation RPC migration

**File**: `supabase/migrations/<timestamp>_create_client_offer.sql`

**Intent**: Create one transaction-safe entrypoint so the application can never persist a new customer without its requested offer.

**Contract**: Add an authenticated, hardened `create_offer_with_customer` RPC that accepts exactly one of an existing `customer_id` or a new `customer_name`, plus `base_scope`, `base_amount_minor`, `currency_code`, and `base_deadline`; returns the created offer and customer identifiers; and uses the authenticated contractor as the owner. It must reject a selected customer outside that ownership boundary, empty normalized strings, negative amounts, invalid currency, a past deadline, ambiguous customer inputs, and an unconfirmed case-insensitive name match. A caller may intentionally create a same-named customer only through an explicit duplicate-confirmation argument. The function must use a safe fixed `search_path`, minimal `authenticated` execute grant, and no service-role application credential.

#### 2. Database-contract coverage

**File**: `scripts/offer-contract.mjs`

**Intent**: Extend the existing local-Supabase contract test to prove atomicity and ownership rather than trusting the RPC implementation by inspection.

**Contract**: Test new-customer creation, an owned-customer reuse path, cross-contractor customer rejection, duplicate-name rejection until explicit confirmation, and failure handling that leaves no newly created customer behind. Preserve the existing RLS, shared-token, PIN, decision, and idempotency coverage.

### Success Criteria:

#### Automated Verification:

- The new migration applies on a fresh local Supabase instance and `npm run offer-contract` passes.
- The RPC creates a valid new customer and offer together, reuses only an owned selected customer, and rejects invalid or foreign input without partial persistence.
- The contract test proves that a case-insensitive matching customer requires an explicit reuse-or-create choice.

#### Manual Verification:

- Supabase Studio confirms the RPC is granted only to authenticated callers and no new table policy, public table access, PIN, or service-role access was introduced.

---

## Phase 3: Protected contractor creation flow

### Overview

Turn the creation contract into a focused dashboard experience without pre-building later browsing or detail capabilities.

### Changes Required:

#### 1. Dashboard data and offer form

**Files**: `src/pages/dashboard.astro`, `src/components/offers/CreateOfferForm.tsx`

**Intent**: Make the authenticated dashboard the entry point for creating the first customer offer, using the shared form system and only the current contractor's customer records.

**Contract**: The server page loads `id` and `name` for the session contractor through the cookie-aware client and supplies them to a client form. The form offers an existing-customer Select and a new-customer path, customer name, original-scope Textarea, decimal PLN Input, and native date Input. Before submitting a matching new name, it presents the explicit choices to reuse that customer or proceed as a distinct record. Client validation gives immediate feedback; the server remains authoritative. The dashboard renders a concise success confirmation and a create-another action after creation, without exposing a new offer detail/history view.

#### 2. Offer creation endpoint

**File**: `src/pages/api/offers/index.ts`

**Intent**: Accept the dashboard form submission, validate the transport format, invoke the atomic RPC through the signed-in contractor session, and redirect to safe UI states.

**Contract**: `POST /api/offers` requires an authenticated user and handles form data only. It trims customer/scope values, parses a human decimal PLN amount exactly into integer grosze, validates the date against the server's current date, forwards explicit duplicate intent, and maps expected validation/database failures to a dashboard error state. It never accepts `contractor_id`, PIN data, or raw database ownership values from the browser; missing configuration or an unauthenticated request must not write data.

### Success Criteria:

#### Automated Verification:

- Type and lint checks pass for the dashboard page, React form, and API route.
- The authenticated smoke flow can create an offer with a new customer, reuse an existing customer, and receive a dashboard success redirect.
- Invalid amount, past deadline, blank required field, unconfirmed duplicate, unauthenticated request, and RPC failure paths do not create an offer or orphan a customer.

#### Manual Verification:

- On mobile and desktop, the contractor can complete both customer paths using keyboard navigation with visible focus, labels, understandable errors, and no color-only status cues.
- A decimal PLN amount is displayed and persisted as the expected grosz amount, and the date control disallows a new offer deadline before today.

---

## Phase 4: End-to-end verification and delivery checks

### Overview

Extend the project's runnable evidence so the new authenticated flow remains protected and demonstrably usable.

### Changes Required:

#### 1. Application smoke coverage

**Files**: `scripts/smoke.mjs`, `package.json` (only if a narrowly named script is needed)

**Intent**: Cover the new browser-level route behavior alongside the existing auth smoke flow.

**Contract**: The smoke script maintains its cookie jar and adds assertions for protected offer creation, successful redirect/confirmation, invalid submission behavior, and session loss. It uses only test credentials and configured environment values; it does not alter cloud Supabase signup settings or print credentials.

#### 2. Final verification guidance

**Files**: `context/changes/create-client-offer/plan.md`, implementation files from prior phases

**Intent**: Define a repeatable handoff gate for the form-system refactor and creation workflow.

**Contract**: Run the declared lint, build, database-contract, and smoke commands where their configured local Supabase environment is available. Record manual verification separately from automated command results; do not treat cloud `Signups not allowed for this instance` as an application failure.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run build`, and `npm run offer-contract` pass.
- `npm run smoke` passes against a configured local Supabase/auth environment and covers the offer-creation cases.

#### Manual Verification:

- A reviewer verifies auth pages did not regress after the shared-primitives migration and the dashboard flow behaves correctly in current Chrome, Safari, Edge, and Firefox.

## Testing Strategy

### Unit Tests:

- Exact decimal-PLN-to-grosz parsing, including zero and malformed values.
- Form client validation and duplicate-choice state.

### Integration Tests:

- RPC atomicity, RLS ownership, existing-customer reuse, duplicate confirmation, and invalid-request rollback behavior.
- Authenticated endpoint redirects, error paths, and successful dashboard confirmation.

### Manual Testing Steps:

1. Sign in, create a new customer and offer, and confirm the dashboard success state.
2. Create another offer using that customer, then enter the same name as a new customer and verify the explicit reuse-or-create choice.
3. Try invalid dates, amounts, blank fields, and expired sessions; confirm records are not partially created and errors are clear.
4. Keyboard-test both auth and offer forms in light and dark themes at mobile and desktop widths.

## Performance Considerations

The dashboard only loads the signed-in contractor's customer identifiers and names, and creation is one database RPC. No cross-contractor scan, service role, polling, or caching is introduced. A future customer directory/combobox can address large customer lists when that requirement exists.

## Migration Notes

The schema is additive and contains no existing production domain records requiring backfill. Apply the RPC migration after the completed minimal-offer contract migration. Rollback removes only the new function/grant and does not alter the existing table schema or RLS policies.

## References

- `context/foundation/prd.md` — FR-001 and MVP boundaries.
- `context/foundation/roadmap.md` — S-01 outcome and downstream dependencies.
- `supabase/migrations/20260921000000_minimal_offer_record_contract.sql:1-30,88-133`
- `src/lib/supabase.ts:1-21`
- `src/middleware.ts:4-24`
- `src/pages/dashboard.astro:1-22`
- `src/components/auth/FormField.tsx:1-64`
- `scripts/offer-contract.mjs:59-85,133-172`
- `scripts/smoke.mjs:38-63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared form-system foundation

#### Automated

- [x] 1.1 Shared Input, Label, Textarea, Select, and Field primitives build and lint
- [x] 1.2 Auth forms retain their current validation and route contracts

#### Manual

- [x] 1.3 Auth forms remain accessible and responsive in both themes

### Phase 2: Atomic customer and offer creation contract

#### Automated

- [ ] 2.1 Creation RPC applies and creates valid customer offers atomically
- [ ] 2.2 Contract tests enforce ownership, duplicate confirmation, and rollback behavior

#### Manual

- [ ] 2.3 RPC grants and database exposure remain limited to authenticated creation

### Phase 3: Protected contractor creation flow

#### Automated

- [ ] 3.1 Dashboard form and offer endpoint pass type and lint checks
- [ ] 3.2 Authenticated offer creation supports new and existing customers
- [ ] 3.3 Invalid, duplicate, unauthenticated, and failed requests leave no partial records

#### Manual

- [ ] 3.4 Contractor can complete accessible new and existing customer paths across viewports
- [ ] 3.5 PLN conversion and today-or-later deadline validation behave correctly

### Phase 4: End-to-end verification and delivery checks

#### Automated

- [ ] 4.1 Lint, build, and offer contract checks pass
- [ ] 4.2 Smoke checks cover protected offer creation on local Supabase

#### Manual

- [ ] 4.3 Shared form primitives and offer creation work across supported browsers
