# Phase 4: final gate and the fix loop

- Merged `origin/dev` (0fe841be, the type-scale change) before the gate; no dependency change.
- Final gate, first run: lint 0, typecheck:all 0; `bun run test` and `test:all` each had one failure, `scripts/type-roles/inventory.test.ts`: dev's identifier inventory pins `packages/wallet-bridge/src/dispatcher.ts` by digest in three producer sets (`action_operations`, `add_public_authwit`, `execute_window`). Re-attested, since the per-call network read builds no operation and leaves the four window-bound builders as they were, then re-pinned (814551b9).
- Codex round 1 (gpt-6.1-sol high, fresh): approve, nothing material.
- Opus review beside it: approve, with one low finding and two nits.
  - Taken: the in-flight check ignored the profile, and a connect window outlives a profile switch, so a remembered app's reconnect on the new profile waited on the old profile's window. The connect entry now carries its profile, and `isRowInFlight` compares it (a helper, because the inline `&&` put `handleDiscovery` over the complexity budget). The new test fails without the comparison.
  - Taken: a dispatcher test name described a handler-level order that the dispatch-level check now masks. Renamed to the behaviour it pins, a throw and never `accounts: []`.
  - Not taken: passing the parsed key to `registerAccount`. The extension's PXE client takes wire text, and its seam parses it with the same `Fr` schema.
