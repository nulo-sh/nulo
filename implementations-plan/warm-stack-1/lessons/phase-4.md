# Phase 4: review loop, then CI measurement

## Phases 2-3 gates (before the loop)

- Phase 2 at 77d7f0a06: `bun run lint`, `typecheck:all`, `test` and `test:all` all exit 0. `check:plans` was not in the gate and failed on the skill's archive path (Opus 1, below); it is in every later gate.
- Phase 3 at 77d7f0a06, through `agent.sh` at retry 0, the plan's seven files: Chrome 7/7 files, 17/17 tests, 13 `[onboard]` lines (load1 114 → 153). Firefox 7/7, 17/17, 13 lines (load1 149 → 134). Each line sits under its file's `stdout | <file> > <test>` header, so a CI log attributes it.

## Round 1 (arc diff at 77d7f0a06)

- **Codex** (gpt-6.1-sol high, session 01a15f74; `run-codex.sh` ran it on the alejo-gmail roster home this time): `conditional approve`.
  - (1) `makePhase` dropped the thrown error's stack and cause, and the three funded fixtures now route through it. Taken: `{ cause: err }`.
  - (2) I1's pre-probe estimate stood unmarked. Taken: marked superseded, with Phase 1's 94 / 95 calls, about 108 s / 190 s per pool run.
  - (3) `registerProfile`'s rewritten comment kept caller lore. Taken.
  - It found no consumer that relies on a freshly opened popup and no new race.
- **Opus** (`general-purpose`): `conditional approve`.
  - (1) The skill cited `implementations-plan/archive/warm-stack-1/plan.md` before it existed, failing `check:plans` (an enforced path-token finding, run by `test:ci-gating`). Taken: it cites the live path, and the archive commit repoints it.
  - (2) The cause loss, as Codex 1.
  - (3) The second `openPopup` used to reset the launch's error arrays (`wallet-pages.ts:176-177`), so six files' early `consoleErrors`/`pageErrors` assertions now also see registration-time errors. The gate is stricter, not looser. Taken: the skill line says so, and `connect-check-window` and `execute-scope-chain` join Phase 3 on both browsers.
  - Nits taken: the skill line names `localNetworkExtension`, and the comment is its contract only.
  - It traced the consumers (`activateCreatedProfile` writes the active account before Home; `setupActiveAccountRun` is epoch-fenced; every fixture closes the kept page before `use()`) and found no state difference a file relies on.
- Fixes committed as 140587739.

## Round 2 (diff 77d7f0a06..140587739)

- **Codex resumed: `conditional approve`.** It verified every round 1 fix. One finding: the plan's Phase 2 and 3 text did not yet name `check:plans` or the two added files. Taken.
- **A second `agent.sh` run in the same worktree is refused at setup** ("another run in this worktree holds the sandbox"). The first Chrome run of the two added files hit this while Firefox held the sandbox. That is a refusal, not a result. It was rerun alone.
- `connect-check-window` and `execute-scope-chain` at 140587739, retry 0: Chrome 2/2 files, 3/3 tests (load1 170 → 169). Firefox 2/2, 3/3 (load1 121 → 201). Two `[onboard]` lines each. Neither run saw a registration-time error in the arrays.

## Round 3 (diff 140587739..6534b83a3, and the whole arc)

- **Codex resumed: `approve`, no findings.** The loop converged, within its three-round stop.

## Compliance round (after F)

- Rounds 1-3 asked adversarial questions but did not carry `implementations-plan/README.md` § Post-implementation standard's two rules verbatim, nor its three adversarial questions. One resumed Codex round over the whole arc's code and skill diff carried them: **`approve`, no findings.** It found no new trust boundary, weakened assertion, suppression or evidence loss, and the changed comments state contracts and the switch's timing constraint.

## Freeze and measurement

- `origin/dev` merged (0510ba904; #964, #1008, #1009). `lint`, `typecheck:all`, `test`, `test:all` and `check:plans` all exit 0. **F = 0510ba904. P = c7764a2ee**, F plus one commit that closes the registration popup and reopens one inside `launchOnLocalNetwork`, with the `[onboard]` line and phase tags unchanged. Pushed as `warm-stack-1-measure-f` and `warm-stack-1-measure-p`.
- The critical shard on F's tree is Chrome shard 5 (784 s recorded) and Firefox shard 3 (931 s). Each file list matches exactly one shard job in the CI runs.
- **Dispatch rule in practice:** e2e-clocks-1's lead dispatches its next slot within seconds of its own runs finishing, so a polling dispatcher never sees a gap mid-round. P1 ran in the one gap before e2e-clocks-1's slot 4. F2 waits for the end of e2e-clocks-1's round, about 2.6 h after P1, which loosens pair 1 only.
- **A dispatch race.** e2e-clocks-1's next P (19:36:29) went out 30 s after my F2 (19:35:59): its check ran before my dispatch was visible, and mine ran before its dispatch existed. The two ran on separate runners. A file's time is a span inside its own job, so the overlap moves queueing, not file times. Now a second clash check runs 75 s after each dispatch, and on a clash mine cancels and defers. One earlier same-second clash (19:16:51) was cancelled that way within two minutes.
- **Pair 1** (P1 Chrome 39648469531 / Firefox 39648472577; F2 Chrome 39663049486 / Firefox 39663054039): all green, 106 / 105 `[onboard]` lines per run.
  - Chrome: `[onboard]` median 3763 → 2993 ms (−0.77 s); critical shard 830 → 801 s.
  - Firefox: 4448 → 3521 ms (−0.93 s); critical shard 985 → 941 s.
  - CI's reopen is cheaper than the loaded host's on Firefox, so Firefox's rule (b) bar of 1.0 s (half the probe's 2.0 s) is close.
- **My dispatcher exhausted the account's API rate limit** (about 20:45-21:00Z). It polled ten `gh run list` calls (five statuses × two workflows) every 10 s, about 3600 calls an hour, on a 5000-an-hour limit that every lane's agents share. `gh api rate_limit` showed this token's `core` bucket nearly full while every call returned 403, because the limit is per user across tokens. It now polls one unfiltered list call per workflow every 45 s, under 200 calls an hour. e2e-clocks-1's last slot (20:39) ran before F3.
- e2e-clocks-1's 17:59 slot also overlapped P1 (17:58). So pair 1's two runs each ran beside one of its runs, again on separate runners.

## The measurement (P = c7764a2ee, F = 0510ba904; pairs by order (P1, F2), (F3, P4), (P5, F6); every run green at retry 0)

| Run | Chrome run | `[onboard]` median (n) | critical shard 5 file time | suite | Firefox run | `[onboard]` median (n) | critical shard 3 file time | suite |
|---|---|---|---|---|---|---|---|---|
| P1 | 39648469531 | 3763 (106) | 830 s | 15.8 min | 39648472577 | 4448 (105) | 985 s | 19.2 min |
| F2 | 39663049486 | 2993 (106) | 801 s | 15.5 min | 39663054039 | 3521 (105) | 941 s | 18.1 min |
| F3 | 39675218030 | 2968 (106) | 806 s | 15.4 min | 39675223477 | 3592 (105) | 974 s | 18.2 min |
| P4 | 39679183048 | 3768 (106) | 773 s | 15.5 min | 39679187444 | 4007 (105) | 929 s | 17.8 min |
| P5 | 39681739685 | 3660 (106) | 840 s | 16.0 min | 39681743670 | 4370 (105) | 791 s | 18.7 min |
| F6 | 39684348870 | 2991 (106) | 640 s | 15.6 min | 39684353033 | 3392 (105) | 958 s | 18.3 min |

| Rule | Chrome | Firefox |
|---|---|---|
| (a) no unresolved F failure | pass: every job green | pass: every job green |
| (b) `[onboard]` median per call, P − F ≥ half the probe's net saving | pass: 3737 − 2990 = **747 ms** ≥ 574 | **fail: 4309 − 3536 = 773 ms < 1000** |
| (c) critical shard's summed file time, median of F − P over the pairs | pass: −29, +33, −200 s → **−29 s** | **fail: −44, +45, +167 s → +45 s** |
| (d) no other file slower in all three pairs by > max(10 % of its P median, 10 s) | pass: none, over every file in every job | pass: none |

- **Verdict: no ship.** The rule fails on Firefox, by (b) and by (c).
- The mechanism is real on both browsers. Every F run's `[onboard]` median sits below every P run's. On the critical shard, the `[onboard]` sums fell 17, 5 and 30 s on Chrome and 18, 11 and 4 s on Firefox. But the shard's own spread across runs (640-840 s on Chrome, 791-985 s on Firefox) is far wider.
- **CI's reopen is cheap on Firefox.** It saved 0.77 s per call against the loaded host's 2.0 s. The probe overstated Firefox by 2.6×; Chrome's 0.75 s against 1.15 s is closer. Rule (b) took its bar from the probe, so it held Firefox to a saving the host's load had inflated.
- The suite wall-clock medians, P against F: Chrome 15.8 → 15.5 min, Firefox 18.7 → 18.2 min. The critical-shard job, P against F: Chrome 15.8 → 15.3 min, Firefox 17.3 → 17.6 min.
