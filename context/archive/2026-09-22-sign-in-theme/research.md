---
date: 2026-09-22T14:53:09+02:00
researcher: Codex
git_commit: a4b7c10
branch: master
repository: ScopeGuard
topic: "Restyle the existing sign-in screen with the user's warm semantic theme"
tags: [research, auth, sign-in, tailwind]
status: complete
last_updated: 2026-09-22
last_updated_by: Codex
---

# Research: Warm sign-in theme

## Research Question

How can the existing sign-in screen adopt the user's warm palette with the smallest necessary semantic-token and component changes?

## Summary

The inspected sign-in path already has the needed Tailwind v4 token source and repo-owned button primitive. The view bypasses both with cosmic, blue, purple, white, and red utility literals. The change will map the user's warm values into the existing core semantic roles and make the sign-in page and its shared form controls consume those roles. It will not add unused chart, sidebar, typography, or dark-mode controls.

## Detailed Findings

### Charge list

1. **Missing token adoption** — `src/pages/auth/signin.astro:9-18` uses `bg-cosmic`, translucent white, blue/purple gradients, and blue/purple link colors instead of the published semantic tokens in `src/styles/global.css:6-38,75-110`. The proposed palette cannot reach the card, heading, or link, so the page currently looks unrelated to the product theme.
2. **Missing token adoption** — `src/components/auth/FormField.tsx:5-6,37,41,53,59` uses direct white, blue, purple, and red classes. The default, focus, and error field states therefore ignore `input`, `border`, `ring`, and `destructive`, disconnecting keyboard focus and validation feedback from the design contract.
3. **Shared-component override** — `src/components/auth/SubmitButton.tsx:15-22` imports `Button` but replaces its token-driven default styling with purple and white literals. The CTA misses the centralized primary, disabled, and focus treatments already present in `src/components/ui/button.tsx:7-48`.
4. **Focus-state gap** — `src/components/auth/PasswordToggle.tsx:10-15` has a label and hover treatment but no visible focus treatment. Keyboard users cannot reliably distinguish the active password-visibility control.
5. **Deferred: auth-shell duplication** — `src/pages/auth/signin.astro:9-21` and `src/pages/auth/signup.astro:9-21` duplicate the page shell. Extracting a shared shell would reduce future drift, but it changes a second view and is not required to restyle this one view.

### Token and component contract

- `src/styles/global.css:6-110` is the existing semantic value source and Tailwind publication layer. The supplied values are compatible with this model.
- `src/components/ui/button.tsx:7-48` is an existing importable, token-aware button; the sign-in submit action should retain it rather than creating another primitive.
- `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`, and `ServerError.tsx` are shared by sign-in and sign-up. Updating their hard-coded visual values makes the visible sign-in states token-driven; the same consistency carries to sign-up without changing its flow.

## Code References

- `src/styles/global.css:6-110` — semantic values and their Tailwind v4 publication.
- `src/pages/auth/signin.astro:8-23` — sign-in page shell and account link.
- `src/components/auth/SignInForm.tsx:43-84` — field, server-error, and pending submit states on the screen.
- `src/components/auth/FormField.tsx:5-65` — shared text-field visuals and client validation state.
- `src/components/auth/SubmitButton.tsx:11-31` — shared CTA built on the repo button.
- `src/components/auth/PasswordToggle.tsx:8-18` — named password visibility control.
- `context/archive/2026-09-22-starter-baseline-cleanup/plan.md:5-29` — retained sign-in route and authentication boundaries.

## Architecture Insights

The restyle does not change the sign-in form action, authentication API, redirects, or middleware. The current repository has a `.dark` token block but no reachable theme switch, so the user-requested palette is applied to the active light theme without adding a new dark-mode feature.

## Historical Context (from prior changes)

`context/archive/2026-09-22-starter-baseline-cleanup/plan.md:5-29` retains sign-in, sign-up, and the protected dashboard as the supported application views; successful sign-in must still reach `/dashboard`. That contract remains unchanged.

## Related Research

Not applicable.

## Open Questions

None. The user supplied the palette and requested a minimal token set; the exact visible scope is the sign-in screen and its existing shared controls.
