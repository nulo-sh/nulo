# Arc 2: implementation log

## Start (2026-10-14)

- Arcs 1 (#246) and 1b (#247) merged into `dev` (squash). Arc 2 branches from `origin/dev` d3dc441 as `backup-import-export-arc-2` (D-orch-4) and opens as one plain PR against `dev` (D-orch-5). P1-05 approved as proposed (2026-10-14, the `## Decision` block on #191, #221 and #147).
- Facts re-verified at d3dc441 (the plan's were read at f15a9b5). F13 holds: `getNodeStatus` calls `_getChainId(primary.rpcUrl)` without the kind hint (now `network/service.ts:752-767`, with a comment stating the gap); `probeNodeStatus` applies `isLocalNetworkTarget` (`:778`). F14 holds: the slice is `non-storage`, `precheckContractAddress` skips `isPxeProvidedAddress`, the cap is `40 * 1024 * 1024` code units (`normalize.ts:34`), its comment at `:21-33`. The `(BUG PIN)` is at `network/service.test.ts:1606`; the dead-URL and public InvalidChain controls the plan asks for already exist beside it. The header dot is a bare `<div>` inside the testid'd `network-button`, so `data-status` goes on the button.

## Phase 2.1 (#147, status)

- `getNodeStatus` passes `network.kind`; the `(BUG PIN)` flipped to "a local-kind network on a non-seed URL whose node answers is Active on both". `Header.vue` computes the status key once and uses it for the dot's class and the chip's `data-status`; `Header.test.ts` pins the attribute.
- Gate: lint 0, `typecheck:all` 0, `src/wallet/services/network/` + `src/components/` 76 files, 1101 tests passed.

## Phase 2.2 (#191, export)

- `backupNetworkState` skips `isPxeProvidedContract(c)` before `getContractInstance`. The string form (not `isPxeProvidedAddress`) because `getContracts` returns strings and a spelling the parse refuses stays work, as on the import side. The `normalize.ts` cap comment now says what is true: the export leaves them out, an older backup still carries them, and its measured 33.8M is why the bound cannot come down. `pxe-provided.ts`'s header said "a backup still carries them"; reworded.
- Old-shape import: `restore-surface.pins.test.ts` already pins the skip of a protocol and a preloaded address with a custom sibling registered; unchanged and green.
- New test: a protocol address and the AuthRegistry address are left out before their instance is read; a custom contract is kept (control). Red with the filter line removed (1 of 22), green with it.
- Gate: lint 0, `typecheck:all` 0, `account-state/` + `importChainSync.test.ts` 5 files, 67 tests passed.

## Phase 2.3 (#221, the proof)

### Inventory: every PXE call that can name a profile account or a protocol sponsor after a restore

Restore state: a fresh install, a new profile with its own PXE store, the account rows restored, no FPC row (the `fpc` slice is retired, backup README "Retired slices"), and, with the skip, neither the account contracts nor the sponsors registered from the slice. The account contract is initialized by its first send but never published (`nulo-account.ts` `ensureContractRegistered`), so the node never serves its instance; the PrivateFPC is never deployed and is not a known-bundle instance (`known-artifacts.ts` carries only SponsoredFPC).

| Read | Path | Registration before it? | Class |
|---|---|---|---|
| The sender's own entrypoint in any tx build (wallet send, dApp `sendTx`/`simulateTx`/`profileTx` standard path, fee estimation, the batched view's slow arm, `buildNoFrom`) | `NuloAccount.buildTxExecutionRequest` / `tx-request-builder.ts` `buildNoFrom` | yes: `ensureContractRegistered` (pxeOnly probe, then `registerContract`) runs first | needs the contract; ordered |
| A tx build whose actions or authwit intents name an own account explicitly (Codex) | `tx-request-builder.ts` `resolveBuildContext` (`:248-250`) | **no**: action targets resolve before `buildTxExecutionRequest` registers the sender | needs the contract; **read first** |
| dApp `createAuthWit` with a call intent whose target is an own account or the PrivateFPC before discovery (Codex) | `execution/service.ts` `resolveAuthWitMessageHash` (`:1172`) | **no**: reads the instance and fails closed ("Contract not found") | needs the contract; **read first** |
| dApp `getPrivateEvents` on an own account or the PrivateFPC (Codex) | `view-executor.ts` `executeAztecGetPrivateEvents`; upstream syncs the target before reading | no | needs the contract; read first |
| Display decoding of a call's target; a developer notes read of an explicit contract (Codex) | `execution/service.ts` (`:785`) artifact lookup; `note/service.ts` `getNotesRaw` | — | probes: an unregistered target decodes raw or lists nothing |
| dApp `executeUtility` with `to` = an own account (aztec.js `lookupValidity` calls the account's `lookup_validity`) | `view-executor.ts` `executeAztecExecuteUtility` | **no**: it registers the account's keys (`ensureRegistered`), then `resolveInstance` (PXE, node, known bundle), and never registers the target | needs the contract; **read first** |
| dApp `simulate_utility` on an own account | `executeSimulateUtility` | **no**: `resolveInstance` throws before its own `registerContract` | needs the contract; **read first** |
| dApp utility calls inside a batched view (`simulateTx`'s utility legs) on an own account | `batched-view-simulation.ts` `resolveBatchContracts` | **no**: `resolveInstances` throws before `ensureContractsRegistered` | needs the contract; **read first** |
| dApp `getContractMetadata` / `getContractClassMetadata` on an own account or a sponsor | `view-executor.ts` (pxeOnly) | — | probe: reports "not registered", as a recovery-phrase import does |
| Developer notes viewer | `note/service.ts` `fetchKnownContractsNotes` | — | probe: lists only registered contracts |
| Gas balance, private leg (PrivateFPC `balance_of`) | `gas-balance-reader.ts` | yes: `getFpcs` discovers the missing row and `registerContract`s before the row exists | needs the contract; ordered |
| Wallet fee payment through a PrivateFPC or SponsoredFPC row | `fpc-strategy.ts` → `buildStandard` → resolver | yes for a restore: a protocol row exists only through discovery, which registers first; SponsoredFPC also resolves from the node and the known bundle | needs the contract; ordered |
| dApp-supplied fee payload through the PrivateFPC, or a dApp utility on it, before discovery has run | resolver | no (plausible, unverified: discovery usually runs when the popup opens after the restore) | needs the contract; read first when discovery has not run |

### Verdict

The proof fails. A connected dApp granted `simulation.utilities` over the account (`method-scope-checkers.ts` `checkExecuteUtility`) that calls `executeUtility` on the restored account before an earlier build or an explicit registration has registered it reads the account contract first: `resolveInstance` misses in the PXE, the node has no instance, the known bundle has none, and the call fails with "Contract instance not found". Today the slice registers the account contract during the restore, so the same read executes. Upstream's `runUtility` also refuses a contract its local store lacks ("the contract is not registered", `@aztec-labs/pxe` 6.0.0-rc.1 `contract_function_simulator.js`), so the answer would not change if the node did serve the instance.

Consequence: with the skip, between a restore and the account's first build on the new install, a dApp's `lookupValidity` reports a valid private authwit as invalid (aztec.js swallows the error), a dApp authwit request over a call to the account is refused, and a tx naming another own account fails; today all three work after the restore for every account the old install had registered. No skip was built: the trace refuted it before any code, so there is nothing to revert.

### Panel

- Codex (gpt-6.1-sol, high, read-only; session 01a13b50-46b7-7b00-b97d-40b7f8edd03a): the proof fails (high confidence); it added the explicit-target tx build, the call-intent authwit, `getPrivateEvents` and the two probes above; it confirmed the composition matrix cannot be built (COMPOSITION-TESTS.md D2, D3, D6) and recommended a unit failure/control pair over the real `ContractResolver` and no e2e for the failure exit.

### Tests that document the order

- `view-executor.test.ts`: `executeAztecExecuteUtility` on an own account the PXE does not hold registers the account's keys, refuses with `ContractNotRegisteredError("Contract instance not found")`, and registers no contract and runs nothing; once the PXE holds it, the same read runs (control). It uses the real `ContractResolver`, so the refusal is the production one.
- The plan's step 2 (composition tests, one per class of read) is not buildable: COMPOSITION-TESTS.md, which is normative, excludes tx builds (D3), FpcService discovery (D6, bb), the gas-balance read (D2) and selector-bound views (D6). The unit pair replaces it (D-arc2-1).
- No `restore-skip-proof.test.ts` (D-arc2-2). The plan's step 5 stops at the counterexample. Its e2e scenario (restore a used account, read private and fee balances, send through a sponsor) would pass with the skip on: every one of those reads registers first, so it could not have caught the failing read. A real-PXE run of the failing read adds no evidence the trace lacks: the wallet path registers nothing (unit-pinned) and upstream's `runUtility` refuses an unregistered contract whatever the node answers.
- `precheckContractAddress` states the invariant in one sentence.
