# Phase 1: the format and the wallet

## Deviations from the plan

- `inBand` lives in `price-map.ts`, beside the table it checks, so the service and `usePrices.ts` share one band test.
- `priceRequestUrl` and `withinTable` are exported from `price/service.ts`: `real-data.test.ts` builds the live request through the first, and the second is the one filter both `snapshotOf` and `readUsable` apply.
- No `feedFault(key, value)` helper: `checkPriceFeeds` runs each record through `checkFeed` inside a try/catch, strict rethrowing and wallet skipping the record. Same behaviour, and the function stays under the complexity budget.
- No separate `price-map.test.ts`: invariant 6 (an inherited name never resolves) is proved where a name enters, `parse.test.ts` (`isFeedId` refuses `constructor` and `__proto__`), and where it is looked up, `service.test.ts` (stored rows under inherited names) and `usePrices.test.ts`.
- The new cases were written with the code rather than run red first: each imports an API the base copy lacks (`checkPriceFeeds`, `priceTableOf`, `priceEntryFor`), so at the base they fail at import, which proves nothing about the behaviour. The behavioural red was checked instead on the two that can run against the base shape: `sign.test.ts`'s first case (entries lost their `priceId` once the list named no feed) and `stored-shapes.writers.test.ts` (a stub list without feeds dropped `tether`).

## Attempts

- `bun run lint` red on 6 formatting errors in the touched files (long lines from hand edits); `biome check --write` on the 27 changed files fixed them. The 23 warnings and 4 infos are in files this arc does not touch.
