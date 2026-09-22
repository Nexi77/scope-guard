# Dashboard account menu implementation plan

## Goal

Replace the centered signed-in confirmation with a responsive dashboard header whose account avatar opens accessible theme and sign-out actions.

## Scope

- Add the shadcn dropdown-menu primitive in `src/components/ui/`.
- Add a hydrated account-menu component that persists light/dark preference locally.
- Bootstrap the saved theme before render, then replace dashboard literals with semantic token utilities.
- Preserve the existing `POST /api/auth/signout` endpoint and protected-route behavior.

## Verification

- `npm run lint`
- `npm run build`
- Browser visual check at desktop and mobile widths, including the open menu and both themes.

## Progress

- [x] Add component and theme behavior
- [x] Render the dashboard header
- [x] Verify lint, build, and Astro type checks; browser capture was unavailable because localhost is blocked in the in-app browser
