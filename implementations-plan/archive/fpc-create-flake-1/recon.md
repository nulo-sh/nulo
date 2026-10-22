# fpc-create-flake-1: recon

Two Explore sweeps (Sonnet) at 977227864, verified against the tree where the plan relies on them.

## Reuse map

| Capability | Verdict | Where |
|---|---|---|
| Order proof "X never waits on parked Y" by awaiting X with Y's gate closed | exists, in the same file | `fpc/service-create.test.ts:245-271` (T6 awaits `clearChainState` inside the `try`, gate released in `finally`) |
| Reached/release deferreds in place of `setTimeout(0)` turns | exists | `token-balance/service.test.ts:156-185` and later cases; the move away from timers is recorded in `archive/test-infra-1/lessons/phase-4.md` |
| Deferred gate helper | exists | `deferred` in `packages/wallet-core/src/utils/deferred.ts`, via `@nulo/wallet-core/utils`; `apps/extension/tests/helpers/held-read.ts` aliases it for component tests |
| WebCrypto tracking | partial | `trackSubtleCrypto()` in `apps/extension/src/wallet/storage/sealed-entity-storage.testing.ts:72` counts pending `crypto.subtle` calls; it delays nothing. Rejected as a fix (plan D1) |
| WebCrypto or storage delay for a reproduction | none | the plan's spy is scratch, never committed (D4) |
| Unit test timeout and retry | defaults | no `testTimeout`, no `retry` in `apps/extension/vitest.config.ts` or `vitest.base.mts`: 5 s, 0 |

## History

- `archive/fpc-discovery-1` (`plan.md` Phase 1 step 4, `lessons/phase-1.md`) wrote the one-macrotask bound for T1 and T3 on purpose, when the fake storage settled on microtasks. Its base proof reds T1 and T3 by that flag and T6 by the timeout.
- `archive/e2e-tmp-4/lessons/phase-1.md` records the one observed red (`:233`, load ≈ 120) that became #1086.

## Timer waits elsewhere (classified, out of scope)

The Bun runtime runs `crypto.subtle` off the main thread, so a fixed timer wait is a latent flake only where the waited-for path crosses WebCrypto.

| Site (`apps/extension/src/wallet/services/`) | Verdict |
|---|---|
| `account/service.test.ts:641-643` | latent flake: the parked read comes after a keyed `get`'s `keyedSegment` sign (`sealed-entity-storage.ts:150-154,454`); a late sign leaves `parked` null and the case hangs. Filed at close-out (plan D6) |
| `account/create-import-lock.test.ts:72` | assertion does not depend on the wait; under load its negative check can pass without reaching the write |
| `cross-profile-isolation.test.ts:571-618` | microtask-only today because the fixtures seed plaintext rows |
| `contact/service.test.ts:485,521`, `account/service.test.ts:96,108`, `dapp-session/service.test.ts:192`, `execution/chain-tip-gate.test.ts:44` | microtask-only today (no storage before the asserted point, or an empty unkeyed root) |
