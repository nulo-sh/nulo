# Phase 4: final gate and the fix loop

- Merged `origin/dev` (0fe841be, the type-scale change) before the gate; no dependency change.
- Final gate, first run: lint 0, typecheck:all 0; `bun run test` and `test:all` each had one failure, `scripts/type-roles/inventory.test.ts`: dev's identifier inventory pins `packages/wallet-bridge/src/dispatcher.ts` by digest in three producer sets (`action_operations`, `add_public_authwit`, `execute_window`). Re-attested, since the per-call network read builds no operation and leaves the four window-bound builders as they were, then re-pinned (814551b9).
- Codex round 1 (gpt-6.1-sol high, fresh): approve, nothing material.
- Opus review beside it: approve, with one low point and two nits.
  - Taken: the in-flight check ignored the profile, and a connect window outlives a profile switch, so a remembered app's reconnect on the new profile waited on the old profile's window. The connect entry now carries its profile, and `isRowInFlight` compares it (a helper, because the inline `&&` put `handleDiscovery` over the complexity budget). The new test fails without the comparison.
  - Taken: a dispatcher test name described a handler-level order that the dispatch-level check now masks. Renamed to the behaviour it pins, a throw and never `accounts: []`.
  - Not taken: passing the parsed key to `registerAccount`. The extension's PXE client takes wire text, and its seam parses it with the same `Fr` schema.
- Codex round 2 (resumed, over 96fb3485..HEAD): request changes, three points.
  - The re-pinned digests and their attestations hold.
  - Point 1 (taken as an issue, not in this arc): `persistAndApprove` checks the active profile, then `addDappSession` captures its own fence under a second facade-lock turn, so a switch queued between them binds an Allow given under one profile to a row under another. That predates the arc; the arc adds only a disconnect when a grant write also fails on such a row. The fix (the expected profile checked against the fence before the write) changes `DappSessionService`'s RPC method, outside the three items.
  - Point 2 (closed known limit): a duplicate already waiting when the person switches profiles can connect on the new profile's remembered row through the window path without spending a reconnect token, at most eight per window. The waiter path predates the arc.
  - Point 3 (taken): a banned word in this file.
  - Argued on proportion and scope; resumed answer: approve, dispositions accepted, nothing else new and material. The loop converged after two rounds.
