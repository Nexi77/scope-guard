# Review fixes

## F1 — Direct contractor writes bypass customer approval

Implemented a database guard that keeps contractor edits open for pending changes while reserving customer-decision transitions and decision records for the PIN-protected RPC. Added regression coverage for direct acceptance, direct decision insertion, and deletion of an accepted change.

## F2 — PIN attempt abuse protection

Deferred by scope. The public anonymous decision RPC has no rate limit or lockout. When the customer-decision delivery boundary is implemented, expose it through a rate-limited endpoint and revoke direct anonymous RPC execution. A database-only lockout remains an alternative, but requires explicit attempt-window, expiry/reset, and support-policy decisions and cannot provide network-level distributed-attack controls.
