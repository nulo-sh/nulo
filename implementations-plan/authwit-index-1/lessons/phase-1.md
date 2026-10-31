# authwit-index-1: phase 1 (arc 1)

- Red proofs: the composition case and the held-History unit case fail with the base `sentTxRecorder`; the held-read case fails with only the commit-time recheck removed; the entry case fails with only the entry check removed (it asserts no row was prepared).
- `bun run test` was red once on `scripts/type-roles/inventory.test.ts`: it pins the digest of `auth-registry/service.ts` as a producer file. Re-attested (the two `send_transaction` sites and the evidence line are untouched by this diff), then re-pinned by hand; the test has no generator.
- Codex fix R1 (gpt-6.1-sol, high, read-only): changes needed, docs only. Accepted: the recorder's doc says the grants can land, not that they are live; the helper's doc drops the restated precedence.
- Opus fix R1 (general-purpose, beside Codex): changes needed. Accepted: the entry-refusal test also passed without the entry check, so it now asserts `prepare` was never called; the same two doc points; `spec.ts`'s `pending` doc matches the reconcile doc. Noted, no change: a send whose owning account is gone now leaves a pending row History refused (D3 keeps the epoch as the only check).
