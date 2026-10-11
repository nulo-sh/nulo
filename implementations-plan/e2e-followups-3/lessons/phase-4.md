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
