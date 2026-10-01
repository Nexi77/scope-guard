# ScopeGuard Codex hooks

Configured and proved on 2026-10-01 with Node 24.16.0.

## Inputs and audit

- Gates: `context/foundation/test-plan.md`, Quality Gates. Lint and Astro typecheck are required now.
- Harness: Codex, identified by `.agents/.10x-cli-manifest.json` (`tool: codex`) and the invoked skill under `.agents/skills/`.
- No other harness configuration, existing project hooks, user hooks JSON, or inline user hooks were found. No hooks were replaced; no orphan scripts remain.
- Commands: local ESLint CLI, equivalent to `npm run lint` scoped to edited/changed files; local `astro check`, equivalent to `npm run astro -- check`, for the whole project. Astro check generates framework types itself.
- Untouched baseline was green. The complete Stop sweep took approximately 5.6 seconds.
- Existing unit command `npm run offer-change-estimator` passed 13 tests in less than a second. It is not added to hooks: the approved configuration preserves the plan's timing for regression gate enforcement.
- Existing Git manager: Husky with `npx lint-staged` in `.husky/pre-commit`. No Git hook configuration changed.

## Gate mapping and deferrals

| Gate | Moment | Decision |
| --- | --- | --- |
| ESLint, including Astro | PostToolUse for apply_patch; changed-file sweep at Stop | Configure now |
| Astro typecheck | Stop | Configure now |
| Local Supabase contract and Worker smoke | Existing CI | Preserve |
| Unit and integration regression checks | Local + CI, "required after §3 Phase 4" | Skip promotion into agent hooks |
| Critical journey e2e | CI on PR, "required after §3 Phase 4" | Preserve phase timing |
| Selective AI-assisted visual review | Local review, "recommended after §3 Phase 4" | Preserve phase timing |

The plan explains: "Phase 3 creates the critical e2e signal; Phase 4 enforces it." No deferral override was requested. The user approved the two static-check hooks and preservation of later gates.

## Configuration diff

New `.codex/hooks.json` registers:

- PostToolUse matcher `^apply_patch$`, command `node "$(git rev-parse --show-toplevel)/.codex/hooks/lint-edited-file.mjs"`, timeout 30 seconds.
- Stop command `node "$(git rev-parse --show-toplevel)/.codex/hooks/end-of-turn.mjs"`, timeout 120 seconds.

New executable scripts: `lint-edited-file.mjs` and `end-of-turn.mjs`.

The sole modification to existing configuration:

```diff
-  files: ["scripts/**/*.mjs"],
+  files: ["scripts/**/*.mjs", ".codex/hooks/**/*.mjs"],
```

This extends the existing Node-script lint configuration to the hook scripts. Lint never uses `--fix`. Commands use the installed binaries, argument arrays, plain output, and bounded subprocess timeouts. Patch paths resolve relative to payload cwd; paths outside the repository are skipped. Stop includes tracked changes against HEAD and untracked files, so shell rewrites are covered. This is a working-tree sweep, not a precise per-turn snapshot; pre-existing changes also get checked. Stop returns `{}` on success and allows completion after `stop_hook_active: true`. Failures use stderr and exit 2.

## Proof

Proof used a temporary error in real `src/lib/utils.ts`, restored byte for byte in a finally block. No application tests were added. A temporary independent Git repository proved the no-change early exit without installed dependencies.

| Case | Observed exit / output |
| --- | --- |
| Clean edited source | 0, no output |
| Clean Stop baseline | 0, `{}` |
| Unused variable in edited source | 2, stderr names utils.ts and lint error |
| Multi-file patch with error in second file | 2, stderr names utils.ts |
| Move-to destination containing error | 2, stderr names utils.ts |
| Payload cwd in src/lib, relative utils.ts | 2, stderr names utils.ts |
| Shell edit, no per-edit payload, then Stop | 2, stderr names utils.ts |
| Stop retry flag while error remains | 0, `{}` |
| Wrong string/number type, then Stop | 2, stderr includes Astro typecheck failure |
| Restored clean edited source | 0, no output |
| Restored clean Stop sweep | 0, `{}` |
| Markdown path | 0, no output |
| Nonexistent source | 0, no output |
| Empty object | 0, no output |
| Invalid JSON | 0, no output |
| Empty stdin | 0, no output |
| Pathless tool input | 0, no output |
| Patch without file headers | 0, no output |
| Non-patch tool payload | 0, no output |
| Outside-repository path | 0, no output |
| Stop invalid JSON | 0, `{}` |
| Stop empty stdin | 0, `{}` |
| Stop with no changed files and no dependencies | 0, `{}`; no checks launched |

Final project lint and build passed. Build's existing sitemap warning remains: Astro has no `site` setting. The sandbox blocked Wrangler's default log location on the first successful build; a second build used `/private/tmp/scopeguard-hook-build.log`.

## Activation and limits

Review and trust both definitions using `/hooks` in Codex CLI. Project-local configuration must also be trusted. Changed hook definitions require renewed trust. Manual payload proof confirms scripts and signals, but does not prove that this desktop session has loaded or approved the hooks.

Current [official Codex documentation](https://learn.chatgpt.com/docs/hooks) agrees with the skill reference on `tool_input.command`, `stop_hook_active`, exit 2 plus stderr, Stop JSON success, timeouts in seconds, and trust review. No relevant reference drift was found. These commands target the current macOS environment; Windows execution has not been configured or proved.

Hooks do not prove customer-link isolation, PIN authorization, decision idempotency, database policies, React hydration, navigation, or applied offer prices/deadlines. Keep the existing Supabase contract and Worker smoke checks, and use the planned critical-journey E2E/browser verification for those boundaries.

Recommended Git gates, not written: keep staged lint/format in existing Husky/lint-staged; consider full Astro typecheck and the fast estimator suite before commit, and local Supabase contract plus Worker smoke before push. E2E belongs in CI once shipped by its planned phase.

After trusting the hooks, ask the agent to introduce and repair a lint error, then a type error. Finally ask it to rewrite a source file through a shell command with a lint error and verify Stop sends it back once. This demonstrates actual harness delivery in the same session.
