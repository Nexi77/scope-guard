---
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
---

## Why this stack

ScopeGuard is a one-week, after-hours web MVP for a solo developer, with contractor authentication and secure customer decisions on a shared offer. The recommended TypeScript starter provides an opinionated full-stack foundation, explicit contracts, authentication, database support, and Cloudflare Pages deployment without assembling those concerns from scratch. Cloudflare Pages and GitHub Actions with automatic deployment on merges to main keep the operational path small while the MVP focuses on offer changes, approvals, and history. The registered project setup is first-class: it has a valid automated setup path, though occasional manual steps may be needed.
