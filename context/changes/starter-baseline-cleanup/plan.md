# Starter Baseline Cleanup Implementation Plan

## Overview

Remove starter-only presentation and restore a self-contained three-view authentication baseline without changing the existing cookie-backed Supabase client or dashboard authorization guard.

## Current State Analysis

- `/` renders the starter landing page, while sign-in and sign-out currently redirect there.
- Sign-up redirects to the separate `/auth/confirm-email` page.
- Middleware already populates `Astro.locals.user` and protects `/dashboard`.
- Smoke coverage and CI currently assume that the root and confirmation routes exist.

## Desired End State

Only sign-up, sign-in, and dashboard render browser views. Authentication routes never target removed pages; the dashboard is protected and shows only a greeting plus the authenticated user's details.

### Key Discoveries:

- `src/middleware.ts:4-24` already enforces the dashboard boundary and supplies the dashboard user.
- `src/lib/supabase.ts:5-20` owns cookie-backed, server-only Supabase access and remains unchanged.
- `scripts/smoke.mjs:38-58` encodes the obsolete route expectations that must be realigned.

## What We're NOT Doing

- Adding customer, offer, change, or other product views.
- Changing Supabase credentials, RLS, database migrations, or authorization rules.
- Adding authenticated-visitor redirects, email-confirmation callbacks, or a new sign-out UI.
- Pruning shared UI dependencies or styling infrastructure solely because it is starter-derived.

## Implementation Approach

First make the allowed auth flow internally consistent, then remove unreferenced starter artifacts and align active project identity, documentation, and verification with that flow.

## Phase 1: Minimal Auth Baseline

### Overview

Remove unsupported browser views and make every successful auth action resolve to one of the three retained views.

### Changes Required:

#### 1. Route and authentication-flow cleanup

**Files**: `src/pages/index.astro`, `src/pages/auth/confirm-email.astro`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signout.ts`

**Intent**: Remove the root starter page and confirmation page, then direct every successful auth action to an allowed route.

**Contract**: Delete the root and confirmation views. Successful sign-up redirects to `/auth/signin`; successful sign-in redirects to `/dashboard`; sign-out redirects to `/auth/signin`. Existing error redirects and the anonymous `/dashboard` redirect remain unchanged.

#### 2. Minimal protected dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Leave a deliberate empty-product baseline that confirms who is signed in without starter dashboard copy or controls.

**Contract**: Render only a hello/greeting and the authenticated user's identifying details from `Astro.locals.user`; do not render a visible sign-out control.

### Success Criteria:

#### Automated Verification:

- Auth redirects and guard behavior are aligned to the three-view baseline.
- `npm run lint` and `npx astro check` pass.

#### Manual Verification:

- `/auth/signup`, `/auth/signin`, and `/dashboard` are the only rendered application views.
- An authenticated dashboard displays the expected greeting and user details, with no starter dashboard copy or sign-out control.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding. Phase blocks use plain bullets; the corresponding checkboxes live in the `## Progress` section.

---

## Phase 2: Project Cleanup and Proof

### Overview

Delete unreachable starter residue, rebrand active project metadata and documentation, then validate the revised route contract end to end.

### Changes Required:

#### 1. Remove unused starter residue and rebrand active configuration

**Files**: `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/components/ui/LibBadge.astro`, `public/template.png`, `src/layouts/Layout.astro`, `src/lib/config-status.ts`, `package.json`, `package-lock.json`, `supabase/config.toml`, `.gitignore`

**Intent**: Delete artifacts made unreachable by the route cleanup and replace active starter branding with ScopeGuard identity.

**Contract**: Keep the shared layout, favicon, global styling, Supabase warning behavior, and deployment configuration. The configuration warning remains plain ScopeGuard copy without an external starter link. Rename the package and local Supabase `project_id` to `scope-guard`; document that developers must restart or reset their local Supabase stack after the namespace change.

#### 2. Documentation and CI/smoke alignment

**Files**: `README.md`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`

**Intent**: Make project documentation and automated checks describe and validate the actual ScopeGuard baseline rather than the starter.

**Contract**: Rewrite active README setup, route, migration, deployment, and smoke-test guidance to match ScopeGuard and the three supported views. Remove obsolete root and confirmation assertions from smoke coverage; keep guard, failure, successful auth, dashboard, and direct sign-out API checks. Update CI's preview readiness probe to use a retained route rather than `/`.

### Success Criteria:

#### Automated Verification:

- Starter residue and active project metadata are cleaned without breaking shared runtime configuration.
- `npm run smoke` passes against the local Supabase stack with the revised redirect expectations.
- `npm run lint`, `npx astro check`, and `npm run build` pass.
- CI's preview readiness check targets a retained route and the existing smoke job remains runnable.

#### Manual Verification:

- Starter branding, landing content, confirmation page, template screenshot, and unused UI components are absent from active application surfaces.
- With missing Supabase secrets, retained views show a plain configuration warning and auth submission still produces the existing safe configuration error.
- README instructions accurately describe the current routes, local Supabase reset implication, migrations, offer-contract test, and deployment flow.

## Testing Strategy

### Unit Tests:

- Keep existing client-side form validation unchanged; this cleanup adds no new unit-test surface.

### Integration Tests:

- Preserve HTTP smoke coverage for anonymous dashboard protection, unsuccessful sign-in, successful sign-up and sign-in, dashboard access, direct sign-out, and post-sign-out protection.

### Manual Testing Steps:

1. Visit the three retained routes and verify the dashboard redirects anonymous visitors to sign-in.
2. Sign up and sign in with local Supabase; confirm navigation reaches sign-in, then dashboard.
3. Verify the dashboard contains only the greeting and logged-in user details.
4. Run without Supabase secrets and confirm the plain configuration warning and safe form error behavior.

## Performance Considerations

This is a route and artifact reduction with no new runtime data access or performance budget.

## Migration Notes

Changing `supabase/config.toml`'s `project_id` creates a new local Supabase namespace. Stop and restart or reset the local stack before running database and smoke checks; existing migrations recreate the contract.

## References

- `context/changes/starter-baseline-cleanup/frame.md`
- `src/middleware.ts:4-24`
- `src/lib/supabase.ts:5-20`
- `scripts/smoke.mjs:38-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Minimal Auth Baseline

#### Automated

- [x] 1.1 Auth redirects and guard behavior are aligned to the three-view baseline — 9310bc2
- [x] 1.2 Lint and Astro type checks pass — 9310bc2

#### Manual

- [x] 1.3 Only the retained auth views render and the dashboard contains only greeting and user details — 9310bc2

### Phase 2: Project Cleanup and Proof

#### Automated

- [x] 2.1 Starter residue and active project metadata are cleaned without breaking shared runtime configuration
- [x] 2.2 Smoke, lint, Astro type checks, and production build pass with the revised route contract
- [x] 2.3 CI preview readiness targets a retained route and the smoke job remains runnable

#### Manual

- [x] 2.4 ScopeGuard documentation and missing-configuration behavior match the cleaned baseline
