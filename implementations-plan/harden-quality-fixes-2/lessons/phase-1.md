# Arc 1 lessons: harden-quality-fixes-2

## Phase 1.1 (#538)

- Config proof: a scratch script imported the three `vitest.e2e*.config.ts` and printed each resolved `test` and `resolve` (reporters by class, functions by name, keys sorted). The dumps at `ea8827f9` and after the extraction are byte-identical, the combined config included. With `NULO_E2E_RETRY=0` all three resolve `retry: 0`; with `abc`, vitest stops with a Startup Error naming `NULO_E2E_RETRY="abc"` before any browser starts.
- `networkRunner` is a function, not the plan's object: a module constant would build the stateful reporters at import in every importer of `vite.shared.ts` (the build and unit configs included) and share one instance between configs.
- No gate type-checks the three `vitest.e2e*.config.ts` (`tsconfig.node.json` is used by no script and fails on its own). Checked ad hoc with `tsc --ignoreConfig --strict --moduleResolution bundler` on the three files: clean.
- The observability pin's child vitest now writes to its own `GITHUB_STEP_SUMMARY`; run under an outer `GITHUB_STEP_SUMMARY`, the outer file stays absent.

## Phase 1.2 (#542)

- Mutation check of the new harness (scratch, reverted): disabling the suite loop in `e2e-aggregate.sh` fails 16 tests in `aggregators.test.ts`; moving the `main` rule in `e2e-decide.sh` fails 5 across `decide-gate.test.ts` and `aggregators.test.ts`. The tables reach the scripts.
- The lane truth tables (any need ending otherwise fails) now run for all four lanes, not only the two smoke lanes: one script makes it cheap.
- Deviations D15-D17 in the plan's ledger: `networkRunner` is a function; the status checkout is pinned once, in the aggregator loader; the decide errors name the step outputs they read.
- CI.md's Firefox job count changes with the `decide` jobs gone: seventeen more jobs per PR that trips both filters (thirteen suites, four control), not nineteen.
