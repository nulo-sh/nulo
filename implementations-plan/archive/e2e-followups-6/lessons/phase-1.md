# Phase 1: #326, a zombie the test keeps

## 2026-10-12: the reproduction on the base fixture (step 1)

`scripts/e2e/owned-processes.test.ts` at `32b7bf4`, copied to an uncommitted `owned-processes.widened.test.ts` with a 2,000-step builtin loop before each `exec`, run 5 times on Bun with `-t zombie` (unpinned, host load average about 100 on 192 cores).

| Round | "a zombie reads as gone" | "a zombie owner is dead to the identity check and to the reap" |
|---|---|---|
| 1-5 | green | red: `ENOENT: no such file or directory, open '/proc/<pid>/stat'` |

5/5 red, each the issue's ENOENT at the `) Z ` wait. The sibling test stayed green: its child dies by itself after 0.1 s, so a 2,000-step loop (a few ms) does not push the parent's `exec` past the child's death. Its race is the same one with a wider margin. The copy was deleted before any other run.

## 2026-10-12: the unmodified file pinned (step 2)

The base file 20 times, `taskset -c 150` on vitest, its workers and its spawned processes, beside three `taskset -c 150 sh -c 'while :; do :; done'` busy loops killed by their pids afterwards: 20/20 green, 0 lost zombies. Core 150, not 0-1: `e2e-followups-5` owns the two-core amplifier on this host. As the plan says, step 1 is the forced-order proof; this round only shows the race is rare on Bun without forcing.

Combined with the planning probes (lessons/phase-0.md): the unfixed fixture lost its zombie 8 of 300 times on Node unpinned, 2 of 200 pinned, 37 of 40 with the loop forced; on Bun, 0 of 20 pinned and 5 of 5 with the loop forced.

## 2026-10-12: the fix (steps 3-4)

A test-local `zombieParent()` spawns the same fixture, reads the child's pid within the file's `until` budget, refuses a pid that is not a positive integer, and returns only once `/proc/<parent>/comm` reads `sleep` while the parent is still running. A parent that exits, or a `/proc` read that throws, is a fixture failure; on any failure the helper kills the child (once known), then the parent, and rethrows. `release()` kills the child first, while the parent still holds the pid (so it cannot be reused), ignoring only `ESRCH`, then always the parent through `ChildProcess.kill`, which never signals a reaped pid. Both zombie tests use the helper; the first now kills its child instead of waiting for `sleep 0.1`. Each test keeps its `) Z ` wait.

## 2026-10-12: certification (steps 5-6)

| Run | Rounds | Green | Lost zombies |
|---|---|---|---|
| fixed file, unpinned | 10 | 10 | 0 |
| fixed file, pinned to core 150 beside three busy loops | 20 | 20 | 0 |
| fixed file widened (2,000-step loop before the `exec`), `-t zombie`, unpinned | 20 | 20 | 0 |

The widened copy of the fixed file was deleted after its run; `git status` shows no `*.widened.test.ts`.

**Gate: pass.** Step 1: 5/5 ENOENT on the widened base copy (≥ 1 required). Step 5: 10/10, then 20/20 pinned. Step 6: 20/20. `bun run lint` and `bun run typecheck:all` exit 0. No widened copy in the tree.

Before and after, in one line: on Bun, the widened fixture lost its zombie 5 of 5 times on base and 0 of 20 on the fix; the unwidened file lost none in 20 pinned rounds either way, and none in 10 unpinned rounds on the fix.
