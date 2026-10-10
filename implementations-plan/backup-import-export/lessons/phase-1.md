# Arc 1: implementation log

## Start (2026-10-09)

- Merged `origin/dev` at ac259a7 (the accessibility-1 close-out). One conflict, `implementations-plan/index.md`: dev archived accessibility-1, this branch added its own line; kept this lane's line only.
- Orchestrator decisions D-orch-1 (no stack; arc 1 is a plain PR on `dev`) and D-orch-2 (arc 1 only) recorded in the decision ledger.

## Phase 1.1 (#207)

- `resolveFullBackupEnterAction` now takes the page's `FullBackupCtaSource` and reads its four fields once, up front, as before; the fixed-order read pin gains `isAllowedToImportBackup`.
- Both new page cases (failed restore, incomplete form) fail on the old resolver (checked by swapping the old `import.vue` and resolver back in).

## Phase 1.2 (#223)

- The parked-construction case snapshots each wiped buffer at its wipe, so the control (each held key material) and the never-happens (each is zero while construction waits) read the same buffers.

## Phase 1.3 (#203)

- `fromHex` also refuses a non-string (an array `["0a"]` would otherwise pass the regex through `toString`).
- The non-string MAC case passes on the old code as well (the old `catch` returned `false` for `42` and `null`, and `[1, 2, 3]` decoded to three bytes that fail verification). It pins the explicit refusal, not a fix.

## Phase 1.4 (#226)

- Deviation: `RestoreData.profile` is `profile?: unknown`, not `profile: unknown`. The stage helpers take `Record<string, unknown>` and pass it on as `RestoreData`; a required key breaks that assignability, and an optional `unknown` claims the same nothing.
- `BackupProfile` (`{ id; name; type }`, all `unknown`) is the restore's read; it becomes `ProfileInfo` only in `restoreProfileStep`, at the RPC.
- The id rule lives in `isGeneratedProfileId` beside `PROFILE_ID_HEX_LENGTH` in `repository.ts`, so the generator and the check share the length.

## Phase 1.5 (#146)

- A watchdog failure carries the migration's own `breaking` flag (`defineMigration` defaults it to `true`), like any other `up()` failure.
- If the restore itself fails after a timeout, the reason reads "failed to restore after migration N failed: … (migration error: migration N was interrupted mid-write (restored cleanly))". That nesting already exists for any `up()` error; reaching it needs storage to fail during the restore. First left as is, then fixed in review (A1-2): the inner text now stops at "interrupted mid-write".
- The parked-read case fails when the post-await re-check in `StagingArea.value` is removed (mutation checked once).
- `registry.test.ts`: a `SEEDS` map keyed by migration object holds a pre-shape seed for each migration under test; a migration with no seed fails the check, so the first real migration adds its seed in the same PR. Each run must end `migrated`, and the first run must change the seed.

## Arc gate (2026-10-09)

- `bun run audit:vue`: pass (extension 715 files, 10737 tests). `bun run test:all`: pass.
- Smoke at retry 0, armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE`, `_TOKEN_SEEDS` pair, `_CSP_REPORT`), run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`: `backup-roundtrip`, `backup-migration`, `import-paths`, `import-errors-scroll`, `passkey-backup`, Chrome 14/14 and Firefox 14/14. Another lane's network drill and a third lane's smoke run were live on the host meanwhile; no red.

## Review loop

- Codex round 1: approve with fixes (one Low). Opus review: approve (three Lows). All four verified and accepted; plan.md § Arc 1 implementation review has the table.
- Codex round 2: clean. Converged in two rounds.
- Final smoke attempt 1 (after review fixes): 13/14 red on both browsers, every launch refused by the CSP check ("the CSP violation recorder never ran"). Cause: my run script passed the armed flags as one zsh string (`env $A` does not word-split), so the build was unarmed. Rerun with the flags as separate assignments.
- Final smoke attempt 2 (armed, bundle grepped for the recorder first): Chrome 14/14, Firefox 14/14 at retry 0.

## CI (PR #246)

- First CI run (d6e291e): smoke green on both browsers; network Chrome red on one leg, `profile-reimport-matrix` "delete → full-backup re-import in one session: the same-id successor boots past the tombstone" (`expected '5c6b2e09' to be 'e91364e0'`); the Firefox network run was cancelled. Cause: the restored-id rule (#226) rerolls the synthetic fixture's `"syn-profile-id"`, so the second import no longer reuses the first import's id. The arc's gates named no network spec, and the Opus review read the fixture id as unasserted; it is asserted by that network leg.
- Fix e00665f (pushed by the orchestrator session into this branch): the synthetic backups carry `SYNTHETIC_PROFILE_ID = "e2e5a1d0"`, generated-shaped, so the same-id leg holds. A file the wallet exports always carries a generated id, so the product behaviour stands.
- Lesson: a change to which ids or keys a restore keeps reaches the network fixtures that re-import one file; grep the e2e helpers for the literal before choosing the arc's e2e set.
