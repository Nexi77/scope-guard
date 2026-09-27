# Archive SHA repoint

- Date: 2026-09-27
- Target: local `master`; refreshed `origin/master` was `eaa38f4` before the user-requested squash.
- Integration commit: `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` — `feat(offer-flow): finalize grouped offers flow`.
- Association: explicitly requested by the user in this task: squash `feat/offer-flow` directly into `master`, update the SHA references, then close the change without a PR.
- Evidence: the squash commit contains the complete offer-flow implementation and its change record (55 files; 3,496 insertions, 788 deletions). It is the implementation integration commit on local `master`.
- Decision: repoint completed Progress rows that already had SHA suffixes. The manual row 6.5 had no suffix and remains unchanged.
- Affected rows: 32.

| Row IDs | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.6 | `2f4e6b5` (`2f4e6b5caada801218bfe6fdde7ee4889549a855`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
| 2.1–2.5 | `4729a6f` (`4729a6f41cf4dafb99c5ef03f24f44034def671a`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
| 3.1–3.5 | `46a09f7` (`46a09f72656f6a91154bdb4548072a4c561bdadc`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
| 4.1–4.5 | `75a5b09` (`75a5b09fdb0e5ad44dca4a2381a6d3f40b5bf608`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
| 5.1–5.5 | `2cf0338` (`2cf033842589eb503cfae7827dca55fa556f9bf3`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
| 6.1–6.4, 6.6–6.7 | `dc02ae8` (`dc02ae89a3e807ef9c926fd8b7b0944520e9c962`) | `e56366419206b4794dda2d16f1f7b35bb4c1c8d4` |
