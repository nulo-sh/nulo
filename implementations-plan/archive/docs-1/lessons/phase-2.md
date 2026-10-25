# docs-1 phase 2: #665

- `LoggerStore.storageOps` takes the propagate form; `clear()` returns the removal's outcome; the flush, the opt-out purge and `applyRetentionPolicy()` catch their own failure.
- Planned guard test dropped in part: `collectUnhandledRejections` stayed green with the opt-out catch removed. Cause: `createSerialQueue()` sets `tail = link.then(noop, noop)` synchronously, so every link it returns already has a rejection handler and a `void` caller can never raise `unhandledrejection`. The test kept covers the one site that can fail: the boot's awaited purge.
- Red/green: the flipped test fails on the base `store.ts` (`clear()` resolves); the boot test fails with the boot catch removed.
- Gate: `bun run lint` 0; `bun run --cwd apps/extension test src/wallet/logger src/components/JsonViewer` 178/178; `bun run test` 828 files, 13 536 tests passed; `bun run typecheck:all` 0.
