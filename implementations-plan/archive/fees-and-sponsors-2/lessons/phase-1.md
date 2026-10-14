# Phase 1: one cap rule and the app's priority

## What landed

- `feeCapFor`: every rule takes `appCap` and `appPriority`; the app's cap is returned verbatim for every payer, else the payer's basis plus the priority (D1, D3).
- `appPriorityOf` feeds every `buildStandard` in the four strategies (D4); `capRuleOf` and `finalizeGasLimits`' account rule carry the app's fee settings; an embedded payment always keeps the request's cap at finalize.
- `applyEmbeddedFpcGasCap` uses the `app` rule with the priority; `buildNoFrom` commits the app's priority; `prepareNoFrom` passes it to the embedded cap; the profile path's build receives it.
- The reuse stash refuses an app priority beside an app cap (D11). `priorityFeeOf` and the optional `priorityFee` / `priorityFeeFormatted` pair on `TransferFeeEstimate` (D5).

## Pins moved (old value → new value)

- `strategies-lifecycle.test.ts`: the sponsor and private fee juice app-cap cases now commit the app's cap (99_999 per gas, payload 6_299_937_000); the priority case asserts `buildStandard`'s fifth argument is `{ maxPriorityFeesPerGas }`, the committed priority is the app's (70, 80) and the cap is basis + q per path. The private fee juice "× 1.2, the level never applies" case kept its values and lost only the app cap it carried, which moved to the app-cap table. A control asserts no build is given a priority when the app sets none. The harness's fake builder now completes the priority it is given, as the entrypoint does.
- `tx-request-builder.pins.test.ts`: NO_FROM commits (70, 80) for the app's priority and zero without one. The standard "the builder reads no fee from the operation" pin is unchanged.
- `fee-cap.test.ts`: every payer with the app's cap (verbatim, the node not consulted), every payer with a priority and no cap (basis + q).
- **Not in the plan's list:** `fee-structural-parity.test.ts` "embedded WITH explicit customLimits.maxFeesPerGas" fed finalize an app cap the request did not carry. Finalize no longer re-derives an embedded cap (Phase 1 step 3), so the pin now feeds the request as `applyEmbeddedFpcGasCap` leaves it and expects the same (1_500, 1_800). The app's cap reaching the request is pinned by `embedded-fpc-cap.test.ts` case 3 and the lifecycle's embedded path. Added: a non-embedded finalize with a priority and no cap (min × 2 + q, the build's priority kept).
- `dapp-send-executor.test.ts`: the fake `txRequest` gained `maxPriorityFeesPerGas` (zero), the field every real request carries and `priorityFeeOf` now reads.

## Gotcha

- A NO_FROM operation's `opts.fee.gasSettings` arrives as the wallet-sdk serialized it: each bigint a decimal string (`jsonStringify`'s replacer). A test fixture with `GasFees` instances fails the NO_FROM fingerprint's JSON round-trip; feed decimal strings.

## Gate (2026-10-14)

`bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun run --cwd apps/extension test src/wallet/services/execution` 1232 passed; `bun run --cwd packages/wallet-bridge test` 750 passed; `bun run --cwd packages/aztec-runtime test` 392 passed. Pass.
