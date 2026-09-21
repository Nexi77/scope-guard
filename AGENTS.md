# Repository Guidelines

ScopeGuard records contractor/customer decisions about changes to an offer. The product contract lives in @context/foundation/prd.md; use it to resolve ambiguous feature requests.

## Product and Security Rules

Keep the MVP focused on one contractor. Do not add customer accounts, teams, billing, CRM, AI estimates, or a broad client portal unless the request explicitly expands scope. A price- or deadline-affecting change requires a new customer approval; rejected changes remain in history and never enter the active scope. Shared customer links may expose only their assigned offer, and accept/reject actions require its six-digit PIN and must be idempotent.

Keep `SUPABASE_URL` and `SUPABASE_KEY` server-only. Never commit `.env` or `.dev.vars`, log credentials or PINs, or rely on hidden UI elements for authorization. Follow @src/lib/supabase.ts and @src/middleware.ts for cookie-backed authentication and protected routes.

## Project Structure

Place route views in `src/pages/` and API endpoints in `src/pages/api/`; export uppercase Astro handlers such as `POST`. Use `src/layouts/` for page shells, `src/components/` for Astro and React UI, `src/lib/` for reusable server/business helpers, and `src/styles/global.css` for global styling. Use the `@/*` alias for `src/*`. Keep product decisions in `context/foundation/`; never edit `context/archive/`.

## Build, Test, and Development Commands

Use the scripts declared in @package.json for development, linting, building, previewing, formatting, and smoke testing. For changes to routes, authentication, deployment, or dependencies, run `npm run lint` and `npm run build` before handoff. When a configured Supabase environment is available, also run `npm run smoke` after authentication, deployment, or dependency changes.

## Style, Testing, and Delivery

Match existing `PascalCase.tsx` React components and `kebab-case` route files. Formatting, strict TypeScript, and lint rules are defined in @tsconfig.json and @eslint.config.js. Do not add ESLint disable comments unless the pull request explains why the rule cannot be satisfied. Tests currently consist of @scripts/smoke.mjs; when adding an API route or authentication flow, extend that script or add a test covering both success and failure behavior.

Use Conventional Commit-style prefixes shown in history, such as `feat(starter):` and `chore(wrangler):`. Each pull request should implement one user-visible feature or one maintenance concern; explain authorization changes and include screenshots for UI work. CI requirements are defined in @.github/workflows/ci.yml.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
