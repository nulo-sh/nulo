# Phase 1: arc 1 log

## Phase 1.1 (#88), 2026-10-09

- `projectStoredGrants` is exported through the existing `export { … } from "./capability-negotiation"` line in `packages/wallet-bridge/src/dispatcher.ts`, which `index.ts` re-exports with `export *`; same public surface as an `index.ts` line, one place listing the module's exports.
- Fixtures made well-formed: `{ type: "transaction" }` gained `scope: "*"` (`queued-journal.fixtures.ts`, `queued-journal.test.ts` twice, `background.connect-window.test.ts`); the composition round trip's `{ type: "data" }` gained `addressBook: true`. `{ type: "accounts" }` with no flag is well-formed and stayed.
- Red/green: the nine new cases fail on the base `service.ts` and `queued-journal.ts` and pass with the fix.
- The stored-row tests plant rows signed with the real MAC key (`plantRowSignedBy`); the schema keeps a row whose grant is any object, so a non-object record is a writer-only class.
- Gate 1.1: `bun run lint` 0; `bun run typecheck:all` 0; `bun run --cwd packages/wallet-bridge test` 663 passed; `bun run test` 10724 passed, 4 skipped.

## Phase 1.2 (#228), 2026-10-09

- `wireSessionTeardown` moved into `session-revocation.ts` and takes `{ sessionProfiles, pendingVerification }`; `background.ts` passes its `state`.
- The admission gate's `released` hook tombstones whatever marker the map holds for the id, so the replaced-marker barrier test releases the old slot and admits a new one for the same id before it swaps the marker; the gate's identity check (`reservations.get(r.id) !== r`) then keeps the old callback's `releaseIfUnstarted` off the replacement's slot. A replacement while the old slot is still held cannot happen: admission refuses a second window for a live id.
- `background.connect-window.test.ts`'s handler fake now lists each session with the origin and chain its discovery named, so revocation can match it; `fakeSdkServices` returns `onDappSessionDeleted`.
- `copy-dash-ban.test.ts` reads `terminateWith`'s argument as copy (it is not a log call by name): the new reason avoids the em dash rather than adding a reviewed entry.
- `handleSessionEstablished` hit cognitive complexity 19 with the recheck inline; two helpers bring it back under 15 without a suppression.
- Red/green: the eight never-happens cases (revocation table x3, establishment barriers x2, wiring x2, composition x1) fail on the base `session-revocation.ts`, `session-established.ts` and `background.ts`; the controls pass on both.
- Composition checklist (`apps/extension/tests/COMPOSITION-TESTS.md`): no PXE fake (D1), no simulate or prove (D2), no tx request or derivation (D3, D6), fake state is the handler's live list only (D4), assertions read the real stamp map, the real marker and the rows the real service purged.
- Gate 1.2: `bun run lint` 0; `bun run typecheck:all` 0; `bun run test` 10736 passed, 4 skipped (first run red on the dash ban, fixed as above).
