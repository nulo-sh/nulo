# Phase 1: #297, a plain record and a refusing boundary

## Base: the unit pins on base sources (2026-10-11)

Tree: the arc branch after merging `origin/dev` at ca79036 (merge 403623d), with only the test files changed. Command: `cd apps/extension && bun run test -- src/utils/storage.test.ts src/popup/components/modules/send/FeeSettingsCard.test.ts` on Bun 1.4.2. Result: exit 1, 8 failed, 160 passed, 16 unhandled rejections (15 `DataCloneError: The object can not be cloned.` thrown by the cloning fake's `set` from `storageLocalSet` called by `FeeSettingsCard.vue`'s `persistSelection`, and 1 the failed-write test's own `QUOTA_BYTES quota exceeded`).

Bug pins, red on their own assertions:

- `storage.test.ts`, the snapshot case: `expected { level: 10, tags: [ 'a', 'b' ] } to deeply equal { level: 9, tags: [ 'a' ] }` (the mutated value is written).
- `storage.test.ts`, the refusal case: `promise resolved "true" instead of rejecting` (the Proxy reached `set`).
- `storage.test.ts`, the skip case: `promise resolved "false" instead of rejecting`.
- `FeeSettingsCard.test.ts`, save-and-remember: `expected undefined to deeply equal { type: 'fpc', … }` (nothing saved).
- `FeeSettingsCard.test.ts`, the failed write: `expected [] to deeply equal [ [ 'Failed to save the fee method', { error: Error } ] ]` (no `console.error`; the rejection is unhandled).

Projection guard (the same-identity re-run, both sponsors): red on base, but on its own assertion, not only through the unhandled rejection as the plan expected. Its "the re-run started" checks pass (one more saved-selection read, one more balance and FPC read each), then `expected 2 to be greater than 2` on the payer emissions: with nothing saved, the re-run has no record to pre-fill, so no new payer is emitted. The fix makes the pre-fill land, which is the path the guard exists to check. Deviation recorded in the plan's ledger (D13).

Success control, green on base: `storage.test.ts`, a plain nested value written deep-equal.

Existing test turned red by the cloning fake alone: `picking the same Sponsored FPC twice: cacheStore.feePaymentMethods has exactly one entry` (`expected [] to have a length of 1 but got +0`: the refused write never reaches the cache update). Expected by the Phase 1 gate; no edit beyond the fake.

Engines: the unit suite runs on Bun (JavaScriptCore). The same refusal on V8: `node -e 'structuredClone({ a: reactive({ b: 1 }) })'` on Node v24.21.0 throws `DataCloneError #<Object> could not be cloned.`

## Fix: the unit pins green (2026-10-11)

After `savedSelectionOf`, the handled write and the clone on entry: the same command exits 0, 168 passed, no unhandled error. `storage.test.ts` also passes under Node v24.21.0 (V8): `node node_modules/.bin/vitest run src/utils/storage.test.ts`, 12 passed, so the refusal holds on the engine whose storage would accept the Proxy. `picking the same Sponsored FPC twice` is green again with no edit beyond the fake.

Gate: `bun run lint` exit 0 (27 warnings, 3 infos, all pre-existing; the changed files carry one, `fee-helpers.ts:124`'s optional-chain warning, untouched); `bun run typecheck:all` exit 0; `bun run test -- src/utils/storage.test.ts src/popup/components/modules/send/ src/popup/components/modules/fee-cards.comount.test.ts src/popup/windows/execute/ src/popup/pages/send.integration.test.ts` exit 0, 34 files, 643 tests; `bun run test` exit 0, 740 files passed, 3 skipped, 11233 tests passed.
