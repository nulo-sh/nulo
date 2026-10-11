# Phase 3 and the post-implementation fix loop

## Phase 3

One CLAUDE.md bullet (`ff23542`). Gate: lint, typecheck:all, test:ci-gating, test:release, `check-no-local-paths.sh` with CLAUDE.md staged, all exit 0.

## Fix loop round 1 (Codex gpt-6.1-sol high, session `01a1285a-fdc6-72c2-806e-162c15c0b13d`; Opus general-purpose review alongside)

Codex: **approve with fixes** (3 Medium, 2 Low). Opus: **approve once its finding 1 is fixed** (1 Medium, 4 Low). Every finding was checked against the tree or a probe before it was applied; all ten were accepted, fixed in `748d26a`.

Probe (scratch dir, loopback registry, temp `HOME`/cache; zsh needs `${=c}` to split a command held in a variable, an earlier run without it measured nothing):

| Working dir `bunfig.toml` | Command | Registry requests |
|---|---|---|
| `auto = "disable"` | `bun x probe-aa-zz` | 1 |
| `auto = "disable"` | `bun create probe-aa-zz` | 1 (`/create-probe-aa-zz`) |
| either | `bun --no-install x probe-aa-zz` | 0 ("Stopping because --no-install was passed") |
| either | `bun --no-install --install=force s.ts`, `bun --install=force --no-install s.ts`, `bun --no-install -i s.ts` | 0 |
| none | `bun s.ts` | 1 |

| # | Finding | Fix |
|---|---|---|
| Opus 1 (Medium) | `bun x` / `bun create` fetch under `auto = "disable"` and match neither `INSTALLS` nor the per-call check; the plan's claim that `CLEAN` refuses `bun x` was false | `INSTALLS` gains `\bbun\s+(x|create)\s`: a selected job that gains one leaves `NO_INSTALL`'s selection (fails), a tagging job refuses it (`CLEAN` mutation added). SECURITY.md says so |
| Codex 1 (Medium) | Arguments were cut at a `;` inside quoted `-e` code and at a line continuation, hiding `--install=force` | `callArgs` joins `\`-newline continuations and blanks quoted text before cutting at `&&`, `;`, `|` or a newline; two mutations |
| Codex 2 (Medium) | setup-bun's own steps were skipped wholesale and `expanded()` stopped at one composite level | `expanded()` recurses; the check drops only setup-bun's step guarded by `inputs.install == 'true'` (the guard `cleanFindings` pins); two mutations (a Bun call added to setup-bun reaches six jobs; a nested composite) |
| Codex 3 (Medium) | A non-cone list naming `/bunfig.toml` and then `!/bunfig.toml` passed | Any `!` pattern in a non-cone list fails the own-revision rule; one mutation |
| Codex 4 / Opus 3 (Low) | "overrides --no-install" describes behaviour Bun 1.4.2 lacks (probe above) | Refusal kept as strictness; message and test renamed "passes conflicting auto-install flags" |
| Codex 5 (Low) | Tautological comment over `bunCallFinding`; selection's reason for reading own steps only was unstated | Comment deleted; the reason stated on `installsNothing` |
| Opus 2 (Low) | A Bun call in backticks was not matched | Backtick added to the call matcher's lookbehind; one mutation |
| Opus 4 (Low) | A `git checkout`/`switch` in an earlier step moves the revision Bun reads, like `with.ref` | Any step running `git checkout|switch|reset|restore|worktree` fails the own-revision rule (none does today); one mutation |
| Opus 5 (Low) | The edited `behavior-gating.test.ts` docblock line ran to 176 characters | Re-wrapped |

Gates after the fixes: lint, typecheck:all, test:ci-gating 509/0, test:release 293/0.

## Fix loop round 2 (Codex, same session)

Codex: **approve with fixes**, three new Medium findings, all verified against the code and accepted, fixed in `4dd761a`.

| # | Finding | Fix |
|---|---|---|
| 1 | Round 1's blanking of quoted text also erased quoted flags: `bun "--install=force" -e '…'` passed (and fetches), and a quoted `"--no-install"` became a false positive | A quoted word without whitespace or a separator is unquoted; quoted code is still blanked. A mutation for the quoted override, and a success control that a quoted `--no-install` passes |
| 2 | `INSTALLS` read raw text, so `bun \`-newline-`x pkg` escaped selection and `CLEAN` | One `script(step)` joins continuations for every install, revision-switch and Bun-call check; mutations for `bun x` (selection) and `bun create` (`CLEAN`) on a continuation line |
| 3 | `git -c advice.detachedHead=false checkout` and `git -C dir checkout` escaped the revision-switch rule | The matcher skips any options (`-c`/`-C` with their argument) before the subcommand; mutations for both |

The comment over `NO_INSTALL` now names the check's second blind spot: a command the shell assembles at run time (a variable, `eval`), which no static read of the YAML can see; the threat it guards against is an accidental import or call, not an evasive author (plan § Security). Gates: lint, typecheck:all, test:ci-gating 515/0.

## Fix loop round 3 (Codex, same session), the last

Codex: **approve with fixes**, one new Medium: `bun --silent x <pkg>` and `bun --silent create <t>` fetch under `auto = "disable"` (Codex's loopback probe) and escaped `INSTALLS`, because round 1's pattern expected the subcommand right after `bun`. Accepted: `INSTALLS` allows option words before `x`/`create`; two mutations, shown red on the round-2 pattern and green after. A value-taking option before the subcommand (`--cwd dir x`, `-c file x`) still escapes `INSTALLS`, but the per-call check already refuses `--cwd` and `-c` on its own. The loop's hard stop is three rounds, so this fix had no fourth Codex pass.

A local `test:all` on the round-2 head failed once in `apps/extension/scripts/e2e/owned-processes.test.ts` ("an agent run's service, adopted by a bare run, outlives every reap until its adopter dies": `reapPriorRun` saw the killed adopter still alive). That file's `kill()` waits with `until(() => !running(pid))` and ignores its result, so under host load the reap can run before the process is gone. Unrelated to this diff (no change under `apps/`); one rerun passed. Already tracked as #284 (a zombie owner reads as alive, so a reap test can fail under load).
