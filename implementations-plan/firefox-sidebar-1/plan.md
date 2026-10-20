---
plan: firefox-sidebar-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 993b3efc
trunk: dev
post_implementation_hardening: not scheduled
status: arc 1 in review (#889, draft) with Phase 5, the Display row (P71-03 B); arc 2, the 240 px layout (P71-01 B), is its own PR
---

# firefox-sidebar-1: a Firefox sidebar whose passkey steps run in place (#596), and a shell that fits it

#596 asks for a Firefox sidebar (`sidebar_action`) as the side panel's counterpart. The owner made it conditional (P28-08 note, 2026-10-16): "I think that if the user has side-panel enabled on Firefox, we can skip the pop-up … be sure that the "side-panel" option can be really tested. Because if it can't be tested, then let's keep as-is today." The lane brief makes that a Phase 0 spike.

**The spike meets the condition** (§ Phase 0). Arc 1 ships the sidebar: the popup shell Chrome's side panel loads, an e2e spec on the Firefox lane, and pictures in draft PR #889.

**The owner's answers (decision page 71, 2026-10-20)** to OA-1 to OA-4:
- **P71-01 (OA-2), B**: "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The page added: "Any pick also signs the sidebar off as pictured", and "That is a layout change on every page, planned and shown to you in pictures before it ships." That is arc 2, a PR of its own: it changes every page at every width and does not depend on the sidebar.
- **P71-02 (OA-4), A**, in chat: "ill test firefox". The owner will unlock once with a passkey from the sidebar on a Mac, using a build of #889. #889 stays a draft until that report. If the sidebar dies there, the step keeps its window and arc 1 changes.
- **P71-03 (OA-1), B**: "Add Chrome's "Open as Side Panel" row on Firefox; the toolbar button then opens the sidebar." That is Phase 5, in #889.
- **P71-04 (OA-3), A**: "As in the draft: no sidebar at install; an open one survives restarts only." No change.

Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Spike runs and consults: [`lessons/phase-0.md`](lessons/phase-0.md).

## Phase 0: the spike

**Setup** (uncommitted):
- **Versions**: Firefox 153.0.4 (the revision puppeteer-core 25.8.0 pins), geckodriver 0.37.1, Bun 1.4.2, Linux, at `993b3efc`.
- **Build and run**: the smoke flags (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:firefox`), then a scratch spec, `cd apps/extension && NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<spec> --retry=0`.
- **Opening**: `chromeScript` calls `extension.apiManager.global.sidebarActionFor(extension).open(window)`, which is what `sidebarAction.open()` runs, and finds the document at `SidebarController.browser.contentDocument.getElementById("webext-panels-browser")`.

**Round 0a misread the browser.** Its eleven runs found that the sidebar never took focus and that WebAuthn was refused there. The Opus leg traced why: every read went through `chromeScript`, whose `POST /window` makes Marionette focus the selected tab's browser (`marionette/browser.sys.mjs` `focusWindow`). In run 9, `actionid 43` activates the sidebar's browser and `44` deactivates it in favour of the tab's.

**Round 0b** sends each input, and reads each outcome during a ceremony, with no window switch in between:

| Probe | Channel | Result (0b runs 2–4, retry 0) |
|---|---|---|
| Open | `chromeScript` | The page reaches `#/popup/auth` with the service ready. `getViews({ type: "sidebar" })` lists it, so `passkeyNeedsOwnWindow()` is already false there. |
| Read testids, hash, state | frame script (`evaluateViaFrameScript`) | Works; each read moves focus to the tab. |
| Address it as a Puppeteer page | WebDriver BiDi | Not possible: its context is in no tab, so it has no navigable id, and classic `/frame` has no route to it. |
| WebAuthn | `host.focus()`, then a frame script, in one privileged script | `navigator.credentials.get` resolves `ok public-key`, 3 of 3 per run. |
| Passkey unlock in place | the wallet's Continue, one chrome-context click; outcome read from a control page over BiDi | Unlocked 0.6–0.7 s after the click; no passkey window. |
| Click and type | chrome-context `/actions` at the element's centre, mapped through `mozInnerScreenX/Y` | Works on buttons, fields and nav tabs inside the view. |
| Width | none | The old sidebar (Firefox 153's default) opens 240–252 px wide, the revamped one 340 px; the shell's 360 px floor overflows both. |
| Old and revamped sidebar, headless and headful | the passkey case (runs 5, 6a, 6b) | The same result in all four. |

**Verdict: the condition is met.** Two rules make it hold, and the driver states both: an input and the step it starts go in one `/actions` payload; outcomes during a ceremony are read from a page opened beforehand.

## Outcome & Quality Bar

- **For whom**: a Firefox user who keeps Nulo beside their tabs. A passkey step started in the sidebar runs where they are (#593's motivation); the toolbar button can open the sidebar; every page fits the sidebar's width.
- **Excellent**:
  - a passkey step started in the sidebar opens no window, proven at retry 0 on both sidebar kinds;
  - with the side-panel setting on, the toolbar button opens the sidebar and no popup, proven at retry 0; with it off, the popup comes back;
  - every popup page and window lays out at 240 px with no text cut or past its box, on both browsers, by the suite's own layout gate;
  - at 360 px and wider every page is pixel-identical to `dev`, on both browsers and both themes;
  - Chrome's side panel and toolbar popup behave exactly as before.
- **Good enough**: no Mac run before the owner's (P71-02); the restart gap of § Phase 5, which the owner accepts or rejects before #889 leaves draft (OA-5); the toolbar popup the background can no longer open with the setting on (D15).

## Assumptions

**Facts** (recon has the citations)
1. Chrome's side panel loads `src/popup/index.html` (`manifest/manifest.config.ts:32-34`); arc 1's Firefox sidebar loads the same page.
2. On Firefox, a passkey step runs in its own window only when it starts in a `popup` view (`utils/browser-surface.ts`); a sidebar is a `sidebar` view.
3. Firefox 153 around the manifest key: it titles a sidebar with the add-on's name; it draws a puzzle piece without `default_icon` (D7); `sidebarAction.open()` requires user input; a plain restart reopens an open sidebar; `open_at_install` alone re-shows it at install or after an update.
4. Marionette's window switch focuses the tab's browser, so every `chromeScript` call deactivates a focused sidebar.
5. The smoke config takes `tests/e2e/*.test.ts`, and the Firefox smoke lane runs on any `apps/extension/**` change.
6. `implementations-plan/lessons.md` is at its 8 KiB budget.
7. **Chrome's row** (`popup/pages/settings/display.vue:42-47, 80-98`): toggling writes `sidePanel`; on success it opens the side panel when on, and closes the page either way. `popup/app.vue:116-121` applies `setPanelBehavior` at boot and on each change, and Chrome keeps it. The row is gated on `chrome.sidePanel`, and so is Settings search (`settings/index.vue:56`).
8. **Firefox keeps a set popup in memory only**: `PanelActionBase.globals = Object.create(this.defaults)`, and `setPopup({ popup: null })` deletes the override, so the manifest's popup returns (`ExtensionActions.sys.mjs`). A browser restart or an add-on reload restores the manifest popup.
9. **With no popup set, a click dispatches `action.onClicked`** (`triggerClickOrPopup`), registered with `inputHandling: true` (`ext-browserAction.js`): the listener runs with the user input `sidebarAction.open()` requires. The listener is persistent, so a click wakes the event page.
10. **At browser startup Firefox starts an event page only** when it has no persisted listener or a persisted `runtime.onStartup` listener (`ext-backgroundPage.js`). This background has persisted listeners and no `onStartup`, so it starts on its first event, and its start is the whole wallet boot (`wallet/runtime.ts`: migration, config, Barretenberg, services).
11. **The shell's floor**: `body { width: var(--base-width); min-width: var(--base-width) }` (`popup/index.scss:18-26`), `--base-width: 360px` (`packages/design/src/base.css:68`); windows set `width: 100%` (`data-fills-window`). A toolbar popup sizes itself to its document's content width in both browsers.
12. **The layout gate exists**: `expectLaidOut` (`tests/e2e/fixtures/type-roles.ts:524`) fails on text an ancestor cuts, or that runs past its box, with no ellipsis drawn. The seeded page sweeps in `type-roles.test.ts` (lines 731, 803, 926) run it at 360 px; `network/type-roles-windows.test.ts` runs it in the windows at 400 px.
13. **Measured at 240 px** (scratch sweep, 45 popup routes, the floor lifted, seeded rows, Chrome 152 and Firefox 153; `lessons/phase-6.md`):
    - every signed-in page: the header's Lock chip ends at 277 px, and the network chip shrinks to its dot;
    - Home, History and a token's page: an activity row's state chip runs to 257 px over the amount, and its title row is cut;
    - a transaction's page: the From/To cards run past the view with a long contact name;
    - labels cut inside their buttons: Send's `CONFIRM TRANSACTION`, `CREATE WITH PASSWORD`, and Accounts' side-by-side `ADD ACCOUNT` / `IMPORT ACCOUNT`;
    - by eye: `RECENT ACTIVITY` and `VIEW HISTORY` touch; an account-state record breaks a mono address over two lines (`0x1a` / `1a1…`); the logger window's toolbar overlaps its first lines;
    - every other route lays out with nothing cut.
    At 360 px the same sweep finds only what `dev` already has (the activity row's hash touching its explorer link by 3 px, the logger by 1 px). Not measured yet: four route states (`lessons/phase-6.md`), every window, and every surface a page opens on demand (Fact 17).
14. **Closing the sidebar**: Firefox hides a sidebar whose page closes itself (`webext-panels.js` handles `DOMWindowClose`), but it refuses a page's own `window.close()` once that page's history has grown (`onboarding/pages/done.vue` records the same rule), and reaching Display always navigates. Measured: from Display, `window.close()` left the sidebar open while the write landed (Phase 5 run 3). `sidebarAction.close()`, like `open()`, requires user input (`sidebar_action.json`). `getViews({ type: "sidebar" })` lists the sidebar's document on Firefox; Chrome's `getViews` refuses the type.
15. **`action.openPopup()` with no popup set opens nothing** and resolves (`ext-browserAction.js`: it opens only `if (action.getPopupUrl(...))`). The wallet calls it after onboarding's "Open wallet" and after the passkey window hands a step back (`wallet/utils/toolbar-popup.ts`).
16. **A background death locks the wallet** under strict mode, the default (`sw-resilience.test.ts`), so the click that wakes a stopped background opens a locked sidebar.
17. **Surfaces a page opens on demand**: the overlays under `popup/components/popups/` (25 `*Popup.vue`), dropdown menus (`components/ui/Dropdown/DropdownRoot.vue`, mounted only while open and positioned with fixed widths), the legal sheet, toasts with an action, tooltips, the logger's filters (`components/JsonViewer/LogsToolbar.vue`), and the register and restore states. A route visit sees none of them unless it opens them.
18. **What the reviewers found in the code**: Lock's accessible name is "Lock wallet" (`components/Header.vue:245`); the network chip already ends in an ellipsis; `TransactionCardLayout` already has `wrapTrailing`, which puts the title's trailing chip on its own line (`components/composite/activity/TransactionCardLayout.vue:45, 111`); the CTA sizes live in `packages/design/src/ui/Button.vue`, which the extension's `Button` wraps; complete values that a person inspects wrap on purpose (an account-state note's hex, `popup/windows/execute/CallArguments.vue`'s arguments). `expectLaidOut` reads horizontal spans only (`fixtures/type-roles.ts:128`), so it cannot see the logger's vertical overlap.
19. **A media query's `width` is the viewport's, scrollbar included**, so a classic scrollbar does not flip it. A zoomed 360 px popup can report a 359.x px viewport (the Opus leg).

**Inferences**
- I1: On a Mac, the OS passkey prompt leaves a sidebar open (it is not a panel). Unverified; the owner checks it (P71-02).
- I2: Which sidebar a Firefox 153 user gets is not settled, so the spec drives both (D8).
- I3: With `max-width: 100%` in place of `min-width`, a toolbar popup still opens 360 px wide. Plausible, not proven: Chromium's autosizer also starts from minimum dimensions on a scroll-width path (the Codex leg). Phase 6 step 1 checks both real popups, settled after load and after a route change, before anything else. If either shrinks, the floor stays for a real toolbar popup (a `popup` view, as `isToolbarPanel` reads it) and only the sidebar, the side panel and windows lose it.
- I4: The dApp windows (discover, verify, capabilities, execute, fee, network-unavailable, passkey) share the measured components; their own offenders are measured in Phase 6 on the network lane.

**Issue claims**: #596 holds (Fact 1, § Phase 0); "the sidebar does not close under the OS prompt" is I1. #593 stays closed; its reopening condition, "a Firefox sidebar ships", is met for the sidebar path only.

## Architecture & Implementation

**Arc 1, Phases 1–4 (shipped in #889)**:
- `manifest/manifest.firefox.config.ts` adds `sidebar_action: { default_panel: side_panel.default_path, default_icon: icons, open_at_install: false }`.
- The e2e driver: `WebDriverSession.chromeActions`; `fixtures/browser/firefox-sidebar.ts` (`openSidebar(kind)`, `evaluateInSidebar`, `clickInSidebar`), all in the session's first window; `FIREFOX_ONLY.sidebar`; a `FIREFOX.md` row and the native-surface exception.
- `tests/e2e/firefox-sidebar.test.ts`: per sidebar kind, a locked passkey profile unlocks from the sidebar's Continue, with no window (`watchPasskeySurface` on a control page) and exactly one `credentials.get` in the sidebar. Measured 13.1–20.7 s per scenario.
- Pin: `src/manifest.test.ts`.

**Phase 5, the Display row on Firefox (P71-03 B), in #889**:
- `utils/browser-surface.ts`:
  - `sidebarAction()` returns Firefox's `browser.sidebarAction` (`open`, `close`), `undefined` elsewhere;
  - `hasSidePanelSurface()` is `Boolean(chrome.sidePanel) || sidebarAction() !== undefined`;
  - `isFirefoxSidebar()`: this document is the sidebar (Fact 14), asked only where a sidebar exists.
- `settings/display.vue`:
  - the row's gate becomes `hasSidePanelSurface()`; the copy stays Chrome's ("Open as Side Panel"), as P71-03 B names;
  - in the toggle's own event, once the write is posted (D10): turning it on calls `sidebarAction().open()`; turning it off in the sidebar calls `sidebarAction().close()`, since `window.close()` cannot close it from Display (Fact 14);
  - then, as on Chrome, the page closes once the write settles; Chrome's `chrome.sidePanel.open` stays where `chrome.sidePanel` exists;
  - a `side-panel-toggle` testid.
- `@nulo/extension-messaging`'s background `ServiceClient` gains `isConnected` (a port that said Ready is open, so a request posts before the call returns); `display.vue` opens or closes the sidebar only while it holds.
- `settings/index.vue`: Settings search's context uses `hasSidePanelSurface()`. `popup/app.vue`'s comment on `setPanelBehavior` says where Firefox's wiring lives.
- `wallet/utils/toolbar-sidebar.ts` (new), registered at module scope in `wallet/index.ts` before the runtime starts. On Firefox only (a `sidebarAction`, no `chrome.sidePanel`):
  - `chrome.action.onClicked` calls `sidebarAction.open()` synchronously (Fact 9);
  - `config.onUpdate` for `sidePanel` calls `chrome.action.setPopup({ popup: value ? "" : null })`. `null` restores the manifest's popup, so no path is repeated.
  - Because Firefox keeps the popup in memory (Fact 8), every background start re-applies the stored value: the config load emits it when it differs from the default. An add-on update restarts the background at once.
  - **The restart gap**: after a browser restart with the sidebar closed, the first click opens the popup, whose start wakes the background; later clicks open the sidebar. Closing it means starting the whole wallet at every Firefox launch (Fact 10). That is background work, so it is OA-5: this phase ships without it, and #889 leaves draft only once the owner has answered.
  - **What the background can no longer open** (D15): with the setting on, onboarding's "Open wallet" and the passkey window's return open nothing (Fact 15); the toolbar button still opens the sidebar. A visible change, so it is asked with OA-5.
- Chrome changes nothing: no listener, no `setPopup`, the same row. The settings-search test's no-side-surface context is renamed from `FIREFOX` to `NO_SIDE_SURFACE`.
- **Tests**:
  - unit:
    - `browser-surface.test.ts`: both browsers and neither; only the sidebar's document is the sidebar, and Chrome is never asked;
    - `client.test.ts` (`@nulo/extension-messaging`): `isConnected` holds from Ready until the port drops, and a request made while it holds posts before it returns;
    - `display.test.ts` on Firefox:
      - the row renders;
      - turning it on calls `open` after the write is posted and before it settles, then closes the page after it;
      - turning it off in the toolbar panel closes the panel and leaves the sidebar alone;
      - turning it off in the sidebar calls `close` after the write is posted, in the same event;
      - a client still reconnecting neither opens nor closes the sidebar;
      - a failed write closes nothing and shows the error;
    - `toolbar-sidebar.test.ts`:
      - Chrome registers nothing;
      - Firefox opens the sidebar from a click and swaps the popup on each `sidePanel` change, ignoring other keys.
  - e2e:
    - `settings-routes.test.ts`: Firefox now finds the row in search;
    - a third `firefox-sidebar.test.ts` scenario, "with the side-panel setting on, the toolbar button opens the sidebar, and with it off the popup again".
- **The e2e scenario's steps**:
  1. Open the toolbar panel on Display and click the toggle with a real pointer (`clickInActionPopup`). Expect the sidebar open, `sidePanel` stored true (read on a control page), the panel closed, and `action.getPopup` reading `""`.
  2. Close the sidebar (`closeSidebar`; D6 revisited) and the control page, and stop the background (`stopBackground`), so the click has to wake it.
  3. Trigger the toolbar action as a click does (`triggerToolbarAction`: `browserActionFor(extension).triggerAction(window)`, the widget's own path). Read both surfaces as soon as either shows: the sidebar open, no panel.
  4. The woken wallet is locked (Fact 16): unlock on a new control page; the sidebar follows. In the sidebar, open Display and turn the setting off: the sidebar closes, `sidePanel` is stored false and `action.getPopup` reads the manifest's popup.
  5. Trigger the action again: the panel open, no sidebar.
- **The scenario's budget**:
  - failure mode: the setting or the click handler no longer opens the sidebar, a stale popup wins, a woken background misses the click, or the sidebar stays open after the setting turns off;
  - no cheaper layer: the user-input rule, the popup swap, the wake and the panel exist only in Firefox;
  - estimate 25 s; measured 19.4, 19.6 and 20.4 s (three runs at retry 0). The Firefox smoke wall-clock before and after goes in #889's body.
- **Negative controls** (uncommitted, `lessons/phase-5.md`): with the `onClicked` listener emptied, step 3 fails reading `{ sidebar: false, popup: false }`; the build before `close()` failed at step 4's "the sidebar closing itself".
- **Driver**: `clickWithPointer` in `firefox-frame-script.ts` takes a locator, scrolls the element into view as WebDriver's element click does, and refuses one it cannot reach. `clickInSidebar` and `clickInActionPopup` are that helper with each surface's locator; the pointer reached the panel, so no step falls back to a unit test.

**Arc 2, the 240 px layout (P71-01 B), its own PR off `origin/dev`**:
- **What renders narrow**:
  - every popup route (45 files under `popup/pages/`): Firefox's sidebar opens at 240–252 px (the revamped one at 340), and Chrome's side panel can be narrowed;
  - every surface a route opens on demand (Fact 17);
  - the nine windows render at their window's width (dApp windows 400 px, passkey 500, viewers 900–1200), and narrow only when a person narrows one;
  - onboarding is a tab with its own 320 px floor, never shown in a sidebar: out of scope.
- **The inventory comes first** (Phase 6 step 2). Before any fix, `lessons/phase-6.md` holds the full map: each offender's file, the state that shows it, its fit rule and the check that holds it. A surface not measured is marked unverified there and in the PR body. A fit no rule below covers is a plan change and stops for the orchestrator.
- **The one rule**: nothing changes at 360 px and wider.
  - The shell's floor becomes a cap: `body { width: var(--base-width); max-width: 100% }`, unless I3 fails (then the floor stays for a real toolbar popup). Windows keep `width: 100%`.
  - Every narrow-only rule sits under `@media (width < 359px)`, which a zoomed 360 px popup's 359.x px viewport does not match (Fact 19). The shell's floor-to-cap change is the one rule outside it, held by the real-popup checks (I3); every component rule sits inside.
- **How each offender fits** (Facts 13, 18). These are layout calls the owner sees in pictures before it ships (P71-01's record):
  - **Header** (every signed-in page): the Lock chip keeps its icon and drops its word; its accessible name stays "Lock wallet". The network chip keeps the ellipsis it has. `components/Header.vue`.
  - **Activity rows** (Home, History, a token's page): the state chip moves to its own line, through `TransactionCardLayout`'s existing `wrapTrailing`, so a row grows a line; measured on every row kind the seeds make.
  - **Section header with an action** (`RECENT ACTIVITY` / `VIEW HISTORY`): the two keep a gap and wrap when they cannot.
  - **Buttons**:
    - a CTA label wraps to a second line instead of being cut (`packages/design/src/ui/Button.vue`'s sizes; the label keeps its role);
    - side-by-side pairs stack (Accounts);
    - Send's sticky CTA keeps its place.
  - **Values**:
    - an identifier already shortened (`0x1a1a…f3`) never breaks: its row puts it under its label, whole (the account-state record, a transaction's details, the From/To cards);
    - a complete value a person inspects (an account-state note's hex, a call's arguments) keeps wrapping as it does today. Nothing new is shortened.
  - **Logger window**: its toolbar and filters wrap above the log.
  - **Surfaces on demand and windows**: fixed by the same rules once measured; each listed in `lessons/phase-6.md` and the PR body.
  - **Every other route** fits as it stands (Fact 13), and the gate keeps it so.
- **Gate in the suite** (committed), inside the visits that already exist, so no page loads twice:
  - the seeded page sweeps in `type-roles.test.ts`: after each visit's 360 px checks, the viewport moves to 240 and `expectLaidOut` runs again, with a new `expectInsideView` next to it (`scrollWidth ≤ innerWidth`, and no visible box past the view: in-flow boxes and open fixed ones such as a dropdown menu or a popover, which `DropdownRoot.vue` positions fixed; a full-screen backdrop is excluded);
  - the windows sweep (`network/type-roles-windows.test.ts`) keeps its 400 px pass and adds 240 on the same request;
  - the representative surfaces on demand (one overlay, one open dropdown, the legal sheet, an action toast, the logger's filters) opened in seeded journeys that already exist, and checked at 240;
  - the logger: a targeted check that its toolbar's bottom sits above its first line;
  - Firefox's `action-popup-layout.test.ts`: the real panel opens 360 px wide.
  - Each hard offender's check must fail on the base before its fix (Phase 6 step 3).
- **Proof at 360** (scratch, recorded):
  - **The CSS diff is the main proof**: every rule the branch adds to the built CSS sits inside the media query, and no rule outside it changed.
  - **The pixel compare backs it**: every page, surface and window at 360 on the base build and on the branch, light and dark, Chrome and Firefox. Both builds load from their own `extensionPath`, with animations off, the caret blurred, `document.fonts.ready` awaited, seeded rows, fixed times and `Date.now` pinned (`BalanceView.vue`, `TokensView.vue` and `RecentActivityView.vue` read it). A noise control (base against base) must find zero, and a positive control (a known 1 px change) must be found.
- **Pictures**, headful under Xvfb as arc 1's were, from a build of the branch:
  - Firefox's sidebar at 240, at 340 (the revamped sidebar's width) and at 360 (whole window, `drawSnapshot`), and Chrome's popup page at 360 and at 240, each light and dark;
  - every page, every surface on demand the gate opens, and every window through the network lane;
  - copies in `~/.cache/nulo-backlog/firefox-sidebar-1/shots/w240/`.

## Decision ledger

- **D1, the verdict** (pass): 0a's "never focused" was the harness's own focus steal; 0b drives the sidebar through the existing privileged channels plus WebDriver input.
- **D2, arc 1's scope**: the key, the driver, one scenario per kind, one pin, one doc row.
- **D3, `open_at_install: false`**: kept on P71-04 A.
- **D4, the evidence**: this plan and its lessons; the `FIREFOX.md` row is live documentation. No `lessons.md` line (Fact 6).
- **D5, the issues**: #889 closes #596; #593 got its comment.
- **D6, no `closeSidebar`** (arc 1). Revisited in Phase 5: the toolbar scenario closes the sidebar before it triggers the action, so the helper lands there.
- **D7, `default_icon`** (arc 1, a correction of Fact 3).
- **D8, both sidebars driven** (arc 1, Opus).
- **D9, the toolbar wiring lives in the background** (Phase 5). Firefox has no "open on action click". `setPopup` plus `onClicked` is the one path that keeps the native popup, with its mousedown preload, for every person who leaves the setting off. The popup page cannot open the sidebar: it holds no user input once it boots.
  - **Rejected, deciding every click in `onClicked`** (no `default_popup` on Firefox): every popup open would wait for the event page, and the listener cannot read the stored setting synchronously after a wake.
  - **Rejected, waking the background at every Firefox start** (`runtime.onStartup`): it starts the whole wallet at each launch for everyone (Fact 10). Background work goes to the owner (OA-5).
- **D10, the write is posted, then the sidebar opens or closes, with nothing awaited between** (Phase 5). Firefox's user-input rule forces it (Facts 3, 14): neither call can wait for the write to settle. Posted means the config client was connected: its request then reaches `postMessage` before the call returns, so a document the change closes has sent it (the e2e reads the stored value after the panel and the sidebar close). A client still reconnecting has not posted it (the Codex leg), so then the sidebar neither opens nor closes: the page stays, finishes the write and closes as on Chrome, and the toolbar button follows the stored setting. If a posted write fails, the sidebar is open (or closed) with the setting unchanged, and the error shows as on any failed setting, unless the document it shows in has closed. Chrome's order is unchanged.
- **D11, arc 2 is its own PR off `origin/dev`** (P71-01's page). It touches every page and needs nothing from #889. The plan's files live on #889's branch only, so the two PRs do not conflict; arc 2's PR links them by branch.
- **D12, narrow-only rules sit under `@media (width < 359px)`**, and none outside it. A viewport query keys on the width, not the surface, so one layout serves the sidebar, a narrowed side panel and a narrowed window alike ("one layout for every width"). 359, not 360: a zoomed 360 px popup can report 359.x px (Fact 19). At 360 px and wider no rule changes, which the CSS diff and the pixel compare prove.
- **D13, the gate is `expectLaidOut` plus two small checks**, run at 240 inside the visits that already exist rather than in a second pass per width (the runtime budget). `expectLaidOut` reads text cut or past its box, and every offender the scratch sweep's box checks found is one; each must fail on the base before its fix (Phase 6 step 3; unverified until then). It reads horizontal spans only (Fact 18), so `expectInsideView` catches a box past the view and the logger gets a vertical check of its own. Two findings were by eye only, labels touching and a shortened value broken over two lines; the pictures cover them.
- **D14, the 240 px work gets an issue** of its own, filed when arc 2 opens, so its PR has something to close. #596 is the sidebar, and #889 closes it.
- **D15, the background's `openPopup` with the setting on opens nothing** (the Opus leg, Fact 15). The background holds no user input after onboarding or a passkey window, so it cannot open the sidebar instead; the person clicks the toolbar button and the sidebar opens. Onboarding's "Open wallet" does start in a click, so the onboarding tab could open the sidebar itself, a change to onboarding's flow (the Codex leg). Both are visible, so they are the owner's, asked with OA-5. If the owner accepts what ships, it is filed as a closed `known-limit` issue that reopens if Firefox lets `action.openPopup` reach `onClicked`.

## Security & Adversarial Considerations

- **The sidebar** is a persistent extension document hosting every popup route, as Chrome's side panel already does. Only the user can open it, and the extension only on user input; no page can frame or script it. The key needs no permission. dApp approvals still open their own windows.
- **The toolbar listener** (Phase 5) acts only on the toolbar click Firefox dispatches, and opens only the add-on's own sidebar. It reads no message and carries no data. `setPopup` takes a constant or `null`, never a value from storage.
- **Passkey**: the ceremony in the sidebar is the wallet's ordinary in-page path; Firefox allows it only in the focused, active sidebar.
- **Layout** (arc 2): no logic changes. The risk is a regression a person would see; the CSS diff, the 360 px pixel compare and the 240 px gate are its checks. An address must never read as a different address: a shortened identifier moves under its label whole, and a complete value keeps all its characters, wrapping as today.
- **Test channels**: `chromeActions` and `triggerToolbarAction` are privileged and exist only in the e2e fixtures, behind geckodriver's `--allow-system-access`.
- **Supply chain, crypto**: no dependency or key change.

## UI impact

- **Firefox sidebar (new surface, arc 1)**. The lane brief: "the plan's `UI impact` line names the new Firefox surface with pictures, and quotes P28-08's condition as met by the spike. Because the surface is new, the PR opens as a draft with the pictures for the owner's look." The owner signed it off with P71-01: "Any pick also signs the sidebar off as pictured."
  - The sidebar is listed as "Nulo V6" with the add-on's icon, and shows the shell Chrome's side panel shows.
  - A passkey step started there runs in place.
  - Pictures in [`screenshots/`](screenshots/).
- **Settings → Display on Firefox (Phase 5)**, P71-03 B: "Add Chrome's "Open as Side Panel" row on Firefox; the toolbar button then opens the sidebar."
  - The row and its search entry appear on Firefox with Chrome's copy.
  - Turning it on opens the sidebar and closes the page it was turned on in, as on Chrome. From then on the toolbar button opens the sidebar.
  - Turning it off closes the page it was turned off in, the sidebar included, and the toolbar button opens the popup again.
  - With it on, after onboarding's "Open wallet" or a passkey window, nothing opens by itself (D15).
- **Every page below 360 px (arc 2)**, P71-01 B: "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The page added: "That is a layout change on every page, planned and shown to you in pictures before it ships."
  - Each fit is listed under § Architecture, arc 2; the pictures in the draft PR show every page, surface and window at 240 and 360, and the revamped sidebar at 340.
  - At 360 px and wider nothing changes, proven pixel by pixel.
- **At install** (P71-04 A): no sidebar opens. Firefox lists Nulo in View → Sidebar and, with the revamped sidebar, in its launcher.

## Arc 1

### Phases 1–4 ✓

The manifest key and pin, the driver and both scenarios, the pictures, and the arc gate. Each gate's outcome is in `STATUS.md` and `lessons/phase-2.md` to `phase-4.md`.

### Phase 5: the Display row on Firefox

1. Merge `origin/dev` (no rebase).
2. Add `sidebarAction()`, `hasSidePanelSurface()` and `isFirefoxSidebar()`; the row's gate, toggle and testid; the search context; `toolbar-sidebar.ts` and its registration.
3. Add the unit tests (§ Architecture).
4. Add the driver pieces: the shared pointer click, `clickInActionPopup`, `actionPopupShows`, `sidebarShows`, `closeSidebar` and `triggerToolbarAction`. Then add the scenario and update `settings-routes.test.ts`.
5. With load1 under 150, rebuild the armed Firefox build and run `firefox-sidebar.test.ts` three times at retry 0, then on Chrome (skipped).
6. Negative controls (uncommitted): the `onClicked` listener emptied must fail step 3's read; the build without `close()` must fail step 4.
7. Once the owner answers OA-5, file D15 as the answer says.

**Gate**:
- `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run check:plans`, `bun run audit:vue`;
- step 5 at exit 0, and step 6 failing where it must;
- the full smoke suite on Firefox and `settings-routes.test.ts` on Chrome, at retry 0;
- the full Firefox network suite through `e2e:agent`, since the background registers a listener before it boots.

Then the Codex loop and an Opus review over the phase's diff, and a push to #889.

## Arc 2: every page fits down to 240 px

Branch `firefox-sidebar-1-a2` off `origin/dev`; one draft PR → `dev`, which leaves draft only after the owner's look at the pictures.

### Phase 6: the shell, the inventory, the fits and the 240 px gate

1. The shell's floor becomes a cap (§ Architecture). At once, check I3: Firefox's real panel (`action-popup-layout.test.ts`) and Chrome's real popup, headful under `xvfb-run` through `action.openPopup()` from a scratch spec, each settled after load and after a route change. If either opens narrower than 360, keep the floor for a real toolbar popup before going on.
2. Finish the inventory at 240 on both browsers: the routes' unmeasured states, the surfaces on demand (Fact 17), and every window on the network lane. Write the map into `lessons/phase-6.md`.
3. Add the checks (§ Architecture, gate) and run them on the base: each hard offender's check must fail there.
4. Fix each offender by the rules in § Architecture, inside the media query.
5. Run the checks again: all pass.

**Gate**:
- the 240 px checks on both browsers at retry 0 (`type-roles.test.ts` and the journeys that open surfaces, smoke; `network/type-roles-windows.test.ts` through `e2e:agent`);
- `action-popup-layout.test.ts` on Firefox, and the headful Chrome popup check at 360;
- `bun run lint`, `bun run typecheck:all`.

Pass: exit 0. Layers: smoke and network e2e, lint, typecheck.

### Phase 7: proof that 360 is unchanged

1. Diff the built CSS of `origin/dev` and the branch: every added rule inside the media query, nothing else changed.
2. Build both with the smoke flags into their own directories, and shoot every page, surface and window at 360 on each, stabilised as § Architecture says. Use Chrome and Firefox, light and dark. The windows come from the network lane on each build.
3. Compare pixel by pixel (scratch; `sharp` raw buffers), with the noise and positive controls first.

**Gate**: the CSS diff clean; the noise control at zero and the positive control found; zero changed pixels on every pair. A difference is a regression to fix, never a mask. The counts go in `lessons/phase-7.md`.

### Phase 8: pictures

Headful under `xvfb-run -a -s "-screen 0 1440x1000x24"`, from a build of the branch:
- Firefox's sidebar, set to exactly 240, 340 and 360, whole window via `drawSnapshot`;
- Chrome's popup page at 360 and at 240;
- each light and dark, every page, every surface the gate opens, and every window;
- saved to `~/.cache/nulo-backlog/firefox-sidebar-1/shots/w240/`, with an index for the report's `SHOTS_READY w240` list.

**Gate**: a picture for each page × width × theme × browser, with nothing cut by eye; the windows included.

### Phase 9: arc gate

`bun run audit:vue`, `bun run test:all`, then the full smoke suite on both browsers at retry 0, since every page's layout changed. Then the network specs that measure windows or rows on both browsers (`type-roles-windows`, the execute and capabilities window specs), and `rows.test.ts`, which moves `--base-width` at run time. CI runs the full network lanes on the PR.

**Pass**: exit 0, with one rerun for a known flake. The PR body states each browser's smoke wall-clock before (the `dev` run at the base) and after.

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #596 | 1 | 1–5 | `Closes #596` (#889) |
| #593 | none | none | stays closed; commented (D5) |
| new (D14) | 2 | 6–9 | `Closes #<n>` (arc 2's PR) |

## Delivery

- **Arc 1** is #889, `firefox-sidebar-1-a1` → `dev`, a draft. Phase 5 lands there after its gate and Codex loop. Its body quotes P71-01 B (the sign-off), P71-02 A (pending the owner's Mac result), P71-03 B and P71-04 A, by id and text, and states OA-5 and D15. It leaves draft when the owner has reported the Mac run (P71-02) and answered OA-5, and the orchestrator moves it.
- **Arc 2** is `firefox-sidebar-1-a2` off `origin/dev` → `dev`, opened as a draft after Phase 9 and its Codex loop. Title: `feat(ui): every page fits down to 240 px; the popup looks the same` (66 chars). The body carries:
  - the pictures;
  - P71-01 B quoted;
  - the fits;
  - the pixel-compare counts;
  - the e2e budget (the sweeps' added time per browser, smoke wall-clock before and after);
  - `Closes #<n>`.
  It leaves draft after the owner's look.
- The decision page's file name and URL appear in no commit and no PR; picks are quoted by id and text.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `993b3efc`. Specific to this plan:
- **Reviews**: step 2 runs per arc, over each arc's diff against its base:
  - Phase 5: `git diff <head before Phase 5>..HEAD`;
  - arc 2: `git diff origin/dev...HEAD` on its branch.
  It uses `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. There is one Opus diff review alongside each first round, and a hard stop at three rounds. Rounds go in `lessons/phase-5.md` and `lessons/phase-9.md` and in § Audit verdicts.
- **Approval boundary**: a background wake at startup (OA-5), a permission, an `open_at_install` flip, any copy, or a layout change outside § Architecture's fits is a plan change and stops for the orchestrator.
- **Close-out**: #889's final commits, after the owner's Mac report:
  - the Outcome;
  - `STATUS.md` deleted;
  - `git mv` into `archive/` in its own commit, the index line moved.
  Arc 2's records (`lessons/phase-6.md` to `phase-9.md`, its audit rows) are committed on #889's branch, never on arc 2's, and #889's archive commit waits until arc 2's PR is merged or closed.
- **Teardown** after the merges: slug `firefox-sidebar-1`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 (0a plan) | Codex, gpt-6.1-sol | conditional approve | D1's rationale; the classic-frame row and run 11 marked inconclusive; Fact 1 narrowed | none |
| 1 (0a plan) | Opus 5.5 lens | reject | the harness's focus steal (reversed the verdict); run 9's log; the Linux-only proof (OA-4); the evidence's durability | `Refs` for a hand-closed issue (moot) |
| 2 | Codex, resumed | conditional approve | poll the sidebar after the session; the window recorder and its forced-window run; the clipping owner-gated (OA-2); the native-surface exception; OA-4 before leaving draft | none |
| 2 | Opus 5.5 lens | conditional approve | the revamped sidebar; the owner's quoted sign-off; the locator held to the driver's window; the success control (one `get`); the install-time entries pictured | none |
| final | Codex, fresh | approve on resume | the full Firefox network suite in Phase 4; whole-window pictures only; smoke wall-clocks in the body | none |
| arc 1, loop 1 | Codex | approve | `clickInSidebar` refuses a zoomed sidebar | readiness markers are the suite's convention, not a selection |
| arc 1, loop 1 | Opus 5.5, diff | request changes | both kinds pinned and driven (D8); the lock picture retaken; `chromeActions` reports its own error; `openSidebar` reports a refused open | the `get` counter counts calls: no retrying fallback exists |
| arc 1, loop 2 | Codex, resumed | approve | `open()` returns nothing, so a try/catch reports a throwing open | opening after `promiseInitialized` and one task follows the event loop's order |
| P71 delta | Codex, gpt-6.1-sol | conditional approve | the panel toggle proven in the real panel, no unit fallback; OA-5 answered before #889 leaves draft; I3 checked on both real popups first; the inventory finished before any fix, the Button's sizes in `@nulo/design`; surfaces on demand; shortened against complete values; the logger's vertical check and a negative control per offender; the windows keep their 400 px pass | none |
| P71 delta, round 2 | Codex, resumed | conditional approve | the open or close only once the write is posted (`isConnected`); Fact 14 states Firefox's history rule, not "a sidebar cannot close"; the shell's change named as the one rule outside the query; open fixed menus inside `expectInsideView`; D15 asked of the owner with OA-5, not called unavoidable | none |
| P71 delta | Opus 5.5 lens | conditional approve | `getPopup` read before each trigger; both surfaces read as one opens; the click on a stopped background; D10 reworded; the `openPopup` known limit (D15); the full Firefox suites and `audit:vue` in Phase 5, the search test and `app.vue` comment; `expectInsideView`; overlays, dropdowns, toasts, sheets; `width < 359px` with nothing outside it; `wrapTrailing` reused; the CSS diff, controls and stabilised builds; 240 inside existing visits; Chrome's popup headful; arc 2's records on #889's branch; "Lock wallet"; the 340 px picture | a classic-scrollbar known limit: a media query's `width` includes the scrollbar (Fact 19), so the query reads what the popup has today |

## Seeds

```
/goal Phase 5 of implementations-plan/firefox-sidebar-1/plan.md ✓ with its gate in the transcript and #889's five required checks green; arc 2 (Phases 6-9) ✓ on firefox-sidebar-1-a2 with the CSS diff clean, the 360 px pixel compare at zero and the 240 px checks green on both browsers; arc 2's draft PR open with the pictures; both Codex loops converged (gpt-6.1-sol, high).
```

```
/loop 20m Drive implementations-plan/firefox-sidebar-1 per its plan.md and the README § Post-implementation standard at 993b3efc: run the next phase's gate at retry 0 with load1 under 150, settle open questions with Codex (gpt-6.1-sol, high), add no copy, background wake or layout change outside the plan, never merge; stop when #889's required checks are green and arc 2's draft PR is open, and report.
```

