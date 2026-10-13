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
