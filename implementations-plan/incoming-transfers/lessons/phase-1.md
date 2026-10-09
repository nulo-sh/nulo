# Phase 1 (Arc 1) — implementation log

## Phase 1.1: one receipt head (#227)

- The note arm now reads `tokens → getRecord → outgoing → inflight`, the public arm's order, through
  one `isOwnSend(scope, txHash)`; both contexts satisfy one `ReceiptScope` (the public context's
  `account` field became `accountAddress`). The epoch is re-read after the token read and after the
  record read in the note arm, as the public arm already did.
- Matrix re-pins: N1 to N4 now stop at the read they park on; N3 (outgoing miss) still reads the
  journal before standing down, like P3. A new row, "N2 record read, existing", pins that an existing
  note's backfill stands down on a bump after the record read (the public reconcile row's twin).
- New tests: an own outgoing hash reads the record, then `outgoing`, never the journal; an existing
  note with its timestamp costs `tokens` and `getRecord` only (two reads, was four); both arms'
  unknown-trust controls log the same head.
- Gate: `bun run --cwd apps/extension test src/wallet/services/incoming-transfer/` 346/346,
  `bun run lint` exit 0 (after `biome format` wrapped one long row), `bun run typecheck:all` exit 0.
  No complexity directive added.
