# Phase 2: the live move-approval label (#250)

## Red against the old behaviour (step 6)

Work committed first (`3ff1ca4`). In place, `pullRequestEvent`'s type got its `labels` back and `movesApproved(env)` returned the base rule, `(pullRequestEvent(env.GITHUB_EVENT_PATH)?.labels ?? []).some((l) => l?.name === MOVE_APPROVED_LABEL)`. `bun test scripts/ci-cd/complexity-baseline.test.ts -t "move approval"`: 1 pass, 4 fail, each on its own assertion:

- stale snapshot (event carries the label, live answer `false`): expected `false`, received `true`;
- live label (event lacks it, live answer `true`): expected `true`, received `false`;
- unset and `"yes"` under Actions: "Received function did not throw".

The off-Actions case passed under both rules, as it should. Restored with `git checkout HEAD -- scripts/ci-cd/complexity-baseline.test.ts`; `git status --short` showed only the plan files; the block again 5 pass.

## Pin red on the base workflow (step 7)

`git show af4afcc:.github/workflows/_unit-tests.yml` over the tree: the new `behavior-gating.test.ts` test fails on its first assertion (the `live` step's `run` is `undefined`). Restored from `HEAD`; the file again 50 pass.

## Wiring check, local

`GITHUB_ACTIONS=true GITHUB_BASE_REF=dev` with the ratchet test alone (`-t "shrink-only"`, base `origin/dev`): `BASELINE_MOVE_APPROVED=false` and `=true` pass (no move in this diff); unset fails with `BASELINE_MOVE_APPROVED must be "true" or "false" on a pull request run`. The hosted check is the PR's own quality run.
