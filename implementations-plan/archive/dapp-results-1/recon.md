# dapp-results-1: recon

Base: `origin/dev` at `563b0627`. One Explore agent (sonnet) plus direct reads.

## What the tree already does (merged in #701, plan `archive/dapp-boundary-1`)

- **A dApp's `simulateTx` answer is rebuilt from an allowlist** (`apps/extension/src/wallet/services/execution/app-facing-results.ts:27-37`). Every call, recursively, gets `partialWitness: new Map()`, `newNotes: []`, `acir`/`vk` empty, and only four public-input fields (`:39-61`). `executeAztecSimulateTx` returns `toAppFacingSimulationResult(...)` on every route a dApp's simulation takes (`view-executor.ts:234`).
- **A dApp's `profileTx` is refused before any work** (`view-executor.ts:387-390`, `UnsupportedMethodError.forMethod("profileTx")`). No profile mode runs, so no kernel witness is computed for a dApp.
- **Tests on the serialised wire exist.** `app-facing-results.test.ts` seeds a unique value into every emptied field at depth 0, 1 and 2, serialises through `toJsonSafe`, and asserts no value survives; the dApp schema parse is the success control. `view-executor.test.ts:420-434` refuses `gates`, `execution-steps` and `full`, asserts no fence, build or `pxe.profileTx`, and controls with a simulate build.
- **The wallet's own consumers keep the full result**: they call `pxe.simulateTx` directly, outside `executeAztecSimulateTx` (dapp-boundary-1 plan, Fact 4).

## The redactor

- `REDACTED_KEYS` (`apps/extension/src/wallet/logger/utils.ts:83-120`) already holds `partialWitness`, `acir`, `vk`, `publicInputs`, `authWitnesses`. It does not hold `witness`, `newNotes` or `taggingIndexRanges`.
- `trim()` matches a key exactly (`utils.ts:261`) and prints a `Map` as `[Map(n)]` (`:204`). Upstream `NoteAndSlot` is a class holding `Fr` values, and `TaggingIndexRange` an object type holding an `AppTaggingSecret` instance. Nulo's own `Note` shape rule (`utils.ts:229-246`) is for the wallet's `Note` type, so for those two a key rule is what applies.
- No proof-material key has a kebab-case twin. Kebab-case exists for keys of exported backup JSON (CLAUDE.md § Logging policy); no backup slice carries a witness or a note list.
- The static guard (`apps/extension/src/utils/log-payload-ban.test.ts:83`) builds its names from `REDACTED_KEYS`, so a new key extends it with no edit; `:872` asserts the parity. It blanks string-literal text before matching (`stripNoise`, `:173`), and matches names on word boundaries (`:361`).
- Tests: `apps/extension/src/wallet/logger/utils.test.ts:67-70` covers the five proof-material keys in one test.

## dApp routes (all 20 methods in `packages/wallet-bridge/src/method-descriptors.ts:120-290`)

- No answer carries a kernel witness or a populated execution intermediate. `simulateTx` returns the rebuilt result with every such field empty (`view-executor.ts:233-234`), and `toAppFacingSimulationResult` has that one caller. `createAuthWit` returns the authentication witness it was asked for, by design (`execution/service.ts:1230`). `sendTx` returns `{ txHash | receipt, offchainEffects, offchainMessages }` (`dapp-send-executor.ts:1088-1093`, `:1251-1256`); the proven `Tx` stays in `ExecutionCoordinator` (`execution-coordinator.ts:331-355`). `executeUtility` returns `UtilityExecutionResult` (`result`, `offchainEffects`, `anchorBlockTimestamp`, `stats?`).
- `batch` legs re-enter `dispatch` (`dispatcher.ts:466-473`), so a `simulateTx` leg is reduced and a `profileTx` leg refused; `sendTx`, `registerToken` and `grantPublicAuthwit` are refused as legs.
- `pxe.profileTx` has one non-test caller, `PxeService.profileTx` (`packages/aztec-runtime/src/pxe/service.ts:627`), and nothing in `apps/extension/src` or `packages/*/src` calls `PxeClient.profileTx`.

## Paths from a result to a log line

- `trim()` runs on every entry: in `LoggerStore` (`wallet/logger/store.ts:76`), in the page logger client before the port (`wallet/services/logger/client.ts:51`), and with `scrubHex32` in the PXE frame (`offscreen/frame-logger.ts:9`).
- No wallet log call passes a simulation or profile result, a private execution result, `newNotes`, a witness, a proving result, a `Tx` or a whole envelope. Read: `view-executor.ts`, `dapp-send-executor.ts`, `authwit-discoverer.ts`, `discovery-probe.ts`, `batched-view-simulation.ts`, `execution-coordinator.ts`, the execute window, `extension-messaging` base service and client, `wallet-sdk/background.ts`, `wallet-bridge/dispatcher.ts`.
- The notes developer page passes a whole wallet `Note` to `console.warn` on a render failure (`popup/pages/settings/developer/account-state/notes/index.vue:82`). `NoteService` always sets `contract`, `storageSlot`, `txHash` and `rawContent` (`note/spec.ts:4-24`), so `trim()`'s `Note` rule collapses it. Holds; no change.
- Upstream loggers emit `warn` and above in the bundle (`vite.shared.ts:48-50`); the PXE's note and storage-value lines are `debug` and flattened strings, so off and out of reach of any key rule.
- No non-test identifier or key named `witness`, `witnesses`, `newNotes`, `taggingIndexRanges`, `partial-witness` or `new-notes` sits near a log call; the names appear only in comments and copy, which the guard blanks. Adding them to the set flags no existing line.
