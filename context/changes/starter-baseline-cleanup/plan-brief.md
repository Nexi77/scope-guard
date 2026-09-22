# Starter Baseline Cleanup — Plan Brief

> Full plan: `context/changes/starter-baseline-cleanup/plan.md`
> Frame brief: `context/changes/starter-baseline-cleanup/frame.md`

## What & Why

> **The actual problem to plan around is**: replace the starter route topology with a self-contained three-view authentication baseline, rather than merely deleting starter components.

ScopeGuard should begin future product slices from a clean auth baseline: sign-up, sign-in, and a protected dashboard with a greeting and the logged-in user's details.

## Starting Point

The root landing page and confirmation page are starter presentation, but existing auth endpoints redirect to them. Middleware, the cookie-backed Supabase client, and the current dashboard user details already provide the correct authentication foundation.

## Desired End State

Only `/auth/signup`, `/auth/signin`, and `/dashboard` render application views. Auth redirects remain inside that set, starter-only assets and documentation are gone, and smoke coverage proves the revised flow.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Supported views | Sign-up, sign-in, dashboard only | Matches the agreed minimal baseline. | Frame |
| Auth redirects | Sign-up → sign-in; sign-in → dashboard; sign-out → sign-in | Prevents removed routes from remaining redirect targets. | Plan |
| Dashboard content | Greeting and user details only | Keeps it ready for later product slices without starter UI. | Plan |
| Missing configuration | Plain ScopeGuard warning, no starter link | Explains disabled auth without retaining starter attribution. | Plan |
| Local Supabase identity | Rename to `scope-guard` | Removes active starter identity; reset/restart is documented. | Plan |

## Scope

**In scope:**

- Auth route cleanup, redirects, and minimal dashboard content.
- Unused starter UI/assets, active metadata, README, smoke assertions, and CI readiness probe.
- ScopeGuard-specific missing-configuration notice and local Supabase project identifier.

**Out of scope:**

- Product screens, new auth behavior, database/RLS changes, email confirmation callbacks, and visible sign-out UI.

## Architecture / Approach

Preserve the server-side Supabase client and middleware as the only session/authorization boundary. Route handlers establish the redirect topology; page removal and starter-residue cleanup then reduce the visible surface; smoke tests validate behavior through HTTP.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Minimal auth baseline | Three-view route topology and stripped dashboard | A redirect retains a deleted target. |
| 2. Project cleanup and proof | Rebranded active project, docs, and verified smoke/CI behavior | Local Supabase project-ID change requires restart/reset. |

**Prerequisites:** Node dependencies installed; Docker and local Supabase available for smoke verification.
**Estimated effort:** One focused implementation session plus local smoke verification.

## Open Risks & Assumptions

- Local Supabase email confirmation stays disabled, as currently configured, so successful registration can lead to sign-in.
- Hosted email-confirmation flow remains a future dedicated change, not a fourth view in this baseline.

## Success Criteria (Summary)

- The application exposes only the three agreed browser views with correct auth redirects and dashboard guard.
- Active starter identity and unreachable assets are removed or rebranded without touching the product data contract.
- Smoke, lint, Astro type checks, and production build pass.
