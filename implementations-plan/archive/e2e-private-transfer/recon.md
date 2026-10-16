# e2e-private-transfer recon

Base: `origin/dev` at 8459699c. One Explore agent (sonnet) plus the planner's own reads. Paths under `tests/e2e/` are in `apps/extension/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Playground control for a private transfer | `apps/playground/src/sections/transactions.ts:22-36,51` (`pg-select-transferFn`, four functions, default `transfer_public_to_public`, feeds `pg-btn-sendTx-default` only) | already exists (#293) |
| Network e2e asserting a private transfer's row | `tests/e2e/network/tx-transfer-row.test.ts:90-117` (`PRIVATE_KINDS`: label, `data-intent-kind="transfer"`, sender kind, `5 TST`) | already exists (#293) |
| Publish `PublicChecks` on the local network | `tests/e2e/fixtures/aztec.ts:830` `ensureStandardPublicChecks` (check, then publish class and instance) | reuse as-is |
| Delegated pull rig | `tests/e2e/fixtures/aztec.ts:782` `deployDelegatedPullRig(config, donor, donorMint)` | reuse as-is |
| Contract instance as playground JSON | `fixtures/selfpay-phase.ts:27` `serializeInstance` (four callers); copies in `type-roles-windows.test.ts:228`, `tx-sendTx-delegated-authwit.test.ts:73-82`, `contracts-register.test.ts:44` | reuse as-is (the explorer missed it; found while folding the audits) |
| Cap grant, playground inputs | `fixtures/extension.ts:535` `grantCapBundle`; `fixtures/playground.ts` `setPgInput`, `setPgTextarea` | reuse as-is (the delegated file hand-rolls both today) |
| Import a token held only privately | `fixtures/helpers.ts:970` `importToken` (toast gate); `:1872` `waitForFreshBalanceRow({ expectedPublicRaw, expectedPrivateRaw })`; `importTokenAndWaitForBalance` asserts the public side only | reuse (compose; do not widen the helper) |
| Discovered-authwit structured rows | `OperationCard.vue:162-169,272`; `CallArguments.vue:36-80`, prefix `execute-discovered-authwit` | reuse; testids exist |

No `build new` row.

## Facts the plan rests on

- `isToken` is a persisted token row for the window's chain (`OperationCard.vue:118`, `call-surface.ts:60-67`). The execute window reads the list once at open (`execute/index.vue:286,450,701`). A contract the dApp only registers is decoded but not read as a transfer.
- `callSurface` reads a transfer only when the selector equals the vocabulary's own and the ABI names fit the roles (`call-surface.ts:99-125`). `transfer_in_private/4` is `0xd73354bc` (`utils/token-transfer-vocabulary.ts:94`), pinned against the sample Token by `token-transfer-vocabulary.real.test.ts`.
- `Crowdfunding.donate(amount)` calls `transfer_in_private(donor, self.address, amount, 0)` (the rc.3 artifact's embedded source). A zero nonce shows no nonce row (`call-surface.ts:82`).
- The decode of a discovered authwit runs on its consumer, the pull token (`src/wallet/services/execution/service.ts:779`); the playground's delegated button registers both instances with their artifacts (`transactions.ts:248-255`).
- The 6.0.0-rc.3 local network publishes only AuthRegistry at boot (`aztec/dest/local-network/local-network.js:176`). The archiver preloads standard contracts only under `TEST_PRELOAD_STANDARD_CONTRACTS`, which the harness does not set.
- Network e2e files run one at a time (`vitest.e2e.network.config.ts:24`), each run on its own network. `ensureStandardPublicChecks` has one caller today (`type-roles-windows.test.ts:239`).
- CI runs the network shards proverless (`pr-extension-network-e2e.yml`, `proverless: true`); the canary lane proves for real. Firefox has the same partition. Neither file of this lane is in an exclude or canary list.

## Lower layers already pinned

- `OperationCard.discovered.test.ts`: summary rows, the toggle, decoded and undecoded details, and a registered token's `transfer_private_to_public` read as structured rows (fixture data).
- `call-surface.real.test.ts`: the real Token's selector and decoder through `callSurface`.
- `discovery-probe.test.ts`, `strategies-structural.test.ts`, `dapp-send-executor.test.ts`: discovery and the folded estimate, on fake simulators.

None of them runs the real simulator against a deployed consumer, so none proves that a real delegated pull discovers a `transfer_in_private` authwit whose decode the window reads as a transfer.

## Collisions and absences

- Open issues searched: `gh issue list --state all --search "delegated authwit e2e"`, `"PublicChecks"`; closed known limits: `--label known-limit --search "authwit discovered"`. Only #165 and the closed #365, #430 touch the area; #430 (Testnet lacks the standard contracts) does not bear on the local network.
- No other private-transfer control in the playground (searched `private|transfer_` and `pg-(btn|select)` names under `apps/playground/src`).
- No per-file runtime script: the vitest default reporter prints file durations; the suite envelope comes from the `e2e-testing` skill's `gh run view` one-liner.
