---
project: scope-guard
researched_at: 2026-09-19
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3.2
  runtime: Cloudflare workerd via @astrojs/cloudflare 14.3.1
---

## Recommendation

**Deploy ScopeGuard on Cloudflare Workers.**

It keeps the project's existing SSR configuration (`@astrojs/cloudflare`, Wrangler 4.131.1, and `wrangler.jsonc`) intact, instead of requiring an adapter/runtime migration. It also meets the MVP priorities: managed global delivery, a free tier with 100,000 Worker/Pages Function requests per day and unlimited static-asset requests, external Supabase support, and CLI/MCP operations. The earlier `cloudflare-pages` target in `tech-stack.md` should be read as superseded: Astro's current Cloudflare adapter deploys SSR applications to Workers, not Pages.

## Platform Comparison

| Platform | CLI-first | Managed/serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---:|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5.0 / 5 |
| Netlify | Pass | Pass | Pass | Pass | Partial | 4.5 / 5 |
| Render | Pass | Partial | Pass | Pass | Pass | 4.5 / 5 |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP is beta) | 4.0 / 5 |
| Railway | Pass | Partial | Partial | Pass | Pass | 4.0 / 5 |
| Fly.io | Pass | Partial | Pass | Partial (Machines API is beta) | Partial | 3.5 / 5 |

Cloudflare Workers is native to the existing Astro adapter and Wrangler configuration. It offers a managed edge runtime, deterministic `wrangler deploy` and `wrangler rollback`, Markdown/LLM-readable docs, and official docs, bindings, builds, and observability MCP servers. Its free plan is appropriate for a small stateless MVP; static assets are unlimited and function requests use the Workers allowance.

Netlify is the strongest zero-cost stateless alternative. Its free credit plan, branch deploys, CLI/API rollback, and agent-readable documentation are good fits, but ScopeGuard would need a migration from `@astrojs/cloudflare` to `@astrojs/netlify`. It does not offer an always-on process model for a future realtime backend.

Render is familiar to the developer and supports WebSockets, background workers, managed containers, and an official MCP server. However, SSR Astro would need the Node adapter and the free web-service tier sleeps after 15 minutes and is explicitly non-production.

Vercel has polished previews and automation, but its free Hobby plan is for non-commercial personal use, which makes it a poor default for a contractor-facing product. Railway is capable but its durable free allowance is too small for a live MVP. Fly.io is a strong future persistent-process option but has no free tier and requires container/Node-adapter work.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The current project already targets this runtime: `output: "server"`, the Cloudflare adapter, a Worker entry point, static assets, KV, Node compatibility, and observability are configured. It preserves the one-week MVP's low operational surface, while Supabase remains the external system for authentication and data.

#### 2. Netlify

Netlify is a viable fallback if its free-credit model or deployment experience is preferred later. It is well-suited to the stateless application but costs migration and regression-testing effort now, with no advantage over the existing Cloudflare-targeted code.

#### 3. Render

Render is the preferred fallback if durable server processes become a concrete requirement. For today's scope it introduces a Node adapter migration and free-tier cold starts, so it is not worth the extra operational and compatibility work.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Server-rendered routes run on `workerd`, not an unrestricted Node server; a dependency that assumes filesystem access, native modules, or unavailable Node APIs can fail at runtime.
2. Worker code runs globally but Supabase is regional. A poorly chosen Supabase region can make every authenticated or mutation request wait on a distant database.
3. Cloudflare code rollback does not revert Supabase migrations or decisions already written to the database, so a rollback can expose an incompatible schema or confusing business state.
4. Runtime configuration distinguishes plain variables from encrypted secrets. Incorrectly adding a credential as a public/configured value can leak a server-only Supabase key.
5. Future WebSocket requirements need a deliberate shared-state design (Supabase Realtime or Durable Objects); process memory cannot be treated as durable or globally shared state.

### Pre-Mortem — How This Could Fail

Six months after launch, a feature is added under the assumption that every Node package works at the edge. It passes a local happy-path check but crashes for a customer because the dependency uses an unsupported runtime capability. The team then learns the error logs are too terse to diagnose quickly. Meanwhile, the worker is near the user but the Supabase project is in a distant region, so offer pages feel slow whenever they read or write data. A hurried `wrangler rollback` restores the old code but leaves a newer database migration and a customer approval record in place; the older code interprets that state incorrectly. Finally, realtime status updates are implemented in instance memory. Different Worker instances see different state and reconnects lose updates. The failure is caused by treating edge placement, code rollback, and server instances as if they behaved like a regional long-lived server. Keep runtime dependencies portable, choose the database region deliberately, make migrations backward-compatible, and design realtime separately before adding it.

### Unknown Unknowns

- Astro 7's Cloudflare adapter no longer supports Cloudflare Pages for SSR. The supported target is a Worker with static assets; do not revive old `wrangler pages` tutorials.
- With `@astrojs/cloudflare` 14.3.1, `npm run build && npm run preview` uses the `workerd` runtime for a close local production check; a legacy `wrangler pages dev ./dist` workflow is not the right local preview command.
- Since Astro 6, Cloudflare environment selection is a build-time concern. Build separately per environment (for example, with `CLOUDFLARE_ENV=preview`) rather than building once and assuming `wrangler deploy --env preview` changes the result.
- Workers Logs has limited retention on the free plan (three days). Enable and use a third-party sink or a paid plan before audit/debugging needs exceed that window.
- A customer decision must remain idempotent and database-enforced. A platform retry or duplicate request is normal and must not create another approval record.

## Operational Story

- **Preview deploys**: Create a separate Worker environment for preview and deploy it from a pull-request workflow after building specifically for that environment. Treat preview offer links as real data exposure; use test data or protect the preview before sharing it externally.
- **Secrets**: Store `SUPABASE_URL` and `SUPABASE_KEY` as Worker secrets with `npx wrangler secret put`; only Cloudflare account members with appropriate permissions and the runtime can use their values. Rotate by updating the Supabase credential, then replacing the Worker secret and redeploying.
- **Rollback**: Inspect recent releases with `npx wrangler deployments list`, then run `npx wrangler rollback <VERSION_ID> --message "reason"`. It immediately routes traffic to the selected Worker version; it does not revert Supabase migrations or recorded customer decisions.
- **Approval**: A human approves first production publishing, custom-domain changes, secret rotation, and any database migration or destructive data action. An agent may build, deploy a preview, inspect deployment status, and read logs using a least-privilege Cloudflare token.
- **Logs**: Read live runtime logs with `npx wrangler tail scope-guard`; use Workers Logs/observability or Cloudflare's observability MCP server for historical inspection. Never log PINs, cookies, or Supabase credentials.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| Unsupported Node/runtime dependency in SSR route | Devil's advocate | M | H | Keep server code Web-API-first; run `npm run build && npm run preview` and test every authenticated route before deployment. |
| Slow Supabase round trips | Devil's advocate / Pre-mortem | M | M | Create Supabase in the nearest intended customer region and measure offer-route latency before launch. |
| Code rollback leaves incompatible data state | Devil's advocate / Pre-mortem | M | H | Make migrations additive/backward-compatible; separately approve and document any Supabase migration before a Worker deploy. |
| Supabase server key accidentally exposed | Devil's advocate | L | H | Use Worker secrets only, retain Astro server-only environment declarations, and review built output/logs for credentials. |
| Duplicate accept/reject request changes business state twice | Research finding | M | H | Enforce idempotency and decision state transitions in Supabase/database logic; add smoke coverage for duplicate submission. |
| Pages-era workflow used with Astro 7 | Unknown unknown | M | M | Use Worker deployment and `astro preview`; do not use `wrangler pages dev` for this SSR application. |
| Insufficient free log retention during an incident | Unknown unknown | M | M | Add external log export or upgrade before launch if three-day retention is not enough. |
| Realtime feature assumes shared in-memory state | Pre-mortem / Unknown unknown | M | M | Use Supabase Realtime or design Durable Objects explicitly when realtime enters scope. |

## Getting Started

1. Keep `astro.config.mjs` on `@astrojs/cloudflare` and `output: "server"`; the existing `wrangler.jsonc` is already a Worker configuration, so do not create a Pages project.
2. Choose the Supabase region nearest to the initial customers and create the project there before adding production data.
3. Authenticate the repository's pinned CLI with `npx wrangler login`, then create server-only runtime values using `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. Verify the exact installed stack locally with `npm run build && npm run preview`; test protected contractor routes and the PIN-protected customer decision flow.
5. Publish the first Worker with `npx wrangler deploy`, then use `npx wrangler tail scope-guard` for read-only runtime verification. Add a distinct preview environment and GitHub Actions deployment only after the manual deployment is verified.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
