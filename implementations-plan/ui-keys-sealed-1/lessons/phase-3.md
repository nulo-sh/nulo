# Phase 3: e2e, the update, the measurement (the three maps)

The pointer's parts of P3 wait for OA-1: the exact-pointer checks in the update scenarios, and the network files that exercise only the pointer (`account-switch-isolation`, `execute-scope-account`, `incoming-arrival`, `incoming-transfers`, `profile-reimport-matrix`).

## What changed

- `update-in-place.test.ts` makes three changes through the release's own UI (v0.31.0 carries the same testids): it pins the sandbox token from the token page; it picks Send's fee payer (`sponsored`, private origin); and it hand-picks the app window's fee payer for the deploying send (`runApprovedPgCall` gains `feeMethod`). The release saves every explicit pick, even one equal to the default.
- `fixtures/update/preferences.ts` (`expectReleasePreferences`) runs after the unlock in the live scenario and in both replay paths. It first requires each of the release's three maps to hold an entry. It then waits for each key to hold an envelope, and asks the service for the pins and picks, which must equal the release's maps as the service parses them. `HELD` gains the three names, so a recording made before this arc is refused until it is recorded again.
- `sealed-storage.test.ts` seeds the three maps as structured values, as a pre-seal build stored them. After the locked cold boot it reads them back unchanged. After the unlock it waits until each is a string that does not name the account, and the service returns the seeded maps. Red on the base build: `TimeoutError: Waiting failed: 120000ms exceeded` at that wait (`sealed-storage.test.ts:242`).
- **Deviation:** the plan put the Home timing inside `sealed-storage.test.ts` with no condition. It is a second case behind `NULO_E2E_HOME_TIMING=1`, for two reasons. The required smoke lane would pay about 30 s per browser on every PR for a printout that proves no failure mode. And the base build cannot pass the first case, which asserts the maps are sealed, so the timing has to run without it. Documented in `tests/e2e/README.md` § Home open timing.

## The measurement (popup open → Home ready, Home FCP; median of 5 after one unmeasured open)

"Home ready" means the hash is `#/popup/general`, the hero shows `balance-amount` or `balance-hero-unknown` with no `balance-hero-loading`, and `tokens-list[data-settled="true"]`. The base is `2b856d1a` (the merge base), built armed in a scratch worktree, and its `dist/<browser>` is passed through `EXTENSION_PATH`. Rounds alternate which build goes first.

| Chrome, 8 rounds, medians | base → candidate |
|---|---|
| open to Home ready | 578 → 570 ms |
| first contentful paint | 412 → 392 ms |
| load1 | 36 to 80 |

Within the 50 ms rule. Per-round pairs vary in sign (ready −145 to +142 ms), so the host's noise exceeds any difference.

Firefox: three rounds at load1 between 103 and 152 spread by about 1 s within one build (base ready 1375 to 2473 ms), too noisy to read. A4 records the same at load near 200. The Firefox rounds are taken again at a quieter load (see below).

## Network files (retry 0, `e2e:agent`)

- Chrome: `fee-methods` (8 tests, 314 s), `tx-sendTx-sponsoredFpc` (20 s), `pin-to-home` (31 s), green; the run took 495 s, build and sandbox included.
