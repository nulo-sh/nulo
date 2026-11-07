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

## The arc's diff review, round 1

- **Codex `01a1b505`**: revise, 1 P2 and 1 P3, no P1.
  - **The P2.** A take updated its record before the write, so a failed first take let the next row's write record both offers, and the first row never got its append. A take now keeps its record only once written. A two-row service test was seen red without the fix.
  - **The P3.** § 5.12 described a strict per-address limit. The Worker counts an IPv6 client by its /64, approximately and at each Cloudflare location; the text now says so.
- **Opus 5.5**, fresh: approve with changes, 3 medium and 5 low.
  - **Legal.** § 2's summary and the manifest said the relay "writes no log", while § 5.5's hosting records apply; both now say so. Terms § 2 still contradicts the relay on its path, so BEFORE-LAUNCH holds Terms 1.2.3's publication on OA-9. § 2 also said "Two hosts" for two hostnames, and § 5.1 said every network starts on a provider, which the Local Network does not.
  - **A failed record write at seeding.** A new profile's rows carried the relay but its record write failed. The next pass recorded the kinds without the relay offer, so a relay removed after that came back at the next worker. The seeding pass now records every kind whose row holds its seed's relay (`relayHolders`). The test was seen red without it.
  - **A reorder in the session that converts a row** is refused with the failed-update toast before the page re-reads. Added to known limit 11.
  - **The frames.** The converted frame was the new profile's frame. Alpha now holds an endpoint of the person's before the third restart, so the converted frame shows `[dRPC, My node, Nulo]`. "My node" is written as a pre-seal row, since no smoke node passes the add form's check; its URL is loopback port 1.
  - **Hygiene.** The shot names no longer carry a decision-page tag. The table asserts each case's takes. The id comment says why the id is derived.
  - **Rejected:** moving the runtime out of the spec's header. The repo's e2e headers carry their estimate and measurement, and this one now carries both.
  - **Deferred to the owner:** the "Nulo" label and its place need an explicit yes in the PR (§ UI changes need explicit owner sign-off). OA-6 was marked read with a question.
- 2026-11-07, the round-1 fixes: network, conversion, storage and legal suites 509 + 60 green; the relay smoke green at retry 0, Chrome 13.4 s and Firefox 22.2 s.

## Round 2

- **Codex `01a1b505` resumed: approve**, nothing new. Both round-1 findings were confirmed closed.
  - `relayHolders` records a relay already on a row and appends nothing, so a relay the person added by hand also stays removed once removed.
  - The planted Alpha row exercises sealing and then the conversion. The Testnet leg still proves the append on a sealed row.
- The loop converged at round 2.

## The lane's cross-arc review

- **Codex `01a1b51b`**, fresh, over the 190 paths the lane touched, diffed from `98c0ad9bf^`: revise, 2 P2 and 2 P3, no P1.
  - **Bounded reads and the return.** `route.singleAttempt` neither ticked the health nor started return probes. A background route served only by bounded reads (the tip gate, storage reads during a send) therefore stayed on its fallback, now the relay for every default network. It now does both before its attempt, as `call` does. The test drives the return through bounded reads alone and was seen red without the fix.
  - **A hanging primary and the status probe.** `probeNodeStatus` gives the first endpoint the whole remaining budget. On a cold route a primary that never answers spends all 5 s, and the relay is never asked. Filed as #1754, not fixed: sharing the budget changes how long the wallet waits on an endpoint, which the approval boundary reserves.
  - **The text.** § 5.12 also says the relay serves until the primary wins the role back. SECURITY lost its three-strike eviction bullet, which #1687 removed from the code. ARCHITECTURE's floor follows the active endpoint down as well as up.
