# Phase 1: arc 1 log

## Phase 1.1 (#88), 2026-10-09

- `projectStoredGrants` is exported through the existing `export { … } from "./capability-negotiation"` line in `packages/wallet-bridge/src/dispatcher.ts`, which `index.ts` re-exports with `export *`; same public surface as an `index.ts` line, one place listing the module's exports.
- Fixtures made well-formed: `{ type: "transaction" }` gained `scope: "*"` (`queued-journal.fixtures.ts`, `queued-journal.test.ts` twice, `background.connect-window.test.ts`); the composition round trip's `{ type: "data" }` gained `addressBook: true`. `{ type: "accounts" }` with no flag is well-formed and stayed.
- Red/green: the nine new cases fail on the base `service.ts` and `queued-journal.ts` and pass with the fix.
- The stored-row tests plant rows signed with the real MAC key (`plantRowSignedBy`); the schema keeps a row whose grant is any object, so a non-object record is a writer-only class.
- Gate 1.1: `bun run lint` 0; `bun run typecheck:all` 0; `bun run --cwd packages/wallet-bridge test` 663 passed; `bun run test` 10724 passed, 4 skipped.
