# Phase 4 (A3) · the in-place update harness

## Step 1, the mechanism (run during A1, 2026-10-19, before A1's PR)

Two production builds of `ec831afb` (0.31.0.0, and the same bytes at 0.31.1.0 / 0.31.2.0), a probe imported first by `service-worker-loader.js` recording every `runtime.onInstalled`, Chrome for Testing 152 and Firefox 153. One fixed path P, one profile D.

- **Close, swap P, relaunch on D (the plan's flow): no update on either browser.** Id (Chrome, from the path), per-profile UUID (Firefox, `prefs.js`), storage and the new code all carry over, but every launch reports `reason: "install"`, `previousVersion: null` (Firefox also `temporary: true`; its temporary add-on is gone from `extensions.json` after each close). So every e2e relaunch runs the wallet's install branch (the onboarding tab), which a real update never does; the `fixtures/extension.ts` comment that a reused profile "opens no tab" is wrong on both browsers (the fixture's poll closes the tab).
- **Swap P while the browser runs: a real update on both.** Firefox: a second geckodriver `POST /moz/addon/install {path: P, temporary: true}` gives `update`, `previousVersion` 0.31.0.0, same UUID, storage kept, no barrier; `runtime.reload()` after a swap does too. Chrome: `Extensions.loadUnpacked(P)` over CDP (pipe transport, `--enable-unsafe-extension-debugging`, no `--load-extension`) a second time in the same session gives `update`, `previousVersion` 0.31.0.0, same id, storage kept; a CDP-loaded extension is not restored after a restart. `chrome.developerPrivate.reload` from `chrome://extensions` under `--load-extension` hangs, then blocks the extension.
- **Consequence (D21):** the harness swaps P inside one session and reinstalls (Firefox: the driver's existing install call; Chrome: a CDP `loadUnpacked` launch mode in `fixtures/browser/chrome.ts`), and verifies in that session. The stop condition (Firefox cannot under its temporary install) is not met.

Raw data, commands, wall-clock: kept outside the repo with the lane's scratch (`results-*.json`, `RESULT.md`).

## Step 2, `releaseBuild`

`fixtures/update/release.ts` pins each tag's zip digests (v0.31.0's taken from its release and checked against `SHASUMS256.txt` once); a tag with no pin, a zip whose digest differs, and a `SHASUMS256.txt` that omits it, names it twice or disagrees are refused (`scripts/e2e/release-build.test.ts`). The cache is run-owned (D25).

## Step 3, the live scenario

- The 0.31.0 UI matched today's helpers on every flow (a read-only comparison of the tag against `fixtures/` and `helpers/`, per testid): no adaptation needed. Gaps were elsewhere: no helper completes adding a network (written inline), and `connectPlayground` could not ask for a custom chain (it now passes `chainInfo` through).
- A 0.31.0 release build has no `VITE_LOCAL_NETWORK_RPC_URL`, so its Local Network points at `localhost:8080`; the run's sandbox is reached as an added network, whose chain id is `31337 ^ rollupVersion`, and the playground asks for it with `?chainId=31337&version=<rollup>`.
- Verification reads the registry in Node (`fixtures/update/stored-rows.ts`): every key must be claimed by a registered shape and read by that shape's read code; a dApp session is read through its codec only, since its MAC key lives in the session that signed it, and the reconnect proves the MAC.
- Green first run on both browsers, nothing to fix: Chrome 105 s test, 299 s run wall-clock (build, sandbox, test); Firefox 111 s test, 256 s run. Estimates were 6 and 9 min.
- A pipe-launched Chrome (the update launch mode) exits when its parent is SIGKILLed (9 processes, then 0, 5 s after `kill -9` of the node parent): no orphan for the path sweep to miss.

## Step 5, fixes

- The reset composition test seeded no incoming cursor, outbox or arrival row and no token balance. Seeding them: cursors and outbox purge with the chain; an arrival row comes back under its kept key (network id and address survive the reset) with a fresh baseline, so the test asserts the old chain's receipts are gone rather than the key; token balances survived because the harness stubs the balance service, whose purge follows the token-deleted event. A focused test runs the real balance service (old chain's row gone, the other kept); a stubbed run of it fails (mutation check). With the real service in the shared harness, the other chain's outbox row drains on refresh, normal work that breaks the byte-identity check, so the shared harness keeps the stub (D27).

## Step 6, the review loop

- **Codex r1: reject, six findings, all applied.** The onboarding-tab marker could not tell an install from an update (an `onInstalled` probe the staged candidate imports first replaced it, D29); a corrupted imported key and a corrupted session MAC both passed the row checks (the imported key's export now previews, and the connected-apps list reads each session through its MAC); the reset comparison missed rows keyed by network id; a Firefox run could overwrite the recording; comments restated code.
- **Opus review beside r1: conditional approve.** Applied: the candidate names its commit (D28); the live run sends once, so the recording carries a `txs` row, and `HELD` names the families it must hold (D30); run-owned directories and offline endpoints (D31); the promote step says when the live run applies (D32); the build refuses Vite's env files. Not applied: the comment on a reused profile's first-run tab in `fixtures/extension.ts` predates this arc and is outside it.
- **Positive control for the probe's predecessor.** A target watcher saw the install branch's onboarding page on Chrome and nothing on Firefox, whose BiDi reports neither the page nor its close: the watcher was vacuous on one browser.
- **The probe's first run failed on Chrome only**: it compared the reported details by `JSON.stringify`, and Chrome returns the keys in another order. Compared field by field.
- **Codex r2: conditional, two findings, both applied.** The committed recording held no `txs` row, so the replay now refuses a recording that lacks any `HELD` family; the balance outbox is a queue the release deletes once a refresh succeeds (`settleAnchoredRow`), so it left `HELD` and its absence after the update is not a loss.
- `sendDefaultTx` sets the amount to 1 base unit whatever the caller set; the send moving one whole token calls `runApprovedPgCall` directly.
- **Codex r3: conditional, one P2, applied.** Excusing every drained outbox row also excused one dropped before its refresh, which leaves a stale balance no boot requeues. The excuse now holds only in the live run, whose verify asserts the exact balances; the replay is strict.
- Measured: live Chrome 162 s test (326 s wall, recording) at f1593a0d and 102 s (180 s) at 7064527d, Firefox 186 s (286 s) and 182 s (262 s); the strict replay at 7064527d, Chrome 15 s + 9 s, Firefox 17 s + 14 s. The send (the release's real proof of the account's deployment) took the live run from about 105 s to 162 s.
