# Phase 1: gate the nightly on the seven jobs

## Gate (2026-10-11, commit 4e10e82)

- `bun run lint:actions`: exit 0. `bun test scripts/ci-cd/aggregators.test.ts scripts/ci-cd/behavior-gating.test.ts`: 131 pass. `bun run test:ci-gating`: 523 pass. `bun run test:release`: 0 fail (10 skip, pre-existing). `bun run lint`: exit 0 (27 warnings, none in a touched file). `bun run typecheck:all`: exit 0.

## Red on base

`git show 27af8d7:.github/workflows/nightly.yml` over the new file, then the two pin files: exit 1, two failures, then the file restored byte for byte.

- `nightly.yml gates > status always runs, … waits on every job but the advisory reports`: expected minus received lists exactly the seven jobs (`network-e2e-firefox`, `network-e2e-heavy-firefox`, `network-e2e-heavy-concurrent-firefox`, `network-e2e-canary-firefox`, `network-e2e-chaos`, `network-e2e-chaos-firefox`, `smoke-firefox-against-artifact`).
- `canary lanes > … the chaos run only in nightly, seeded by the run`: expected `${{ github.event.inputs.chaos_seed || github.run_id }}`, received `… || ''`.
- The publish test passes on the base: its needs equal status's minus itself there too. The mutations below isolate it.

## Mutations (one at a time, file restored after each)

- 1 smoke-firefox-against-artifact out of status needs only
  - exit 1
  - fails: nightly.yml gates > status always runs, nothing can hide a red script, and it waits on every job but the advisory reports
  - fails: nightly.yml gates > status passes a green night
  - fails: nightly.yml gates > status passes a quiet day
  - fails: nightly.yml gates > status fails a green night once any one need fails or is cancelled
  - fails: nightly.yml gates > status fails a quiet day once any one need fails or is cancelled
  - fails: nightly.yml gates > publish-nightly runs only past every gate status reads, each exactly success, never from a cancelled run
- 2 network-e2e-firefox out of publish needs and if
  - exit 1
  - fails: nightly.yml gates > publish-nightly runs only past every gate status reads, each exactly success, never from a cancelled run
- 3 chaos-firefox clause out of publish if only
  - exit 1
  - fails: nightly.yml gates > publish-nightly runs only past every gate status reads, each exactly success, never from a cancelled run
- 4 '|| true' appended to publish if
  - exit 1
  - fails: nightly.yml gates > publish-nightly runs only past every gate status reads, each exactly success, never from a cancelled run
- 5 loop exit 1 -> exit 0
  - exit 1
  - fails: nightly.yml gates > status fails a green night once any one need fails or is cancelled
  - fails: nightly.yml gates > status fails a quiet day once any one need fails or is cancelled
- 6 one chaos_seed back to || ''
  - exit 1
  - fails: canary lanes > the same-token matrix runs proverless in a dedicated job, and the chaos run only in nightly, seeded by the run

Mutation 1 also throws in the script runs (the loop reads a result no world binds), which is why the status tests fail beside the exact-set one.
