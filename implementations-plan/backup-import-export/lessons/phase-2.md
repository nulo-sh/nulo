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
| dApp-supplied fee payload through the PrivateFPC, or a dApp utility on it (its `balance_of` is `abi_utility`), before discovery has run | resolver | no: discovery runs only from popup code (`stores/balances.store.ts`, the settings pages, `gas-balance-reader.ts`), never on the dApp RPC path (Opus) | needs the contract; read first when the popup has not run discovery |
| The batched view's slow arm during a popup balance refresh (Opus) | `batched-view-simulation.ts` → `buildTxExecutionRequest` | registers the account contract as a side effect | incidental: popup-driven, not ordered before any dApp RPC |

### Verdict

The proof fails. A connected dApp granted `simulation.utilities` over the account (`method-scope-checkers.ts` `checkExecuteUtility`) that calls `executeUtility` on the restored account before an earlier build or an explicit registration has registered it reads the account contract first: `resolveInstance` misses in the PXE, the node has no instance, the known bundle has none, and the call fails with "Contract instance not found". Today the slice registers the account contract during the restore, so the same read executes. Upstream's `runUtility` also refuses a contract its local store lacks ("the contract is not registered", `@aztec-labs/pxe` 6.0.0-rc.1 `contract_function_simulator.js`), so the answer would not change if the node did serve the instance.

Consequence: with the skip, between a restore and the account's first build on the new install, a dApp's `lookupValidity` reports a valid private authwit as invalid (aztec.js swallows the error), a dApp authwit request over a call to the account is refused, and a tx naming another own account fails; today all three work after the restore for every account the old install had registered. No skip was built: the trace refuted it before any code, so there is nothing to revert.

### Panel

- Codex (gpt-6.1-sol, high, read-only; session 01a13b50-46b7-7b00-b97d-40b7f8edd03a): the proof fails (high confidence); it added the explicit-target tx build, the call-intent authwit, `getPrivateEvents` and the two probes above; it confirmed the composition matrix cannot be built (COMPOSITION-TESTS.md D2, D3, D6) and recommended a unit failure/control pair over the real `ContractResolver` and no e2e for the failure exit.
- Opus 5.5 (Plan lens): the verdict stands; only three paths register an own account contract (`buildTxExecutionRequest`, `buildNoFrom`, the restore). It added the slow-arm row, verified the sponsor row, agreed to drop the e2e (the owner's rule puts the burden on the skip; the plan's scenario cannot tell the two cases apart; the only discriminating real-PXE run is a direct `executeUtility(lookup_validity)` before any send, since `lookupValidity` swallows the error), and asked for four fixes, all taken: the stubbed account is the target itself, `ensureContractRegistered` is asserted uncalled, a line says what the stub's `undefined` stands for, and the comment says the lookup fails rather than "resolves", naming the protocol sponsors.
- The unit pair proves Nulo's ordering (the read registers nothing); upstream's refusal of an unregistered contract is read from its source (`pxe.js` syncs the target first and `contract/helpers.js` throws; `runUtility` refuses too), since the `executeUtility` stub answers either way.

### Tests that document the order

- `view-executor.test.ts`: `executeAztecExecuteUtility` on an own account the PXE does not hold registers the account's keys, refuses with `ContractNotRegisteredError("Contract instance not found")`, and registers no contract and runs nothing; once the PXE holds it, the same read runs (control). It uses the real `ContractResolver`, so the refusal is the production one.
- The plan's step 2 (composition tests, one per class of read) is not buildable: COMPOSITION-TESTS.md, which is normative, excludes tx builds (D3), FpcService discovery (D6, bb), the gas-balance read (D2) and selector-bound views (D6). The unit pair replaces it (D-arc2-1).
- No `restore-skip-proof.test.ts` (D-arc2-2). The plan's step 5 stops at the counterexample. Its e2e scenario (restore a used account, read private and fee balances, send through a sponsor) would pass with the skip on: every one of those reads registers first, so it could not have caught the failing read. A real-PXE run of the failing read adds no evidence the trace lacks: the wallet path registers nothing (unit-pinned) and upstream's `runUtility` refuses an unregistered contract whatever the node answers.
- `precheckContractAddress` states the invariant in one sentence.

## Phase 2.4 (#147, chain 0 in the backup)

- Unit: `account-state/service.test.ts` runs `backup()` over a real `NetworkService` and a fake node: an edited Local Network (kind `local`, chain 0, a non-seed URL) whose node answers travels as its own chain-0 item; a custom network answering for another chain on the same URL stays out (control). Red with the kind hint removed, green with it.
- **`tests/e2e/network/backup-edited-local-network.test.ts`** (the runtime budget):
  - Failure mode: a Local Network edited off its seeded URL, whose node answers, reads red in the header and is left out of the full backup.
  - Why not cheaper: the unit layer pins the status rule against a fake node and the backup gate over that rule; only the browser runs the real endpoint edit (its own kind-hinted identity probe), the header's status sync, the export and a real node together, so only it shows the screen and the file agreeing.
  - Shape: on `localNetworkExtension`, the endpoint is edited from `localhost` to `127.0.0.1` (the same sandbox under another URL), the header's `data-status` must read `active` on a fresh popup, and the exported backup's only chain-0 item must be that network's.
  - Runtime: estimated 30 s; measured 18.4 s (Chrome, retry 0, the file alone). Red-check: a scratch worktree at 1406a8b with only the kind hint removed fails on `expected 'invalidchain' to be 'active'`.
  - No sandbox config fails the test (an assertion) instead of skipping it (D-orch-7).
  - Its declared budget is 120 s, not the suite's 30 s default: vitest 4 times the fixture's setup inside the test (`withTimeout(withFixtures(…))` in `@vitest/runner`), the 18.4 s includes the launch, and CI runners are 3-5x slower. Codex round 1 read the first draft's 300 s as a raised timeout; it was the declared budget, tightened to 120 s.

## Arc gate (Phase 2.4)

- Network, Chrome, retry 0, default build: `backup-restore-integrity` 62.7 s, `backup-import-stalled-network` 95.5 s, `backup-edited-local-network` 15.6 s (5/5); `import-handshake-note` 2/2 (85.9 s) on a proverless build, as D-arc1b-3 runs it.
- The first smoke leg failed `import-dead-rpc.test.ts` 3/3 with the stub seeing no request: the dist was the proverless network build, its Local seed stamped `http://localhost:25929`, so the spec's interception of `localhost:8080` never matched. Environmental; the armed smoke build (the setup's `ARMED_BUILD` line) is the one a smoke run needs after any `e2e:agent` run in the same worktree.
- Rerun on the armed smoke build, Chrome, retry 0: `import-dead-rpc` 7/7, `backup-roundtrip` 1/1, `endpoints` 6/6.

## Review loop

- Codex round 1 (session 01a13b65) and the Opus diff review: approve with fixes; A2-1 to A2-7 in plan.md § Audit verdicts. The Opus race finding (A2-3) is real: `syncNetworkStatus` sets `sync` before each probe, and startup calls it from the network watch and from the profile bootstrap, so a settled status can go back to `sync` between a wait and a later read.
- After the fixes, retry 0: Chrome 22.8 s, Firefox 19.7 s. Codex round 2 clean.
