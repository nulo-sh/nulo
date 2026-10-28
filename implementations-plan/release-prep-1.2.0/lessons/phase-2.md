# Phase 2: the runs, 2026-10-28

All at retry 0, at commit `956fc686e` (both candidates name it; manifest `1.1.0.1`). `git status --porcelain -- apps/extension` was empty before each run, except the new recording after the Chrome live run. Chrome 155.0.8059.79 (Puppeteer 25.14.0's pin), Firefox 153.0.4. No rerun.

| # | Run (UTC) | Outcome |
|---|---|---|
| 1 | Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 07:30:18-07:33:18 | passed: test 101.6 s, vitest 161.4 s |
| 2 | Live, Firefox, 07:33:43-07:37:29 | passed: test 150.4 s, vitest 205.3 s |
| 3 | Replay, Chrome, 07:37:44-07:39:13 | cases 1, 2, 4 passed (22.8 s, 12.4 s, 11.3 s); case 3 failed (38.4 s) |
| 4 | Replay, Firefox, 07:39:29-07:41:14 | cases 1, 2, 4 passed (30.7 s, 17.4 s, 13.8 s); case 3 failed (40.2 s) |

- Case 3 failed on both browsers the same way: `TimeoutError: Waiting failed: 30000ms exceeded` at `update-replay.test.ts:689`, the wait for `auth-setup-again`. Its update checks at `:685-686` passed first. F7 is demonstrated, and I1 held.
- Case 2 ran (it skips only once the seed has moved) and passed.
- The recording: SHA-256 `a5d96c04a1aeb0a648fac05224e10ac6291a545e9bdfd892bdb923c32dd780b8`, 39 keys, no `nulo:e2e:` key. Its plaintext names 5 URLs, all of them the loopback dials. 9 keys are not sealed envelopes: the config, the profile row, the onboarding, legal, schema and last-profile keys, and per profile the integrity, active-network and network-seeded records. It was written at 07:32:59 UTC. Its dApp session, made during that run's populate (after 07:31:37), expires 7 days later, about 2026-11-04 07:31 UTC; the replay refuses it from 10 minutes before (`SESSION_MARGIN_MS`).
- Noise, not reds: the aztec CLI's bind error at boot (`[e2e-setup]` says it is expected); Firefox's `Client disconnected` add-on exceptions while popups closed; one 93 s stall-watchdog silence in the Firefox live run, which passed.
