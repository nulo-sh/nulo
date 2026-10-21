# soak-mode-1: phase 0 (planning)

- 2026-10-21 recon: one Sonnet explorer (soak mentions, pins, nightly inputs, validation idioms, the
  PR lanes' dispatch, the shard sequencer). Its line numbers for `pr-extension-network-e2e.yml` and the
  suite's artifact step were off by 5 to 64 lines; every citation in the plan was re-read by the planner.
- 2026-10-21 the brief's "nightly dry-run on a branch" instrument: run 39652968832 failed at `resolve`
  in 10 s (`nightly.yml:108-111`, dev only). Read a cited run's jobs before building on it.
- 2026-10-21 decision consult, Codex (gpt-6.1-sol, high, session `01a15fd0`): R, high confidence.
  Steelmanned F (a suffix made inside the suite avoids a lane input); found the whitespace-only list,
  `1/1` and the option-token paths; choice-value refusal is a reported 422, so `prep` refuses any mode
  anyway. Opus 5.5 (Plan): R; `1/2` holds 32.6 min of recorded Chrome time and the soak's shard can
  host `same-token-concurrent-sends`, so drop `mode=shard` (D2). Planner took R with D2.
- 2026-10-21 plan audit r1. Codex (gpt-6.1-sol, high, fresh session `01a15fd8`): approve with changes,
  six findings; it ran vitest's `filterFiles` in memory to show a typo beside a real path is dropped.
  Opus 5.5 (Plan): approve with changes, nine findings, read from the vitest 4.1.10 source. Both found
  the armed-file hole (`send-chaos`). Re-checked before folding: `assignShards` gives 2093/2092 s for an
  unexcluded `1/2`; only `send-chaos` and `_probe-warmup-effect` read the arming variables; Opus's
  `nightly.yml:70-78` correction is wrong (`:71`, `:79`).
- 2026-10-21 r2 (Codex resumed): approve with changes; three more opt-in files skip their substantive
  test, so a name list cannot carry the guarantee. r3 (Codex resumed; Opus fresh): both chose the
  report read-back (the suite's canary mechanism) over two hand-kept lists, strict; Opus found two more
  hollow files (one armed through a helper), proving the lists would have shipped stale. r4 (Codex
  resumed, verify only): approve.
