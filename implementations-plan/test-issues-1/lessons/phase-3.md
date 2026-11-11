# test-issues-1: phase 3 (#1742, #1735, the probe budget)

## Red/green proof (scratch, not committed)

A 2 ms busy-wait on `performance.now()` wrapped the service's private `routes.get`, which `probeNodeStatus` calls between its deadline read and the first probe (`service.ts:1060`).

- Base test code: the three tests go red, `[["https://rpc.example.com", 4998]]`, `[["https://a.example", 2499]]`, `[["https://b.example", 2497]]`, against 5_000, 2_500, 2_500.
- With the describe-level `vi.useFakeTimers({ toFake: ["Date"] })`, the same stall: 15 of 15 tests in the describe pass.
- A busy-wait on `Date.now()` would never exit under the frozen clock; `performance.now()` is not faked by `["Date"]`.

## Gate

`bun --bun vitest run src/wallet/services/network/service.test.ts --retry=0` from `apps/extension`, twenty runs: 20 of 20 green, 227 tests each, 9 18  s (min, max) per run.
