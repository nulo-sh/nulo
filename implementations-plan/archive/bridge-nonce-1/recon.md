# bridge-nonce-1 recon

One Explore agent (sonnet) swept the repo; the driver read the installed Aztec CLI. Base: `origin/dev` at `b3d6e0a2a`.

## L1 signers in the repo

| Site | Account | Evidence |
|---|---|---|
| `bridgeFeeJuice` | anvil index 0 | `apps/extension/tests/e2e/fixtures/aztec.ts:427,433`: `createExtendedL1Client([ANVIL_URL], ANVIL_MNEMONIC, chain)`, no index |
| `bridgeForMint` | anvil index 0 | `apps/extension/tests/e2e/fixtures/aztec-private-fpc-bridge.ts:36,65`: its own `DEFAULT_L1_MNEMONIC`, `opts?.l1Mnemonic ?? …`, no index; mints, approves, deposits (`:84-95`) |

- Nothing else signs L1: `anvil_mine` (`aztec.ts:861-869`) and `anvil_reorg` (`network/stale-anchor-recovery.test.ts:97`, `packages/aztec-runtime/src/pxe/stale-anchor.real.test.ts:180`) are raw RPCs. Playground and `packages/*` build no L1 client from a key.
- No caller passes `bridgeForMint`'s `opts` (grep `l1Mnemonic`, `messagePollTries`: only the definition).
- The mnemonic string is duplicated (`aztec.ts:427`, `aztec-private-fpc-bridge.ts:36`); no shared anvil-account helper exists.

## Callers (network files that bridge)

- `bridgeFeeJuice`: `fundPublicFeeJuice` (`aztec.ts:895`), `setupPreFundedAccount` (`aztec.ts:628`), `feeJuiceReadyExtension` (`fixtures/extension.ts:910`).
- `bridgeForMint`: `setupPreFundedAccount` (`aztec.ts:660`), `bridgePrivateFuel` (`fixtures/selfpay-phase.ts:115`).
- Files: `fee-methods`, `price-fixture`, `same-token-concurrent-sends`, `send-chaos` (through `fixtures/burst-account.ts:92`), `selfpay-phase`, `sim-from-selfpay`, `tx-sendTx-default`, `tx-sendTx-selfPay`, and `store-captures`, which is opt-in (`describe.skipIf(!process.env.STORE_CAPTURES || isFirefox)`, `:397`).
- Files run one at a time (`fileParallelism: false`, `apps/extension/vite.shared.ts:134`); bridges inside a file are awaited in turn (`network/selfpay-phase.test.ts:311-314`), so two fixture bridges never overlap.

## The sandbox's L1 accounts (installed CLI 6.0.0-rc.3, `~/.aztec/versions/6.0.0-rc.3`)

- `node_modules/@aztec-labs/aztec/dest/local-network/local-network.js:111-124`: `hdAccount = mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic)`; when no publisher key is set, `sequencerPublisherPrivateKeys = [hdAccount key]`; when no validator key is set, `validatorPrivateKeys = [hdAccount key]`; `coinbase` is the validator's address. `:150` deploys the L1 contracts with the validator key.
- `dest/mnemonic.js`: `DefaultMnemonic = 'test test test test test test test test test test test junk'` (anvil's). `l1Mnemonic` comes from `--local-network.l1Mnemonic` or `MNEMONIC` (`dest/cli/aztec_start_options.js:92-95`).
- The keystore built from those keys has no funding, slasher or prover account (`aztec-node/dest/aztec-node/config.js:99-123`); the automine epoch settler writes L1 storage through cheat codes (`sequencer-client/dest/sequencer/automine/automine_sequencer.js:679`), not a transaction.
- The same `mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic)` line, with no index, is in the installed 5.0.1, 5.2.0 and 6.0.0-rc.1 CLIs (`local-network.js:108`).
- `global-setup.ts:531-579` starts `aztec start --local-network` with no `MNEMONIC`, publisher or validator key (the env spreads `process.env`, which CI does not set them in); anvil starts without `--accounts` or `--mnemonic` (`:404-411`), so it funds ten accounts of the default mnemonic with 10000 ETH each (`aztec-anvil --help`: `--accounts` default 10, `--balance` default 10000).
- Nonce handling: `L1TxUtils` reads the `pending` nonce, signs and sends inside one mutex (`@aztec-labs/ethereum/dest/l1_tx_utils/l1_tx_utils.js:200-224`). It reads the chain, so a foreign transaction from the same account mined between its read and its send takes its nonce.
- The node API names no publisher: `NodeInfoSchema` (`@aztec-labs/stdlib/dest/contract/interfaces/node-info.js:4-17`). A checkpoint's L1 block is readable (`getCheckpoint(…, { includeL1PublishInfo: true })`, `interfaces/l1_publish_info.d.ts`), not its transaction.

## Client and tests

- `createExtendedL1Client(rpcUrls, mnemonicOrPrivateKeyOrHdAccount, chain, pollingIntervalMS, addressIndex, opts)` passes `addressIndex` to viem's `mnemonicToAccount` (`@aztec-labs/ethereum/dest/client.js:91-93`). It opens no connection when built.
- Unit tests of e2e infra live in `apps/extension/scripts/e2e/*.test.ts` and import from `tests/e2e/**` (`chaos-seed.test.ts`, `anvil-probe.test.ts`); `apps/extension/vitest.config.ts` includes `scripts/**/*.test.ts` and excludes `tests/e2e/**`.
- No known-limit issue covers the area (`gh issue list --state closed --label known-limit --search "bridge L1"`); no other issue owns the work (`--search nonce`).
