# Warm Sign-in Theme — Plan Brief

> Full plan: `context/changes/sign-in-theme/plan.md`
> Research: `context/changes/sign-in-theme/research.md`

## What & Why

The existing sign-in view will adopt the user's warm amber/brown palette through the app's own semantic tokens. This replaces a starter-like cosmic blue/purple treatment with a focused, readable entry point while preserving the authentication flow.

## Starting Point

ScopeGuard already has Tailwind v4 semantic tokens and a repo-owned Button, but the sign-in shell and shared auth controls bypass them with raw color utilities.

## Desired End State

The sign-in page presents a warm, calm surface with a clear amber CTA and token-driven form states. It is legible and keyboard-friendly at a desktop size and one mobile size, while sign-in behavior and navigation stay exactly as they are.

## Key Decisions Made

| Decision           | Choice                                    | Why                                                                                                | Source   |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Palette scope      | Core auth roles only                      | The user asked for the necessary values only; chart/sidebar/font tokens are unused on this screen. | Plan     |
| Component strategy | Reuse existing Button and auth components | Avoids a second primitive and puts focus/error states on the existing component layer.             | Research |
| Behavioral scope   | Styling only                              | Auth routes, form action, redirects, and validation are already established.                       | Research |

## Scope

**In scope:** compact semantic token values, sign-in shell, and the existing shared controls it renders.

**Out of scope:** new fonts, a dark-mode switch, new UI libraries, auth-flow changes, and a sign-up shell extraction.

## Architecture / Approach

The token values remain in `src/styles/global.css` and are published through the existing `@theme inline` layer. The sign-in shell and shared controls use semantic utilities from that layer, keeping visual roles centralized while retaining existing component interfaces.

## Phases at a Glance

| Phase                                 | What it delivers                                             | Key risk                                |
| ------------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| 1. Compact tokens and sign-in surface | Warm semantic palette and page hierarchy                     | Over-applying unused supplied tokens    |
| 2. Token-driven form states           | Focus, error, and pending presentations on existing controls | Preserving validation and form behavior |

**Prerequisites:** Existing dependencies and local browser preview.
**Estimated effort:** One focused session across two small phases.

## Open Risks & Assumptions

- The repository has a dark token layer but no reachable theme switch; this change covers the active light theme only.
- Shared auth controls are also rendered by sign-up, so their semantic visual cleanup will carry there without altering its flow.

## Success Criteria (Summary)

- The sign-in screen visually uses a compact warm palette at desktop and mobile widths.
- Default, hover, focus, disabled, error, and pending states use semantic tokens and remain understandable.
- Lint and production build pass with no authentication-flow changes.
