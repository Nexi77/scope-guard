# View Offer History — Plan Brief

> Full plan: `context/changes/view-offer-history/plan.md`

## What & Why

Finish the contractor's offer history so the recorded sequence of proposals, decisions, and replacements is clear and trustworthy. The current offer remains the source of active scope and values; the history explains how it reached that state.

## Starting Point

The contractor already has a current-offer page and a separate history timeline with revision snapshots, proposal details, and rejection reasons. Creation cards currently show their eventual status, replacements have no dedicated dated event, and history reads are unbounded.

## Desired End State

The contractor sees a bounded chronological timeline whose entries describe the state at each event. “Review pending change” opens that exact proposal in history. Future replacements have dated events linking old and successor records; old replacements remain identified without invented dates. Decisions and rejection reasons stay visible, and pending or rejected changes do not alter the active offer.

## Key Decisions Made

| Decision              | Choice                                    | Why                                                                 |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Scope                 | Finish the contractor view                | Matches roadmap S-07 and builds on existing pages.                  |
| Creation labels       | Show status at event time                 | An earlier card should not imply a later decision already occurred. |
| Replacements          | Store and display separate dated events   | Gives future replacements a precise place in the timeline.          |
| Existing replacements | Future events only; no timestamp backfill | Every dated event uses an explicitly recorded time.                 |
| History size          | Bounded, deterministic pages              | Avoids silent omission at the database row limit.                   |
| Proposal link         | Open the exact proposal details           | The current offer link needs a clear destination.                   |

## Scope

**In scope:** Future replacement timestamps, owner-scoped event paging, accurate contractor timeline labels and links, rejection reasons, long-history access, security and current-scope regression checks.

**Out of scope:** A fuller shared-link customer history, whole-offer version comparison, backfilled replacement dates, changes to PIN or decision rules.

## Architecture / Approach

An additive migration records replacement times in the existing revision and change tables. A bounded owner-scoped event read combines creation, decision, and future replacement events. The contractor history page renders that stream with saved details and navigation; the existing current-offer page continues to calculate active values.

## Phases at a Glance

| Phase                                          | What it delivers                                  | Key risk                                                                       |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Record Future Replacement Times             | Atomic replacement time and successor linkage     | Historical null times must remain untouched.                                   |
| 2. Read and Present a Bounded Event Timeline   | Accurate event labels, links, and page navigation | Same-time ordering and off-page anchors must be stable.                        |
| 3. Verify History and Current-State Boundaries | Contract, HTTP, and UI evidence                   | Rejected work or foreign records must never leak into active scope or history. |

**Prerequisites:** Existing S-04 and S-06 records and a configured local Supabase environment for contract and smoke checks.
**Estimated effort:** About 2–3 focused implementation sessions across three phases.

## Open Risks & Assumptions

- Existing replaced rows have no explicit replacement time. They retain an undated status note and do not gain a dated event.
- A replacement and successor may share a transaction timestamp; the event contract must order the replacement before the successor creation.
- A pending-change anchor must load its page and open the exact proposal details, even if the event moves off the first page.

## Success Criteria (Summary)

- A contractor can browse the full history with correct creation, decision, replacement, and rejection details.
- Current scope includes accepted and agreed work only; pending and rejected effects stay in history.
- Anonymous and foreign users cannot read the contractor history, and long timelines do not silently truncate.
