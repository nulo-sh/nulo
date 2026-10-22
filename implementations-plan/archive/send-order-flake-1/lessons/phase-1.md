# Phase 1: wait for the stored stage

Arc branch `send-order-flake-1-a1` off the plan commit `7c84b0708`, with `origin/dev` at `76f88c4d3` merged first (`3cb3a0822`; #1084 touched e2e files and plans only). Commits: `4f179e8d9` (the change), `0317ba973` (the review nits).

## Negative controls (scratch copies, deleted; 2026-10-22, load1 about 120)

| Variant | Result |
|---|---|
| The base test (`git show 421bf33b4:…`) with phase-0's `gate(h)` | red 5/5, `expected 'pending' to be 'queued'` |
| The fixed test with `gate(h)` | green 5/5 |
| The fixed test with the `queued` transition stubbed to no write | red 5/5, `waitFor timeout` |
| The D7 lane test with `await` dropped before `this.requeue` (scratch edit, restored) | red, `expected "vi.fn()" to not be called`; rechecked after `0317ba973` moved its mock below the acquire: still red |

## Soak

`send-order.composition.test.ts` at `--retry=0`, 100 runs, 4 at a time, beside the running lanes, on `4f179e8d9`: **100 of 100 passed**, 20:49:13Z to 20:55:19Z, load1 122 at the start and 76 at the end. `0317ba973` changed only that file's comment line.

## Gates on the final head (`0317ba973`)

- `bun run lint`, `bun run typecheck:all`: exit 0.
- `bun run test`: exit 0, 15133 tests (15120 passed, 1 expected fail, 5 skipped, 7 todo): the base count plus one, since the diff from `3cb3a0822` adds one `test(` and removes none, in the only two test files it touches.
- `bun run test:all`: exit 0, every workspace.
- `apps/extension` `bun --bun vitest run src/wallet/services/execution --retry=0`: 74 files passed, 1 skipped; 1467 tests passed.
- No local e2e (plan D5).

## Review loop

- **Codex round 1** (gpt-6.1-sol, high, session 01a16561): approve, no findings.
- **Opus diff review** (opus, general-purpose): approve, 3 nits, all applied in `0317ba973`: the test comment and `parkSlot`'s TSDoc stated today's hand-on order as fact (now "nothing orders" and "possibly after"); the lane test's held write is installed after the acquire. Its observation that the claim needs only write-before-return went into D7's wording.
- **Codex round 2** (resume): approve, no findings or regressions. Converged.
