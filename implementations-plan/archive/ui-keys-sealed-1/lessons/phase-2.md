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

## After OA-1 A: the pointer through the RPC

- The popup's boot reads `getSelectedAccount` for the profile it activates, before its superseded check, so the fence's "no await between the check and the commit" holds as before. Every selection writes through `rememberSelection` (switch, hide), `NewAccountPopup` (it captures the profile id before its await), the import and new-profile helpers, and the execute window's follow (`selectionWriter`).
- `scope-follow.core.test.ts`: the three facade cases left with the facade. In their place: a writer test (no call when `unless` holds, one call when it does not) and a follow that lands. The send case is KL-1, which the owner signed with P84-06 (#1096). The lock and switch cases are the service's commit fence (`ui-preference/service.test.ts` § refusals).
- e2e: `fixtures/accounts.ts` gains `selectedAccount`, `getAccountAddress` and `waitForSelectedAccount`, all through the service. Every raw read of `nulo:ui:activeAccount` in the smoke and network specs moved to them.
- Attempts: `scope-follow.test.ts`'s `vi.mock` factory read a mock before its initialization (fixed with `vi.hoisted`); `useProfileBootstrap.test.ts` had 20 failures for a missing `managers.uiPreference` (stubbed); `NewAccountPopup` first read `account.profileId`, which the created account does not carry (it uses the captured id).
- Smoke at retry 0 on the pointer's head (`17b6e5b0`; a later spec fix re-ran alone):
  - Chrome, 5 shards: 348 + 389 + 347 + 401 + 397 = 1882 s;
  - Firefox, 7 shards: 402 + 367 + 371 + 373 + 344 + 397 + 486 = 2740 s.
  - The only red, on both browsers, was `sealed-storage.test.ts`, which has two causes. Its seed planted the bare selection on an unlocked wallet, and the list-load popups that came next claimed it at their boot, before the cold boot: correct service behavior, so the spec now locks first (`5390b1a9`). And Chrome returns an absent array slot from `page.evaluate` as `null` where Firefox keeps `undefined`, so the spec's read returns `null` for an absent key (`b5769757`; FIREFOX.md gains the row). It re-ran green alone: Chrome 33.7 s, Firefox 64.4 s.
