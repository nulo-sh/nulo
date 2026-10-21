# e2e-clocks-1, phase 0: planning consults

- 2026-10-21: recon, two Sonnet explorers (e2e flags and the release gate; the waits tied to the clocks). Findings in recon.md. Two brief claims did not hold: `behavior-gating.test.ts` pins no release marker, and `shard-timings.json` is not on `dev` (draft #978 adds it).
- 2026-10-21: CI timings read from five green PR runs (three Chrome, two Firefox): the unlock scan shows a receipt in 1.5-2.1 s; `snack-placement`'s grants read final 53.7-56.8 s after the chain is.
- 2026-10-21 ~14:45Z: Codex r1 (gpt-6.1-sol, high, session 01a15eea): conditional approve, six findings, all accepted (plan § Review verdicts).
- 2026-10-21 ~14:58Z: Opus r1 (Plan agent): conditional approve, eight findings, all accepted. Both legs found `SendCheck`'s first read ignores the interval; Codex found the deliver-then-arm race, Opus the values' import path around the stamp.
- 2026-10-21 ~15:10Z: Codex r2 (resumed): conditional approve; P built at the base would lack the deliver-then-arm helper (a confound in `incoming-arrival`), so P became the head with the clocks off. Recon synced with D6 and D9.
- 2026-10-21 ~15:20Z: Codex r3 and r4 (resumed): conditional approve each; removing or unsetting the flag leaves an inherited or `.env` value in force, so P and the prover-ON build pass `0` explicitly and P requires the stamp absent.
- 2026-10-21 ~15:25Z: Codex r5 (resumed): approve, no new material findings.
- 2026-10-21 ~15:15Z: the orchestrator approved with four conditions (D12-D15): measure on CI, production untouched, nothing weakens a test, review before measuring. Codex r6 (resumed) on the rewritten measurement: conditional approve, five findings, all accepted; r7: approve.
