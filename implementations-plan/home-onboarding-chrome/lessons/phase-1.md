# Arc 1 log (phases 1.1 to 1.4)

## Phase 1.1: Account State under Developer (#135), 2026-10-13

- Moved with `git mv`; the depth under `settings/` is unchanged, so the CSS `composes` paths still resolve.
- Five literal redirect records rather than a generated list: the file's shape, and each old path stays greppable.
- The "keeps its own page" case for the five old paths is gone (they now redirect); the pinned record list is the independent statement of the eight, and the landing cases iterate it.
- Red on base: with the base `legacy-routes.ts`, the record pin fails (1 of 13).
- Gate: lint, typecheck:all, test (745 files), `settings-routes` smoke on Chrome and Firefox at retry 0: green.

## Phase 1.2: one own window per flow on Firefox (#149), 2026-10-13

- `followOwnRoute` is the router's `afterEach` hook itself (`NavigationHookAfter`), not a path function called from one: the "a failed navigation releases nothing" case then runs against a real memory router with a cancelling guard, without mounting `popup/index.ts`.
- `releaseOwnWindow` now returns a promise that never rejects (callers may ignore it); the unit tests await it.
- Mutation check: dropping the in-flight share and ignoring `failure` each turn exactly their never-happens case red.
- E2E (Firefox, `passkey-toolbar-panel`): headless Firefox returns focus to the main window once `armPanelDeath`'s guard disarms, so after the second `toOwnWindow` the case asserts the window left on profile creation is not focused (the plan's wording), not that the new one is.
- Red on base: the committed case fails at the registration wait (the base never registers). A proof variant that waits for the first window's boot instead fails at the focus check: the base's second start opened window 75 and focused it, the duplicate the issue reports. Logs under the lane's scratch dir.
- Gate: lint, typecheck:all, test; `passkey-toolbar-panel` on Firefox at retry 0, 6 of 6: green.

## Phase 1.3: onboarding honours the stored theme (#133), 2026-10-13

- `applyThemeChoice(root, choice)` takes `Config["theme"]`, so its domain follows the config schema.
- `useConfigRead` swallows a rejected read, so onboarding's fetch logs its fixed debug category itself and rethrows.
- E2E deviation: the plan named a fresh install. A fresh install cannot hold a stored theme without writing `nulo:config` raw and restarting the worker (the config store reads storage only at boot), so the case registers a profile, stores `dark` through Settings → Display, writes a `light` hint, flips the onboarding flag and opens onboarding; with an unlocked profile onboarding moves to `learn` and stays open. The read and the paint are the same code either way.
- The build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` for each new export under `utils/`; they are tracked and ride with the change that adds the export.
- Red on base: the three `onboarding/app.test.ts` cases fail on the base `app.vue`; the e2e case times out on it (Chrome).
- Gate: lint, typecheck:all, test (747 files); `appearance` smoke on Chrome and Firefox at retry 0: green.

## Phase 1.4: the header and the filtered History (#132, #130), 2026-10-13

- `.section_header` held only the two declarations, so the class and its two template uses are gone.
- The link's target is a one-line `historyRoute` computed rather than an inline object in the template (the template line stays one line).
- The chip follows the owner-viewed prototype (`shot/130-A`): Badge, headline 11 px uppercase label, the `close` glyph at 14 px. Two departures, both from the plan: `RowAction` (24 px box, accent ring) instead of a hand-built 20 px button, with the chip's padding trimmed to `2px 2px 2px 10px` so its height stays the prototype's 28 px; and the fixed accessible name "Show all activity" (OA-1) instead of one that embeds the symbol.
- Two testids added for the e2e, neither visible: `activity-token-filter-symbol` (the label; `MaterialIcon` renders its glyph as ligature text, so the chip's own text carries "close") and `activity-empty` (History's empty state had none).
- Unit layer: every History mount now carries a memory router (the page reads the route); the filter cases cover the loading hold, the dropped query (missing token, failed first read), the kept filter on a failed refresh, six malformed queries plus a repeated one, the sanitized label, the clear and its focus move, and an empty filtered list.
- E2E (`home-links`): two tokens with distinct contracts, a 32-wide-character symbol, a third registered token with no activity. Red on base: with the base link, Enter on the token page lands on `#/popup/activity` and the `?token=1` hash wait fails.
- Shots: the header pair comes from the same e2e run with only the old `.section_header` rule restored, so before and after differ by #132 alone. 28 PNGs under `screenshots/`, also copied to the orchestrator's shots directory.
- Seen, not this arc's: Firefox's page-error relay printed `Client disconnected` from `useIncomingTransfers` (a read in flight when the page unmounts). It failed nothing; it predates the arc.
- Flake: `src/utils/zod-jitless.test.ts` timed out at 5 s once inside `bun run test` (it passed in `test:all` and alone); the one rerun was green.
- Gate: lint, typecheck:all, test, test:all; `home-links`, `navigation`, `rows` on Chrome and Firefox at retry 0: green.

## Arc gate and fix loop, 2026-10-13

- Arc gate: `audit:vue` and `build:firefox` exit 0; smoke at retry 0 on Chrome (`settings-routes`, `appearance`, `home-links`, `navigation`, `rows`: 21 passed, 1 skipped) and Firefox (the same plus `passkey-toolbar-panel`: 27 passed, 1 skipped). The skip is `appearance`'s existing `test.skip`.
- Round 1: Codex rejected on one Medium (a reloaded own window keeps a registration it can no longer release) and two Lows; the Opus lens approved with the same reload path and two Lows. All held. Codex proposed recovering the flow across reloads; the fix taken drops the registration instead, which keeps the base behaviour and changes nothing a person sees. Lesson: an own window's URL loses its marker as soon as it routes, so any state keyed on "this document is an own window" must survive, or be cleared by, a reload.
- Round 2 (Codex, resumed): approve, nothing new; it accepted the drop-only fix and noted the non-atomic read-then-remove shared with `unregister` (D7's residual only).
- A test fake must accept what the real API accepts: `storage.session.get`/`remove` take a key array, and a single-key fake hid the new code path until it was widened.
