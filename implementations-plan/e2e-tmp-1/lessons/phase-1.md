# e2e-tmp-1 phase 1: the owner and the self-test

- 2026-10-22: the self-test written first; against the base helper body it failed exactly the refusal case and both "gone" cases (`expected undefined to be an instance of Error`, `expected true to be false` twice), success control green.
- 2026-10-22: with the helper in `import-drivers.ts`, `typecheck:all` failed with 19 errors in `tests/e2e/fixtures/*` and `import-drivers.ts` under `tsc -p tsconfig.scripts.json`: importing `import-drivers.ts` from `scripts/` drags the fixture graph into a program without the e2e ambient types (`ProvidedContext`, the chrome API declarations). Moved the helper to `helpers/backup-temp.ts`, re-exported from `import-drivers.ts`; red/green re-proved on the moved module; `typecheck:all` exit 0 (D7).
- 2026-10-22: gate green: lint, `typecheck:all`, `test` (908 files, 15027 tests), `test:all`.
