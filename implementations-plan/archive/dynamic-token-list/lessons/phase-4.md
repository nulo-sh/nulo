# Phase 4 — Consumers

## Deviations from plan.md (each with the reason)

- **`seedsFromList` lives in `default-tokens.ts`.** That module keeps the trust-model doc and the `DefaultTokenSeed` type, so the mapping from a list entry to its pins sits next to the rule it serves.
- **`getVerifiedDefaults(profileId, chainId)` is a `TokenService` method.** The connect window's service already holds a `TokenService`; it reads the seeder's `verifiedSeeds`, so `knownContracts(protocolFpcs, verifiedDefaults)` takes the verified seeds as an argument and stays pure.
- **`usePrices` asks for `getQuotes()` first.** That call makes no request, so a wallet holding only unpriced tokens learns the mapping without waiting on a quote fetch. `refreshIfStale()` follows as before.
- **`BalanceView` waits per token, not per wallet.** It waits for a quote only for a positive holding that the mapping prices (`mapped` and `isPriced`), which is today's behaviour. A whole-wallet wait would change what the card shows while quotes load, which is a UI change without sign-off.
- **The armed seed source returns `undefined` when its key is absent**, so the list applies; a malformed blob still yields `[]`.
- **The price pin in `token-list-pins.test.ts` was dropped.** It compared the fixture to itself once the compiled map was gone.
- **"`onListChanged` reaching the seeder" lands here** (deferred from P3), in `token/service.composition.test.ts`: the event calls `seeder.listChanged()`, and the seed version moves from `+1` to `+2` with the list's sequence.
- **Every user delete tombstones** (D11). The composition test that pinned "a non-default delete writes no marker" now pins the opposite.
- **A shared `tokenListStub()`** in `wallet/services/composition-harness.ts` serves the six harnesses that start `TokenService` or `PriceService`, instead of six inline stubs.
- **The live spec reads its expectations from the list the wallet verified**, not from a compiled constant: it waits for the stored envelope, verifies it against the pinned keys, and expects every bundled-class Testnet entry as a token. Letting `tokens.nulo.sh` through its launch is P5.

## Facts found

- A list change during a held preview is fenced by the epoch alone: a mutation that removes `invalidate()` from `listChanged()` reds both held-preview tests in `seeder.list.test.ts`.
- After a fenced attempt, the re-pinned default waits out that attempt's backoff before it seeds: `prepareSeedEntry` resets the round only for a rejected or capped entry. The continuation re-arms it, so nothing is lost.
- **Smoke never fetches a list today, and the priced smoke specs lose their mapping.** A launch seeds Terms acceptance by writing storage, which emits no `onAcceptanceChanged`; the worker booted before the write, saw no acceptance and cleared its alarm. Source builds also have no list source unless a spec writes one. So `rows`, `send-keyboard`, `home-links`, `navigation` and `send-outcome-rows`, which price Test USDC through `seedUsdQuoteAndReload`, have no mapping in either run kind. The compiled map hid this. P5 gives those specs a held list (see `phase-5.md`). The network suite is unaffected: the sandbox price rule maps chain 0 without a list.

## Gate (2026-10-13)

- `bun run audit:vue`: exit 0, 750 test files and 11674 tests passing (the first run failed on Biome formatting in three test files, fixed with `biome format --write`).
- `rg -n "TESTNET_TOKENS|DEFAULT_TOKEN_SEEDS" apps/extension/src`: no match (exit 1).
