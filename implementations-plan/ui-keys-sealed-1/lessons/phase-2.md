# Phase 2: the popup and the windows through the service (the three maps)

Pins and fee picks now go through `managers.uiPreference`. The pointer reads stay as they are on dev until OA-1 is answered.

## Attempts

- `fee-cards.comount.test.ts` (two fake-timer tests) and `send.integration.test.ts` went red when their `managers.uiPreference.getFeePicks` stub loaded the reader with a dynamic `import()` on every call. Each call then took extra macrotask hops, which moved the fee card's first read after the timer the tests advance. Fix: the stub imports the reader once, through `vi.hoisted`, so a read costs what the old `chrome.storage.local.get` cost.
- In `test:all`, an unhandled `RpcTimeoutError: getPinnedTokens` came from `TokensView.test.ts`. `TokensView`, `holdings`, `general` and `SelectTokenPopup` mount `usePinnedTokens` against the real `managers` proxy. The real client's request reaches no service, and the suite's fake timers run it out to 60 s. Fix: `chromeUiPreferences()` in `tests/helpers/ui-preference-fake.ts`, a stub over whatever `chrome.storage.local` the suite installs. The `[id]` page suite uses the same helper.
- In the same run, `send-order.composition.test.ts` failed once at load 115: expected `pending` to be `queued`. It passed 3/3 alone and in the next full `test:all`. No execution path changed in this arc.
- `usePinnedTokens.test.ts` had two migration-barrier cases, a write that the facade's barrier holds. The composable no longer goes through the facade, so they were replaced by "a write the worker refuses reports stale". The commit fence that makes the worker refuse is covered by `ui-preference/service.test.ts` § refusals.
- e2e reads move to `tests/e2e/helpers/ui-preferences.ts`, which goes through `callService(page, "ui-preference", "getFeePicks", …)`. `fee-methods`' `readSendPicks` used to answer `undefined` when no row was stored. The service answers `{}` for that same state, so the assertion now reads `toEqual({})`. Its clears, and `clearPinnedTokens`, stay raw removes: removing a sealed row is still a removal, and the open page re-reads on the key's change.

## Gate

- `bun --bun vitest run src/stores src/composables src/popup src/components src/utils …`: 471 files and 7674 tests green; lint; `typecheck:all`; `test:all` exit 0, on the second run.
- Smoke, retry 0, armed builds, run as time-balanced shards so that each fits a bounded foreground call:
  - Chrome, 5 shards: 354 + 362 + 329 + 347 + 453 = 1845 s;
  - Firefox, 7 shards: 429 + 371 + 383 + 328 + 362 + 383 + 521 = 2777 s.
  - Every file green, with load1 between 40 and 125.
