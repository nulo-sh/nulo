# wallet-bugs-2: phase 6 (#654, bars and marks on the 13 px scale)

#743 is still open, so no `dev` merge came first.

## Before (pre-change dist, 360 px)

Measured by a throwaway probe spec that was never committed. Chrome and Firefox agree to 0.05 px:

| Row | Row height | Left column | Right column | Bars / marks |
|---|---|---|---|---|
| Loaded `tokens-card` | 53 | 37 (symbol 18, gap 2, `fiat` 17) | 37 (amount 18, gap 2, `meta` 17) | marks 9 × 9 |
| Working `token-seed-row` | 50 | 34 (symbol 18, gap 2, `caption` 14) | 32 (`min-height`) | bars 64 × 13 and 92 × 9, touching |

- The loading column's `gap="5"` is not a `Flex` gap token (the scale goes 4, 6), so it renders as `normal` and the two bars touch. The ghost rows in `TokensView` have the same bad token in both columns (OA-2).
- A `tokens-card` still on its first sync (`token-balance-loading`) uses the same column markup and CSS as the seed row. Its height comes from the 37 px left column (53), so only the seed row grows when a default lands: 50 → 53.
- Getting a loading row in a smoke run took four probes. A `listedExtensionPerTest` profile shows no seed rows in an armed build. A seeded balance row with `updatedAt: 0` syncs to a fresh zero within seconds, even with the node blackholed. The recipe that works is `token-list.test.ts`'s: a served list, its source key, `createProfileAcceptingTerms`, and a node that never answers.

## Change (D7)

- Bars beside `meta` lines: 9 → 11 px (`TokenCard`, `TokenSeedRow`, both of `TokensView`'s ghost bars).
- Marks: 9 → 12 px, as on the token page. The loaded detail line stays at 17 px.
- The loading column now uses the loaded box: `gap="2"` and `min-height: 37px`, in `TokenCard` and `TokenSeedRow`.

## Test

`rows.test.ts`: "a default token's placeholder row, still working, stands as tall as a loaded token row". It uses a served list and a blackhole node, measures a working seed row, then seeds a token row and balance, restarts the background, and measures the loaded `tokens-card`. It takes the after pictures through `shotSend`; the before ones came from the probe on the pre-change dist, of the same rows. It is red on base in Chrome: `expected 53 to be 50`.

## Gate

- Lint 0, typecheck:all 0, `modules/general` unit 301/301.
- Smoke after a fresh armed build:
  - Chrome: `rows.test.ts` 10/10 (file 73.5 s, the new case 11.7 s), `type-roles.test.ts` 13 (1 skipped, 59.9 s), `shipped-token-list.test.ts` skipped (live leg only); run 138 s.
  - Firefox: `rows.test.ts` 10/10 (138.8 s, the new case 22.3 s), `type-roles.test.ts` 13 (126.3 s), `shipped-token-list.test.ts` skipped; run 272 s.
- After pictures come from the gate run (`shotSend`, both themes). In the loaded picture, a landed USDC row sits above USDT's working seed row, at one height.
