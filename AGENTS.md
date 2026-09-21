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

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
