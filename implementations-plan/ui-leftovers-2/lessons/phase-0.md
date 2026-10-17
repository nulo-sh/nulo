# Phase 0: planning consults

## Codex plan audit (gpt-6.1-sol, high, session 01a14b76)

- Verdict: conditional approve. Five findings, all accepted after checking them against the tree.
- C1: the 10 s bound held only on a worker that is up; a `Connecting` port keeps its waiters to the 60 s deadline. Recon and the plan corrected; the cap question went to the owner as OA-3 (ships: no cap).
- C2: the network config retries twice unless `NULO_E2E_RETRY=0` (`vitest.e2e.network.config.ts:26`). Added to the gate.
- C3: Holdings' hidden ruler repeats the figure and the meta line, so a whole-summary text assertion cannot prove the visible state. Visible spans get testids.
- C4: a stub that never answers ends in the failure state, not the figure. The scratch stub now holds, then releases a valid quote.
- C5: OA-1's account-change sequence was wrong (`settled` stays true). Reworded.

## Opus 5.5 plan lens (Plan agent)

- Verdict: approve with changes; eight findings accepted (plan.md § Audit verdicts, O1-O8).

## Codex verify (resumed, session 01a14b76)

- Round 1: conditional approve; three wording leftovers (the 10 s is the fetch's abort, not the call's bound; OA-1's account change is conditional on prices having answered; recon's stub cell). Applied.
- Round 2: approve, no new material defect.
