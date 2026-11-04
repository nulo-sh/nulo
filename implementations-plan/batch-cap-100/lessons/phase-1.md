# Phase 1: the batch cap at 100

## Red first, 2026-11-04

- On the base cap of 25, with the tests moved, `bun --bun vitest run` of the three files: 4 failed, 10 passed. `seeds.test.ts`: `expected 25 to be 100`. In `node-factory.test.ts` and the preflight split, the requests came out as `Array(10)` instead of `[100, 100, 50]`. In the refusal test, `[25]` instead of `[100]`.
- At 100: 14 of 14 passed.
- Forwarding proof: I made `node-factory.ts` pass `() => undefined` and removed `maxBatchSize` from `seed-preflight-node.ts`. The two forwarding cases failed (`expected [ 8 ] to deeply equal [ 3, 3, 2 ]`). The six other cases in those files still passed, the 100-splits among them, which is the gap Codex r1 named. I then reverted both files.

## Review, arc 1 round 1

- Codex (gpt-6.1-sol, high, session 01a1a728): clean.
- Opus 5.5 diff review: two findings, both accepted. (1) Demonstrated by trace: the refusal test's `[100]` passes when `checkSeed` hard-codes 100, because the real lookup also answers 100. The new case `checkSeed sends one tick of the cap the lookup answers` expects 3 reads; with `seed-identity.ts:21` changed to `length: 100` it failed (`called 3 times, but got 100 times`), and passed once reverted. (2) The comment's prover clause no longer tied to anything; it now says one prover tick can exceed the limit.
