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
