# Phase 2: the driver and the scenario

Firefox 153.0.4, geckodriver 0.37.1, at the arc branch after merging `origin/dev` (`ce48691e`). Smoke-flag builds of both browsers. Every run at retry 0 through `bun run test:e2e`, load1 under 150 at its start.

| Run | What | Outcome |
|---|---|---|
| 1–3 | `firefox-sidebar.test.ts` on Firefox | Pass, 12.8 s, 13.3 s, 11.9 s for the scenario (estimate 25 s). |
| 4 | The same on Chrome | Skipped, exit 0; Chrome's built manifest has no `sidebar_action`. |
| 5 | `passkey-toolbar-panel.test.ts` and `action-popup-layout.test.ts` on Firefox, which share `webdriver-classic.ts` | 7 of 7 pass, 177 s. |
| 6 | Negative control (uncommitted): `passkeyNeedsOwnWindow()` also true in a `sidebar` view, Firefox rebuilt | Fails as it must: the session lands (the window ran the step) and `readPasskeySurface` counts one window, `expected 1 to be +0` at the window check. Source reverted before the run, the clean build restored after it. |
| — | `scripts/e2e/browser-seam.test.ts`, `scripts/e2e/firefox-driver.test.ts` | 102 of 102 pass. |

Deviation: `closeSidebar` is not added. No spec closes the sidebar (the launch is torn down with it), and an unused export is dead code.
