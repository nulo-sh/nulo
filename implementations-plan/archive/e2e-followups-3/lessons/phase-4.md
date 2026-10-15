# Phase 4: docs, quality loop, delivery

## Step 1: the docs against what Phases 1-3 measured

The run logs, `~/.cache/puppeteer/firefox/linux-stable_153.0.4` and `bun.lock` (`puppeteer-core@25.8.0`) match the revision FIREFOX.md and the skill name ("Proved on Firefox 153.0.4 with puppeteer-core 25.8.0"; a failing arming or capture check on a Firefox bump holds the bump). The dynamic-import row and the flake ledger already carry Phase 2's and Phase 3's results.

## Quality loop, round 1

Codex (`run-codex.sh … high read-only gpt-6.1-sol`, prompt: the arc's diff against `27af8d7`, the plan and ledger, the adversarial ask and the two verbatim rules): **approve**. It confirmed the eight restored files match `39f3dda` and found no functional blocker in caller compatibility, attribution or gate propagation.

| # | finding | severity | disposition |
|---|---|---|---|
| C1 | skill row 52 "never a test failure; ignore it in triage" reads as a blanket exemption | minor | accepted: the row now says a stderr line alone is the known diagnostic, and a recorded entry or failed assertion beside it still fails |
| C2 | `reopenAndRecoverAfterImport`'s doc carries a phase tag ("P0-proven") | nit | accepted: tag dropped in the block this arc rewrote; the rest of the contract kept |
| C3 | `_probe-console-capture.test.ts`'s header cites an archived plan and repeats the opt-in note | nit | rejected: both predate the arc, the path resolves under `archive/` (allowed until the comment is rewritten), and the re-land stays byte-identical to the reviewed `39f3dda` |

Opus diff review (Agent tool, read-only): **approve**. It verified byte-identity of the six relay files against `39f3dda`, all 28 caller files of the lock helpers, the unchanged 15 s literal (the old code gave the redirect 0 ms and then 15 s on a reloaded document; the new one gives the same document 15 s, no retry) and that no filter was added.

| # | finding | severity | disposition |
|---|---|---|---|
| O1 | `ensureUnlocked`'s comment cites a `lockWallet` doc on stale-TRUE `isLogined` that 1203582 removed | minor | accepted: it now says the lock chip clears `isLogined` before the background drops the session |
| O2 | "once the lock event has read the profiles" misses `unlockAfterBackgroundDeath`'s pages opened after the lock | nit | accepted: the redirect comes from the lock event or, on a page opened after the lock, from its boot; FIREFOX.md and the skill say "the popup's own redirect" |
| O3 | "Chrome stays silent" overreaches: P2c's Chrome control cut bare imports only, never the CSS step | nit | accepted: the Chrome claim is limited to a cut import (FIREFOX.md, skill line and row 51) |
| O4 | row 52's file list omits `sim-from-selfpay` | nit | accepted |
| O5 | `reopenAndRecoverAfterImport` no longer reopens | nit | accepted in part: no rename (six callers); the doc names the user's reopen it models and says it runs in one document |

Comment and doc changes only; lint and `typecheck:all` exit 0.

## Quality loop, round 2

The same Codex session resumed with `15f69a6` and the dispositions above, asked whether any fix claims what the code, the logs or the measurements do not support: **"no new material finding"**. The loop converged after two rounds.

## Pre-push gate (PASS)

On `15f69a6`: `bun run lint`, `lint:actions`, `check:plans` and `test` exit 0 (740 files passed, 3 skipped; 11,252 tests passed). Comment and doc changes since Phase 3's gate only, so no e2e rerun.

## Delivery

PR #313 opened on `0cdd317`. Its first CI run: 46 checks passed; the four `chaos` jobs (both browsers) and the two network aggregators failed. The chaos test itself passed (1/1); `assert-canary-results` failed with `send-chaos.test.ts: no entry in canary-expectations.json`. The run took its workflows from the merge ref (dev's chaos lanes, #304) but checked out `0cdd317`, whose `canary-expectations.json` predates that entry (the known merge-ref gotcha in `implementations-plan/lessons.md`). Merging `dev` brings the entry.

## Close-out merge

`origin/dev` merged clean (`77bd9d3`); `index.md` and `lessons.md` read (two other lanes' status lines, one added and one retired lesson). The merge brought two e2e fixtures (`chaos-seed.ts`, `journal-page.ts`) and changes to nine network files, so those ran on both browsers at retry 0, proverless, one at a time, with Phase 3's temporary entry log (reverted after):

| run | Firefox | Chrome |
|---|---|---|
| `connect-one-window`, `legal-acceptance-wall`, `scope-refusal`, `session-tabClose`, `sim-methods`, `tx-sendTx-multicall`, `tx-sendTx-noFrom`, `tx-transfer-row` | 8 files, 19/19 | 8 files, 19/19 |
| `send-chaos`, seed 1095865833 (`NULO_E2E_CHAOS=1`) | 1/1 | 1/1 |
| `send-chaos`, seed 1960252198 | 1/1 | 1/1 |

`dist` listing hash unchanged within every run. Delivered to the listeners at error level: `Error: Client disconnected` ×2 (`scope-refusal`, `send-chaos`, popup pages), absorbed by the pre-existing filter; nothing newly recorded. Firefox stderr: `DataCloneError` 0; the per-launch `unsafe filename` line for the relay's `data:` process script (known since the relay's first landing), Firefox-internal `resource://` errors, `PortMessage for closed conduit`; no `error loading dynamically imported module`, no `Unable to preload CSS`. On the merged head: `lint`, `typecheck:all`, `lint:actions`, `test` exit 0 (741 files passed, 3 skipped).
