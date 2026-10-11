# Phase 2: the pins, the sites, the helper

## Step 1: the pins (22 of 28 lines)

| Line | Test file | Case |
|---|---|---|
| `wallet/logger/console-forwarding.ts:21` | `console-forwarding.test.ts` | existing; expected arguments only |
| `FeeSettingsCard.vue:383` (send pick save) | `FeeSettingsCard.test.ts` | new: "a pick whose save fails is logged under a named key" |
| `FeeSettingsCard.vue:705` (init) | same | existing: "an init that throws stops the rows loading…" |
| `FeeSettingsCard.vue:731` (recovery recommit) | same | new: "a recovery recommit whose storage read fails…" |
| `network-unavailable/index.vue:82` | `network-unavailable/index.test.ts` | new: "an init that fails is logged under a named key" |
| `discover/index.vue:89`, `:115` | `discover/index.test.ts` | existing tests 9 and 8 |
| `capabilities/index.vue:178` | `capabilities/index.test.ts` | existing A4 (init throws) |
| `capabilities/index.vue:333` | same | new: "an approve refused with any other error…" |
| `export/full.vue:413` | `export/full.test.ts` | new: "a download that fails is logged under a named key" |
| `utils/files.ts:181` | `files.settle.pins.test.ts` | existing; `expect.anything()` became `{ error: expect.any(Error) }`, message check kept |
| `full-backup-restore.ts:761` | `useFullBackupImport.stages.test.ts` | existing: "liveness-gate read failure fails CLOSED…" |
| `full-backup-restore.ts:769` | same | existing: "a PRE-finalize mid-flight throw rolls back…" |
| `useFullBackupImport.ts:458` | `useFullBackupImport.test.ts` | existing: "a rejected completeImport keeps status 'finished'…" |
| `useFullBackupImport.ts:509` | `useFullBackupImport.stages.test.ts` | existing: "a throwing pick surfaces the read-failure copy" |
| `useContactImportExport.ts:130` | `useContactImportExport.test.ts` | existing export case |
| `note/service.ts:132` | `note/service.test.ts` | existing (`brokenNoteDao`); `makeService` exposes its real `LoggerStore` |
| `aztec-runtime/src/pxe/service.ts:1006` | `pxe/service.test.ts` | existing: "any OTHER op failure still logs at ERROR" |
| `balance-projector.ts:160` | `balance-projector.test.ts` | existing; `makeProjector` takes an optional real `LoggerStore` |
| `execute/index.vue:386` | `execute/index.test.ts` | existing metadata prefetch case; `{ error: expect.any(TypeError) }` (the engine's TypeError text is not pinned) |
| `wallet/runtime.ts:394`, `:433` | `runtime.test.ts` | new describe, one case each; a sentinel in the reason is absent from every logged argument, and the persisted status still carries the reason (the success control) |

The degraded case stops the boot with a Barretenberg rejection right after the outcome, so it stays in the pre-registration zone the file's header promises.

Lines no test file reaches (no new file, D6):

- `offscreen/index.ts:51`, `wallet/index.ts:73,100,112`: no test imports either entry module; smoke boots both without driving these branches.
- `export/account.vue:192`, `account-state/notes/index.vue:82`: no test mounts either page.

All six are covered by the scanner (the four `getErrorData` lines and the `.message` read at `account.vue`) or by nothing but review (`notes/index.vue`, an alias site).

## Step 2: red on the unfixed lines (helper still present)

22 assertions red, each on its own diff:

- 14 show the old string as the argument (a stack for the `getErrorData` sites, the bare message for the `.message` sites, `"store exploded"` for `pxe/service.ts`, `"decode failed"` for the note service), e.g.:
  ```
  -     "Capabilities window init failed",
  -     { "error": Error { "message": "profile-fetch-failed" } },
  +     "Error: profile-fetch-failed
  +     at …/capabilities/index.test.ts:305:9
  ```
- 6 find no call under the new message, because the old line carried the error text inside the message or had no message (`full-backup-restore.ts:761,769`, `balance-projector.ts:160`, `execute/index.vue:386`, and the two runtime lines, whose diff shows the reason in the message: `"Storage migration blocked boot (failed): Unexpected token … row-sentinel"`).
- `console-forwarding.test.ts` shows the stack where `"unhandled rejection", { error }` is expected.
- `files.settle.pins.test.ts` shows `"inflate failed"` where `{ error: Any<Error> }` is expected.

Runs: `cd apps/extension && bun run test -- <the 15 files>` (`7 + 5 + 7 + 2` red across four calls) and `bun run --cwd packages/aztec-runtime test -- src/pxe/service.test.ts` (1 red).

## Step 3: green

After the 28 site edits, with `getErrorData` still exported: the 15 extension files `505 passed (505)`, including the scanner's whole-tree test; `pxe/service.test.ts` `13 passed (13)`.

## Steps 4 to 6

- `getErrorData` deleted from `packages/wallet-core/src/utils/errors.ts`; its seven imports removed (and the empty `/** Utils */` header it left in `network-unavailable/index.vue`). `rg -n 'getErrorData' apps packages scripts` lists only `log-payload-ban.test.ts`.
- CLAUDE.md § Logging policy: one sentence (D-orch-4).
- Gate: `bun run lint` exit 0 (27 warnings, 3 infos, all outside the touched files; `biome check` on the 36 touched files reports none), `bun run typecheck:all` exit 0, `cd apps/extension && bun run test` exit 0 (740 files passed, 3 skipped; 11246 tests passed), `bun run --cwd packages/aztec-runtime test` exit 0 (389 passed, 2 skipped), `bun run --cwd packages/wallet-core test` exit 0 (278 passed).

## The two commits

The sites commit carries no scanner change. Nothing imports `log-payload-ban.test.ts`, and the old scanner refuses a subset of what the new one does (the new rules only add hazards; the narrowed allowlist only removes exemptions), so the sites commit is green whenever the head is. The scanner commit can be checked alone against it: on the sites commit's tree the new scanner reports nothing, and on the plan base it reports the 21 lines of `phase-1.md`.
