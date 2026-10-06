# Balance warm-up cancelled its own requests

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `refreshBalances` in `apps/extension/src/utils/core.ts` settles every refresh before it disconnects, and always disconnects; its pins are in `apps/extension/src/utils/core.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

`refreshBalances` awaits every stale-row refresh with `Promise.allSettled` before it tears the token-balance client down, and the teardown sits in a `finally`. A rejected refresh is logged and does not cut the others short. The staleness threshold and the shape of the function are kept as they were: changing either is a product call, not part of this fix.

## Why

The warm-up fired the per-token refreshes without awaiting them and disconnected on the next line. Disconnecting rejects the client's own pending requests, so the refresh outcome was lost, surfacing only as unhandled rejections, and whether the unsent ones went out depended on transport timing. A thrown balance read skipped the disconnect altogether and leaked the connected client.

## What shipped

- **Ordering.** The refreshes are collected and awaited together, then the client disconnects.
- **Failure path.** A throw from the balance read still reaches the disconnect.
- **Pins.** Three tests, each red against the old code: no disconnect while a refresh is in flight (fresh rows are skipped), the throw path still disconnects, and one rejected refresh is logged without ending the rest. The settle-all pin is written so a fail-fast `Promise.all` cannot satisfy it.
