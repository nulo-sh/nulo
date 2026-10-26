# Phase C2: arc C2

Every consult, gate and meaningful attempt of arc C2. Paths repo-relative.

## Setup (2026-10-26)

- The worktree's branch is `passkey-chaos-1-c2`, not `worktree-<slug>`, so `agent-worktree register` refused it; the lane's manifest row stays the lead's.
- Base: `origin/worktree-passkey-chaos-1` at `9772b74e9`, which already holds `origin/dev` at `74cf8995b` (#1139).

## C2 design consult (2026-10-26, Codex gpt-6.1-sol, high, read-only)

Asked, before the session file: challenge the session's design for path escapes, false greens, a session outliving `stop`, and a replay that reaches the same end by other means. Verdict: conditional reject, eleven findings, each read in the tree before its disposition; all accepted:

1. `do` params could carry a path or an arbitrary string into a driver: params are shape-checked (refs by pattern, other strings by a short charset, depth two, no arrays) (D47).
2. Path guarantees rested on string checks: `pick-file` reads by descriptor with `O_NOFOLLOW` and checks the descriptor's real path is inside the directory; queue files are read with `O_NOFOLLOW`; every written file is created exclusively.
3. A `do` step's export replaces the download capture with its own: the session's stub carries a mark and is set again before every command, takes only `blob:` URLs, and is preloaded into every page the session adopts.
4. `stop` was unbounded and Chrome's renderers outlive their parent: bounded waits, then signals by pid or by the group a session process leads, never the launcher's own group.
5. "Serving ended" and "the runner exited" were one signal: `ended.json` and `exit.code` are apart, and a replay requires the runner's exit 0.
6. A hold read as held before any assertion reached it: `holdNextGet` reports `isReached`, and only a reached hold exempts its page from the settle.
7. The quiet settle hid races: `--now` on `click` and `press` (D46), and the disabled state is part of what must hold still.
8. O1 lacked the bearer rules: a passkey row holds no bearer, strict mode none at all.
9. A malformed phrase typed into a phrase field became no needle: a valid phrase is a phrase needle, anything else a text needle.
10. A phrase or name read from the screen and typed back differs per run: a fill records the snapshot it was read from, and a replay takes its own (D49).
11. Comparing ends only let a replay pass by another path: snapshots' routes and testids, findings with ids masked, incomplete checks and the commit are compared too (D49).

## C2.1 tour (2026-10-26)

A scripted tour drives one session through every verb and every refusal, then stops it and checks its files and what is left: `snapshot`; `do createPasskey`, `do createPassword`, `do` of an unknown action (refused), `do lock`; the passkey profile picked from the lock screen; `do` after a driving command (refused); `passkey refuse`, `no-prf`, `other` (an unknown name refused, then the profile's own), a second fault on one page (refused), `release` with nothing held (refused), `hold`, the ceremony dialog shown, `release`, Home; an encrypted full backup exported and captured; `open popup <route>`, `snapshot`, `screenshot`, `close`, a snapshot of the closed page (refused); `open onboarding`; `close p0` (refused on Chrome, served on Firefox); the password profile with a wrong then the right password; the import's `pick-file` of the backup truncated, flipped, through a link (refused, `ELOOP`), outside the directory and absolute (refused by the launcher), then intact, and its decrypt; `press Tab`, `press Shift+Tab --now`; `report`; `bg-restart`; `oracle`; a missing testid (failed); five malformed commands (refused by the launcher: no testid, unknown verb, a testid outside its pattern, a deadline under 250 ms, a key outside the list); then either `end` or `bg-restart --deadline 250` (timeout, the session ends) followed by a command answered `ended`.

What the first tours found in the harness, each fixed in the harness:

- A planned restart's step is reported incomplete (logs), as in C1 (D5, D38): kept.
- A served refusal exited 1 while a launcher refusal exited 2: `cmd` exits 2 for every refusal.
- Firefox refused the held assertion once released (`NotAllowedError`: the checks between commands had moved focus): `release` brings its page to the front first (D48).
- A hold released before any assertion reached it stayed installed and would catch a later prompt: it is taken off (D48).
- `open popup <route>` timed out on Firefox and caught the hash only by chance on Chrome: the popup starts behind its lock and sends an open session Home. `open` loads the route and reports the route shown (D51); the page is tracked before it loads.
- Firefox announces a window as `about:blank`, so pages the wallet opened were never adopted: adopted on `targetchanged` too.
- The download stub preloaded into Firefox's `about:blank` window threw (`chrome is not defined`), a page error: it returns where no extension API exists.
- `bg-restart --deadline 250` on Firefox closed the launch while the restart had the node interceptions let go, and the egress guard failed the close: the session waits up to three minutes for late work before closing (D50); `stop` waits up to five minutes for the runner.
- A replay sent the original's download name, which carries a time, and compared profile ids unmasked: picked files map by their session number and 8-hex ids are masked (D49).

## C2.1 gate (2026-10-26, at `9d6459c38` and `70c116fb0`)

- Launcher unit test (`apps/extension/scripts/e2e/chaos-session.test.ts`): 30 consecutive runs at retry 0, 30/30 (71 tests); 72 after the replay mapping. Its refusal tables print each refusal as `[refused] …`.
- The tour, 5 consecutive runs per browser at retry 0, a Chrome and a Firefox session running at once each time: Chrome 5/5 (81 commands, 72 to 80 s), Firefox 5/5 (80 commands, 85 to 94 s); endings alternate between `end` and a timed-out `bg-restart`; every run: runner exit 0, `stop` graceful, no process left by the launcher's sweep or by an independent `/proc` scan for the session id (command lines and environments), the dist copy gone, `actions.jsonl` numbered 1 to n with a result for each, the report in `findings.jsonl`.
- Two Chrome sessions started at once from this worktree: each browser's command line names only its own dist copy; one holds a password profile, the other a passkey profile; stopping the first left the second's seven processes serving; both stopped with nothing left.
- `seeded` once per browser (seed 7): the launcher ran `profile-chaos.test.ts` in isolation and printed its verdict line; both red at step 1 on O2's passkey row fields, the other lead's known red (below), with nothing left.
- Replay: a fresh tour per browser replayed with no difference (`same: true`, exit 0).
- Findings the tours met: on every Chrome tour, opening the onboarding tab after onboarding is done logs `Failed to fetch dynamically imported module` at error level as the tab closes itself (O4, unfiled; triage in the pilot's findings); on Firefox, `Client disconnected` at a create, filed as #1132.

## The other lead's reds (recorded, not mine)

`apps/extension/tests/e2e/helpers/profile-chaos/backups.ts` imports `downloadPlainPasskeyBackup`, which `helpers/backup-export.ts` no longer exports (typecheck), and three tests of `scripts/e2e/profile-chaos-model.test.ts` fail after #1139: cited lines moved, and O2's passkey row fields predate the row's new fields. The second makes every passkey create an O2 finding in a session, and stops a seeded run at its first passkey create.

## What an agent may read (2026-10-26, before the probe)

An agent reads its session directory and the results `cmd` prints, so nothing there may carry a node URL, which may hold a provider key. The network detail page shows each endpoint's URL as text and its editor holds it in a field (`apps/extension/src/popup/pages/settings/networks/[id].vue:292-293`), so `snapshot` masks every URL in a text or value as `<url>` and `screenshot` refuses a page showing one (D52). The browser writes page errors to the runner's output unmasked, so that output moved to `~/.cache/nulo-chaos/.log/<id>.log`, outside the directory. The wallet's logger keeps only an endpoint's origin (`URL_KEYS`, `apps/extension/src/wallet/logger/utils.ts:146`), and reasons and finding details go through `mask`. Checked on a Chrome session, counting without printing any text: the three network pages and their endpoint editors gave 0 texts or values with `://` and 9 masked, every screenshot there was refused, and no result, action or finding file of the session held `://`.

## C2.2 confinement probe (2026-10-26, Claude Code 2.1.310, Opus)

Each probe is a headless agent told to make one tool call per item, exactly as written, and report; the transcript (`--output-format stream-json`) is the evidence, not the agent's report. Run against a live Chrome session with a link planted in its `files/` pointing into `apps/extension/src`, and a stopped session as "another session".

**Probe 1, the brief's settings** (working directory the worktree root, `--permission-mode default`, `--tools Bash,Read`, `--strict-mcp-config`, the two allow rules, no GitHub token): refused `gh`, `git push`, writes inside and outside the directory, the dist copy, the runner's log, another session's directory (directly and by `../`), the planted link, `$(…)` and backtick injection, `&&`, `>`, `|`, `start`, `bun -e`, `printenv`, `curl`. But it **ran** `git status`, `cat apps/extension/src/utils/files.ts`, `ls apps/extension/src`, a Read of that source file and of `apps/extension/dist/chrome/manifest.json`, and `cmd <dir> snapshot; cat apps/extension/src/utils/files.ts`: Claude Code approves read-only commands and reads inside its working directory without a rule, and passes a compound command whose parts each pass. **Confinement does not hold at the worktree root.**

**The fix: the agent's working directory is its session directory**, and the allow rule names the launcher by absolute path, so what Claude Code approves without a rule is what the agent may read anyway.

**Probe 4, the final spawn line** (CHARTERS.md § Fleet permissions), 39 items: ran the session command, a Read of `actions.jsonl`, `ls` and `git log` in its own directory (not a repository), and two commands that expand inside the allowed one (`fill … "$HOME"`, `report "home:$HOME"`; a glob into `report` reached the launcher as extra arguments and was refused). Refused all 32 others: `cat`, `ls`, `find`, `grep`, `head` and Read under `apps/extension/src`, `apps/extension/dist`, the dist copy (directly and as `../.ext/…`), the runner's log, `/etc/hostname`, another session (Read, `cat ../…`, `cmd <other>`, `cmd <dir>/../<other>`), the planted link (Read and `cat`), writes inside and outside (`>`, `| tee`), `gh`, `git -C <worktree> push` and `status`, `cd <worktree>/apps/extension/src && ls`, `start`, `bun -e`, `printenv`, `curl`, and `;`, `&&`, `$(…)` and backtick injection.

**The agent's environment:** `env -i` keeps HOME, PATH, LANG and USER; `claude-usage run` adds the account's config directory and, for a token account, its token to Claude Code's own environment. A Bash subprocess under the same line saw `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` and `SSH_AUTH_SOCK` all absent. So a `$VAR` expanded into a report carries no credential; it can carry a path, which triage masks when quoting.

What else the probes taught:

- `--setting-sources ""` and `--safe-mode`: the user settings carry allow rules (two review scripts, the memory tool), `defaultMode: auto` and hooks, and the user CLAUDE.md asks every session to run the memory tool first; neither reaches the agent.
- `--permission-prompts none`: nothing waits on a prompt; a denial reads "this session has no approval surface".
- `--permission-mode default` is accepted though the help lists `manual`.
- An absolute path in a Read rule takes `//`; `Read(/<dir>/**)` with a single slash is relative to the settings' root.
- `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` turns on Claude Code's Bash sandbox, which needs `socat` (absent here), so no command runs at all, and its first start left empty placeholder files (`.env*`, `package.json`, `node_modules/.bin`, `.claude/…`) in the working directory. Not used; the placeholders were removed.
- This account's stored login had lapsed (`claude auth status`: not logged in), so agents run through `claude-usage run best`, which picks the roster account with headroom; no account name appears in any command or file.
- An agent refused, on its own judgment, the items that expanded credential variables into `report`; a model's refusal is not the boundary, so the environment was checked by a fixed command instead. One such check ran with permissions bypassed in a scratch directory; it was redone under the normal permissions and its result is the one above.

## C2.2 pilot, round 1 (2026-10-26, before the review)

Three agents on the final spawn line, on the code before the review: CH1 on Chrome (103 commands), CH3 on Firefox (112), CH2 on Firefox (107). Each ran about five to six minutes, not thirty: the prompt told it to wind down near 100 to 120 commands. No permission denial in any transcript; every session ended on the agent's `end`, `stop` was graceful and nothing was left. Replays: CH3's differed only in the code revision; CH1's and CH2's also in the O1 lines the harness fix below removed.

Triage of what the agents and the checks reported (CHARTERS.md § Triage):

- **Harness artifacts, fixed in the harness:** O1 read `/popup/profile/new` and `/popup/settings/security/reset` as unlocked-only routes, but the lock screen opens both (every route whose meta sets `isAuthRequired: false` now counts as shown while locked); O2's passkey row fields predate the row's sealed slots (`apps/extension/src/wallet/services/profile/profile-row.ts:5-10`), the other lead's stale table, recorded there; an agent read "the button does nothing" where the wallet showed the empty-name error as `role="alert"` text with no testid (`apps/extension/src/components/composite/ProfileNameField.vue:34`), which the snapshot did not list.
- **Behaviour the contract allows:** an error notice stays until closed, across screens (CLAUDE.md § Common patterns, toasts), so a passkey error still showing after a later success is the contract; `no-prf` on a create applied to nothing, since the fault is an assertion's (now documented and reported when unspent); a passkey profile created from the popup leaves the phrase to the Get started card.
- **Product candidates:** both full-backup import forms say "Select a .json or .txt file" though an export is a gzip (`ImportFullBackupForm.vue:73`, `settings/accounts/import.vue:212`); every red confirm is labelled "Irreversible" (`ConfirmPopup.vue:60`), including the strict-mode disable, which one click undoes; turning strict mode off says re-entry is skipped across restarts, yet the next restart asked for the password (the bearer is minted at the next unlock); a second lock screen keeps showing the profile it opened on after another window switched, and its Continue then unlocks that profile and moves the other window; opening the onboarding tab after onboarding logs `Failed to fetch dynamically imported module` at error level on Chrome as the tab closes itself (every tour).
- **Suspected weaknesses:** 1, held privately (CHARTERS.md § Triage, step 1) and withdrawn when round 2 retested it: the run had armed its fault too late, and the wallet behaved as it should.

## Review round 1 (2026-10-26, Codex gpt-6.1-sol high read-only, and an Opus agent beside it)

Codex: reject, 9 must-fix and 2 consider; Opus: conditional approve, 4 must-fix and 9 consider, six of them shared. Each finding was read in the tree before its disposition; all were accepted but one (plan.md § Review verdicts, D54 to D58).

- The URL masking keyed on `scheme://`, and the endpoint editor's field is editable, so `press Home` and `Delete` gave back an endpoint with no `://`. Masking by the endpoints' values needs the runner to read them, which no session may. The fix withholds them by where they show (D55). Checked on a Chrome session, counting only: the network list and three detail pages and their editors gave 0 texts, 0 values that are not a length, 0 raw `://` in any result, action or summary file; every `screenshot`, `press` and `fill` there was refused.
- `getEntropy` is async: an unawaited call in a `try` never reaches its `catch`, so an invalid phrase became a phrase needle and the next check threw.
- Chrome's `refuseNextStep` replaces the page's `navigator.credentials` methods, so a hit counter set before it was overwritten and reported a fault that had applied as unmet. The counter now wraps the refusal.
- Firefox's browser process is not Puppeteer's child (geckodriver starts it), so the session records no profile for it; its processes keep the session's environment, which is how `stop` finds them.
- `/proc/self/fd/<fd>/<name>` gives a path API the effect of `openat`: a directory held open stays the one written to, whatever is renamed over its name.

## Review round 2 (2026-10-26, Codex resumed, high)

Reject, 7 must-fix and 1 consider; 6 accepted and fixed, 2 declined (plan.md § Review verdicts, D56, D57, D59).

- Round 1's held-directory fix handed C1's `do` exports to the browser as `/proc/self/fd/<fd>/<name>`; Puppeteer passes that path to the browser, where `/proc/self` is the browser. A descriptor path is only good inside the process that holds it. The tours never exercised a `do` export and a restore, so only the review caught it.
- Firefox's `refuseNextStep` sets the session authenticator's user verification off, so it refuses every page's prompts until lifted; a page-local fault needs a page-local shim.
- Whether a shim was spent reads best as whether it is still installed: each one puts the page's own method back on its first call.
- Gate after round 2's fixes: a tour pair (Chrome ending on `end`, Firefox on a timeout) passed, the spent `refuse`, `no-prf` and `other` faults reported nothing, and the unspent `no-prf` (both) and the `refuse` left armed at `end` (Chrome) were reported.

## Review round 3 (2026-10-26, Codex resumed, high, the last)

Reject on two replay-determinism defects, both fixed without a fourth round; every round-2 fix confirmed closed and both declines accepted (plan.md § Review verdicts).

- An id mask that needs a digit misses about one 8-hex id in 2,560 (`(6/16)^8`): rare per run, certain across a fleet.
- The profile repository declares its enumeration order unspecified (`apps/extension/src/wallet/services/profile/repository.ts:51`), so a list position is no identity across runs; the order the session first saw each profile is.

## C2.2 pilot, round 2 (2026-10-26, at `e2c1b37b4`)

Three agents on Opus on the spawn line (CHARTERS.md § Fleet permissions), sessions of 30 minutes started together; the prompt now asks for the whole session (CHARTERS.md § Rules).

| Charter | Browser | Commands | Agent ran | Cost | Reports | Denials |
|---|---|---|---|---|---|---|
| CH1 | Chrome | 433 | 22.0 min | $7.56 | 20 | 0 |
| CH2 | Firefox | 270 | 17.6 min | $4.30 | 14 | 0 |
| CH3 | Firefox | 354 | 15.7 min | $5.10 | 11 | 0 |

- Every session ended at its deadline (an agent that stops early leaves its session to run out); every `stop` was graceful and an independent scan found no process left.
- $0.24 to $0.34 per agent-minute on these charters: OA-C1's two waves of 12 × 60 minutes cost about $350 to $500 if every agent drives the whole hour, less if they stop early as here, after 52 to 73 % of the session.
- Unfiled lines (787, 270, 274) are almost all the other lead's stale O2 table (§ The other lead's reds); incomplete checks 6, 7 and 5, each a planned restart or a fault that met no prompt.

Triage (CHARTERS.md § Triage), each read in the tree before its class:

- **Filed:**
  - #1144 (S2): a negative auto-lock locks every profile out (CH2 175 to 247; the replay's unlocks also hang 30 s).
  - #1145 (S3): two windows creating profiles at once put OA-8's message on the wrong window (CH1 259, 391 to 396).
  - #1146 (S3): the full-backup import asks for `.json` or `.txt`.
  - #1147 (S3): every red confirm reads "Irreversible".
  - #1148 (S4): the onboarding tab's self-close logs at error level on Chrome.
  - #1149 (S3): a lock screen keeps its profile after another window picks another.
  - #1150 (S4): after deleting its profile, the lock screen falls back to an arbitrary one.
  - None dedupes against an earlier issue; #100 is the decision #1145 departs from.
- **Already filed:** "Client disconnected" at error level on Firefox's first passkey `do` is #1132.
- **The contract:** a PRF error logged when an armed `no-prf` fails a passkey export; strict mode off taking effect at the next unlock (`session-manager.ts:767`); the duplicate-wallet dialog naming one profile; Escape on the phrase page; back as history.
- **Owner-decision candidates, not filed:**
  - revealing the phrase counts as saving it (CH1 81, 132);
  - deleting a profile whose phrase was never saved warns no more than any delete (CH1 181);
  - auto-lock `0` saves with no confirmation (CH2 173).
- **Harness:**
  - an agent read a refused click as "nothing happens" where the wallet showed error or hint text with no testid (`ProfileNameField.vue:34`, `NewProfileCredentials.vue:43`), so a snapshot now lists a screen's untagged visible text (none on network routes) and marks an invalid field;
  - CH3 32 (the first `do` password profile named "Main") is C1's catalog;
  - CH1 337 is the planned restart's incomplete line.
- **Suspected weaknesses:** none.

Replays (`replay <dir>`, at the same commit and build):

- **CH1:** 4 differences.
  - The `end` the replay's stop sent after an original that ended at its deadline.
  - Command 313's opened page read `#/popup` in one run and `#/popup/general` in the other, before it settled.
  - At command 275, a background restart caught a PXE request in flight in the replay only (`foundation:retry` logged a failed fetch at error level), and so the end's unfiled list differed.
  - Every other command, path and the end matched, the two-window creates included.
- **CH2:** 19 differences.
  - The stop's `end`, three opened pages' first routes, the O5 lines' loading lists (an unlock click hung 30 s in both runs, once with `aria-busy` read at the bound and once with nothing) and a gas refresh mark.
  - From command 229: after the reset at 221 to 228 deleted the selected profile, the lock screen fell back to a passkey profile in one run and a password profile in the other (#1150), so the next unlock clicks met another screen.
- **CH3:** 16 differences.
  - The stop's `end` and two opened pages' first routes.
  - The backup the wallet exported was 1474 bytes in one run and 1471 in the other, so every pick's size differed, and a flip at byte 1473 fell past the replay's copy.
  - Command 123 met the other fallback profile (#1150).

Fixed in the harness (`e27ea8dd9`, D60):

- an opened page compares by its id;
- a pick compares by being picked;
- a position in a file's second half is recorded from its end;
- a finding's loading list, refresh and skeleton marks, and the stop's `end` are left out.

A live check on each browser then replayed to the same end: a 3-minute session ending at its deadline that exports a backup, picks it with a flip and a cut in its second half (recorded as -3 and -5), opens a page and reads "Profile name is required." beside an invalid name field. The difference #1150 causes stays until that issue is fixed.
