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
- Firefox: `fee-methods` (8 tests, 560 s), `pin-to-home` (47 s), `tx-sendTx-sponsoredFpc` (28 s), green; 721 s with build and sandbox.

## The update (`NULO_E2E_UPDATE_FROM=v0.31.0`, retry 0)

| | Chrome | Firefox |
|---|---|---|
| `update-in-place.test.ts` (live; Chrome recorded) | 133 s | 200 s |
| `update-replay.test.ts` (3 cases) | 50 s | 69 s |
| `default-network-arrival-update.test.ts` (`--extra-seed`, 2 cases) | 36 s | 46 s |

The live scenario's estimate (+40 s Chrome, +60 s Firefox) sits inside its earlier measured range (102 to 162 s, 182 to 186 s). The Biome pre-commit hook refused the raw recording: `writeRecording` expands arrays, and Biome folds short ones. `biome format --write` on the file changes only whitespace, and the replay reads the same JSON.

## The measurement, Firefox at a quieter load

The pair is the same: base `2b856d1a` and the candidate at `d208a4fd`, both armed and built before the merge of `dev` at `c49430a6`. That merge brings #1080's icon change, which a base at `2b856d1a` does not have. The round started at load1 161 was skipped.

| Firefox, 7 rounds, medians | base → candidate |
|---|---|
| open to Home ready | 952 → 958 ms |
| first contentful paint | 400 → 413 ms |
| load1 | 40 to 98 |

Within the 50 ms rule. Per-round ready spans 853 to 1109 ms on the base and 853 to 1249 ms on the candidate. The candidate's two slowest rounds came last and ran at load1 46 to 52, where the base gave 853 and 1066 ms. The difference stays inside the host's noise. What the path adds is one RPC that opens one sealed row, where before it was one `chrome.storage.local.get`.

## Smoke runtime: the one smoke file this arc changes

`sealed-storage.test.ts`, conversion case only (the timing case skips without its flag), retry 0. The base runs its own file on its own build.

| | base | candidate |
|---|---|---|
| Chrome | 28.7 s (load1 35) | 34.3 s (load1 40) |
| Firefox | 59.6 s (load1 39) | 68.9 s (load1 160) |

Chrome adds +5.6 s against the +5 s estimate. The Firefox pair ran at different loads, and the candidate's earlier run gave 84.3 s, so its +9 s is an upper reading.

The full smoke suite, retry 0, at P2 (`c29ed290d`): Chrome 1845 s in 5 shards and Firefox 2777 s in 7. A base run of the full suite was not taken: only this file changed between P2 and P3, and P2 changed no smoke spec.
