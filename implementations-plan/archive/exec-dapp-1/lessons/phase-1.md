# Phase 1: the wallet honours the three fields

- **Gate (2026-11-01).** `bun run lint` exit 0 (25 warnings, 4 infos, none in the changed files); `bun run typecheck:all` exit 0; `bun run test:all` exit 0 (it runs `@nulo/extension`'s `test`, which is `bun run test`, and `@nulo/wallet-bridge`'s: 805 passed); `bun --bun vitest run src/wallet/services/execution --retry=0`: 76 files, 1548 passed.
- **Red at the base.** With the 11 changed sources checked out at `51ea220b1` and the new tests kept, every new or rewritten pin fails in the six suites (strategies structural and lifecycle, builder, discoverer, view executor, send executor). In `dapp-send-executor.test.ts`, 7 of the 8 new cases fail; the 8th, the never-happens `NO_WAIT` case, passes, as it should. Mutations on the new sources:
  - With the interval clamp removed, the `0` and `4294967.296` rows fail.
  - With `null` read as an object, the `null` row fails.
- **Fixture fallout, not behaviour.** The structural strategy pins deep-compare the sim options, so a fixture build's `scopes` must share its account's address object. The lifecycle "account read" order pin became a scope-read pin: the simulate no longer reads the account. The fee-race catalog models a send to its submission, so its drafts ask `NO_WAIT`, as the playground's buttons do. Under the real wait, its fake pending receipts never settle.
- **`initialDelay` needs no clamp.** `waitForTx` caps it at `timeout`, and `timeout: 0` skips it. An overflowed value fires once, at once, and the clamped interval then governs the polling.
- **Deviation (D11).** 6.0.0's `AztecAddress` has no `fromString`, so the capsule scope uses `fromStringUnsafe`, as the contract address beside it does.
