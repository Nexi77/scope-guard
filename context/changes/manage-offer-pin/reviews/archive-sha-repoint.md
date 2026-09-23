# Archive SHA Repoint

- **Date:** 2026-09-23
- **Integration target:** `origin/master` at `60cd35f7efadf73a81225aa1e7eddf21710feca4`
- **Integration commit:** `60cd35f7efadf73a81225aa1e7eddf21710feca4` — `Feat/manage offer pin (#13)`
- **Association:** merged implementation [PR #13](https://github.com/Nexi77/scope-guard/pull/13), confirmed by the user
- **Evidence:** The PR commit list includes both phase commits. Its squash diff contains the owner-scoped PIN migration and contract tests from Phase 1 plus the authenticated endpoint, offer-card UI, and smoke coverage from Phase 2. The refreshed `origin/master` contains the squash commit and neither original phase commit is its ancestor.
- **User decision:** Repoint existing Progress SHA suffixes to the single squash commit, commit the repoint, then archive and commit the remaining archive changes.
- **Affected rows:** 6 (five SHA suffixes and one inline SHA reference)

| Row ID | Old suffix (resolved OID) | New SHA |
|--------|---------------------------|---------|
| 1.1 | `febff26` (`febff26fd4be9838a48acffa071814d9d8c0b59a`) | `60cd35f` |
| 1.2 | `febff26` (`febff26fd4be9838a48acffa071814d9d8c0b59a`) | `60cd35f` |
| 1.3 | `febff26` (`febff26fd4be9838a48acffa071814d9d8c0b59a`) | `60cd35f` |
| 2.1 | `afc4656` (`afc46568f286a0ac9d9fbe2beebadc3e9380443e`) | `60cd35f` |
| 2.2 | `afc4656` (`afc46568f286a0ac9d9fbe2beebadc3e9380443e`) | `60cd35f` |
| 2.6 (inline) | `afc4656` (`afc46568f286a0ac9d9fbe2beebadc3e9380443e`) | `60cd35f` |
