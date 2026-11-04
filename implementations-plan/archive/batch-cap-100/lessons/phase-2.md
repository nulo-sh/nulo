# Phase 2: uncapped

## Design, 2026-11-04

- The owner, after reading that uncapped and a cap of 100 send the same requests on `@aztec-labs/foundation` 6.0.0: "uncapped." Arc 2 removes both entries.
- Codex (gpt-6.1-sol, high, session 01a1a763): approve with changes, all taken (plan.md, Audit verdicts). It traced that no construction treats `undefined` differently from 100, ran the guard against in-memory client defaults (25 and 100 pass; 101 and 1000 fail), and noted the guard reads observed requests: a future cut of the 1 MiB body budget at the same time as a raised count could mask the raise. Accepted as the guard's stated contract.

## Red, 2026-11-04

- Touched files at retry 0: 15 of 15 pass.
- Both entries at 101: the guard failed on both seeds (`expected 101 to be less than or equal to 100`), and the no-cap case failed (`called 100 times, but got 101 times`). Reverted.
- `checkSeed` falling back to 1: only the no-cap case failed (`called 100 times, but got 1 times`). Reverted.

## Review, arc 2 round 1

- Codex (gpt-6.1-sol, high, session 01a1a769): changes needed, two low documentation findings, both accepted. `checkSeed`'s comment promised one request, which a lower client default breaks; the plan's Post-implementation paragraph and D5 still read as one arc. No runtime defect; its probes found no mock or stub leak.

## Review, arc 2 round 2

- Codex (resumed): approve, no findings. Both fixes verified; no regression over the arc.
