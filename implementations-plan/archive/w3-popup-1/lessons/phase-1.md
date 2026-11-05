# w3-popup-1, arc 1 (phases 1-3): implementation log

- Phase 1 (#1486): two cases red at `09741c853` (the held read rejected by the unmount's disconnect, then pushed; an empty answer resumed after the unmount, then pushed); green after `b36923226`.
- Phase 2 (#1499): three cases red at `c4a76f6e4` (Enter on a listed address added it; Enter submitted while the list was out; a late list showed no verdict); green after `f2df6b229`. The pre-existing test that pinned Enter live during the load now pins it inert, then a submit once the list lands.
- Phase 3 (#1406): five cases red at `23a1cfb63`; green after `fe62b1e24`.
  - The vitest environment has no component resolver, so a page test that wants the real `Input` registers `Input` and `Flex` from `@nulo/design` (an unregistered `Input` renders as a native `<input>` and ignores `normalize`).
  - A Vue warning about `DropdownItem` and a Teleport target in the authwits test printed only while its new row failed at the base (the failure report renders the page); it is gone once the row passes.
  - A helper bug in the two new page tests (`attributes()` on an absent status line throws) fixed in `3dd9148fb`.
- Gates: `bun run audit:vue` exit 0 (16809 tests, build); `bun run test:all` exit 0; smoke `send-picker-add`, `token-list`, `holdings-add-token` on Chrome (40 s) and Firefox (62 s) pass at retry 0.
- OA-1 captures taken with a scratch smoke spec on the arc 1 Chrome build, deleted after use: `screenshots/oa1-c-today-trailing-space.png`, `screenshots/oa1-a-as-a-clean-paste.png`.
- Post-implementation round 1: Codex (gpt-6.1-sol, high) changes requested, two comments only; Opus (general-purpose) changes requested: `NewSenderPopup`'s duplicate check compared strings, so an upper-case paste of a listed sender (the PXE answers lower case) passed both routes. Fixed with `sameFieldAddress` (test red at `4fadda542`, green at `5e5c9b921`); titles named in `bb2632272`.
- Two signed commits hung in `ssh-keygen -Y sign` on the agent socket; killed the session's own `ssh-keygen` by pid and recommitted with `env -u SSH_AUTH_SOCK` (the common brief's remedy).
- Post-implementation round 2: Codex resumed, clean. The loop converged.
- Final head `bb2632272`: `lint`, `typecheck:all`, `test:all` exit 0; smoke (the three files above) on Chrome 38 s and Firefox 57 s; network `senders-advanced`, `connect-check-window` on Chrome 98 s and Firefox 119 s; all at retry 0. No e2e scenario added or changed, so the per-browser suite wall-clock is unchanged by this arc.
