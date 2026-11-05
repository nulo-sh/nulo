# Phase 2: the runs, 2026-11-05

Every run at retry 0, through `e2e:agent` (live) or `test:e2e` (replay), with no rerun. Chrome from Puppeteer's pin, Firefox 158.0 (`install-firefox.ts`). Each run started with load1 under 150 and `git status --porcelain -- apps/extension` empty, except the red control's one edit and the untracked recording before its commit.

## At `3eb970086` (candidates `1.2.0.1` naming it)

| Run (UTC) | Outcome | Wall-clock |
|---|---|---|
| Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 17:41:48-17:45:21 | passed | test 133.2 s, vitest 199.5 s |
| Live, Firefox, 17:45:34-17:49:59 | passed | test 183.9 s, vitest 251.6 s |

The recording: written 17:45:01 UTC, SHA-256 `12a3e7f924c82d4d12d8591f8fae67d170c5060aa7f51d9dfa6224faf96f218a`, 40 keys, tag `v1.2.0`, browser `chrome`, 5 dials all loopback, no `nulo:e2e:` key, 5 plaintext URLs all loopback. Against `v1.1.0.storage.json`: `nulo:core:fpcs` 1 row, not 2 (v1.2.0 never stores the canonical sponsor on the sandbox, F5); `nulo:core:token-id-high-water` and `nulo:ui:getStartedFeeJuiceHeld` new (the second from the bridged Fee Juice); `nulo:core:incoming-balance-outbox` 1, not 0 (it drains, so timing decides). Its dApp session was made between 17:41:48 and 17:45:01; the replay refuses it from 2026-11-12 17:31 UTC at the earliest.

## At `T` = `ba50b97f0` (the recording, a merge of `dev` at `01aa06abf`; candidates naming it)

| Run (UTC) | Outcome | Wall-clock |
|---|---|---|
| Live, Chrome, from v1.2.0, 17:54:36-17:58:17 | passed | test 138.0 s, vitest 205.8 s |
| Live, Firefox, from v1.2.0, 17:58:17-18:03:02 | passed | test 193.4 s, vitest 266.6 s |
| Replay, Chrome, from v1.2.0, 18:03:02-18:04:09 | 4 passed: 27.8 s, 12.9 s, 8.9 s, 11.7 s | vitest 66.0 s |
| Replay, Firefox, from v1.2.0, 18:04:09-18:05:37 | 4 passed: 32.6 s, 21.7 s, 14.2 s, 14.1 s | vitest 87.5 s |
| Live, Chrome, from v1.1.0 (D3 control), 18:05:37-18:08:41 | passed | test 104.5 s, vitest 170.3 s |

- The bridge's cost, like for like on Chrome at `T`: 138.0 s from v1.2.0 against 104.5 s from v1.1.0, about 34 s. Before this arc, from v1.1.0 (#1665's runs): Chrome 97.2 s, Firefox 161.9 s.
- Gates at `T`: `bun run lint` 0, `typecheck:all` 0, `test:all` 0 (extension 993 files, 17,442 passed), `bun --bun vitest run scripts/e2e` 755 passed.
- Noise, not reds: the aztec CLI's bind error at boot; the stall watchdog's longest silences 61.6-125.3 s, under its 10-minute bound.
