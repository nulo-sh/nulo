# Arc 1 lessons: harden-quality-fixes-2

## Phase 1.1 (#538)

- Config proof: a scratch script imported the three `vitest.e2e*.config.ts` and printed each resolved `test` and `resolve` (reporters by class, functions by name, keys sorted). The dumps at `ea8827f9` and after the extraction are byte-identical, the combined config included. With `NULO_E2E_RETRY=0` all three resolve `retry: 0`; with `abc`, vitest stops with a Startup Error naming `NULO_E2E_RETRY="abc"` before any browser starts.
- `networkRunner` is a function, not the plan's object: a module constant would build the stateful reporters at import in every importer of `vite.shared.ts` (the build and unit configs included) and share one instance between configs.
- No gate type-checks the three `vitest.e2e*.config.ts` (`tsconfig.node.json` is used by no script and fails on its own). Checked ad hoc with `tsc --ignoreConfig --strict --moduleResolution bundler` on the three files: clean.
- The observability pin's child vitest now writes to its own `GITHUB_STEP_SUMMARY`; run under an outer `GITHUB_STEP_SUMMARY`, the outer file stays absent.
