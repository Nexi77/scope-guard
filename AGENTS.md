# Repository Guidelines

ScopeGuard records contractor/customer decisions about changes to an offer. The product contract lives in @context/foundation/prd.md; use it to resolve ambiguous feature requests.

## Product and Security Rules

Keep the MVP focused on one contractor. Do not add customer accounts, teams, billing, CRM, AI estimates, or a broad client portal unless the request explicitly expands scope. A price- or deadline-affecting change requires a new customer approval; rejected changes remain in history and never enter the active scope. Shared customer links may expose only their assigned offer, and accept/reject actions require its six-digit PIN and must be idempotent.

Keep `SUPABASE_URL` and `SUPABASE_KEY` server-only. Never commit `.env` or `.dev.vars`, log credentials or PINs, or rely on hidden UI elements for authorization. Follow @src/lib/supabase.ts and @src/middleware.ts for cookie-backed authentication and protected routes.

The configured cloud Supabase project intentionally has self-service email registration disabled until the product enables it. Do not treat its `Signups not allowed for this instance` response as an application defect or enable registration to make a smoke test pass. Use local Supabase credentials for registration-flow verification instead.

## Project Structure

Place route views in `src/pages/` and API endpoints in `src/pages/api/`; export uppercase Astro handlers such as `POST`. Use `src/layouts/` for page shells, `src/components/` for Astro and React UI, `src/lib/` for reusable server/business helpers, and `src/styles/global.css` for global styling. Use the `@/*` alias for `src/*`. Keep product decisions in `context/foundation/`; never edit `context/archive/`.

## Build, Test, and Development Commands

Use the scripts declared in @package.json for development, linting, building, previewing, formatting, and smoke testing. For changes to routes, authentication, deployment, or dependencies, run `npm run lint` and `npm run build` before handoff. When a configured Supabase environment is available, also run `npm run smoke` after authentication, deployment, or dependency changes.

## Style, Testing, and Delivery

Match existing `PascalCase.tsx` React components and `kebab-case` route files. Formatting, strict TypeScript, and lint rules are defined in @tsconfig.json and @eslint.config.js. Do not add ESLint disable comments unless the pull request explains why the rule cannot be satisfied. Tests currently consist of @scripts/smoke.mjs; when adding an API route or authentication flow, extend that script or add a test covering both success and failure behavior.

Use Conventional Commit-style prefixes shown in history, such as `feat(starter):` and `chore(wrangler):`. Each pull request should implement one user-visible feature or one maintenance concern; explain authorization changes and include screenshots for UI work. CI requirements are defined in @.github/workflows/ci.yml.
