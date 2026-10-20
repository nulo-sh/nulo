# test-infra-1: phase 6 (one e2e poll)

## The helper

`fixtures/poll.ts` `pollUntil(probe, done, { label, timeoutMs, intervalMs, show })`: probe at once, then every `intervalMs`; return the first value `done` accepts; a probe's throw ends the poll with that error; a refused value after the budget throws `PollTimeoutError` (`label`, `timeoutMs`, `last`). It is probe-then-check: a loop that checked its deadline before probing now probes once more at the deadline, which no moved loop depends on. Callers whose contract is the last state (`tickStateAtMarker`, `waitForEstimate`) or best effort (`waitForL1ToL2Message` phase 2, `fireCanary`, `waitForToggleToFinish`) catch `PollTimeoutError` themselves; shared-deadline phases pass `deadline - Date.now()`.

## Moved

The per-loop inventory (contract, deadline owner, interval, disposition) went into the PR body before any loop moved. Work that moves the state on runs in `between`, after a refused read while budget remains and before the pause, never inside the probe: `waitForL1ToL2Message` forces a block, `finalizeThrough` mines, `waitForRowOf` refreshes balances, `holdEnterThroughAllow` presses Enter (the first draft ran each inside the probe, so the read that ended the budget started one more block, mine or refresh; Codex round 1 reproduced it). `waitForL1ToL2Message` skips its claimability phase when phase 1 spent the shared budget, as the old loop did. `restore-again` clicks Retry at the start of each re-read, after the pause, as before. `boot-guard.waitWhileAlive` keeps its message prefix (`Timed out waiting for …`, which the README and its test read): its probe throws on the child's exit, on a stranger's listener and on a lost race against the shared deadline. `webdriver-classic.open` now throws at its own deadline instead of falling through to a failing `POST /session`. `passkey-backup` arms its MutationObserver for the Encrypting card (text only, as the poll checked) before the second Protect click; the encryption awaits WebCrypto, so the card's insertion and removal never share a batch. `account-switch-isolation` calls its own `driveScanUntilHeld` and `pollIncomingRecordByHash`.

## Kept, and held

Kept: the H windows (an assertion over a window, not a wait), `endObserved` (a stop protocol with an outside timer), `session-reconnect-flood`'s driver loop, `window-placement`'s `settledWindow` (inside `page.evaluate`), the counted polls, the runner's locks and kill sweeps. Held for arc 3, because a running lane edits the file: `fixtures/profiles.ts` (2), `fixtures/tokens.ts` (1), `helpers/legal-drivers.ts` (1), `same-token-concurrent-sends` (3). At the phase's start five spec and fixture files were in older lanes' diffs (harden-security-fixes-2 and its arcs, send-fees-ux); a trial merge of each lane's head into `origin/dev` left every one of those files unchanged, so their changes were already on dev and the files moved.

## Collision recheck

Re-run against every worktree before the e2e moves: `vitest.config.ts` (authwit-intent-1, PR open) and `FeeSettingsCard.test.ts` (fees-display-1, running) were in Phase 4's diff. Both reverted and held for arc 3; see lessons/phase-4.md.

## Gate (2026-10-18)

Fast layers on f68a6e98: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (836 files, 13677 tests). E2E at retry 0, load1 under 150 before each run, the armed smoke builds and the proverless network runner as the plan spells them:

- Smoke Chrome (started at 94deea17; the later fixes add `between`, unused on the smoke paths, and Firefox-only text): 57 files passed, 6 skipped, 260 tests, 30 min.
- Smoke Firefox on f68a6e98, attempt 1: 59 files passed, 1 failed: `viewers-csp` (untouched by this arc), `logLines` timed out waiting for the editor to grow by its 60 probe lines; two later tests in the file passed through the same helper. Traced to a plausible cause in the viewer's 100-line trim at 1,100 lines and filed as #749 (`flake`). The one rerun: 60 files passed, 3 skipped, 260 tests, 41 min.
- Network Chrome on f68a6e98: the run was stopped by the agent tool's two-hour limit for a background command with 128 of 129 files reported (123 run, 5 skipped on Chrome). Every run file passed except `import-handshake-note-matrix`'s passkey row, the pre-existing red of #643 (its import refuses a resealed MAC-bound backup; red since #598, the file is skipped on CI); it failed after 343 s, inside `importPasskeyFullBackup`'s 300 s wait, which this arc does not touch. The one file never reported, `import-handshake-note`, then ran alone on the same head: 2 tests passed. Later long suites run detached (`setsid nohup`) with a waiter, so the tool limit cannot stop them.
- Network Firefox on f68a6e98, detached: 28 of 129 files reported in 45 min, none failed; stopped (SIGTERM to its process group, the runner tore down its own services) when the gate moved to the head merged with `dev`, which supersedes every run above.

### The gate on the merged head (fd52d5be, `origin/dev` merged)

Fast layers: `bun install --frozen-lockfile`, `bun run lint` 0, `bun run typecheck:all` 0, `bun run test:all` 0 (extension 847 files, 13879 tests). E2E at retry 0 (no `retry x` line in any log), load1 under 150 at each start. To fit the host's time, suites that share nothing ran side by side: network Firefox beside smoke Chrome, then smoke Firefox from a second armed build passed through `EXTENSION_PATH` (smoke's setup kills every browser loading its extension path, so it must not share `dist/firefox` with a network run), and network Chrome from a temporary detached worktree at the same commit (a network run owns its worktree's `.e2e-state`), removed afterwards.

- Smoke Chrome: 57 files passed, 6 skipped, 260 tests, 29 min.
- Smoke Firefox: 60 files passed, 3 skipped, 260 tests, 40 min.
- Network Firefox: 123 files passed, 5 skipped, 1 failed, 226 tests passed, 2 h 22 min. The failure is #643's passkey row again (`importPasskeyFullBackup`'s 300 s `waitForHash`, `helpers/handshake-import.ts:233`, untouched); the Firefox reproduction is on the issue.
- Network Chrome: 123 files passed, 5 skipped, 1 failed, 228 tests passed, 1 h 57 min; the failure is #643's passkey row, as on Firefox.

Every suite passed except #643's passkey row, which fails the same way on both browsers in a file CI skips and this arc does not touch; no rerun was spent on it.
