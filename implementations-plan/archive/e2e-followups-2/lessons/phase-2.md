# Phase 2: a reverted transaction fails the mined wait (#280)

- **`origin/dev` unchanged (2026-10-11).** `git fetch origin dev` showed nothing past 29d9e49, so there was nothing to merge and no new caller under `tests/e2e/network/` or `fixtures/`.
- **Red on the old helper.** `NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/wait-for-tx-mined.test.ts` (Chrome, retry 0) with the old `waitForTxMined` body: success 4.1 s ✓, dropped ✓, revert ✗ `AssertionError: promise resolved "undefined" instead of rejecting` (3.8 s from send to the proven receipt). The old helper passes a transaction whose public execution reverted.
- **Deviation from § Architecture, placement only.** The plan has the test sync the PXE and call `BaseWallet.prototype.sendTx.call(wallet, …)` itself. The PXE is `protected` on `BaseWallet`, so the sync-then-send went onto the fixture's own wallet subclass as `FrozenArtifactWallet.sendUnsimulated(payload, from)`, the one place with typed access to it; it also applies the file's `E2E_FEE_GAS` ceiling, as every helper there does. Behaviour is the plan's: `pxe.sync()`, then the base send with `NO_WAIT`. `BaseWallet.prototype.sendTx<NoWait>` is instantiated before `.call` so the hash is typed without a cast.
- **The new body.** `waitForTx(node, hash, { waitForStatus: TxStatus.PROVEN, timeout: timeoutMs / 1000, ignoreDroppedReceiptsFor: 0 })`, with a `TimeoutError` (from `@aztec-labs/foundation/error`, the copy `aztec.js` resolves) rethrown with the hash and the last status (`unavailable` when the read fails).
- **Callers at 29d9e49:** 17 calls in 10 files (`git grep -c 'waitForTxMined(' -- apps/extension/tests/e2e/network`), as recon counted. Prover-ON: `frozen-account-canary`, `passkey-execution-canary`. Proverless: the other eight and the new file.
- **Gate (2026-10-11), retry 0, every run through `agent.sh`:**

  | Run | Files | Tests | Result |
  |---|---|---|---|
  | Chrome, proverless (`wait-for-tx-mined`, `account-switch-live-session`, `authwit-consume-smoke`, `authwit-lifecycle`, `execute-scope-account`, `execute-scope-chain`, `multi-account-from`, `selfpay-phase`, `snack-placement`) | 9/9 | 14/14 | pass |
  | Chrome, prover-ON (`frozen-account-canary`, `passkey-execution-canary`) | 2/2 | 4/4 | pass |
  | Firefox, proverless (the same nine) | 9/9 | 14/14 | pass |
  | Firefox, prover-ON (the two canaries) | 2/2 | 4/4 | pass |

  The revert case is red on the old helper and green on the new on both browsers; success and dropped green on both. No caller turned red under the stricter wait: none of their transactions reverted. Fast: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0.
