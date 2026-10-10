# Arc 1 build log

## Phase 1.2: precedence pins and the budget comments (2026-10-10)

- Built on `origin/dev` 4f34f56, before send-queue-activity arc 1 (#264), as D-orch-3 allows: tests and comments only.
- Pins added:
  - `fee/strategies-lifecycle.test.ts`: `fj`/`fjwc` commit an app cap below the node minimum verbatim with no multiplier; both `fpc` paths ignore an app cap (committed cap and payload `maxFee` stay the wallet's); on all five paths `buildStandard` gets no gas settings and the committed priority is the build's.
  - `fee/fee-structural-parity.test.ts`: finalize commits a below-minimum `customLimits.maxFeesPerGas` with no multiplier and no floor.
  - `tx-request-builder.pins.test.ts`: `buildStandard` reads no fee from the operation (the entrypoint gets `undefined` gas settings); NO_FROM commits zero priority whatever the app's gas settings carry. The NO_FROM helpers moved to module scope so both describes share them.
  - `operation-planner.test.ts`: the planner's Send-page `send_transaction` carries no `fee`.
- **Deviation: five comment sites, not four.** The "byte-for-byte" claim the plan placed in `account/fee-options.ts` lives in `account/nulo-account.ts`; `fee-options.ts` carries a sibling "(matches upstream)" claim. Upstream 6.0.0-rc.1 defaults to `getMinFees(Limit)` × 1.5 (`wallet-sdk/dest/base-wallet/base_wallet.js:180`), Nulo to `getCurrentMinFees()` × 1.5, so both claims were false. Both were corrected; no code changed. The embedded strategy's inline "keeps max_gas_cost within the dApp's embedded amount" repeated the budget claim and was cut with it.
- Gate: `bun run lint` ✓, `bun run typecheck:all` ✓, the phase's vitest command (8 files, 200 tests) ✓, `bun run --cwd packages/aztec-runtime test` (372 passed, 2 skipped) ✓.
