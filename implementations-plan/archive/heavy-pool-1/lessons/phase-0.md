# heavy-pool-1: planning consults

## Data (2026-10-21)

- Pulled every first-attempt green run of both network PR lanes, 01:26–14:34Z: 9 Chrome and 10 Firefox runs that ran the suite (docs-only PRs skipped it). Per run: every `Run /` job's duration; each shard's and each heavy job's per-file costs through `parseJobLog`. Scratch only, under the lane's cache dir; no log kept.
- Replayed `assignShards` leave-one-out for today's layout, the five-shard fold and a six-shard fold; table in plan.md § Measurement.
- Recon (one Sonnet Explore sweep): the lane brief's job names did not hold (it named `network-e2e-heavy` and `network-e2e-heavy-concurrent`; the owner's pick names heavy-long's two files). The generator reads only `Run / shard` jobs, so the record holds neither folded file.

## Panel round 1 (2026-10-21)

- Codex `gpt-6.1-sol` high, session `01a15f04-77ca-7401-bdee-148afec24b1c`. `CODEX_ACCOUNT` was unset as the brief says, but the managed `best` routing ran it on the alejo-icloud roster home; it worked. Verdict: conditional approve, six findings (I2 residuals, a median-only rule, unproven I1/I3/I4, run-time records, the median fallback, credential wording).
- Opus 5.5 Plan lens, run beside it. Verdict: conditional approve, nine findings; it re-implemented the replay and matched every figure. New beyond Codex: the flake rule for folded files, same-arm dispatch cancellation, the SHA pin, gate wording, #1003's skill edit, the smoke re-split.
- Dispositions are in plan.md § Audit verdicts.

## Panel rounds 2–3 (2026-10-21)

- Round 2 (Codex, resumed): conditional approve. New evidence against the whole regeneration: the lane brief says smoke is untouched, so the generator gains an optional suite argument. Also the 3a base-drift re-measure and an open-row-only flake rule.
- Round 3 (Codex, resumed): approve, no material finding.
