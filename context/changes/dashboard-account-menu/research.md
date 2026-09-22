---
date: 2026-09-22
topic: Dashboard account header and preferences menu
status: complete
---

# Research: Dashboard account menu

## Charge list

1. **Accidental architecture** — `src/pages/dashboard.astro:7-16` centers a transient authentication confirmation instead of providing persistent dashboard navigation; signed-in users have no visible account controls.
2. **Missing shared component** — `src/components/ui/` contains the token-aware `button.tsx` primitive but no accessible menu primitive; implementing a bespoke popover would duplicate shadcn/Radix keyboard and focus behavior.
3. **Missing token adoption** — `src/pages/dashboard.astro:7-16` uses the obsolete `bg-cosmic` and white/blue/purple literals rather than `background`, `border`, `popover`, and `muted` semantic tokens, so its dark-theme values cannot apply.
4. **Missing entry-point behavior** — `src/layouts/Layout.astro:10-17` has no persisted theme bootstrap, so the existing `.dark` token values are unreachable and a stored preference would flash the wrong theme before hydration.

## Contract

- `src/styles/global.css` remains the single source of semantic light and dark values.
- `src/components/ui/dropdown-menu.tsx` will be a repo-owned shadcn/Radix primitive, paired with the existing `Button`.
- A small client React component owns only browser-local theme state and menu interaction. The server keeps ownership of the authenticated email and the POST-only sign-out flow.

## Named states

- Default, hover, keyboard focus, open menu, light theme, dark theme, and sign-out submission.
- The header must remain usable at desktop and mobile widths; the avatar trigger has an accessible name and visible focus indicator.
