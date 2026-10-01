# CI verification — Phase 1

Verified locally on 2026-10-01 against the running loopback Supabase backend.

- Independent pricing suites: 4 offer-items and 14 estimator tests passed.
- Existing offer-contract and harness smoke checks passed.
- ESLint passed; Astro check inspected 87 files with zero errors, warnings or hints.
- Full Chromium suite under `CI=true`, using a newly provisioned dedicated account and fresh build: 7 passed. Preview used port 4360.
- Provisioning refused existing configuration without changing developer files. A stub returning a nonlocal backend was rejected before any account/state creation.
- Generated environment and ownership files had mode 0600 and used the existing E2E_USERNAME/E2E_PASSWORD contract.
- Cleanup refused a modified generated file. After restoring that file, cleanup succeeded and the dedicated user was absent.
- Original .env, .dev.vars and auth storage state were restored byte-for-byte with original permissions. Private values were never printed.
- Resolved CI config: list reporter, trace/screenshot/video off, one worker, no existing-server reuse. Workflow contains no diagnostic artifact upload.
- Both existing PR/push jobs remain. Static job runs lint, type check, both unit suites and build; local backend job runs contract, build, harness smoke and full E2E after Chromium installation. Cleanup steps use always().

No new business tests were introduced in this phase, so the production deliberate-break check does not apply. Negative provisioning and ownership checks exercised the actual safety boundaries instead.

Remote GitHub Actions on Ubuntu has not been run. Browser/system dependency installation and hosted-runner behavior require verification after an authorized push; local green does not establish remote green. No push was performed.
