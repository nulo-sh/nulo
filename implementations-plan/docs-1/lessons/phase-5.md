# docs-1 phase 5: #672

- `doRefresh` checks `getActiveProfile()` after the backoff check, as the last await before the request; a locked call answers from the cache, or `{}` when the generation moved meanwhile.
- Red/green: the three new tests fail on the base `service.ts`; the fiat-display-flip test also fails with the generation check removed from the locked return.
- Unit gate: `bun run lint` 0; `bun run --cwd apps/extension test src/wallet/services/price` 56 passed; `bun run test` 13 540 passed; `bun run test:all` 0; `bun run typecheck:all` 0.
- Smoke: `bun run test:e2e -- fiat-display` needs the armed Chrome build first (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`), and its filter is the file name, not the path.
- Smoke on Chrome (load1 137): `fiat-display.test.ts` 2/2 passed, 11.9 s, retry 0.
