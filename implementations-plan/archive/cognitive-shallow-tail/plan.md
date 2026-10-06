# Cognitive shallow tail

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Extract-helper refactors across wallet services, extension UI and the faucet and operational tooling, with their suppressions removed from `scripts/complexity-baseline/manifest.json` under the gate in `biome.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Clear the lower band of the shrink-only complexity baseline (cognitive scores 16 to 20, about 51 functions) by extracting named helpers, in three sequential batches by area: wallet services and service-adjacent packages, extension UI, then the faucet and operational tooling. No rewrites and no behavior changes; where behavior was surprising it is pinned by a test rather than fixed. The batches are part of the burn-down described in [complexity-budgets](../complexity-budgets/plan.md).

## Why

A function that scores just over the budget is usually one extraction away from passing, so it is the cheapest debt in the baseline. Harness and test entries in the same band stay baselined: refactoring test scaffolding for a score buys no production safety and churns pinned suites. Scores above 20 belong to the separate adjudication in [complexity-residue](../complexity-residue/plan.md).

## What shipped

- Each batch rebased on the previous one and regenerated the manifest with `bun run baseline:complexity`, so it shrank monotonically with no hand edits.
- Control flow, error identities, event order and log payload arities were preserved verbatim; lock-boundary naming (`...Locked`, `...HoldingLock`) carried onto the extracted wallet-service helpers.
- What stayed baselined in the band: the soak-matrix CLI, e2e harness fixtures, and a few test bodies whose complexity is an enumerated scenario table.
- Moving a fence-guarded write across a new `await` reopens the race the fence closed, because awaiting an internally fenced helper still yields a microtask before the caller resumes. One such case was caught in the profile bootstrap and fixed by re-checking the fence on resumption; every batch was swept for the class.
- Biome scores nested closures separately, so hoisting a small callback out of deep nesting removes its inherited score without touching its logic. It is the cheapest win in the band.
- A `fail(): never` helper declared as a const arrow does not narrow control flow the way a `throw` statement does; a helper that must narrow its return should throw directly.
- A pre-commit formatter failure inside a compound command can block a commit silently; check that the commit landed.
