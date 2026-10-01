# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npm run e2e -- tests/e2e/<name>.spec.ts
- full-suite command: npm run e2e
- base URL: http://localhost:4321
- port: 4321 (detected from Astro preview documented default; detected default 4321, override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT (defaults to 4321); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects risk #5's first leg: contractor navigation and session continuity through reload at the interactive offer form, including client validation. It does not yet cover creation, sharing, decisions, changes, or copy branches.
- browser CLI: playwright-cli 0.1.22, command skill at .agents/skills/playwright-cli/SKILL.md; use -s=scopeguard on every call
- updated: 2026-10-01

### Local prerequisites and verification

Run Docker and local Supabase before E2E. The existing minimal CI startup command is:

```sh
npx supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
```

Keep SUPABASE_URL and SUPABASE_KEY in ignored .env and .dev.vars pointed at that same local instance. Cloudflare preview uses the build's dist/server/.dev.vars; production credentials must not be used. Store E2E_USERNAME and E2E_PASSWORD only in ignored .env. A dedicated local test user was created; no shared/cloud user was created or changed. .env.example records empty credential names. Chromium is installed with `npx playwright install chromium`.

Astro 7 preview needs ASTRO_PREVIEW_BACKGROUND=1 to stay attached to Playwright's webServer. This is set in the config. Stop any exploratory preview before tests and check the chosen port is free; otherwise reuseExistingServer can silently test an older build. Set E2E_PORT explicitly if you need a different port. The config loads .env with Node's built-in process.loadEnvFile and rejects a nonlocal SUPABASE_URL.

Auth setup signs in through the real form and saves cookie-backed authentication. tests/e2e/ready.ts waits for Astro island hydration before form interaction. Seed uses accessible roles/names, checks navigation and reload, then exercises an invalid submission. It creates no records and does not revoke the shared setup session. The heading and aria-invalid assertions fail if validation/hydration stops working; the URL and heading assertions fail if session continuity or navigation breaks.

Cold-server proof on 2026-10-01: nothing listened on 4321 before the run; Playwright built and started preview, ran auth setup and seed (2 passed, 6.8 seconds), and released the port afterward. Lint, Astro check, and production build passed. Node's existing single-file unit command does not collect E2E specs. CI workflows, AGENTS.md, test-plan.md, and quality-gate timing were not modified.

Agent wiring added global @playwright/cli 0.1.22, .agents/skills/playwright-cli/, and the empty .playwright/ workspace marker. .playwright-cli/ snapshots and logs, auth state, reports, and test output are gitignored. Review both the seed and the config before committing. Never commit auth state or environment files.

Next browser-level risk without a spec: #3, pending/rejected changes must stay outside active terms and contractor actions must match decision state. Use `$10x-e2e 3` in Codex. The full risk #5 journey remains additional work despite the seed covering its first leg.
