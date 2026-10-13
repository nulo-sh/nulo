# Phases 1 and 2: the hold, the report, the fence

## Phase 1 (2026-10-13)

- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (743 files, 11458 tests).
- The verify page reports only the hash its URL carried. With no hash it closes without reporting, and a failed report keeps the window open with its controls live again, as a failed trust write does.

## Phase 2 (2026-10-13)

- Gate: lint 0 (`scripts/complexity-baseline/manifest.json` unchanged, no suppression), `typecheck:all` 0, `test` 0 (744 files, 11484 tests), `test:all` 0.
- `handleSessionEstablished` stayed under its 80-line budget with the one `release()` line, so `showCheck` was not extracted (L13).
- Attempt 1 of the wiring left 39 wallet-sdk tests red. Every one was a missing collaborator: the `hold` dep in `session-established.test.ts`, the event stub and subscription count in the two pins tests, and an identity-preserving `getSession` in three mocked handlers. Fixed by giving the harnesses what production now reads, with no assertion loosened.
- `background.connect-window.test.ts` needed a stable session-object map, a stateful journal (`transitionIfStage`, per-row stage and kind), a response spy and lock/switch helpers. The grant row needs `scope: "*"` or the call never reaches a row.
- The 32-call cap test saw 19 of 32 dispatched after one settle. Dispatch drains the FIFO over many ticks, so the positive count is read with `vi.waitFor`; the refusal of call 33 is synchronous and asserted directly.
- **Deviation, L18:** a call whose session is not live at arrival, or that finds no hold, is dropped at arrival instead of flowing through the outcome gate. Through the gate it would get a queued row, and after a same-id re-key that row would sit under the successor's session.
- **Mutation pass.** Each guard was removed once and a test had to go red: M0 the page's confirm (the two edited cases), M1 the hold await, M2 the post-legal liveness check, M3 the identity guard keyed by id, M4 the post-release liveness check, M5 the arrival capture by id instead of by object, M6 the cap, M7 the lock rule. M4 and M5 survived the first draft. Test 23d now spies on the Terms read and asserts none after the slow call resolves; test 23c now uses a late `sendTx`, so a capture by id shows up as a created row. Both went red under their mutation.
