# shard-balance-1: phase 0 (planning) consults

## Measurement method

- Per-file costs come from the default reporter's file lines in the job logs (`gh api …/jobs/<id>/logs`).
  The gap between two lines is the file's wall time; the first file's gap holds the global setup
  (about 50 s on network), so it is charged its reported time instead.
- Check of the method: re-running vitest's own SHA-1 split on each run's file list with these costs
  rebuilt every shard's job duration within 1–2 %.
- Leave-one-out: each run is replayed with a record built from the other runs, so the projection
  never sees the run it predicts.

## Consult: Codex plan audit, round 1 (2026-10-20)

- `gpt-6.1-sol` at high, read-only, session `01a15b9e-4a89-7670-8092-3026e48153c1`.
- Verdict: conditional approve, six findings. All were verified against the tree and the scratch
  data, and all were adopted (plan.md § Audit verdicts).
- What it caught that matters beyond this plan: summed file gaps telescope to the shard's own
  duration. Rebuilding shard durations from them is accounting, not validation of the cost model.
- Re-run on the corrected sample (one first-attempt run per branch): the gains held (−171 / −333 /
  −185 / −115 s). The reported-versus-gap difference shrank to noise (≤ 9 s), so D3 now rests on
  forgery resistance, not on balance.

## Consult: Opus 5.5 Plan lens, round 1 (2026-10-20)

- Verdict: conditional approve, nine findings, all verified. Eight were adopted; one was adopted in
  a cheaper form (no glob copy in the generator). See plan.md § Audit verdicts.
- It caught what Codex did not: the smoke command needs the armed build. It also found that one
  network matrix serves both browsers, so OA-1's "per browser" was wrong (four shards would be
  slower on Firefox), and that a skipped first file prints no duration.
- Probe it prompted: `vitest/node` and both e2e configs import fine in a
  `// @vitest-environment node` test under `bun --bun vitest`.

## Consult: Codex plan audit, round 2 (2026-10-20)

- Resumed session `01a15b9e-4a89-7670-8092-3026e48153c1`. Verdict: approve. One low wording
  finding was adopted (the once-per-run check proves "not twice", not "not zero times").
