---
plan: hook-bins-1
tier: light
status: completed (delivered in #910)
issues: "none public (tracked privately)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at dc94581d
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** delivered as one ready PR against `dev`, #910, which carries this close-out; its merge closes the plan.
- **Shipped:** both hooks check `./node_modules/.bin/<tool>` first and refuse with one fixed line before `bun install`, else run `bun --no-install ./node_modules/.bin/<tool>`; `generate.ts` and `rescore.ts` run the installed Biome by path; a manual-command comment names the Aztec CLI wallet without a runner; `scripts/ci-cd/githooks.test.ts` pins the hooks' behaviour and the runner ban; CLAUDE.md:50 and :54. No public issue (tracked privately).
- **Review loop:** the plan took Codex and Opus conditional approves, then a fresh Codex conditional approve and approve; the arc's diff took Codex findings (comments), Opus findings (minor), one Codex gap at round 2 and clean at round 3.
- **Gates at the head:** lint, `typecheck:all`, `test:all`, `test:ci-gating` (638), `test:release` (341) and `check:plans` 0 after merging `origin/dev` at `93ce1e4e`; the fresh-worktree proof in [lessons/phase-3.md](lessons/phase-3.md).
- **Dispositions:** `pr-quick.yml`'s commitlint and `setup-puppeteer`'s Firefox download keep their runner (D3: after a frozen install, from the declaring directory); FIREFOX.md's pinned `web-ext` check stays a deliberate manual fetch; Bun's runtime module resolution stays out of scope (not a runner; the probe saw no fetch).
- **Known limits:** none. **Open items:** none.
- **Lessons:** none promoted: `lessons.md` sits at its 8 KiB budget, and F4 now lives in CLAUDE.md § Working in this repo. The Biome `files.includes` trap for a root-level proof file is in [lessons/phase-0.md](lessons/phase-0.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# hook-bins-1: the git hooks run the worktree's installed Biome and commitlint, and refuse before `bun install`

One arc, one PR against `dev` (§ Delivery). Tracked privately; the PR carries no issue line. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults and probes: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

For a contributor or an agent who commits in a worktree, and for the maintainer who inherits the hooks:

- A commit in a worktree with no install stops at once with one plain line that says to run `bun install`. No tool runs and nothing is fetched.
- After `bun install --frozen-lockfile`, the same commit runs the locked Biome (2.5.13) and commitlint (21.2.2) of that worktree. A failing tool still refuses the commit.
- A runner that can fetch, brought back into a hook, a package script or a root script, fails `test:ci-gating`.

Good enough: an install older than the lockfile runs what it installed. CI stays the authority for `--no-verify` commits. A worktree runs the hooks of its own checkout, so a branch cut before this change keeps its old hooks until it merges `dev`.

## Assumptions

**Facts** (verified at `dc94581d`; probes in recon.md):

- F1. `.githooks/pre-commit:3` runs `bunx biome check --staged --no-errors-on-unmatched`, then `./scripts/check-no-local-paths.sh` and `bun scripts/complexity-baseline/check.ts --staged`, under `set -e`. `.githooks/commit-msg:2` runs `bunx commitlint --edit "$1"`.
- F2. `prepare` (`package.json:39`) sets `core.hooksPath` to the relative `.githooks`, in the clone's shared config, so a new worktree runs the hooks before its own install.
- F3. Git starts a hook in the root of the worktree being committed, from a subdirectory too (probe); the pre-commit already relies on it (`./scripts/…`).
- F4. `bunx` 1.4.2 takes `node_modules/.bin/<name>` from the working directory or any parent, past a `package.json`, before its cache or npm (probe, both layouts). CLAUDE.md:50 records the npm `@latest` fallback.
- F5. Both bins start with `#!/usr/bin/env node`; `bun <bin>` runs either (probe). `scripts/dup-trend/report.ts:14,135` and `scripts/publish/stage.ts:204` already run an installed launcher as `process.execPath` + its path, and `commitlint.test.ts` runs commitlint that way.
- F6. `scripts/complexity-baseline/generate.ts:45` and `rescore.ts:51` spawn `bunx biome lint …` from the root; `complexity-rescore.test.ts` (in `test:ci-gating`) drives the second through real Biome. `generate.ts:150` stamps `generated` with today's date.
- F7. `pr-quick.yml:225` and `setup-puppeteer/action.yml:39` run after setup-bun's frozen install, from the directory that declares the tool; pr-quick's token is read-only.
- F8. No package script uses a runner and no test reads the hooks. Two documented manual commands use one: `apps/extension/tests/e2e/FIREFOX.md:91` (`bunx web-ext@10.6.0 lint …`) and the comment at `nulo-account.test.ts:10` (`bunx aztec-wallet …`, a name no workspace declares).

**Inferences:**

- I1. `bun x --no-install` still runs a package an earlier `bunx` cached ("not already installed" counts the cache). Not probed. D1 does not depend on it.
- I2. Biome's launcher picks its native binary (or `BIOME_BINARY`), runs `ldd --version` on Linux, then spawns it; on Bun instead of Node the lint result is the same. Phase 2 compares the manifest.

**Asks:** none. No surface a person sees changes.

## Architecture & Implementation

- **Hooks.** Each hook's first command checks `[ -f node_modules/.bin/<tool> ]`, relative to the worktree root git starts it in (F3); `-f` follows a link and is false for a dangling one. On a miss it prints one single-quoted line to stderr and exits 1: `pre-commit: Biome is not installed in this worktree. Run bun install first.` (commit-msg names commitlint). The line has no backticks, path or variable. Otherwise the hook runs `bun --no-install ./node_modules/.bin/<tool>` with today's arguments; commit-msg `exec`s it. The pre-commit's two later steps are unchanged, and `set -e` still stops them when Biome fails.
- **Baseline scripts.** `generate.ts` and `rescore.ts` each take `const BIOME = join(import.meta.dir, "..", "..", "node_modules", ".bin", "biome")` and spawn `process.execPath` with `--no-install`, `BIOME` and today's arguments, as `dup-trend/report.ts` does. Before an install, Bun refuses the missing path and today's "produced no output" error carries its message; nothing else moves.
- **Comment.** `nulo-account.test.ts:10` names the Aztec CLI wallet of the pinned line and its `aztec-wallet create-account …` command, with no runner.
- **Test.** `scripts/ci-cd/githooks.test.ts` (`bun:test`, so `test:ci-gating`). Each case makes a temp git repo holding only the hook under test, run with `-c core.hooksPath=.githooks`, unsigned commits, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, and an env without `GIT_*`. Git is spawned by absolute path. A sentinel directory holds `bunx`, `npx`, `node` and, in refusal rows, `bun`; each records its call and exits 1.
  - Refusal rows (hook × no `node_modules` / a dangling link): `PATH` is the sentinel directory alone; a commit from a subdirectory exits non-zero, stderr is exactly the hook's line, and no sentinel ran.
  - Run rows (hook × tool exit 0 / 1): `node_modules/.bin/<tool>` is a script that records its arguments; the pre-commit fixture adds stubs for its two later steps that record their names. `PATH` is the sentinels, then Bun's directory. Exit 0: the commit passes with the tool's arguments (and both stubs) recorded. Exit 1: the commit fails and neither stub ran.
  - Harness control: a fixture hook with the base line (`bunx biome …`) under the refusal `PATH` makes the sentinel record `bunx`.
  - Static pin: each hook invokes its tool as `bun --no-install ./node_modules/.bin/<tool>`. `release-integrity.test.ts`'s runner pattern (`\bbunx\b|\bbun\s+(-\S+\s+)*(x|create)\s|\bnpx\b`, continuations joined) matches nothing in tracked `.githooks/*`, any tracked `package.json` script, or `scripts/**` outside `*.test.ts` and `*.md`. It bans the named runners; it does not prove that no code can fetch.
- **CLAUDE.md.** :50's root-`bunx` sentence becomes: "`bunx <tool>` takes the tool from `node_modules/.bin` in the working directory or any parent, else fetches npm `@latest`, past the lockfile and the age gate: at the root, where only root dependencies are linked, use workspace scripts (1.4.2, its evidence link kept). The git hooks and `scripts/` never call `bunx`: they run the worktree's own launcher on Bun (`bun --no-install node_modules/.bin/<tool>`), so before `bun install` they stop instead of fetching (`scripts/ci-cd/githooks.test.ts`)." :54 names the complexity scan (missing today) and adds: "Each runs the worktree's installed Biome or commitlint and, until `bun install` has run in that worktree, refuses with one line. `core.hooksPath` is shared by every worktree of a clone; each worktree runs the hooks its own checkout carries."
- **Not changed:** F7's CI sites (D3); FIREFOX.md's `web-ext` check (Mozilla's package under that name, version pinned, run on purpose outside the lockfile since nothing here depends on it); the Puppeteer download in the docs (run from `apps/extension`, whose e2e needs the install first); `bunfig.toml`; `prepare`.

### Decision ledger

- **D1, the runner: `bun --no-install <bin>`.** A direct exec needs `node` on `PATH` for both shebangs, which a Bun-only contributor lacks today too. `bun x --no-install` walks up (F4), may take a cached package (I1), and keeps the name the test bans. `--no-install` (Codex r1) makes the no-fetch rule independent of the working directory, as SECURITY.md's pattern for Bun started elsewhere; both legs agree on D1.
- **D2, the path: relative to the hook's working directory.** Git sets it (F3) and the hook already uses `./scripts/…`; `git rev-parse --show-toplevel` returns the same directory in a hook. Both legs agree.
- **D3, the CI sites stay, on an explicit assumption:** each runs after a frozen install, from the directory that declares the tool. Codex r1: the earlier "another gate fails first" wording was detection, not prevention; corrected. Only a reviewed change that drops the dependency would make the bin absent, and that run's token is read-only. Converting `setup-puppeteer` trips all four e2e lanes. Opus r1 verified the install order.
- **D4, no helper module.** Codex r1 found a shared `biomeLint` proportionate; Opus r1 showed the repository's existing pattern is a constant per script (F5) and the empty-output error already fails closed. The precedent wins: the smallest diff in the codebase's own design.
- **D5, each hook keeps its own guard** (four lines each); a shared sourced file adds a path to resolve for two callers. Both legs agree.

## Security & Adversarial Considerations

- **Invariant.** A hook runs only what the worktree's own install put there; before that install it refuses, and the guard is its first command.
- **Path.** `./node_modules/.bin/<tool>` consults no `PATH`, parent directory or runner cache. Under a user's opt-in `globalStore` the link resolves into that user's store, still the locked version. The hook trusts the worktree's install, its environment (`BIOME_BINARY` included) and the `bun` on `PATH`, as `bunx` did.
- **Refusal.** Fixed, single-quoted, on stderr, without a path, a variable or the environment.
- **Unchanged.** A branch that rewrites its hooks runs its own hooks, as any checked-out code does. CI lints every commit (`quality-status`). No credential, token or permission changes. Runtime module resolution is not a runner and stays out of scope (probe in lessons/phase-0.md).

## Phases

### Phase 1: the hooks and their test ✓

- Change map: `.githooks/pre-commit`, `.githooks/commit-msg`; new `scripts/ci-cd/githooks.test.ts` (refusal, run and harness rows).
- Gate: `bun test scripts/ci-cd/githooks.test.ts` passes; with the base hooks (`git show dc94581d:.githooks/<hook>`) in the fixture, the refusal rows red. `bun run lint` and `bun run test:ci-gating` exit 0. A real commit in this worktree passes both hooks.

### Phase 2: the baseline scripts, the comment and the static pin ✓

- Change map: `scripts/complexity-baseline/generate.ts`, `rescore.ts`; `apps/extension/src/wallet/services/account/contracts/nulo-account.test.ts` (comment only); the static pin in `githooks.test.ts`.
- Gate: `bun run baseline:complexity` changes only the `generated` line of `manifest.json` (then restore it); `bun run baseline:rescore` reports no drift. The static pin reds on the base copies of F1's and F6's four lines. `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test:release` exit 0.

### Phase 3: CLAUDE.md and the fresh-worktree proof ✓

- Change map: CLAUDE.md:50 and :54 only (#890 and `migration-rule-1` edit near 142-144, #743 near 214, `unit-flake-1` near 267).
- Proof on a detached worktree of the arc head under `~/.cache/nulo-backlog/hook-bins-1/`, outside the clone. Raw traces stay there; the PR body carries outcomes only. Other agents share this host's Bun caches, so the proof gives its own: fresh empty `TMPDIR`, `BUN_TMPDIR` and `BUN_INSTALL_CACHE_DIR` under the proof directory.
  1. Stage a file. `strace -f -e trace=execve,connect git commit -m "test: proof"`: exit 1, the one line, no `execve` of `bun`, `bunx` or `node`, no `connect`.
  2. The same for `sh .githooks/commit-msg <file>`.
  3. The three private directories are still empty.
  4. `bun install --frozen-lockfile` (load1 under 150). The same commit passes with Biome 2.5.13 and commitlint 21.2.2; `fix: Handle PXE` is refused by `subject-case`.
  5. `git worktree remove` the proof worktree.
- Gate: each expectation above holds. `bun run lint`, `typecheck:all`, `test`, `test:all`, `test:ci-gating`, `test:release` exit 0; `bun run check:plans` passes after staging.

## UI impact

None: git hooks, two developer scripts, a test comment, a CI-gating test and CLAUDE.md.

## Delivery

- One arc: branch `hook-bins-1-a1` off `origin/dev`, this plan's commit cherry-picked first. One PR, ready, no label: the comment edit trips the e2e filters (`apps/extension/**`), so every lane runs.
- Title: `chore(hooks): run the worktree's installed biome and commitlint; refuse before install` (86).
- Body: the change and why in its own words, the Phase 1 red/green, the Phase 3 outcomes, the gates, `UI impact: none`. No issue line. The close-out lands as the PR's final commits. Parallelism: none.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `dc94581d`; step 1 absent (`code_review: off`).

- After Phase 3: the Codex loop over the arc's diff against `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/hook-bins-1/`). Each prompt carries the two verbatim rules and asks: can a hook still reach the network, can a path resolve outside the worktree, does a refusal leak anything. Hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; rounds logged in `lessons/phase-N.md` and § Audit verdicts. A fix that grows the design stops for the orchestrator.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; Outcome (`Known limits: none`, `Open items: none` unless a round files one); promote F4 as one lesson; delete `STATUS.md`; `git mv` to `archive/` in its own commit; `bun run check:plans` green.
- Teardown once `implementations-plan/archive/hook-bins-1/plan.md` is on `origin/dev`: `agent-worktree done hook-bins-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a156ad): conditional approve.
- #1 sweep missed FIREFOX.md's `web-ext` check: classified (Not changed).
- #2 D3's reasoning: corrected to an explicit assumption; sites kept.
- #3 I2 misstated: rewritten; `-f` specified.
- #4 `--no-install`: taken (D1). Runtime resolution of workspace scripts: out of scope; the probe saw no fetch.
- #5 no case for a failing tool or a dangling link: both rows added.
- #6 the pin's pattern: `release-integrity.test.ts`'s, continuations joined; claim narrowed.

**Round 1, Opus Plan:** conditional approve.
- #1 raw cache listings in the PR body: hashes only.
- #2 commit-msg's refusal could not pass behind pre-commit: one hook per fixture.
- #3 the manifest's date line: gate reworded.
- #4 two missed sites: classified; the comment drops its runner.
- #5 the parent decoy proved nothing: dropped; sentinel-only `PATH`, absolute git, clean env.
- #6 helper module: not built (D4).
- #7 backticks in the refusal would run `bun install`: single quotes, no backticks.
- #8 propagation: one line in Outcome; a private note to the orchestrator.
- F4 doubted: re-probed with a `package.json` in the child; holds. Overlaps named; CLAUDE.md wording inlined.

**Final pass, Codex** (fresh, gpt-6.1-sol, high, session 01a156bc): conditional approve, no design finding; it ran both hook blocks under dash.
- #1 the shared-cache snapshots race other agents: the proof uses private cache and temp directories.
- #2 the pin did not assert the installed path: it now does, per hook.
- Resumed (verification): **approve**, no remaining finding.

**Arc 1, Codex r1** (gpt-6.1-sol, high, session 01a156cf): findings, comments only: the baseline scripts' lockfile claim, the hook comments (now say why relative paths hold), two narrating test docstrings. All fixed.
**Arc 1, Opus diff review:** findings, minor: the runner check missed spawn arguments (extended, with a control); CLAUDE.md:50 overclaimed `--no-install` for all of `scripts/` and skipped bunx's cache. Fixed; an earlier commit body left as is (the squash replaces it).
**Arc 1, Codex r2** (resumed): one gap, spawn arguments split across lines; fixed. **r3** (resumed): **clean**.

## Seeds

- `/goal` Phases 1-3 marked ✓ in implementations-plan/hook-bins-1/plan.md, each gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `chore(hooks): run the worktree's installed biome and commitlint; refuse before install` open against `dev` with the close-out commits; `bun run test:ci-gating` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/hook-bins-1: read plan.md and lessons/, run the next phase and its gate, tick it, then the Codex loop, the PR and the close-out; never merge.
