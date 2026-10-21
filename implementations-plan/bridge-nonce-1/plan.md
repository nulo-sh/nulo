---
plan: bridge-nonce-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at b3d6e0a2a
trunk: dev
issues: "#988 (A1)"
post_implementation_hardening: not scheduled
---

# bridge-nonce-1: the e2e fixtures sign L1 transactions as an account the sandbox never uses

One arc, one PR against `dev` (`bridge-nonce-1-a1`, `Closes #988`): both e2e L1 signers move to anvil account 1
through one module. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults:
[lessons/phase-0.md](lessons/phase-0.md). Size: 150-line target, about 15 over; the overage is evidence and audit record.

## The issue's claims against the tree

- **Shared account: holds (demonstrated by code trace).** `bridgeFeeJuice` passes no index
  (`apps/extension/tests/e2e/fixtures/aztec.ts:433`), so it signs as index 0. The local network publishes,
  validates and deploys as `mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic)`, also index 0, and
  global-setup overrides none of it (recon § The sandbox's L1 accounts).
- **Incomplete: a second signer.** `bridgeForMint` (`fixtures/aztec-private-fpc-bridge.ts:36,65`) also signs
  as index 0 (mint, approve, deposit), for `setupPreFundedAccount` and `bridgePrivateFuel`. Same cause; A1
  fixes both.
- **Race mechanism: holds in shape.** The node's `L1TxUtils` reads the `pending` nonce, then signs and sends
  (`l1_tx_utils.js:200-224`); a same-account transaction anvil mines in between takes that nonce. The window
  widths in the issue are not in the code, and the fix needs none. The three sightings are #959's (D5).

## Outcome & Quality Bar

- **For whom:** whoever runs the network e2e lanes, above all a change that adds blocks (forced blocks, #990).
- **Excellent:** (1) under the default sandbox configuration, no fixture L1 transaction shares a nonce
  sequence with the node, in any bridging file; (2) an edit that moves the shared signer to index 0, or a
  fixture that builds its own L1 client, fails `bun run test`, so `quality-status` catches it.
- **Good enough:** the test pins the pinned CLI's default publisher; an Aztec line that moves it, or a shell
  that overrides it, is not caught (D2, known limit at close-out).

**UI impact:** none (the lane brief: "**UI impact: none.**"); the arc changes e2e fixtures and unit tests only.

## Assumptions

**Facts (verified):**
- F1 The local network's L1 signer is index 0 of anvil's mnemonic unless `MNEMONIC` or a key is set
  (`~/.aztec/versions/6.0.0-rc.3/node_modules/@aztec-labs/aztec/dest/local-network/local-network.js:111-124`,
  `dest/mnemonic.js`). The same line is at `local-network.js:108` in the 6.0.0-rc.1 CLI and, under the package's
  5.x name `@aztec/aztec`, in the 5.0.1 and 5.2.0 CLIs.
- F2 The node signs with no other L1 account: no funding, slasher or prover key
  (`aztec-node/dest/aztec-node/config.js:99-123`); epoch settlement writes storage and calls `evmMine`
  (`automine_sequencer.js:678-686`).
- F3 `global-setup.ts:531-579` sets no `MNEMONIC`, publisher or validator key; anvil starts without
  `--accounts` or `--mnemonic` (`:404-411`), so it funds ten default accounts with 10000 ETH each.
- F4 The two fixtures are the repo's only L1 signers (recon § L1 signers); no caller passes `bridgeForMint`'s
  `opts`. `tests/e2e/scripts/check-setup-pre-funded.ts` reaches the fix through `setupPreFundedAccount`.
- F5 `createExtendedL1Client`'s fifth parameter is `addressIndex`, and building it connects nothing
  (`@aztec-labs/ethereum/dest/client.js:91-93`). F6 Files run one at a time; a file's bridges are awaited in
  turn (recon § Callers). F7 `scripts/e2e/*.test.ts` unit-tests `tests/e2e/**` modules (`chaos-seed.test.ts`).
- F8 Any caller can mint: `FeeAssetHandler.mint` has no modifier, `setMintAmount` is `onlyOwner`
  (`@aztec-foundation/l1-artifacts/l1-contracts/src/mock/FeeAssetHandler.sol:23,27`); the deposit pulls from
  `msg.sender` (`FeeJuicePortal.sol:52`). Account 1 needs only its ETH for gas.

**Inferences:** none left; Phase 2 confirms F1-F8 end to end. **Asks:** none.

## Architecture & Implementation

- **New** `apps/extension/tests/e2e/fixtures/l1-signer.ts`: `ANVIL_MNEMONIC`, `FIXTURE_L1_ADDRESS_INDEX = 1`,
  and `createFixtureL1Client(rpcUrls: string[], l1ChainId: number)`, which returns
  `createExtendedL1Client(rpcUrls, ANVIL_MNEMONIC, { id: l1ChainId, name: "anvil" } as Chain, undefined,
  FIXTURE_L1_ADDRESS_INDEX)`. One comment: the local network signs as index 0, and a shared account races
  its nonce.
- **Modified** `fixtures/aztec.ts`: drop `ANVIL_MNEMONIC`; `bridgeFeeJuice` calls
  `createFixtureL1Client([ANVIL_URL], nodeInfo.l1ChainId)`.
- **Modified** `fixtures/aztec-private-fpc-bridge.ts`: drop `DEFAULT_L1_MNEMONIC` and the unused
  `opts.l1Mnemonic`; call `createFixtureL1Client(l1RpcUrls, nodeInfo.l1ChainId)`. Its RPC URL logic stays.
- **New** `apps/extension/scripts/e2e/l1-signer.test.ts` (`// @vitest-environment node` on line 1), two tests:
  (a) the client signs as the literal `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (success control: the index
  reaches the signer) and not as `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, the local network's publisher
  (comment cites `@aztec-labs/aztec`'s local-network default); (b) a source scan of `apps/extension/tests/e2e/`:
  `createExtendedL1Client` appears in `fixtures/l1-signer.ts` (control: the scan reads files) and in no other file.

### Decision ledger

- **D1 One module for both signers**, not an index at each call site: the mnemonic is duplicated today, and
  the second signer is the one the issue missed.
- **D2 Pin the package default, not the running sandbox.** Rejected: at each bridge, read the latest
  checkpoint's L1 block and refuse to sign as its sender. It adds RPCs and a 6.0-only node API to every bridge,
  finds one observed publisher rather than every configured signer, and `@aztec-labs/aztec` is no repo
  dependency, so the literal is the constant. Both legs agree.
- **D3 Index 1**: funded and unused (F2-F4); any of 1-9 works. No range check: index 10+ fails every bridge.
- **D4 Chrome-only local proof.** The change runs in the Node test process; the lane brief scopes the proof to
  Chrome; CI's required Firefox network lane runs on the PR. Both legs agree.
- **D5 No local reproducer.** The race needs #959's block pump (not in the tree) and appeared 3 times in many
  runs; a red/green on it would be a flake. Phase 2 proves which account signs instead.
- **D6 The source scan (b).** Codex: disproportionate, narrow the promise instead. Opus: the scan, in the
  `src/utils/*-ban.test.ts` idiom. Chosen: the scan. `aztec-private-fpc-bridge.ts` is a maintained copy of an
  upstream harness, so a re-port brings back its own `createExtendedL1Client` call on index 0, the exact
  regression this issue is; the scan costs one test and no runtime.

## Security & Adversarial Considerations

- **Threat model:** test-only code against a local anvil; no production path or store build changes, and the
  bundle never imports `tests/e2e/**`. The mnemonic is anvil's public dev one (committed twice today, once
  after); nothing prints a key; no workflow, permission, dependency or lockfile change; the derivation is
  viem's `mnemonicToAccount` (`@aztec/viem` 2.38.3). The arc never opens `network-endpoints.ts`.
- **Adversarial:** a wrong index fails closed (an unfunded account cannot pay gas). A shell that sets the
  sandbox's publisher to index 1 needs conditions the suite does not support: a known limit (both legs).

## Phase 1 — the signer module, both callers, the unit tests (A1)

Assumptions: F4, F5, F7.

1. Add `fixtures/l1-signer.ts`; point both bridges at `createFixtureL1Client`; drop both mnemonic copies and
   `opts.l1Mnemonic`.
2. Add `scripts/e2e/l1-signer.test.ts`.
3. Prove both reds, then restore: set the index to 0 and see (a) fail; add a `createExtendedL1Client` call to
   `aztec.ts` and see (b) fail.

**Validation gate.** Commands: `cd apps/extension && bun --bun vitest run scripts/e2e/l1-signer.test.ts`;
`bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: each exits 0, and each red of step 3 failed on
its own assertion. Layers: lint, typecheck, unit.

## Phase 2 — the network proof run (A1)

Assumptions: F1-F3, F6, F8.

1. From the repo root, run through `agent.sh` (ports from `~/.agents/ports.md`), log to
   `~/.cache/nulo-backlog/bridge-nonce-1/`: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_BROWSER=chrome
   NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/{fee-methods,price-fixture,same-token-concurrent-sends,send-chaos,selfpay-phase,sim-from-selfpay,tx-sendTx-default,tx-sendTx-selfPay}.test.ts`.
2. Poll the log in a bounded `until` loop; never yield while it runs. Then run `bun run test:all`.

**Validation gate.** Pass: the run exits 0 with every test green at retry 0; at least one `Minting … tokens
for` line (`portal_manager.js:94`, from `bridgeFeeJuice`'s console logger) appears, every one names the full
`0x70997970C51812dc3A010C7d01b50e0d17dc79C8` and none names `0xf39F…2266` (case-insensitive); `test:all` exits 0.
`bridgeForMint`'s Aztec logger is silent under vitest (`NODE_ENV=test`, `pino-logger.js:97`), so its signer
rests on test (b). Record the wall-clock in `STATUS.md`. Layers: e2e-live-network.

## Post-implementation and Delivery

`implementations-plan/README.md` § Post-implementation standard at `b3d6e0a2a` binds. No diff review
(`code_review: off`). The Codex loop (`run-codex.sh … high read-only gpt-6.1-sol`, default login) runs once
over the arc's diff after Phase 2, with one Opus `general-purpose` review beside round 1; hard stop at three
rounds. Close-out (Outcome, the known-limit issue, the archive move) lands as the PR's final commits.
Branch `bridge-nonce-1-a1` off `origin/dev`; one PR, no stack (D-orch-1), opened after the loop converges.
Title: `fix(e2e): the bridge fixtures sign l1 transactions with their own anvil account` (79 characters).
Body: what changed and why, the gates with outcomes, `Closes #988`. No label at creation. Do not merge.

**Seeds.** `/goal`: "bridge-nonce-1 A1: both e2e L1 signers on anvil index 1, unit tests green, eight bridging
files green at retry 0 on Chrome, PR open with `Closes #988`." `/loop`: "Read STATUS.md; continue the first
unticked phase of plan.md; stop at a red gate or an open PR."

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): approve with changes. Accepted: default-configuration scope and its
  known limit, `NULO_E2E_BROWSER=chrome`, I1 settled (F8). Rejected: "5.x evidence absent" (5.x names the
  package `@aztec/aztec`). Overruled by D6: narrowing the quality bar instead of the scan.
- **Codex round 2** (resumed): approve with changes; withdrew the 5.x finding, backed the scan (D6). Its one
  finding, a non-empty control for Phase 2's log check per helper, is taken for `bridgeFeeJuice` only (the
  Aztec logger is silent under vitest). **Round 3** (resumed, on that evidence): **approve**.
- **Opus** (Plan): approve with changes. Accepted: the scan (D6), Phase 2's positive account check (a clean
  log proves nothing at the default block rate), F8, two literals for the range check, the cuts.
