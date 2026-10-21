# Phase 1: the probe and G1

Scratch spec `tests/e2e/network/_probe-warm-stack.test.ts` (deleted after this phase), through `agent.sh`, proverless, retry 0, on a shared host with no load gate. One reference launch, then twelve cycles per arm in rotating blocks (U K J, K J U, J U K). Each cycle starts at `launchExtension()` and ends after the switch on Local. Times are in ms. "Net" is the onboarding segment plus the switch.

## Runs

| Run | Browser | Head | load1 start → end | Result |
|---|---|---|---|---|
| probe-chrome-1 | Chrome | 089581036 | 232 → 347 | 36 key comparisons red: FPC ids unnormalized (below) |
| probe-chrome-2 | Chrome | 089581036 | 282 → 172 | 28/37; 9 red, all the same late FPC write (below) |
| probe-firefox-1 | Firefox | 089581036 | 152 → 255 | **37/37 green** |
| probe-chrome-3 | Chrome | 089581036 (fixtures with K drafted; the probe's arms do not use them) | 228 → 164 | **37/37 green** |

## The green runs

| | Chrome (run 3) | Firefox |
|---|---|---|
| U onboard, median [IQR] | 3902 [3616, 4362] | 6225 [5846, 6591] |
| K onboard | 2572 [2410, 2931] | 3875 [3594, 4309] |
| J onboard | 2704 [2537, 3164] | 3686 [3434, 4193] |
| switch, U / K / J medians | 784 / 770 / 782 | 1263 / 1767 / 1943 |
| U net | 4729 [4362, 5183] | 7616 [7001, 8250] |
| K net | 3476 [3224, 3919] | 5748 [5334, 5888] |
| J net | 3494 [3312, 3948] | 5569 [5368, 6544] |
| U − K net, per block | +1147 [781, 1776], 11 of 12 > 0 | +2000 [1042, 3012], 11 of 12 > 0 |
| K − J net, per block | −228 [−394, 456], 5 of 12 > 0 | −168 [−542, 481], 5 of 12 > 0 |
| J's fork `import()` / `createProfile` | 18 008 / 629 | 20 532 / 534 |

Chrome run 2 agrees: U − K net +924 [611, 1869] with 12 of 12 above zero, and K − J net +62 [−425, 176]. Its fork import took 27 132 ms.

## G1

- **K: go on both browsers.** U − K is positive, and the U and K interquartile ranges are disjoint, on the onboarding segment and on the net. The saving matches I1 (0.9 s / 1.95 s).
- **J: no-go on both browsers.** Its saving over K is nil, and the range spans zero on both browsers. An unlock runs the creation's key derivations (F2), so all J skips is the register page, and the reopen it pays costs about the same. Its cost is 18-27 s of fork import per fork. With about 95 calls in the pool, it cannot reach 2 % of either pool (77 s / 92 s) at any sign.
- **Firefox moves part of K's saving into the switch:** the switch median is +0.5 s on the kept popup. It is still running work that U's reopen used to absorb. So `[onboard]` spans the registration through the switch (D7), and rule (b) is judged on the net.

## Static counts (the network pool: 122 files, the lane's 12 dedicated files excluded)

- **K changes about 94 registrations per run of the pool on Chrome and 95 on Firefox.** That is 91 counted from block-time-1's span run plus those counted statically in files it did not cover: `stale-anchor-recovery` ×2, `stale-network-a10-capture`, and on Firefox only `firefox-background-restart`. These are every registration under `localNetworkExtension`, `tokenReadyExtension`, `feeJuiceReadyExtension`, `dappConnectedExtensionPerTest` and the four `…Cap` fixtures.
- **These still open a fresh popup over an onboarded wallet:**
  - `registeredExtension` and its consumer `dappConnectedExtension`, which is file-scoped, so the open popup would leak into the file's tests.
  - `listedExtension` and its per-test twin.
  - Direct `registerProfile` calls in test bodies.
  - In the span run, that came to 55 of 155 registrations.
- **The critical shard** (`assignShards` over `shard-timings.json` of 2026-10-20) is Chrome shard 5 (784 s recorded, 19 K calls) and Firefox shard 3 (931 s, 19 K calls). Expected saving: about 22 s and 38 s. The shard SD is 48-96 s, so three pairs can only show a direction (I3).

## What the probe taught

- **FPC rows carry random ids too.** On Local, `FpcService` discovery writes `nulo:core:fpcs@<random8>`, which the plan's normalization and Codex round 4 both missed. The probe now names them by chain, type and address. It also refuses any row whose `id` equals its key's non-numeric id, so an unnormalized generated id cannot slip past again.
- **Those rows land seconds after the switch** (median 4 s on Chrome run 3), through `getFpcs`' lazy discovery. A 2 s quiet window misses them on a loaded host, so the comparison polls until the stored state equals the reference.
- **The fork needs `chrome.runtime.onConnect`** to construct the production `ProfileService`, because the messaging base class subscribes on construction. A scoped stub was enough. Its rows (only `nulo:core:profiles@<id>`) unlocked to Home with no recovery banner every time.
- **Host saturation** (load1 above 300) stretched single cycles to 15-78 s in run 1, and one `switchToNetwork` 5 s wait timed out there. Runs 2 and 3, at lower load, had no such stalls.
