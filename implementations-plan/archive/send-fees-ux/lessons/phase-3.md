# Phase 3: #504, where Send's fee wait goes (measured, no code landed)

## How (2026-10-15)

- Temporary numeric probes, reverted after the run (`git diff --stat -- apps` empty): the card (init, the peek and whether it hit and was stale, prefill read, early FPC list, commit, whether the peek's default matched the committed one), the popup store (a wait for an earlier attempt, each forced attempt and whether it timed out, the FPC attempt) and the service worker's reader (each `get`, compute start, each leg's end). Times are `Date.now()` relative to the click on Send.
- Collection deviates from the plan: the popup marks went to a page global and the worker's to a `chrome.storage.session` key, both read by the test, instead of Developer Mode plus `readSwLogTrail`. Codex's round 1 allowed "another temporary numeric-only probe"; this one needs no logger level or flush wait.
- One run: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts --retry=0 -t fee-timing`, prover on (in-browser WASM; no Presto on this host), load1 118 at start, 198 s wall-clock, green. Opens: three with no transaction between, one after a send settled, one 3 s after a second send's record entered `proving`.

## Numbers (ms after the click)

| Open | FPC list ready | forced gas read ends (public / private leg) | commit | peek | peek default = committed |
|---|---|---|---|---|---|
| 1 | 76 | 363 (362 / 269) | 365 | hit, fresh | yes |
| 2, idle | 54 | 275 (273 / 226) | 275 | hit, fresh | yes |
| 3, idle | 63 | 249 (248 / 153) | 250 | hit, fresh | yes |
| 4, after a send | 47 | 305 (303 / 186) | 305 | hit, fresh | yes |
| 5, during a proof | 112 | 5 817 (5 815 / 5 720) | 5 818 | hit, fresh | yes |

No open waited for an earlier store attempt, none timed out, none committed degraded.

## Reading

- On an idle open the forced gas read is the whole wait (I1 holds): about 0.2-0.3 s against a local node, both legs in parallel; the FPC list is ready in under 0.12 s.
- While a send proves, the forced read waited about 5.7 s, and **both** legs waited, the public one too, so the hold is not only the PXE's one-call-at-a-time queue (I2 holds in part: the read waits for the proof, through more than the private leg). By the commit the send had left `proving`. Inference: the offscreen document that runs the proof also serves both reads.
- Lower bounds: the node is on localhost and this 188-core host proves in seconds. On Testnet each leg crosses the network and a browser proof takes far longer, so the during-proof wait can reach the store's 20 s per-attempt bound and commit degraded ("Couldn't load fee data"). Not measured here.
- The peek hit on every open and its default matched the committed one 5/5 (OA-2 C's premise holds on this run; it was not built, OA-2 ships A).
- Stop condition not met (no timeout, no degraded commit, the peek did not miss). Making the read faster while a proof runs is a separate change, as OA-2's text says.
