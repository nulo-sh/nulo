# teardown-log-1 status

- 2026-11-19 plan: cause demonstrated (leaked mounts whose `ContractChip` hold fires after the file ends); sweep found six files; plan written.
- 2026-11-19 arc1 gate 1: lint and typecheck:all exit 0.
- 2026-11-19 arc1 gate 2: the six files, 131/131 at retry 0.
- 2026-11-19 arc1 gate 3: probe sweep on the fix, 1047 files: 0 files log after they end (base: 6). One `useSendReview` timer remains pending in `useReaskReview.test.ts` (also at base); it fires into a ref with no render and no log.
- 2026-11-19 arc1 gate 4: `OperationCard.wire.test.ts` alone, 50 of 50 green at retry 0, no error line.
