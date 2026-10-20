# Phase 3: the round-trip e2e

All at retry 0. Smoke after the armed smoke build; network through `agent.sh`, proverless. Chrome ran at `5e2c61332` and again on the final head (`511a7a676`); Firefox ran on the final head.

| File | Chrome (`5e2c61332`) | Chrome (final head) | Firefox (final head) |
|---|---|---|---|
| `tests/e2e/backup-roundtrip.test.ts` | 22.3 s | 30.1 s | 32.1 s |
| `tests/e2e/backup-imported-account.test.ts` | 48.2 s | 44.9 s | 62.4 s |
| `tests/e2e/network/backup-restore-integrity.test.ts` | 113.1 s | 116.2 s | 130.0 s |
| `tests/e2e/network/backup-migration-roundtrip.test.ts` | 62.6 s | 43.4 s | 89.8 s |

- `agent.sh` lists files through `vitest.e2e.network.config.ts`, whose include holds only `tests/e2e/network/**` and the egress guard: a smoke file passed to it selects nothing. Smoke files take `bun run test:e2e`.
- The armed smoke build regenerates `apps/extension/src/types/components.d.ts` in the working tree; it is not part of the change.
