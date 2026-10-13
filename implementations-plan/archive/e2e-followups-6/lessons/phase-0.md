# Phase 0: planning log

## 2026-10-12: gh output in the agent shell

`gh issue view <n>` and `gh pr list` printed nothing to the agent's captured stdout, exit 0. Writing `--json` output to a file under `~/.cache/nulo-backlog/e2e-followups-6/` and reading it back with `jq` worked. Use that form for every `gh` read in this lane.

## 2026-10-12: #326 mechanism probe (scratch, outside the repo)

A twenty-line Node probe spawned the test's fixture, `sh -c "<script>"`, read the background pid from stdout, sent it SIGKILL at once and polled `/proc/<pid>/stat` until it read `Z` or vanished. `/bin/sh` is dash 0.5.12-6ubuntu5 on this host (192 cores, no pin).

| Script given to `sh -c` | Rounds | Zombie (`Z`) | Reaped (gone) |
|---|---|---|---|
| `sleep 120 & echo $!; exec sleep 120` (the fixture) | 300 | 292 | 8 |
| the same, Node pinned to one CPU | 200 | 198 | 2 |
| `sleep 120 & echo $!; <2,000-step builtin loop>; exec sleep 120` | 40 | 3 | 37 |
| `sleep 120 & echo $!; sleep 0.3; exec sleep 120` | 50 | 0 | 50 |

Reading: the race is real and reproduces on an idle host (8/300). Builtins alone between the `echo` and the `exec`, with no foreground child to wait for, still let dash reap the killed child (37/40): dash reaps a dead background child between commands. A foreground command before the `exec` reaps it every time (50/50). So a kill that lands after the `echo` (which releases the test) and before the `exec` leaves no zombie. That is the issue's "probable mechanism", now confirmed. Once `/proc/<parent>/comm` reads `sleep`, the parent is past `execve`'s point of no return and no shell code can run in it again.

The sibling test "a zombie reads as gone, not unreadable" (`sleep 0.1 & echo $!; exec sleep 5`) has the same race: there the child dies by itself after 0.1 s, and a parent that has not reached its `exec` by then reaps it.

## 2026-10-12: #326 fix-shape probes (scratch, outside the repo)

- **The issue's `node -e` parent would reap.** A `node -e` parent that spawns `sleep 120` through `child_process` and never waits: the child read `gone` 0.5 s after SIGKILL. libuv reaps every child it spawned on SIGCHLD, so a Node (or Bun) parent can never hold a zombie. The issue's example does not hold.
- **Kill only once the parent's `comm` reads `sleep`.** The same fixture, with the kill moved after a poll of `/proc/<parent>/comm` until it reads `sleep`: 300/300 zombies; with the 2,000-step builtin loop forced before the `exec`: 40/40 zombies (the unfixed fixture gave 3/40). The kernel sets `comm` in `begin_new_exec`, after `execve`'s point of no return, so no dash code can run in the parent once it reads `sleep`.

## 2026-10-12: plan audit, Codex round 1

`run-codex.sh` on gpt-6.1-sol at high, read-only (the host runs it as approve-for-me), `CODEX_ACCOUNT` unset; session `01a130ba-c8b8-7d10-9f32-fa0c43a42ac2`. Verdict: **reject**, with two blockers (the `openPopup` reset erases a window's errors before most assertions; the logger window's URL snapshot can miss a window opened before the call). Seven findings, all checked against the tree, all accepted; plan.md § Audit verdicts has the table.

## 2026-10-12: plan audit, Opus 5.5 Plan lens

Run beside Codex round 1 (`Agent`, `subagent_type: Plan`, `model: opus`). Verdict: **conditional approve**, nine findings, all checked and accepted (one as an exclusion, one in part: the reset gap is fixed in place, as Codex asked, rather than documented and filed). New beyond Codex: CI runs `delete-after-prove` prover-ON; `reconnectPlayground` can resolve one target twice; a hash change may not update a target's URL on Chrome, so the guard is tested by a direct second call; three rounds of the eight files per browser.

## 2026-10-12: plan audit, Codex round 2 (resumed)

Verdict: **conditional approve**: complete the assertion sites (`execute-scope-*`'s first `openPopup`, `connect-one-window`'s capabilities window after its only assertion) and order the zombie cleanup child first. All three accepted. Codex kept the assertions-in-place decision over the Opus alternative.

## 2026-10-12: plan audit, Codex round 3 (resumed)

Verdict: **approve**, no new material findings. Three rounds on one session (`01a130ba-…`): reject → conditional approve → approve. The Opus lens's conditional approve had its five conditions met in the round-2 revision.
