# Phase 6: smoke and publishers take each artifact by the producer's id (#555)

- Gate at 6a0d84aa: `lint:actions` 0, `test:ci-gating` 0 (620 pass; `behavior-gating` and the aggregators unchanged and green), `test:release` 0, `typecheck:scripts` 0. `artifact-handoffs.test.ts` had 24 tests pass, and each of its 15 mutations was red for its own clause.
- The review rounds then pinned each producer by job and step, the check step's shape, and a status-function-free download condition (round 3: all four functions, case-blind). By the final head it had 30 tests: 21 mutations, 8 id-check cases and the clean tree. Final gate on 8dbbd12f: `test:ci-gating` 626 pass.
- The id check is inline bash, not a composite action, because the store jobs check out the tag's revision, and an older tag would lack the action.
