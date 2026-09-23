# Browse client offers — Plan Brief

> Full plan: `context/changes/browse-client-offers/plan.md`

## What & Why

The contractor needs to find one customer's offers and see each offer's current status, price, and delivery deadline. This roadmap slice adds that browse flow and connects it to offer creation while preserving the later detail and history work.

## Starting Point

Customers and offers are stored with contractor ownership and RLS. The dashboard links to `/offers/new`, but there is no offer list or shared protected navigation. The current-value formula exists for shared offers, while the creation confirmation discards the returned customer ID.

## Desired End State

A shared sidebar leads from the dashboard to an `/offers` browser and the existing creation page. The browser shows alphabetical customer groups and bounded, newest-first offer pages with current values; after creation, the confirmation opens the new offer's customer group. The dashboard shows no offer records.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Browse structure | Expandable customer groups | Keeps offers tied to a specific customer, including distinct same-named records. | Plan |
| Displayed values | Current price and deadline from base plus accepted/agreed changes | Matches the current-offer rule; pending and rejected changes do not alter scope. | PRD / Plan |
| Status | Stored offer status | A rejected change can leave a previously accepted offer accepted. | Database contract |
| Offer action | Informational rows, no detail route | Detail and history are later roadmap slices. | Plan |
| Order | Customers by name then ID; offers newest first by time then ID | Makes customer lookup predictable and pagination stable. | Plan |
| Retrieval | Bounded customer pages and bounded per-customer offer pages | Prevents the unbounded-list issue found in the prior review. | Prior review / Plan |
| Navigation | Shared protected sidebar; dashboard remains an entry point | Connects list and creation without placing offer records on the dashboard. | Plan correction |
| After creation | Link to returned customer's expanded group | Makes the created record easy to verify, even outside the first customer page. | Plan |

## Scope

**In scope:**

- Authenticated current-value read contract and database coverage.
- Protected `/offers` browser with customer groups, pagination, empty and error states.
- Responsive sidebar on dashboard, browser, and creation page; creation-to-browser confirmation link.
- Route smoke coverage and manual responsive/accessibility checks.

**Out of scope:**

- Offer detail, editing, history, PINs, customer decisions, and shared customer links.
- Customer accounts, CRM, customer merging, or offer data on the dashboard.

## Architecture / Approach

The Astro browser uses the cookie-backed contractor session and RLS. It loads one bounded customer page and, for the expanded group, one bounded offer page from an authenticated read function that computes current values after selecting the page. The creation endpoint uses its RPC's returned customer ID to link the confirmation to that owned group.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bounded contractor offer read | Owned, current-value offer pages and contract checks | Incorrect aggregation or cross-contractor exposure |
| 2. Customer groups and contractor navigation | Browser, sidebar, and creation handoff | Deep links, duplicate names, and mobile navigation |
| 3. End-to-end browsing verification | Smoke and manual review | Route or UI behavior diverges from the contract |

**Prerequisites:** S-01 creation flow and offer schema are present; configured local Supabase is needed for database and smoke checks.
**Estimated effort:** About 2–3 focused sessions across three phases.

## Open Risks & Assumptions

- Offer records have no title, so the list uses an original-scope excerpt and creation date for identification.
- Exact minor-unit values need string/BigInt handling to avoid JavaScript number precision loss.
- The existing creation-page customer selector remains a separate scaling concern; this plan bounds the browse view.

## Success Criteria (Summary)

- A signed-in contractor can find one customer's offers with stored status and accurate current PLN price and deadline, without seeing another contractor's records.
- Customer and offer pages stay bounded and deterministic, including same-named customers and a direct link after creation.
- Dashboard, list, and creation navigation works on phone and desktop with visible focus and clear empty/error states.
