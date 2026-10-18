# Phase 1: the bridge refuses dApp requests that name the registry's grant functions

## Placement, two departures from the step text

- The three message literals live with `AuthRegistryRefusalError`, not in `scope-violation.ts`: OA-1 (b) gave the refusal its own subclass, whose constructor admits only those wallet-owned words. After the arc review they moved with the class to `@nulo/extension-messaging/errors` (D11).
- The call rule sits in `checkSendTx`, ahead of `checkTransactionCalls`. Only `sendTx` calls `checkTransactionCalls`, so the two placements are equivalent; `checkSendTx` keeps D7 (simulations unchanged) visible at the rule.

## Guard-removal runs (wallet-bridge)

| Removed | Red | Then |
|---|---|---|
| the `sendTx` rule | 6: the three grant selectors, the upper-case spelling, the view-named grant, the grant after an allowed call | controls (`is_reject_all`, other contract, `simulateTx` of `set_authorized`) green |
| the intent rule | 3: the `CallIntent` and `IntentInnerHash` rows, the dispatcher test (nothing signs, no window opens) | the non-registry intent control green |
| one pinned selector altered | 1: its pin against the artifact | 8 of 9 green |

Restored: 789 of 789.

## Guard-removal runs (extension, OA-1 b wiring)

Each mapping removed in turn (envelope, queued-journal kind, `markFailedUnlessCancelled` kind, the History label): 4 red, one per mapping. Restored: 215 of 215 in the four files.

## Gate, 2026-10-17

`bun run lint` 0; `bun run typecheck:all` 0; wallet-bridge 789 passed; wallet-core 317 passed; `bun run test` 13562 passed, 5 skipped, 7 todo (829 files, 3 skipped).
