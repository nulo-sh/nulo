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
