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

<!-- Hooks part -->

## 10xDevs AI Toolkit - Module 3, Lesson 3 (10xDevs 4.0 Hooks)

Treat a hook as a **quality gate the harness runs for the agent**, not a script you hope the agent notices. Hooks run outside the model, so they survive context compaction and forgotten instructions — but only a hook whose signal actually reaches the agent closes the loop:

```
test-plan.md "Quality Gates" -> pick the moment per gate -> /10x-configure-hook -> prove with sample JSON -> watch the agent fix a deliberate error
```

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| `/10x-configure-hook` | Turning the gates from `context/foundation/test-plan.md` into agent hooks, fixing hooks that fire but the agent never reacts to, or auditing an existing hook config. It detects the harness from the repo and carries dated per-harness references. |
| `/10x-test-plan --status` | Read the current gates and rollout state. Changing which gates exist belongs to Lesson 1, not here. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | A hook surfaced a failure the agent cannot fix with a trivial correction (wrong business logic, flaky integration). Open a change instead of looping the hook. |

### Hook lifecycle

1. **Trigger** — an event in the harness: a tool finished editing a file, the agent is about to end its turn.
2. **Matcher** — narrows which tool calls or files the hook reacts to. Not every harness honours matchers the same way.
3. **Handler** — usually a shell command or script that reads the event payload as JSON on stdin.
4. **Signal** — what the hook returns. The exit code, stderr, stdout and JSON fields mean different things in different harnesses, and only one channel per event actually reaches the agent. **The signal channel differs per harness — check the skill's references before writing or reviewing a hook.**

A hook that runs but sends its message down the wrong channel is the most common failure: the user sees "hook error", the agent sees nothing and keeps going.

### Moments and layers

The slower the check, the rarer the moment:

| Moment | Typical checks | Reaches the agent? |
| --- | --- | --- |
| Per edit | Lint/format of **the edited file only**; related tests if they are fast | Yes, mid-work |
| End of turn (Stop or its equivalent) | Lint + tests for every file changed this turn, whole-project typecheck | Yes, before the agent hands back |
| Pre-commit (git) | Lint + tests on staged files; catches edits made without the agent | No — blocks the commit |
| Pre-push (git) | Heavier suites, e2e that run locally | No — blocks the push |
| CI | Integration, shared state, infrastructure you do not have locally | No — PR feedback |

Local layers do not replace CI; each one saves a CI round-trip. Start with one per-edit lint hook and one end-of-turn typecheck, then add layers when you see what escapes.

### Contract

- Read the gates from the "Quality Gates" section of `context/foundation/test-plan.md` (by title, not section number). A gate the plan explicitly defers stays deferred unless the user overrides it — quote the deferral when you ask.
- Per-edit hooks check only the file that was edited. Never run `--fix` or a linter over the whole project on every edit.
- End-of-turn hooks that can send the agent back must stop after one retry (the harness's "already continued" flag or equivalent), so an unfixable error does not loop.
- Per-edit hooks only see the harness's edit tools; a file rewritten through a shell command skips them. The end-of-turn hook re-checks every file changed this turn (`git diff`), so it is the net for those edits.
- Timeouts are usually in **seconds**. Check the unit before copying a number.
- Prove every hook before trusting it: run the script with a sample payload on a deliberately broken file and on a clean one, then revert the error.
- Never overwrite existing hook config silently. Audit it, name the defects, merge, and show the diff.

<!-- Hook part end -->