# Accepted journey live exploration

2026-10-01: named playwright-cli session `scopeguard-journey`, fresh local preview port 4345, ignored contractor storage state, explicitly empty anonymous context. No generated PIN or credentials retained in this document.

- Dashboard main `Create offer` navigates to the hydrated form. New-customer and item textbox names include `required` (e.g. `Customer name required`, `Selling rate (PLN per unit) required`); unit choice is `Piece (pc)`.
- Actual submission redirects straight to `/offers/<id>`; the source's `Review this offer` success link is not present in the observed native submission path.
- Detail exposes `Generate PIN` and `Shared offer URL`. Capture PIN privately and reload/close its result before further diagnostics. Anonymous input is `Six-digit offer PIN required`; settled result is `This offer was accepted.`.
- `Offer actions` → `Start change proposal` opens editable `Quantity`, `What is changing?`, and `Confirmed target date`. `Preview estimate` yields `Estimate preview`, `Total price adjustment: +100,00 zł`, and `Target date: 2099-01-22`. Publication redirects to targeted history.
- Pending contractor/customer terms remain 100,00 zł, quantity 1, Jan 15. Anonymous `Accept change` → `Confirm acceptance` settles `This change proposal was accepted.`. Reload exposes 200,00 zł, quantity 2, Jan 22 in both views.
- Default history shows accepted version/proposal events; `View version details` opens original 100,00 zł/Jan 15/quantity 1; `View proposal details` opens accepted before/after quantity 1→2 effects.

Owned browser/preview closed and uniquely named exploration customer removed (zero customer residue). Focused cold-build verification on port 4346 passed setup and journey: 2 passed (6.3s). Spec cleanup verifies zero residue across all six domain tables. Main agent performs deliberate regression and broader checks.

## Primary review and verification

- Reviewed all five E2E anti-patterns: exact business terms/history, accessible locators, independent token and anonymous storage, state waits, nested failure-safe asserted cleanup. No internal boundary is mocked.
- Cold-build deliberate regression on port 4347 made contractor display the base amount after approval. The test failed specifically on expected current 200,00 zł (received zero matching definitions), after completing the actual approval path. Cleanup still passed; independent customer-token count was zero.
- Production source was restored byte-for-byte (SHA-256 `de8d38bcc0dea4e899b54bfe69ec6b94cf1f07b4ecc1447466f8360232cc7be0`).
- Restored cold-build full suite on port 4348: 6 passed (6.9s), including the new journey and all existing coverage. Asserted six-table cleanup passed in every fixture.
- `npm run lint` passed; `npm run astro -- check` reported 84 files with zero errors/warnings/hints. The E2E webServer completed the production build before verification.

Phase 2 subsequently hardened private inputs in both journeys and setup: ordinary `fill` retained values in HTML report titles despite disabled tracing. `private-input.ts` preserves native input events without value-bearing titles; final suite and report inspection passed. See `rejected-live-flow.md` for the later verification.
