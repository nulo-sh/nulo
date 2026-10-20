# Phase 5: the fix loop and delivery

- 2026-10-19 Round 1: Codex (session `01a15527`) one Low; Opus diff review seven Lows; all fixed in d2fa6663. The Opus leg's trace that the takeover's no-card check could not fail (the view is null without an account) is the general lesson: a never-happens check needs a cause that only the guarded path removes.
- 2026-10-19 Round 2 (verify): Codex "Clean". Loop converged.
- 2026-10-19 Full Chrome smoke: `appearance`'s four tests timed out at 60 s while the host's load1 ran 400 to 975 (another lead's burst). The one rerun at load 146 passed 4/4 in 12.6 s: a load flake, not this arc.
- 2026-10-19 Full Firefox smoke 264/264 run (14 skipped); `test:all` 0. The timing baseline (a detached worktree of 3f9f958c under the cache dir) is removed.
