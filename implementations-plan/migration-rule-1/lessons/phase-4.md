# Phase 4 (A3) · the in-place update harness

## Step 1, the mechanism (run during A1, 2026-10-19, before A1's PR)

Two production builds of `ec831afb` (0.31.0.0, and the same bytes at 0.31.1.0 / 0.31.2.0), a probe imported first by `service-worker-loader.js` recording every `runtime.onInstalled`, Chrome for Testing 152 and Firefox 153. One fixed path P, one profile D.

- **Close, swap P, relaunch on D (the plan's flow): no update on either browser.** Id (Chrome, from the path), per-profile UUID (Firefox, `prefs.js`), storage and the new code all carry over, but every launch reports `reason: "install"`, `previousVersion: null` (Firefox also `temporary: true`; its temporary add-on is gone from `extensions.json` after each close). So every e2e relaunch runs the wallet's install branch (the onboarding tab), which a real update never does; the `fixtures/extension.ts` comment that a reused profile "opens no tab" is wrong on both browsers (the fixture's poll closes the tab).
- **Swap P while the browser runs: a real update on both.** Firefox: a second geckodriver `POST /moz/addon/install {path: P, temporary: true}` gives `update`, `previousVersion` 0.31.0.0, same UUID, storage kept, no barrier; `runtime.reload()` after a swap does too. Chrome: `Extensions.loadUnpacked(P)` over CDP (pipe transport, `--enable-unsafe-extension-debugging`, no `--load-extension`) a second time in the same session gives `update`, `previousVersion` 0.31.0.0, same id, storage kept; a CDP-loaded extension is not restored after a restart. `chrome.developerPrivate.reload` from `chrome://extensions` under `--load-extension` hangs, then blocks the extension.
- **Consequence (D21):** the harness swaps P inside one session and reinstalls (Firefox: the driver's existing install call; Chrome: a CDP `loadUnpacked` launch mode in `fixtures/browser/chrome.ts`), and verifies in that session. The stop condition (Firefox cannot under its temporary install) is not met.

Raw data, commands, wall-clock: kept outside the repo with the lane's scratch (`results-*.json`, `RESULT.md`).
