# test-infra-1: phase 4 (the awaited bus and the unit waits)

## Sites moved

| site (at 138e0ded) | was | now |
|---|---|---|
| `token-balance/service.test.ts` SAME-pair race (`:831`) | 40 `setTimeout(0)` turns | both dispatches started, then `await Promise.all` |
| parked-write deletion (`:885-895`) | park on a bare promise, 2 single turns, 40 turns | `deferred` reached and release in the `set` spy; the deletion starts after `reached` (its lock acquisition queues synchronously), release, await both |
| init fence (`:950-957`) | 2 single turns, 20 turns after `start` | `deferred` reached and release on init's token read; switch, release, await `start` and the switch |
| concurrent creators (`:1087-1089`) | 40 turns; the comment called the drain a stand-in | both dispatches started, then `await Promise.all`; comment says neither is awaited before the other starts |
| `onTokenUpdated` `settle()` (`:1455`) | 10 turns | `await dispatch`; the second test also asserts `getTokenRaw` ran for both ids (its success control) |
| FAN-OUT PIN, CREATE-BALANCE PIN (`:500-511`, `:566-572`) | 3 single turns each, before a "not called" | reached signals on `getAccounts` / `allocateIdAvoiding`; the switch's reconcile queues behind the parked creation's lock, so CREATE-BALANCE starts the switch, releases, then awaits both |
| `network/client.test.ts` `drain()` | 5 microtasks | `connectedClient()`: `holdReady`, `connect()`, `ready()`; Ready lands synchronously, so a request posts before its call returns; test 1 gains a control (a valid request posts at once) |
| `importChainSync.test.ts:207,324` | 5 microtasks after the late answer | `await vi.runAllTimersAsync()`: the fake clock yields a real task, so every reaction at any depth has run |
| local `deferred` (`FeeSettingsCard`, `scope-follow.core`), `held()` (`locked-state`) | copies | `deferred` from `@nulo/wallet-core/utils` |

The delays inside the allocation mocks (`:824`, `:1074`) stay: they widen the races those tests pin.

## Deviations

- FAN-OUT and CREATE-BALANCE were not in the plan's list (recon counted only multi-turn loops); they are the same file, the same bus, and single-turn guesses before a "not called". Moved with the rest.
- `importChainSync`: the code's reaction to the late promise (`importChainSync.ts:122`) is a `.catch` passthrough into a race that already settled, so no handle reaches the test. The check is "nothing appends", which only holds at quiescence; `runAllTimersAsync` is the file's own idiom (`run`) and reaches it.

## Mutation proof (scratch; production restored; old test copied from origin/dev beside the new)

| mutation in `token-balance/service.ts` | new test | old test |
|---|---|---|
| M1 `onTokenDeleted` runs outside `this.lock` | fails | fails |
| M2 init commits without its generation check | fails | fails |
| M3 `onAccountAdded` runs outside `this.lock` (SAME pair; concurrent creators) | fails, fails | fails, fails |
| M4 `onTokenUpdated` drops `isSameTokenLive` | fails | fails |
| M5 `createTokenBalanceHoldingLock` drops its generation check | passes | passes |
| M6 `onTokenAdded` drops its post-`getAccounts` generation check | passes | passes |

M5 and M6 pass on both: later fences cover them. `importChainSync` with a late `.then(record)` on the restore promise: at chain depth 0 both copies fail; at depth 6 the new one fails and the old one passes.

## Helper bug caught by its own test

`this.#collecting?.push(callback(payload))` skips the callback when nothing collects (optional chaining short-circuits the argument), so a plain `invoke` ran no handler. The "invoke alone" control caught it; the call now runs first and its result is pushed after.

## Gate (2026-10-17)

`bun run lint` 0 (27 warnings, 3 infos, none in a changed file); `bun run typecheck:all` 0; `bun run test` 0: 834 files, 13669 tests.
