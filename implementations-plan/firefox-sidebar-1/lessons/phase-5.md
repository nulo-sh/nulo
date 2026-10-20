# Phase 5: the Display row on Firefox

Each run starts with load1 under 150. Logs are in the scratch directory (`p5-run*.log`, `p5/dbg*.log`).

## Attempts

| Run | What | Outcome |
|---|---|---|
| 1 | The scenario, the panel reached by setting its hash at once | The panel's boot routed back to `#/popup/general` before the row rendered. `openDisplay` now waits for `data-session-checked` and `data-service-ready`, then sets the hash from the page's own realm. |
| 2 | Step 4, the click in the sidebar | "outside the view": the 360 px page is clipped at the sidebar's 240 px. `clickWithPointer` now scrolls the element into view first, as WebDriver's element click does. |
| 3 | Step 4, turning the row off in the sidebar | The sidebar stayed open. A probe read the stored value `false` and the toggle off: the write landed, and `window.close()` leaves a sidebar open (Fact 14). The fix is `sidebarAction.close()` in the click, after the write is posted. |
| 4 | With `getPopup` read before each trigger, both surfaces read as one opens, and the background stopped before the first trigger | The wake passed: `{ sidebar: true, popup: false }`. Display never rendered in the sidebar: the woken wallet showed `#/popup/auth` (Fact 16). |
| probe | Unlock on a new control page after the wake | The sidebar followed to `#/popup/general` and then to Display. Still on the build from before `close()`, step 4 failed at "the sidebar closing itself": that build is the negative control for `close()`. |
| 5 | The armed build rebuilt | `global-setup-smoke.ts` loads `dist/firefox` as built, and runs 3 to 4 had used the build from before the `close()` change. |
| 6 | Rebuilt, with the unlock | Pass, 17.2 s. |
| negative | The `onClicked` listener emptied, rebuilt | Fails at "a surface the toolbar button opened" with `{ sidebar: false, popup: false }`, as it must. |
| ×3 | `firefox-sidebar.test.ts` in full, retry 0, rebuilt from the restored source | 3 of 3 runs pass every scenario. The toolbar scenario took 19.4, 19.6 and 20.4 s; the passkey scenarios 10.5–14.0 s. |

## Notes

- Firefox's `sidebar_action.json` marks `open`, `close` and `toggle` `requireUserInput`. `extension.json`'s `ViewType` is `tab`, `popup` or `sidebar`.
- `ext-browserAction.js`'s `action.openPopup` opens only when a popup URL is set, so with the setting on it resolves and opens nothing (Fact 15, D15).
