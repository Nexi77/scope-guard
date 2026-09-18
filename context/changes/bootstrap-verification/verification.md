---
bootstrapped_at: 2026-09-18T11:20:33Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: scope-guard
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: scope-guard
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

## Why this stack

ScopeGuard is a one-week, after-hours web MVP for a solo developer, with contractor authentication and secure customer decisions on a shared offer. The recommended TypeScript starter provides an opinionated full-stack foundation, explicit contracts, authentication, database support, and Cloudflare Pages deployment without assembling those concerns from scratch. Cloudflare Pages and GitHub Actions with automatic deployment on merges to main keep the operational path small while the MVP focuses on offer changes, approvals, and history. The registered project setup is first-class: it has a valid automated setup path, though occasional manual steps may be needed.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | The command template begins with `git clone`; no create-* package applies. |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh | From the registry card's `docs_url`. |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 30,643

**Conflicts (.scaffold siblings)**: `AGENTS.md.scaffold`

**.gitignore handling**: append-merged

**.bootstrap-scaffold cleanup**: deleted

The cloned `.git/` directory was removed before the merge. The starter installed 653 packages; npm emitted peer-dependency and engine warnings for Astro ESLint packages, but completed successfully with 0 vulnerabilities in its install-time audit.

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW

**Direct vs transitive**: not distinguished because the audit returned no findings. Dependency metadata: 360 production, 269 development, 165 optional, and 25 peer dependencies (802 total).

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
