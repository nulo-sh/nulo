# Post-implementation: review loop

- 2026-10-31 Opus diff review: approve. One stale header line in `reaper.ts` (the periodic tick's `stuck_queued`), fixed.
- 2026-10-31 Codex round 1 (gpt-6.1-sol, high): changes requested.
  - Adopted: the playground suite died on import with the transpiler cache off. Under `NODE_ENV=test`, `@aztec-labs/foundation`'s bn254 module calls `expect.addEqualityTesters`, which Bun's `expect` lacks. A warm cache hid it locally; a fresh CI runner would not. The test now mocks that module. Verify a `bun test` suite with `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`.
  - Adopted: two comments that restated their code, deleted.
  - Not adopted: a disconnect overriding a recorded estimate refusal. A refused request ended by close, lock or switch already reads as its refusal (`service.test.ts`, "a refused request ended by a %s"). Every one of those kinds is "refused before sending", and the specific refusal says more. `disconnect` joins that pin.
- 2026-10-31 Codex round 2 (resumed): approve. Fixes verified; the playground suite passes with the cache on and off; the disconnect refusal-precedence pin accepted.
- 2026-10-31 CI: `quality-status` red on the audit gate. The playground's `package.json` and the `bun.lock` change put it in enforce mode (assumption I2), and ten advisories published since the plan had no ack. A local `bun audit` in Phase 3 would have caught it. Fixed first: `qs` 6.16.1 (published 2026-10-14; `bun pm diff` shows no new script or runtime dependency). Acknowledged per SECURITY.md: none of the packages is in either zip (THIRD-PARTY-NOTICES.txt), and none can move yet.
  - `follow-redirects` waits for 1.16.2 to clear the age gate.
  - `systeminformation` and `undici` are exact pins inside existing groups.
  - `glob` and `minimatch` need majors their dependents' ranges refuse.
  - Gotcha (Bun 1.4.2): `bun audit fix` wrote `follow-redirects` 1.16.2 into `bun.lock` while labelling it "newer than --minimum-release-age", bypassing the age gate. That line was reverted by hand. Read its `bun.lock` diff before committing.
- 2026-10-31 Codex round 3 (resumed, the audit-gate commit): approve.
