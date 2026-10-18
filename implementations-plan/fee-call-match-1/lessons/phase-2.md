# Phase 2: arc gate and picture

- 2026-10-18: `bun run audit:vue` exit 0 and `bun run test:all` exit 0 on `6f73a18c`; `test:all` again on the final head after the test-only fix round.
- Smoke suite on Chrome, armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`, `--retry=0`): 57 files passed, 6 skipped; 262 tests passed, 14 skipped; 21:49:35 to 22:21:54 UTC (about 32 min).
- Picture: the scratch spec's first run timed out waiting for the detail box, because it navigated before Home's list held the seeded row; waiting for a `tx-card` first fixed it. The spec lived in `tests/e2e/` only for its run. Light and dark: the Fee method row reads "Set by example.dapp.io"; the fee call stays out of the Calls box.
