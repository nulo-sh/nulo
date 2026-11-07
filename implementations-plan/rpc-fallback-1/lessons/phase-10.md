# Phase 10 (arc 5): Nulo's relay as each default network's second endpoint

The owner's answers on decision page 112, signed 2026-11-06 14:18 UTC: OA-5 D, OA-6 read with the note "Just "Nulo"?" (the label "Nulo"), OA-7 A. Their note on OA-5 asked why the migrations architecture does not cover this change, and what else cannot take a one-time migration; the PR body answers it.

## Design consult

- **Codex `01a1b4d5`**, read-only: 8 findings, 6 medium and 2 low.
  - The bulk pre-write I proposed in `convertRows` put the relay's rule outside the entry, and consumed offers that never reached the conversion. The entry now takes each offer itself, through a context port.
  - An absent record must stand for `KINDS_SEEDED_BEFORE_RECORD`; a record made up from nothing would bring back defaults the person deleted.
  - The legal text must replace what the relay contradicts ("I do not operate a backend", "one host"), not add to it.
  - The smoke must also prove a removed relay stays removed across a later unlock.
- **Opus 5.5**, fresh: 11 findings, 3 high, 5 medium and 3 low.
  - Every writer of the record rebuilt it from `offered` and `announce`, so the new field would have been dropped.
  - Only the seeds a pass adds may record the relay offer; `offered` also names kinds a row already holds.
  - The Terms' § 7.1 line had to be factual; §§ 2 and 7.5 are outside OA-7 and go to the owner (OA-9).
  - Rejected: acting only on a valid record. The baseline is what an absent record already means, and waiting would cost a further unlock.
- Both agreed on `relay?` beside the seed's primary rather than an ordered list: every reader of `seed.rpcUrl` means the primary.

## As built

- **The framework.** The entry's contract sentence changed: `convert` reads `row`, `rows` and the run's `context`, and a change made once per profile records itself through `context`, never on the row. The unlock hook reads the offer record under the network lock (`relayOffersLocked`, a new `REVIEWED` line in the scan test). No other code path decides the append.
- **Take before commit.** The entry writes the offer before its row commits. A commit-time write would be lost if the row landed and the worker stopped; the next pass would find the relay held, return nothing, and never record the offer.
- **The held check.** A hostile row holding `https://RPC.nulo.sh/` was not treated as holding the relay; the check now compares URLs as `sameEndpointUrl` does.
- **The earlier-build fixture.** `service.test.ts`'s `asEarlierBuild` also strips the relay. Left seeded, the second endpoint started admission probes in a test that asserts nothing is sent.
- **The popup.** It reads its networks once at unlock and listens to no `onNetworkUpdated`, so a page open across the conversion shows the old list. Every unlock conversion already behaves this way. The e2e reopens the popup, as a person's next open does (known limit 11).
- **The arrival smoke's stub** answered `getNodeInfo` only. With two endpoints the route admits its primary with `[getNodeInfo, getChainTips]` first, so the batch blackholed, the relay's stand-in refused, and the status never settled. The stub now answers chain tips (`chainTipsResult`).
- **Captures.** The dRPC row shows its URL under the title, so the frames blur every endpoint URL but the relay's before the shot.
- **#1740.** `routeEvents` now judges eviction against the stored log's capacity at the run's level: 1000 lines below Debug, 2000 at Debug.

## Runs

- 2026-11-07, Chrome, armed smoke, `endpoints`, `network-arrival` and `egress-guard`, retries on: three reds.
  - The relay spec navigated to Settings from a detail page, which has no nav bar.
  - The two cases of the arrival spec's Mainnet stub, as above.
  - Both fixed.
- 2026-11-07, Chrome, the relay spec at retry 0: red. The stored row held the relay but the open page did not (the popup point above).
- 2026-11-07, Chrome and Firefox, at retry 0: `endpoints`, `network-arrival`, `egress-guard` and `rows`, all green. Chrome's `rows` took 63 s and Firefox's 98 s.
- 2026-11-07, Chrome, the update replay from v1.2.0 with a candidate built at `0005e7eca`: 4/4 green in 54 s.
  - Its endpoints move off the seed, so the entry declines there.
  - The opt-in `default-network-arrival-update.test.ts` cannot run against any cached release, since v1.2.0 already seeds Mainnet. Its new expectations are reasoned, not run.
- 2026-11-07, the removed-relay leg was added after the first green run. Its first version had no written estimate; this one was estimated at 20 s on Chrome and 35 s on Firefox.
  - Measured 12.6 s on Chrome and 23.7 s on Firefox, both green at retry 0.
  - Seen red on Chrome with the offer check disabled: `expected 1 to be -1` at the stays-removed assertion.
