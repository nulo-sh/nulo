---
plan: dependabot-subject-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
trunk: dev
base: 78f5f9171
---

# dependabot-subject-1 — Dependabot's `Bump` subject and commitlint (#1264)

Dependabot's weekly Actions PR can carry the commit subject `chore(deps): Bump …`. `pr-quick`'s Commitlint job
lints every commit in `base..head`, so `quality-status` is red and the bump is redone by hand (#1141 → #1263). This
plan skips the range lint on Dependabot's PRs, whose commits the squash drops, and makes the merger's rewrite of the
title that lands a documented step. The rule stays as it is for every human commit. Over the light target (150 lines) by
the two audit legs' records.

## Outcome

- **Date:** 2026-10-27. Planned, audited and implemented in one session.
- **Status:** completed, delivered as #1265 (one arc, into `dev`); the merge closes #1264 and archives this plan.
- **Shipped:** the Dependabot skip in `pr-quick.yml` (`83e133758`); the five-row `commitlint` test in
  `behavior-gating.test.ts`; CI.md and CLAUDE.md on the merger's title edit, the 92-character budget, and that CI
  lints commits, never titles; review fixes in `0d4e93d1e`.
- **Dropped or rejected:** issue options 2 and 3, a title-rewriting job, a live-title lint, `gh pr merge --subject`
  (D2–D5). No `lessons.md` line: CLAUDE.md § Dependency policy now carries the gotcha, and the file sits at its budget.
- **Known limits:** #1266.
- **Open items:** #1267 (docs say Dependabot cannot read `bun.lock`; outside this lane). Outside the write scope:
  `implementations-plan/README.md` § Post-implementation standard still says 93 characters.
- **Seeds retired:** the `/goal` below is a record, not an instruction.

## Outcome & Quality Bar

- **For whom**: the merger of the weekly Dependabot PR (the owner, or the orchestrator when the owner delegates one
  in writing, per its house rules), and every later reader of `dev`'s history.
- **Excellent**: a Dependabot PR goes green on its own merits (actionlint, the pin tests, the suites), whatever case
  Dependabot guesses; the subject that lands on `dev` is a lower-case Conventional Commit of at most 100 characters,
  set by one documented title edit that every squash path honours; a human PR with an upper-case commit subject stays red, and a test proves both.
- **Good enough**: nothing enforces the PR title in CI, for Dependabot or for humans (D2).

## Assumptions

**Facts** (evidence in `recon.md`):
1. The only red jobs on #1141's run `40280467913` were `Commitlint` and `quality-status`; local commitlint on its
   commit reports `subject-case` alone, and the lower-cased message passes.
2. The case comes from dependabot-core's `PrNamePrefixer#capitalize_first_word?`, a guess over `dev`'s latest 100
   commits: the case of the last commit whose author name contains `dependabot`; else an unanchored `/:\s+\[?[A-Z]/`
   over full human messages; the `commit-message.prefix` decides only when both say nothing. My `git log` replay of
   `dev` at #1141's open: no such commit in the window, 94/94 messages match, so `Bump`. At `78f5f9171`: 79/89, so the
   next PR may read `bump`.
3. The options reference (`commit-message`, fetched 2026-10-27, no last-updated date shown) offers `prefix`,
   `prefix-development` and `include: scope`, and nothing on case.
4. `quality-status` requires `commitlint` to end `success` on every `pull_request` run (`pr-quick.yml`, `ran "$pull_request"`);
   both existing skips are in-step `elif`s and leave the job `success`.
5. The squash subject is the PR title plus ` (#NNNN)` (`squash_merge_commit_title: PR_TITLE`), so with four-digit PR
   numbers a title has 92 characters, not CLAUDE.md's "~93". Dependabot titles reach 107 characters (#327, #1141);
   #327's title stayed as Dependabot wrote it, and the owner rewrote its subject in the merge box.
6. Nothing in CI lints a squash subject: commitlint runs on `pull_request` only, over `base..head`, and is skipped on
   PRs to `main`; CLAUDE.md § Branching's "red commitlint" for a long title does not hold. The `dev` ruleset also
   allows a merge commit (for the sync PR), which would land a PR's commits as they are.
7. The orchestrator's watcher merges with a plain `gh pr merge --squash --match-head-commit <sha>`, no subject.
8. `user.login` of a Dependabot PR is `dependabot[bot]`; only the Dependabot app can open a PR under that login.
9. No test pins the commitlint step today: the issue's "beside the existing promote and sync skips" in
   `behavior-gating.test.ts` does not hold (only `CI.md` records them).

**Inferences**: (a) the merger follows CLAUDE.md § Dependency policy; nothing enforces it, and a squash of a `Bump`
title still lands one (a known limit, D2). (b) Dependabot rewrites a title only when it pushes (plausible, unverified),
which moves the head: required checks re-run and the watcher's head pin refuses the old one.

**Asks**: none. Nothing here changes what a user of the wallet sees; `OWNER-ASKS.md` says none.

## Architecture & Implementation

- **Skip** (`.github/workflows/pr-quick.yml`, step `Lint PR commits`): add `PR_AUTHOR: ${{ github.event.pull_request.user.login }}`
  to its `env:` and a third `elif [ "$PR_AUTHOR" = "dependabot[bot]" ]`, after the sync skip and before the lint,
  echoing `commitlint: skipped on Dependabot's PR …`. One comment states the why: the squash drops these commits,
  Dependabot guesses their case from `dev`'s history, and the title that lands is the merger's.
- **Pin** (`scripts/ci-cd/behavior-gating.test.ts`, one new test): read the step from `pr-quick.yml` and run it with
  `runStep` (`gh-step-harness.ts`), a `gh` shim that must never be called, and a `bunx` shim written by `setup` that
  logs its arguments and exits 1, as a failing lint would. Rows: a human PR into `dev` (red, one call with the exact
  `commitlint --from <base> --to <head> --verbose`); a human PR on a `dependabot/…` branch (red, the branch name is not
  the identity); Dependabot's PR into `dev` (green, no call); a PR into `main` and the `sync/main-to-dev*` PR (green,
  no call), since the test runs the whole script.
- **Docs**: `CI.md` § `pr-quick.yml` commitlint bullet names the third skip and why. `CLAUDE.md` § Branching + merging's
  title-length bullet: 92 characters (four-digit PR numbers) and what CI enforces: CI lints a PR's
  commits (with the three skips), never its title, so the squash subject is the author's and the merger's to keep
  within the rule. § Dependency policy's Dependabot bullet carries the merger's step: right before merging, rewrite
  the title to a lower-case Conventional Commit of at most 92 characters (`gh pr edit <n> --title "chore(deps): bump …"`),
  then squash, never a merge commit; a push by Dependabot may rewrite the title, so recheck it after an update. `scripts/ci-cd/dependabot.test.ts`'s header stops claiming the prefix keeps titles valid for commitlint
  (it gives the type and scope; the case is Dependabot's guess).
- **Not changed**: `.commitlintrc.json`, `commitlint.test.ts`, `.github/dependabot.yml`, the aggregator, every other workflow.

### Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Where the skip lives | in-step `elif`, as the two existing skips | job-level `if:`: the aggregator expects `success` on every PR, so it and `aggregators.test.ts` would change for no gain |
| D2 | How the landing subject is fixed | the merger's documented title edit, then a squash: the title stays the one source of the subject, so the merge button, the watcher and the CLI all land it | `gh pr merge --subject` (Codex round 1): atomic, but only on the CLI path, and the owner's button and the watcher never pass it; (b) a job that rewrites the title on open: a `pull-requests: write` job (`pull_request` with raised permissions; `pull_request_target` would also run with a write token in the base context), a truncation rule built on Dependabot's title templates, re-run on each Dependabot update, a new pin set, for one PR a week that a person merges anyway; (c) lint the live title for Dependabot PRs: red on every such PR until edited, then a re-run, and an API read in a required gate, stricter for the bot than for humans, whose titles nothing lints |
| D3 | The identity the skip reads | the PR author, `github.event.pull_request.user.login` | `github.actor`: a human's push or "Update branch" moves it, and the range would be linted again; `head_ref` prefix `dependabot/`: any writer can name a branch so |
| D4 | Issue option 2, a commitlint `ignores` entry | rejected | lets a human's `chore(deps): Bump …` pass, needs the config as JS, and leaves the title unfixed |
| D5 | Issue option 3, a Dependabot setting | rejected | none exists (Fact 3), and steering the guess through `dev`'s history would be a monkey-patch |
| D6 | Pin the two existing skips too | yes, as rows of the same table | the test runs the whole script; leaving two branches unasserted keeps them unpinned |

## Security & Adversarial Considerations

- **Who can trigger the skip**: only a PR whose author is the Dependabot app. A writer who pushes commits onto
  Dependabot's branch escapes the lint for those commits, but the squash drops every commit; what lands is the title,
  which the merger writes. Exploitability of the skip beyond that: none traced.
- **Injection**: the new value reaches the script through `env:` only, never as `${{ }}` inside `run:`.
- **Least privilege**: no permission changes; the job keeps `contents: read`, `pull-requests: read`. D2 rejects
  the write-token job, and with it the `pull_request_target` surface.
- **Supply chain**: Dependabot PRs still pass actionlint, `action-pins.test.ts` and every suite; `bunx commitlint` is untouched.
- **Domain risks**: none of frontend, contracts, publishing or backend apply.

## Phase 1 — skip, pin, document ✓

UI impact: none (CI and contributor docs only). Files: the five named above. Write the test first and watch the
Dependabot row fail, then add the skip.

**Validation gate**
- Commands: `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test:release`,
  `bun run lint:actions`, `bun run test:all`, then `bun run check:plans` after staging the plan files.
- Pass criteria: each exits 0; the new test is green and its Dependabot row was red before the skip existed (logged in
  `lessons/phase-1.md`).
- Layers: lint, typecheck, unit (the CI-gating suite runs the step's script); no e2e: nothing a suite reads changes.

## Delivery

Single arc, single PR, no stack: branch `ci/dependabot-subject-1` off this plan's commit, PR into `dev`, title
`ci: skip commitlint's range lint on dependabot's pull requests` (61 characters), body with `Closes #1264`, the gates
and their outcomes, and a note that Dependabot's case flips with `dev`'s history. The close-out lands as the PR's final
commits. `code_review: off`.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `78f5f9171`, single-arc placement. Specific to this plan:
- Review loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's
  diff against `78f5f9171`, resumed with `resume-codex.sh` until no new material finding, hard stop at three rounds.
  One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside the first round.
- Gates once more on the final head, then `gh pr create --base dev`, then `gh pr checks <n> --watch` once. Merging is
  the orchestrator's call.
- Close-out per the standard's step 4 (merge `origin/dev` first; Outcome; `STATUS.md` deleted; the archive move in its
  own commit), plus one closed `known-limit` issue: nothing lints a squash subject, so a merger who skips the edit (or a
  human with a bad title) lands it; reopen when a tool that reads `dev`'s subjects needs the rule. Teardown per step 5,
  slug `dependabot-subject-1`, trunk `dev`.

## Audit verdicts

**Codex, round 1 (gpt-6.1-sol, high): `conditional approve`** (correct the title budget; bind the squash to the subject).
1. Medium, demonstrated (installed commitlint, `header-max-length`): a 93-character title on a four-digit PR lands
   101 characters. Accepted: 92 in CLAUDE.md and in the Dependabot step. `implementations-plan/README.md` § Post-implementation
   standard also says 93; it is outside this lane's write scope, so the report names it.
2. Medium, plausible: an edited title is not atomic with a plain squash. Partly accepted: the doc says to edit right
   before the merge and that a Dependabot push rewrites the title. `--subject` rejected after the Opus leg (D2): it
   holds only on the CLI path. The risk left needs a title change without a push (Inference b) or a writer racing the
   merger; its cost is one capitalised subject. `--match-head-commit` is already the watcher's practice.
3. Low, demonstrated: CLAUDE.md § Branching claims a long title reds commitlint; nothing lints a squash subject.
   Accepted: that bullet states what CI checks (Fact 6). The residual (a merger who skips the step still lands
   `Bump`; the same holds for any human title) becomes a closed `known-limit` issue at close-out; `cliff.toml`
   files any `chore` subject under Chore whatever its case, so the cost is cosmetic.
4. Low, demonstrated: the recon overstated the heuristic. Accepted: Fact 2 and `recon.md` corrected.

**Opus Plan leg (claude_model opus): `conditional approve`** (reword the § Branching bullet; name the owner as merger,
squash only). 1 = Codex 3, accepted. 2, needs unsupported conditions (a merger choosing a merge commit): the `dev`
ruleset allows one, and after the skip no gate refuses it; accepted as two words in the step, "never a merge commit",
no guard. 3, demonstrated: the owner merges Dependabot PRs unless delegated, and the watcher squashes with no subject;
accepted, it decides D2 for a title edit over `--subject`. 4, demonstrated: #327's title was never edited; Fact 5
reworded. 5, plausible: a Dependabot push rewrites the title; recorded as Inference (b). 6: the test shape works with
`runStep` (every bound expression; `chmod 755` the `bunx` shim, or the real one runs); taken as written.

**Codex, final pass (resumed session): `approve`.** The fixes hold; it withdrew `--subject` as a condition on the
new evidence and accepts the race as a cosmetic known limit. One wording fix taken: a Dependabot push *may* rewrite the
title, so the step says to recheck after an update.

**Post-implementation loop (arc 1, diff `b63e55fa6..83e133758`).** Codex round 1 (gpt-6.1-sol, high): `findings`,
two low. (1) CLAUDE.md and `dependabot.test.ts` say Dependabot cannot read Bun's lockfile, while GitHub lists Bun
>= 1.1.39 version updates as supported: rejected here (npm dependencies are out of this lane, the sentence predates the
change, lockfileVersion 2 support unverified), filed at close-out. (2) The new describe comment claimed the range lint
guards commits that land, but a squash drops every PR's commits: accepted, deleted. Opus diff review: `clean`, two
notes: the README's 93 (outside the write scope, reported) and the Dependabot bullet's "because" (accepted: the case
guess is why commits skip; the length is why the merger rewrites). Fixes in `0d4e93d1e`. Codex round 2: `clean`.

## Seeds (retired)

Not run (orchestrator-owned). `/goal`: phase 1 ✓ with its gate pasted; the Codex loop converged; the PR into `dev`
open with `Closes #1264` and the close-out on it; `bun run test:ci-gating` and `bun run lint:actions` exit 0.
