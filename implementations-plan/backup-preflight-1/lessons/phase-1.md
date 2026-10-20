# backup-preflight-1: phase 1 (the tests, red on the base)

- 2026-10-20 `bun run --cwd apps/extension test -- src/wallet/services/backup/` on the unchanged migrator: 5 failed, 106 passed. Exactly the planned five, each on today's uncovered refusal:
  - `backup-migrator.test.ts` (a) and (d): `migration 2 touches "nulo:core:networks", which no backup slice maps to`.
  - pins "a block-listed root refuses beside a root no slice maps to": got the `nulo:mystery` uncovered reason, not the blocked one.
  - pins "a root no slice maps to never masks an absent required read": got `incompatible` (uncovered), not the absent-read `failed`.
  - `footprint-coverage.test.ts` scratch test: the networks row-map's import was `incompatible` (uncovered), not `migrated`.
- Controls passed on base: (b) imperative networks, (c) both block-listed roots, the ack loop's agreement over the stamped fixture.
- `bun run lint` first failed on two Biome format errors in the new tests (long one-line object literals); `biome format --write` fixed both. `bun run typecheck:all` exit 0.
