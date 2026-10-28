# Phase 2: the picker and the add

- A test that mounts a card beside the picker must not share one `disconnect` spy across every `PriceServiceClient`: each `TokenCard` row builds its own client, so "the picker disconnected once" has to read the picker's client (the first one built after the mount began), not a hoisted spy.
- The shared `TEST_FLAGGED.address` fixture is not a curve point, so a flagged paste-to-add case needs a flagged entry on a real point; the paste row refuses an off-curve address before it asks the flag list.
- `trimAddress(a, 4, 2, "…")` keeps four characters counting the `0x`, so the add row reads `0x04…7a`, as Holdings' does.
- Red first on the base sources: 47 tests fail across the five files. The New token file's legacy cases fail on base only because the harness no longer mocks the cache store; rerun on base with that mock restored, 7 fail, every one a payload fill or a report, and the refusal and close-mid-wait controls pass.
- Gate: `cd apps/extension && bun run test src/popup` 3271 passed; `bun run lint` exit 0; `bun run typecheck:all` exit 0.
