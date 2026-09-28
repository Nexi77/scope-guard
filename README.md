# ScopeGuard

ScopeGuard keeps contractor and customer decisions about offer changes durable, clear, and safely scoped.

## Stack

- Astro, React, TypeScript, and Tailwind CSS
- Supabase for authentication and the offer/decision data contract
- Cloudflare Workers for deployment

## Getting Started

Requires Node.js `22.14.0` (see `.nvmrc`), npm, Docker, and the Supabase CLI.

```bash
npm install
cp .env.example .env
cp .env.example .dev.vars
npx supabase start
npm run dev
```

Copy the local API URL and anon key from `npx supabase status -o env` into both environment files as `SUPABASE_URL` and `SUPABASE_KEY`. These values are server-only and must never be committed.

The local Supabase configuration uses the `scope-guard` project ID. If you previously ran this repository under the starter ID, stop the old stack and start this one again; run `npx supabase db reset` when a fresh local database is needed. Repository migrations create the offer and decision contract.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Entry route; redirects to `/dashboard`. |
| `/auth/signup` | Email/password registration. |
| `/auth/signin` | Email/password sign-in. |
| `/dashboard` | Protected starting point; anonymous visitors are redirected to sign-in. |

Route protection is defined in `src/middleware.ts`. The dashboard intentionally contains only the signed-in user's details and a greeting until product slices add functionality.

## Commands

- `npm run dev` — start local development.
- `npm run lint` — run ESLint.
- `npx astro check` — run Astro and TypeScript diagnostics.
- `npm run build` — build the Cloudflare Worker application.
- `npm run smoke` — exercise the offer flow against a running Worker, or use `SMOKE_TRANSPORT=harness` to test the built Worker directly.
- `npm run offer-contract` — verify the local Supabase offer and decision contract.

## Verification

The smoke test requires a reachable local Supabase instance with email confirmation disabled, as configured in `supabase/config.toml`. It uses the local API URL, anon key, and service role key. CI runs the production build through Cloudflare's test harness, so it does not need a separate `wrangler dev` process.

```bash
set -a
source <(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SECRET_KEY|SERVICE_ROLE_KEY)=')
set +a
SUPABASE_URL="$API_URL" SUPABASE_KEY="$ANON_KEY" npm run build
SMOKE_TRANSPORT=harness npm run smoke
```

CI runs linting, Astro diagnostics, the production build, the offer-contract test, and the auth smoke test. The smoke job starts local Supabase and supplies ephemeral credentials; no repository secrets are required for it.

## Deployment

Build and deploy to Cloudflare Workers:

```bash
npm run build
npx wrangler deploy
```

Configure `SUPABASE_URL` and `SUPABASE_KEY` as Cloudflare secrets before deployment.
