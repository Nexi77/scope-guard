# Frame Brief: Starter baseline cleanup

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The project is still a starter. Before working on new slices and views, keep
only sign-up and sign-in views plus an empty protected dashboard that shows
the logged-in user's details and a hello message.

## Initial Framing (preserved)

- **User's stated cause or approach**: Auth guard logic is fine; the excess is starter UI and pages.
- **User's proposed direction**: Remove everything else; no other currently visible page or behavior must remain.
- **Pre-dispatch narrowing**: None besides sign-up, sign-in, and the dashboard must remain visible.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Public starter presentation** — the root landing page, hero, navigation, and feature cards may expose the starter as an app surface.
2. **Auth redirect topology** — successful sign-in, sign-out, and sign-up may still target pages that the cleanup removes.  ← initial framing
3. **Auth/session contract** — cookie-backed server auth, middleware, form/API coupling, and dashboard user data could be accidentally removed with presentation code.
4. **Quality and project residue** — smoke assertions, documentation, configuration banners, and unused starter assets may retain the obsolete baseline.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Public presentation is starter-only | `src/pages/index.astro:1-8` renders `Welcome`; `src/components/Welcome.astro:5-114` is branded starter hero/cards; `Topbar.astro:5-32` is its navigation. | STRONG |
| Redirects make deletion more than a page cleanup | Sign-in and sign-out redirect to `/` at `src/pages/api/auth/signin.ts:19` and `signout.ts:9`; sign-up redirects to separate confirmation view at `signup.ts:19`; those routes conflict with the requested three-view baseline. | STRONG |
| Auth contract must be preserved | `src/lib/supabase.ts:1-20` provides cookie-backed server auth; `src/middleware.ts:4-24` populates `locals.user` and guards dashboard; `dashboard.astro:4-16` renders user identity. | STRONG |
| Quality/project residue needs realignment | Smoke tests expect home and confirmation routes/redirects at `scripts/smoke.mjs:39-58`; `Layout.astro:2-35` and config status render starter-facing configuration UI. | STRONG |

## Narrowing Signals

- The user explicitly confirmed that no other visible page or behavior needs to remain.
- The current route inventory contains no product pages beyond the starter landing page, auth pages, confirmation page, dashboard, and auth APIs.

## Cross-System Convention

A minimal authenticated application keeps browser-visible routes and post-auth redirects as one coherent topology: successful sign-in reaches the protected app, sign-out reaches sign-in, and registration completion does not require an extra public view when the agreed baseline permits only sign-in/sign-up. The current implementation breaks that convention if the root and confirmation views are deleted unchanged.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: replace the starter route topology with a self-contained three-view authentication baseline, rather than merely deleting starter components.

The initial framing is correct that the visible starter UI should go. However, the cleanup must also redirect successful authentication flows away from deleted routes, preserve the server-side session and dashboard guard contract, and realign automated verification and supporting starter residue. The user has already fixed the visible-scope boundary: only sign-up, sign-in, and dashboard are allowed views.

## Confidence

- **HIGH** — direct route, dependency, and smoke-test evidence confirms the required boundary; the user explicitly confirmed no additional visible behavior is needed.

## What Changes for /10x-plan

Plan the cleanup as a coherent baseline reset: preserve auth internals and the protected user-details dashboard; remove starter presentation; establish valid redirects among the three allowed views; and update tests/docs/configuration residue to match.

## References

- Source files: `src/pages/index.astro:1-8`, `src/components/Welcome.astro:5-114`, `src/pages/api/auth/signin.ts:19`, `src/pages/api/auth/signup.ts:19`, `src/pages/api/auth/signout.ts:9`, `src/middleware.ts:4-24`, `src/lib/supabase.ts:1-20`, `scripts/smoke.mjs:39-58`
- Investigation tasks: `/root/route_inventory`, `/root/auth_contract`
