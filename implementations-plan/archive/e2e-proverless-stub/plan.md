# Proverless network e2e

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A build-time proverless mode and a controllable proof gate in `apps/extension/src/e2e/` (`config.ts`, `proof-gate.ts`, `chrome-storage-proof-gate.ts`), the test fixture `apps/extension/tests/e2e/fixtures/proof-gate.ts`, a bundle guard in `.github/workflows/_build-extension.yml`, and a prover-on canary job beside the proverless shard pool in `.github/workflows/_extension-network-e2e.yml`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Network e2e skips real proof generation for most tests and keeps simulation and on-chain execution, which is what the tests assert on.

- **Plain proverless.** A proverless build sets `proverEnabled: false` on the PXE, so the kernel circuits are still simulated but the BB proof is replaced by a fake one. The local node accepts such transactions. Most network test files run this way.
- **Controllable proof gate.** Proverless still leaves a short, variable proving window, too short for a deterministic ordering assert. Tests that need the transaction held at `proving` (cancel mid-prove, concurrent sends, lock and auto-lock during a send, a profile switch during a transfer) use a `ProofGate`. It is a typed seam in the chrome-free runtime whose default resolves immediately. The extension shell supplies a gate backed by presence-only `chrome.storage.session`: key present holds, key absent releases, and the key is removed on release and on a loud safety timeout. The gate runs in the service worker at the `proveTx` call, so it adds no new cancel checkpoint and prove stays uninterruptible.
- **Real proving stays covered** by a prover-on canary job; see [CI.md](../../../CI.md) for the lanes and `apps/extension/tests/e2e/README.md` for the fixtures.

## Why

Real proving made the network suite slow and caused CDP timeouts. A proverless or externally gated prover in a shipped wallet would broadcast unproven or attacker-timed transactions, so the mode is guarded in layers, and the load-bearing guard is the one that holds on every build path.

## What shipped

- **Double opt-in at source.** `E2E_PROVERLESS` is true only when `VITE_NULO_E2E_PROVERLESS` and `VITE_NULO_E2E_PROVERLESS_CONFIRM` are both set; exactly one set throws. A stray `.env` line or typo cannot flip it, on any `bun run build*` path, not only CI.
- **Dead-code elimination.** The proverless branch, gate and listener are constructed only inside `if (E2E_PROVERLESS)`, never through a top-level side-effect import, which would ship the listener with the flag off.
- **Bundle grep.** The proverless build stamp and the `nulo:e2e:proof-gate` key must be absent from every shipped Chrome and Firefox build, and the build script asserts them present when the flag is set.
- **Mutual exclusion.** An init-time throw refuses a build that is both proverless and prover-required.
- **The trust boundary is the absent listener, not `chrome.storage`.** Any extension context can write storage, so a shipping build is safe only because nothing reads the key.
- **Classification.** Tests that wait through a real prove to submit or mine are the canary set, chosen from an explicit file list rather than a count. A test that never reaches prove is not a canary.
