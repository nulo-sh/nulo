# soak-flakes-1: status

- 2026-10-23: phase 0 — briefs and issues read; worktree adopted at `0e4bec132`.
- 2026-10-23: recon — #1101 (the in-body re-evaluation of `background.ts`, CPU-bound) and #1102 (a restart in the dead worker's millisecond) demonstrated; recon.md written.
- 2026-10-23: plan drafted; Codex audit and Opus Plan leg sent.
- 2026-10-23: audit r1 — Codex conditional approve (6 findings), Opus conditional approve (9); all accepted; plan revised to 150 lines; Codex resumed for the verdict.
- 2026-10-23: audit r2 — Codex conditional approve, two diagnostic fixes accepted (pgid from the loops' leader; one vitest invocation per timed-out probe); resumed for the verdict.
- 2026-10-23: audit r3 — Codex approve; plan committed (150 lines).
- 2026-10-23: phase 1 green — probes red on base 9/9 and green on the fix 9/9 (0 fetches); contention red on base, 25/25 on the fix; four builds byte-identical; lint, typecheck, wallet-sdk 491/491.
- 2026-10-23: phase 2 green — zero-gap restart red 3/3, +1 ms green 3/3, '>' mutant red; lint, typecheck, operation-journal 199/199, composition 164/164.
