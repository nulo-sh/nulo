# Phase 0: the spike and the consults

Firefox 153.0.4, geckodriver 0.37.1, puppeteer-core 25.8.0, Bun 1.4.2, Linux, at `993b3efc`. Every run at retry 0 through `bun run test:e2e` (smoke; geckodriver ports from the host registry), load1 under 150 at its start (round 0a's run 3 started at 113 and rose to 218 during it). Logs stayed in the lane's scratch directory.

## Round 0a: eleven runs, misread

Every probe below went through `chromeScript` or a chrome-context action, each of which first switches window through Marionette, and that switch focuses the tab's browser (round 0b explains). Where the table says the sidebar had no focus, the harness had just taken it.

| Run | Change | Outcome |
|---|---|---|
| 1 | Open the sidebar, read it, BiDi and classic probes, chrome-context click on `auth-submit` (passkey profile) | Opens on `#/popup/auth` at 252 px; `getViews`: `sidebar` true, `popup` false. BiDi: no navigable id, `no such frame`. Classic: `#webext-panels-browser` not found. The click lands, the unlock does not complete; `hasFocus()` false when read afterwards. |
| 2 | Hit test and page text around the click | The click hits `auth-submit`; the page shows "PASSKEY NOT CONFIRMED. TRY AGAIN."; no window opens: the step ran in place and was refused. |
| 3 | `host.focus()` before the click | Page `hasFocus()` false; same refusal. Load rose from 113 to 218 during the run. |
| 4 | Bare `navigator.credentials.get` in the page realm, in a later privileged call than `host.focus()` | `NotAllowedError: CredentialsContainer request is not allowed.` |
| 5 | Lower the window and raise it again | No change. |
| 6 | Content-process view; the same call from the toolbar panel | Sidebar: content's active context `null`. Panel: active context is itself, `hasFocus()` true, `ok public-key` (the panel keeps its activation across a window switch). |
| 7 | Headful under Xvfb (`HEADLESS=0 xvfb-run -a`) | Identical to 6 (sidebar 340 px, `sidebar.revamp` true). |
| 8 | Password profile: click the field, separate classic key actions, then `nsITextInputProcessor` | The click focuses the input; key actions sent in a second call leave it empty; the in-process processor sets the value. |
| 9 | `MOZ_LOG=Focus:5` | See the excerpt below. |
| 10 | Focus the tab's browser, then the sidebar's, in separate calls | Content's active context `null` when read; refused. |
| 11 | Headful, Xvfb, `focusmanager.testmode: false` | Inconclusive: the panel is refused too (no window manager gives focus). |

### Run 9, the focus log (excerpt, parent process)

`7b6c2f2a4700` is the sidebar's remote browser, `7b6c2f719600` the selected tab's. Every activation of the sidebar is followed by the tab's at the next action id, which is the next privileged call's window switch:

```
D/Focus Shown Window: chrome://browser/content/webext-panels.xhtml
D/Focus Remote browser activated 7b6c2f2a4700, actionid: 43
D/Focus Remote browser activated 7b6c2f719600, actionid: 44
…
D/Focus Remote browser activated 7b6c2f2a4700, actionid: 51
D/Focus Remote browser activated 7b6c2f719600, actionid: 52
…
D/Focus Remote browser activated 7b6c2f2a4700, actionid: 59
D/Focus Remote browser activated 7b6c2f719600, actionid: 60
```

The draft first read this log as "the sidebar is activated once, at `actionid 73`"; that id belonged to another window. The Opus leg's round-1 finding 1 corrected it, and Marionette's source confirms the mechanism: `switchToWindow` takes `focus` defaulting to true and ends in `focusWindow()`, which calls `contentBrowser.focus()` (`remote/marionette/driver.sys.mjs`, `remote/marionette/browser.sys.mjs`).

## Round 0b: no window switch between input and outcome

The spec `_spike2-firefox-sidebar.test.ts` (uncommitted) has two cases:

- **Passkey in place**: register a passkey profile in a control popup, lock it, open the sidebar.
  - A1–A3 run one privileged script each: `host.focus()`, wait 400 ms, then a frame script that reads `hasFocus()` and the active context and calls `navigator.credentials.get` with the wallet's RP ID.
  - B sends one chrome-context click on Continue, then reads the outcome only from the control page over BiDi (its hash reaching `#/popup/general`), and counts passkey windows.
- **Type and click**: a registered password profile. One `/actions` payload holds the pointer click on the field, the key presses, and the click on Submit. Then the nav tabs, by their centres, and the settings search typed the same way.

| Run | Load1 at start | Outcome |
|---|---|---|
| 1 | under 150 | A1–A3 `ok public-key`, the sidebar's context active and focused. B: unlocked in place (the sidebar on Home, no passkey window); the spec's own predicate read the wrong field (`lockedAt` is the future auto-lock time) and timed out. T: typed and submitted, unlocked. Hops: 3 of 5, the Settings tab off-screen (nav geometry below). Exit 1. |
| 2 | under 150 | Every check passes; 42.9 s for both cases (passkey 21.7 s, typing 21.3 s). B: the control page on `#/popup/general` 604 ms after the click, passkey windows 0; the sidebar read straight after still showed `#/popup/auth`, so the spec waits on the sidebar too. Nav at 252 px: Home 33–66, Holdings 100–156, Activity 191–238, Settings 273–327, `scrollWidth` 360. `#sidebar-box` widened to 420 px: every hop lands; the search typed "theme" and shows `hub-display` and `display-theme`. Exit 0. |
| 3 | under 150 | Every check passes; 42.0 s (passkey 19.3 s, typing 22.7 s). B: control on `#/popup/general` 614 ms after the click, passkey windows 0. Every hop and the search as in run 2. Exit 0. |
| 4 | under 150 | Every check passes; 44.4 s (passkey 20.3 s, typing 24.1 s). B: control on `#/popup/general` 673 ms after the click, passkey windows 0. Exit 0. |
| 5 | under 150 | The passkey case alone, headful under Xvfb (`HEADLESS=0 xvfb-run -a`). `sidebar.revamp` false (not user-set), the sidebar 240 px wide. A1–A3 `ok public-key`; B unlocked in place in 903 ms, passkey windows 0. 68.6 s (a headful launch). Exit 0. |
| 6a | under 150 | The passkey case, headless, with `sidebar.revamp` set true before opening (the revamped sidebar). The sidebar 340 px wide. A1–A3 `ok public-key`; B in place in 737 ms, passkey windows 0. 20.4 s. Exit 0. |
| 6b | under 150 | As 6a, headful under Xvfb. 340 px; A1–A3 `ok public-key`; B in place in 758 ms, passkey windows 0. 25.2 s. Exit 0. |

The width follows the sidebar, not the display: the old sidebar opens at 240–252 px, the revamped one at 340 px. Round 0a's run 7 measured 340 px because `sidebar.revamp` read true in that profile. Firefox 153's static default is false (`defaults/preferences/firefox.js`), and nothing in the browser's own modules sets it. What turned it on in run 7 is unknown: a remote rollout is plausible but unverified.

Logs and the spec stayed in the lane's scratch directory.

## Sources read

- Firefox 153 `omni.ja`: `remote/content/shared/NavigableManager.sys.mjs` (`getBrowsingContextById`), `remote/content/shared/BrowsingContextUtils.sys.mjs`, `remote/content/marionette/actors/MarionetteCommandsChild.sys.mjs` (`switchToFrame`), `remote/content/marionette/driver.sys.mjs` and `browser.sys.mjs` (`switchToWindow`, `focusWindow`), `browser/content/browser/parent/ext-sidebarAction.js` (title and icon defaults, `open_at_install`), `browser/content/browser/sidebar/browser-sidebar.js` (`startDelayedLoad`, `removeExtension`), `browser/content/browser/webext-panels.js` (`DOMWindowClose` hides the sidebar), `browser/content/browser/schemas/sidebar_action.json` (`open` and `close` require user input).
- mozilla-firefox/firefox `main`: `dom/credentialmanagement/CredentialsContainer.cpp` (`IsInActiveTab`), `dom/base/Document.cpp` (`IsInActiveTab`, `IsInFocusedTab`), `dom/base/nsFocusManager.cpp` (`WindowRaised`, `ActivateRemoteFrameIfNeeded`, `SetActiveBrowsingContextInContent`).
- Web and Bugzilla search (sidebar with WebAuthn, `hasFocus`, `NotAllowedError`, WebDriver): no matching report; Mozilla bug 2026687 (the panel closing on a Mac) is the nearest.

## Consults

- **Codex r1** (gpt-6.1-sol, high, read-only, on the 0a plan): conditional approve. Conditions, all applied to the 0a draft: D1's rationale corrected (a `BrowserDriver` sidebar handle would respect FIREFOX.md's rule, and WebDriver's own content key path uses the same in-process synthesis, so "no person types that way" was no reason); the classic-frame probe and run 11 marked inconclusive; Fact 1 narrowed; #596's body to carry the known-limit parts. Moot on the pass branch except the first point, which now supports the driver.
- **Opus r1** (Plan lens, on the 0a plan): reject. 1, the harness's focus steal through Marionette's window switch (`driver.sys.mjs`, `browser.sys.mjs`), verified in run 9's log (above); it reversed the verdict (round 0b). 2, run 9 misread: rewritten above. 3, a reopening condition no driver could meet: moot. 4, the proof is Linux-only and #593 is a Mac report: OA-4. 5, D1's "second driver" reason: dropped. 6, `Refs` rather than `Closes` for a hand-closed issue: moot. 7, the evidence must outlive the scratch directory: the driver and spec ship, and the plan carries the recipe and the table. 8, the classic-frame row overstated (`/frame` had no effect): reworded. It also named a privileged read with no focus move, BiDi `script.callFunction` in a `moz:scope: "chrome"` realm; not taken (plan, Alternatives).
- **Codex r2** (resumed, on the pass-branch plan): conditional approve. The conditions: a race-free sidebar read after the session; a validated window recorder (reuse `watchPasskeySurface`, with a one-off forced-window run that must fail); the clipping at the opening width named and owner-gated; FIREFOX.md's exception for native-surface modules; OA-4 settled before the PR leaves draft. All applied.
- **Opus r2** (resumed): conditional approve. The conditions: the revamped sidebar covered (runs 6a and 6b above, which also explain round 0a's 340 px); the owner's quoted sign-off before the PR leaves draft; the locator held to one window; the evidence stated as it stands. Smaller findings: the success control tightened; the install-time launcher entry named in UI impact (`registerExtension` adds Nulo to `sidebar.main.tools`); OA-4 in the PR body; the seed's command. All applied.
- **Codex final** (fresh session): conditional approve. The conditions: the full Firefox network suite in Phase 4 (CLAUDE.md, for a fixture change); a picture gate that only whole-window shots pass; each browser's smoke wall-clock. All applied. On resume: approve, no new material finding.
