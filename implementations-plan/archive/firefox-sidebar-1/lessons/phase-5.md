# Phase 5: the Display row on Firefox

Each run starts with load1 under 150. Logs are in the scratch directory (`p5-run*.log`, `p5/dbg*.log`).

## Attempts

| Run | What | Outcome |
|---|---|---|
| 1 | The scenario, the panel reached by setting its hash at once | The panel's boot routed back to `#/popup/general` before the row rendered. `openDisplay` now waits for `data-session-checked` and `data-service-ready`, then sets the hash from the page's own realm. |
| 2 | Step 4, the click in the sidebar | "outside the view": the 360 px page is clipped at the sidebar's 240 px. `clickWithPointer` now scrolls the element into view first, as WebDriver's element click does. |
| 3 | Step 4, turning the row off in the sidebar | The sidebar stayed open. A probe read the stored value `false` and the toggle off: the write landed, and `window.close()` from Display, a page whose history has grown, left the sidebar open (Fact 14). The fix is `sidebarAction.close()` in the click, after the write is posted. |
| 4 | With `getPopup` read before each trigger, both surfaces read as one opens, and the background stopped before the first trigger | The wake passed: `{ sidebar: true, popup: false }`. Display never rendered in the sidebar: the woken wallet showed `#/popup/auth` (Fact 16). |
| probe | Unlock on a new control page after the wake | The sidebar followed to `#/popup/general` and then to Display. Still on the build from before `close()`, step 4 failed at "the sidebar closing itself": that build is the negative control for `close()`. |
| 5 | The armed build rebuilt | `global-setup-smoke.ts` loads `dist/firefox` as built, and runs 3 to 4 had used the build from before the `close()` change. |
| 6 | Rebuilt, with the unlock | Pass, 17.2 s. |
| negative | The `onClicked` listener emptied, rebuilt | Fails at "a surface the toolbar button opened" with `{ sidebar: false, popup: false }`, as it must. |
| ×3 | `firefox-sidebar.test.ts` in full, retry 0, rebuilt from the restored source | 3 of 3 runs pass every scenario. The toolbar scenario took 19.4, 19.6 and 20.4 s; the passkey scenarios 10.5–14.0 s. |
| 7 | After the `isConnected` guard | 3 of 3, the toolbar scenario 19.9 s. |
| 8 | After the Opus diff review: `toggle()`, the background's popup restored before `openPopup`, the shell's re-apply, the scenario per sidebar kind with the toggle and re-apply steps, `closeSidebar` proving the close | 4 of 4: default 32.6 s, revamped 29.7 s. |
| negative | Without `app.vue`'s `pointToolbarAtSidebar`, rebuilt | Fails at "the popup pointing the button at the sidebar again", `getPopup` still reading the manifest's popup, as it must. |
| y3-1 | Step 4 sending `OPEN_TOOLBAR_POPUP` from a bare onboarding page, after the final Codex round | Both kinds fail on a discarded browsing context: with onboarding complete, the onboarding shell opens a popup window and closes itself (`onboarding/app.vue`). The step now opens onboarding as `openOnboarding` does, alone in its window, on its done route, and clicks the real "Open wallet". |
| 9 | That step, default kind | Pass, 35.6 s. |
| negative | `openToolbarPopup` without `pointToolbarAtSidebar(false)`, rebuilt | Fails at `waitForOpenPanel`: no panel opens, as Fact 15 says. |
| z3 | `firefox-sidebar.test.ts` three times, retry 0 | Runs 1 and 3 pass all four (toolbar scenarios 19.2–26.9 s). Run 2's revamped scenario failed in `openOnboarding`, whose wait for the welcome CTA races the shell's own replace to Learn for a known profile: a race in the test's use of the helper. The step now resets the flag and opens the onboarding document itself, waiting only for Learn. |
| w3 | `firefox-sidebar.test.ts` three times, retry 0, after that fix | 3 of 3 runs pass all four. Toolbar scenarios: default 26.0–29.0 s, revamped 23.1–28.9 s; passkey scenarios 9.4–14.4 s. |

## Gates at `a1c6c8409`

| Gate | Outcome |
|---|---|
| `lint`, `typecheck:all`, `check:plans` | Exit 0. |
| `test:all` | Exit 0 (rerun after the last source change; the first run, before the review fixes, also exit 0). |
| `audit:vue` | Exit 0: 14444 tests passed, the build green (before the review fixes, which added no Vue file). |
| Full smoke on Firefox, retry 0 | 275 passed, 17 skipped, 0 failed; 64 of 68 files, 53 min. |
| `settings-routes`, `onboarding-tab` and `firefox-sidebar` on Chrome, retry 0 | 17 passed; the Firefox-only file skipped. |
| `onboarding-tab` on Firefox (`waitForOpenPanel` moved) | 11 of 11. |
| Full Firefox network suite | #889's required `extension-network-e2e-firefox-status`, at retry 0 on the pushed head. Shard 1 failed once: `stale-network-resume` N3 waited 60 s for the import-token toast after the background's death. Locally on Firefox, proverless as CI's pool runs it, N3 passed 3 of 3 at retry 0 (36.8–41.4 s); the shard was re-run. |
| Smoke wall-clock per shard (1, 2, 3), CI | Chrome 7:25, 12:49, 8:37; Firefox 11:06, 15:00, 9:39. Before, at #909 (the `dev` commit last merged): Chrome 7:40, 11:36, 9:12; Firefox 10:31, 18:37, 9:40. |

## Notes

- Firefox's `sidebar_action.json` marks `open`, `close` and `toggle` `requireUserInput`. `extension.json`'s `ViewType` is `tab`, `popup` or `sidebar`.
- `ext-browserAction.js`'s `action.openPopup` opens only when a popup URL is set, so with the setting on it resolves and opens nothing (Fact 15). It dispatches the button's `command` and returns; the view reads the URL again in `onViewShowing`, so restoring `""` as soon as the call resolves would race it. The popup's own boot restores it instead (D15).
- Chrome's `chrome-types` has no `sidebar` in `ViewType`; `isFirefoxSidebar` casts it and asks only where a sidebar exists.
- Harness slips, caught before they counted: the load gate first gave up after ten minutes and let the build run anyway; it now blocks until load1 is under 150. A build flag string expanded as `env $B` in zsh is one word, so that build came out unarmed and the suite refused it at setup. The armed build now runs from a script.
