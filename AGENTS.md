# ScopeGuard agent guide

## Product guardrails

ScopeGuard records customer decisions about changes to a contractor's offer. The full product contract is in `context/foundation/prd.md`; keep it authoritative when a request is ambiguous.

- A change that affects price or deadline must receive a new customer approval before it becomes part of the active scope.
- A change with no price or deadline impact can be applied immediately, but must remain in the offer history.
- Rejected changes never become part of the active scope. Preserve the change, decision, comment, and timestamp in history.
- Customer links must be scoped to one offer only. Viewing may use the shared link; accepting or rejecting requires that offer's six-digit PIN.
- Decision endpoints must be idempotent: a repeated submission must not create a duplicate decision or inconsistent offer state.
- The MVP is for one contractor. Do not introduce customer accounts, teams, billing, CRM, AI estimates, or broad client portals unless the task explicitly expands scope.

## Stack and architecture

- Astro 7 SSR application, React 19 islands, TypeScript, Tailwind CSS 4, Supabase, and Cloudflare Workers/Pages.
- Pages render on the server by default (`output: "server"`). API routes must export uppercase handlers (`GET`, `POST`, etc.) and set `export const prerender = false` when required.
- Prefer Astro components for static content and layouts. Use React only where client-side interactivity is needed; do not add Next.js directives.
- `@/*` maps to `src/*`. Put reusable business logic in `src/lib/` (or `src/lib/services/`), shared types in `src/types.ts`, and hooks in `src/components/hooks/`.
- Use Zod to validate API input. Use `cn()` from `@/lib/utils` for conditional Tailwind classes rather than manually concatenating class strings.
- shadcn/ui components live in `src/components/ui/`; add new components with `npx shadcn@latest add <name>`.

## Authentication, data, and secrets

- `src/lib/supabase.ts` creates the cookie-backed Supabase SSR client. `src/middleware.ts` resolves the authenticated contractor and protects contractor routes.
- Keep `SUPABASE_URL` and `SUPABASE_KEY` server-only. Never commit `.env` or `.dev.vars` files, expose secrets to the browser, or log PINs/tokens.
- Add Supabase schema changes as timestamped SQL migrations in `supabase/migrations/` using `YYYYMMDDHHmmss_short_description.sql`.
- Enable RLS on every new table and write narrowly scoped policies for each operation and role. Enforce ownership and offer-link access on the server/database; do not rely on UI visibility as authorization.

## Commands

- `npm run dev` — local development server.
- `npm run build` — production SSR build.
- `npm run preview` — preview the production build.
- `npm run lint` / `npm run lint:fix` — lint and optionally fix source files.
- `npm run format` — format with Prettier, Astro, and Tailwind plugins.
- `npm run smoke` — run the auth-flow smoke test against a running server (`BASE_URL`, default `http://localhost:4321`).

Use Node `22.14.0` from `.nvmrc`. Before handing off a substantive change, run the narrowest relevant checks; for broad app changes, run `npm run lint` and `npm run build`. Run `npm run smoke` when changing authentication, deployment, or dependency behavior and a configured Supabase environment is available.

## Delivery conventions

- Keep changes focused and preserve existing user work.
- CI targets `master` and runs linting, Astro type checks, builds, and a Supabase-backed smoke test. Keep these checks passing.
- `context/` holds project decisions and workflow artifacts. Do not write to `context/archive/`; archived changes are immutable. Create a new change instead.
- Treat generated and local-only artifacts (`node_modules/`, `dist/`, `.astro/`, `.env`, `.dev.vars`, `.wrangler/`) as untracked local state.
