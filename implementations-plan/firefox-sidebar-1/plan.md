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
status: closed (arc 1 delivered as #889, arc 2 as #986)
issues: "#596 (#889), #985 (#986); #1004 and #1005 (known limits, filed at close-out)"
---

## Outcome

- **Date:** 2026-10-21.
- **Status:** closed. Arc 1 (Phases 0-5) is #889 on `firefox-sidebar-1-a1`, which carries this close-out; arc 2 (Phases 6-9) is #986 on `firefox-sidebar-1-a2`, which carries no plan files. Merge order: #889 first, then #986 after a `dev` merge; #889's merge closes the plan. § Post-implementation held the archive commit until arc 2 merged; the orchestrator's merge order puts #889 first, so the archive rides it.
- **Shipped:**
  - Arc 1 (#889, closes #596): Firefox's `sidebar_action` loads the popup shell Chrome's side panel loads, and a passkey step started there runs in place, with no window. Settings → Display's "Open as Side Panel" row on Firefox: on, the toolbar button opens or closes the sidebar; off, it opens the popup. `firefox-sidebar.test.ts` drives both sidebar kinds on the Firefox lane.
  - Arc 2 (#986, closes #985): every page and window lays out down to 240 px. Every narrow rule sits under `@media (width < 359px)`, so the popup at 360 px is unchanged (the CSS diff, and 84 pairs per browser in the pixel compare). `expectFitsNarrow` runs the 240 px check inside the existing smoke and network visits on both browsers.
- **Dispositions:** the owner's picks.
  - **P71-01 B** (decision page 71, 2026-10-20): "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." It also signed the sidebar off as pictured.
  - **P71-02 A** (in chat: "ill test firefox"), with its result in chat on 2026-10-21, recorded on #596: "worked perfectly". The sidebar survived the macOS passkey prompt; arc 1 stands as built.
  - **P71-03 B**: "Add Chrome's "Open as Side Panel" row on Firefox; the toolbar button then opens the sidebar." Built in Phase 5.
  - **P71-04 A**: "As in the draft: no sidebar at install; an open one survives restarts only." No change.
  - **P78-11** (decision page 78, 2026-10-21): arc 2's pictures approved as pictured. Its note asked whether an extension can set the sidebar's width; neither Firefox's `sidebar_action` nor Chrome's side panel takes one, so nothing is built beyond the 240 px layout.
  - **P78-12 A**: "Keep what ships: after a Firefox restart with the sidebar closed, the first toolbar click opens the popup, which wakes the wallet; every click after that opens the sidebar." Known limit #1004.
  - **P78-13 A**: "Keep the placeholders as they are: the label above each field names it, and the copy reads whole at 360 px, where the popup always is." Known limit #1005.
  - The review findings not taken, each with its reason, are in § Audit verdicts. #593 stays closed (D5).
- **Known limits:** #1004 (the first toolbar click after a Firefox restart with the sidebar closed opens the popup), #1005 (a placeholder can read cut below 360 px).
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` holds 8152 of its 8192 bytes and nothing there is superseded. The Firefox behaviours are in Facts 3, 8 to 10, 14 and 15, and in `apps/extension/tests/e2e/FIREFOX.md`; the 360 px compare and the picture capture in [lessons/phase-7.md](lessons/phase-7.md) and [lessons/phase-8.md](lessons/phase-8.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# firefox-sidebar-1: a Firefox sidebar whose passkey steps run in place (#596), and a shell that fits it

#596 asks for a Firefox sidebar (`sidebar_action`) as the side panel's counterpart. The owner made it conditional (P28-08 note, 2026-10-16): "I think that if the user has side-panel enabled on Firefox, we can skip the pop-up … be sure that the "side-panel" option can be really tested. Because if it can't be tested, then let's keep as-is today." The lane brief makes that a Phase 0 spike.

**The spike meets the condition** (§ Phase 0). Arc 1 ships the sidebar: the popup shell Chrome's side panel loads, an e2e spec on the Firefox lane, and pictures in draft PR #889.

**The owner's answers (decision page 71, 2026-10-20)** to OA-1 to OA-4:
- **P71-01 (OA-2), B**: "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The page added: "Any pick also signs the sidebar off as pictured", and "That is a layout change on every page, planned and shown to you in pictures before it ships." That is arc 2, a PR of its own: it changes every page at every width and does not depend on the sidebar.
- **P71-02 (OA-4), A**, in chat: "ill test firefox". The owner will unlock once with a passkey from the sidebar on a Mac, using a build of #889. #889 stays a draft until that report. If the sidebar dies there, the step keeps its window and arc 1 changes.
- **P71-03 (OA-1), B**: "Add Chrome's "Open as Side Panel" row on Firefox; the toolbar button then opens the sidebar." That is Phase 5, in #889.
- **P71-04 (OA-3), A**: "As in the draft: no sidebar at install; an open one survives restarts only." No change.

**The owner's answers on 2026-10-21**: P71-02's Mac run "worked perfectly" (chat, recorded on #596); P78-11 approves arc 2's pictures as pictured; P78-12 A keeps the restart gap (OA-5) and P78-13 A the placeholders (OA-6). Each is quoted in § Outcome and `OWNER-ASKS.md`.

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
- **Good enough**: no Mac run before the owner's (P71-02); the restart gap of § Phase 5, which the owner accepts or rejects before #889 leaves draft (OA-5).

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
15. **`action.openPopup()` with no popup set opens nothing** and resolves (`ext-browserAction.js`: it opens only `if (action.getPopupUrl(...))`), and it reads the URL again later, in the view's `onViewShowing`, after the call has returned. The wallet calls it after onboarding's "Open wallet" and after the passkey window hands a step back (`wallet/utils/toolbar-popup.ts`). A full-backup restore copies `sidePanel`, so onboarding can run with the setting on.
16. **A background death locks the wallet** under strict mode, the default (`sw-resilience.test.ts`), so the click that wakes a stopped background opens a locked sidebar.
17. **Surfaces a page opens on demand**: the overlays under `popup/components/popups/` (25 `*Popup.vue`), dropdown menus (`components/ui/Dropdown/DropdownRoot.vue`, mounted only while open and positioned with fixed widths), the legal sheet, toasts with an action, tooltips, the logger's filters (`components/JsonViewer/LogsToolbar.vue`), and the register and restore states. A route visit sees none of them unless it opens them.
18. **What the reviewers found in the code**: Lock's accessible name is "Lock wallet" (`components/Header.vue:245`); the network chip already ends in an ellipsis; `TransactionCardLayout` already has `wrapTrailing`, which puts the title's trailing chip on its own line (`components/composite/activity/TransactionCardLayout.vue:45, 111`); the CTA sizes live in `packages/design/src/ui/Button.vue`, which the extension's `Button` wraps; complete values that a person inspects wrap on purpose (an account-state note's hex, `popup/windows/execute/CallArguments.vue`'s arguments). `expectLaidOut` reads horizontal spans only (`fixtures/type-roles.ts:128`), so it cannot see the logger's vertical overlap.
19. **A media query's `width` is the viewport's, scrollbar included**, so a classic scrollbar does not flip it. A zoomed 360 px popup can report a 359.x px viewport (the Opus leg).
20. **Both real popups keep 360 px with the floor turned into a cap** (I3, Phase 6 step 1): Firefox's panel reads `innerWidth` 360 on every tab and sample (`action-popup-layout.test.ts`, now asserting it); Chrome's, opened headful under Xvfb through `action.openPopup()` from a tab, reads `outerWidth`, `innerWidth` and the body 360 after load and after a route change (scratch spec, `lessons/phase-6.md`).
21. **An activity row's text column is about 50 px at 240**, narrower than its state chip (127 px), so the chip on its own line (`wrapTrailing`) still leaves the row past its box beside the amount.
22. **An ellipsis the popup never draws at 360 cuts primary text at 240**: Settings rows' titles and descriptions ("Te…" for Testnet), sub-page titles ("MANAGE N…"), the Get started steps ("Ho…"), a contact's name and address ("Ale", "0…"), Manage accounts' names (zero width beside four controls), Home's backup reminder, the stale-network confirmation's account names. `expectLaidOut` accepts a drawn ellipsis, so it cannot see them.
23. **The app shell clips** (`popup/app.vue`, `.wrapper { overflow: clip }`), so "a box past the view unless an ancestor contains it" passes everything; only an ancestor that scrolls sideways inside the view may hold a wider box.

**Inferences**
- I1: On a Mac, the OS passkey prompt leaves a sidebar open (it is not a panel). Unverified; the owner checks it (P71-02).
- I2: Which sidebar a Firefox 153 user gets is not settled, so the spec drives both (D8).
- I3: With `max-width: 100%` in place of `min-width`, a toolbar popup still opens 360 px wide. Proven (Fact 20): the floor became a cap for every view.
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
  - `sidebarAction()` returns Firefox's `browser.sidebarAction` (`open`, `close`, `toggle`), `undefined` elsewhere;
  - `pointToolbarAtSidebar(on)`: on Firefox, `action.setPopup({ popup: on ? "" : null })`; Chrome keeps its popup. `null` restores the manifest's popup, so no path is repeated;
  - `hasSidePanelSurface()` is `Boolean(chrome.sidePanel) || sidebarAction() !== undefined`;
  - `isFirefoxSidebar()`: this document is the sidebar (Fact 14), asked only where a sidebar exists.
- `settings/display.vue`:
  - the row's gate becomes `hasSidePanelSurface()`; the copy stays Chrome's ("Open as Side Panel"), as P71-03 B names;
  - in the toggle's own event, once the write is posted (D10): turning it on calls `sidebarAction().open()`; turning it off in the sidebar calls `sidebarAction().close()`, since `window.close()` cannot close it from Display (Fact 14);
  - then, as on Chrome, the page closes once the write settles; Chrome's `chrome.sidePanel.open` stays where `chrome.sidePanel` exists;
  - a `side-panel-toggle` testid.
- `@nulo/extension-messaging`'s background `ServiceClient` gains `isConnected` (a port that said Ready is open, so a request posts before the call returns); `display.vue` opens or closes the sidebar only while it holds. A port whose `postMessage` throws stops reading as connected at once, and the client drops it as on `onDisconnect` once that request has failed.
- `settings/index.vue`: Settings search's context uses `hasSidePanelSurface()`.
- `popup/app.vue`: the `sidePanel` handler, which already applies Chrome's `setPanelBehavior` at every shell boot and on each change, also calls `pointToolbarAtSidebar`. So every popup, sidebar or window page points the button as the stored setting says when it boots.
- `wallet/utils/toolbar-sidebar.ts` (new), registered at module scope in `wallet/index.ts` before the runtime starts. On Firefox only (a `sidebarAction`, no `chrome.sidePanel`):
  - `chrome.action.onClicked` calls `sidebarAction.toggle()` synchronously (Fact 9): a second click closes the sidebar, as Chrome's `openPanelOnActionClick` toggles its panel;
  - `config.onUpdate` for `sidePanel` calls `pointToolbarAtSidebar(value)`.
  - Because Firefox keeps the popup in memory (Fact 8), every background start re-applies the stored value: the config load emits it when it differs from the default. An add-on update restarts the background at once.
  - **The restart gap**: after a browser restart with the sidebar closed, the first click opens the popup, whose start wakes the background; later clicks open the sidebar. Closing it means starting the whole wallet at every Firefox launch (Fact 10). That is background work, so it is OA-5: this phase ships without it, and #889 leaves draft only once the owner has answered.
  - **The popup the background opens itself** (D15): `openToolbarPopup`, after onboarding's "Open wallet" and the passkey window's return, first calls `pointToolbarAtSidebar(false)`, since Firefox opens nothing while no popup is set (Fact 15). The popup then points the button at the sidebar again as it boots (`app.vue`), so the popup opens as it does on Chrome. If Firefox refuses the open, the next toolbar click opens the popup and repairs it the same way.
  - **Self-repair**: a `setPopup` that failed, or a background that died between storing the setting and applying it, is repaired by the next shell page's boot. The load-time emit fires only for a value that differs from the default, and the shell boot covers what it misses.
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
      - Firefox toggles the sidebar from a click and swaps the popup on each `sidePanel` change, ignoring other keys;
    - `toolbar-popup.test.ts`: on Firefox the manifest's popup comes back before `openPopup`;
    - `browser-surface.test.ts`: `pointToolbarAtSidebar` sets `""` or `null` on Firefox and nothing on Chrome;
  - e2e:
    - `settings-routes.test.ts`: Firefox now finds the row in search;
    - a `firefox-sidebar.test.ts` scenario per sidebar kind: "in the %s sidebar, with the side-panel setting on the toolbar button toggles the sidebar, and with it off opens the popup".
- **The e2e scenario's steps**, on the sidebar kind the scenario names (`setSidebarKind`):
  1. Open the toolbar panel on Display and click the toggle with a real pointer (`clickInActionPopup`). Expect the sidebar open, `sidePanel` stored true (read on a control page), the panel closed, and `action.getPopup` reading `""`.
  2. Close the sidebar (`closeSidebar`, which resolves only once it shows nothing; D6 revisited) and the control page, and stop the background (`stopBackground`), so the click has to wake it.
  3. Trigger the toolbar action as a click does (`triggerToolbarAction`: `browserActionFor(extension).triggerAction(window)`, the widget's own path). Read both surfaces as soon as either shows: the sidebar open, no panel. Trigger again: the sidebar closes and no panel opens.
  4. The woken wallet is locked (Fact 16): unlock on a new control page. From an onboarding page (the flag reset, so the shell routes the known profile to Learn), alone in its window and on its done route, click the real "Open wallet": the background's `openToolbarPopup` opens the panel (`waitForOpenPanel`, now shared with `onboarding-tab.test.ts`), and the panel's boot points the button at the sidebar again (`getPopup` reads `""`). Close the onboarding page, and its panel with it; trigger: the sidebar opens.
  5. In the sidebar, open Display and turn the setting off: the sidebar closes, `sidePanel` is stored false and `action.getPopup` reads the manifest's popup.
  6. Trigger the action again: the panel opens, no sidebar.
- **The scenario's budget**:
  - failure modes: the setting or the click handler no longer opens or closes the sidebar, a stale popup wins, a woken background misses the click, the popup the background opens does not open or never hands the button back, or the sidebar stays open after the setting turns off; on either sidebar kind, since Firefox's `SidebarController` takes its own path for each;
  - no cheaper layer: the user-input rule, the popup swap, the wake and the panel exist only in Firefox;
  - estimate 25 s per kind. Measured: the first version (one kind, steps 1–3, 5 and 6) took 19.4–20.4 s; this one 23.1–29.0 s per kind over three runs at retry 0 (`lessons/phase-5.md`). The Firefox smoke wall-clock before and after goes in #889's body.
- **Negative controls** (uncommitted, `lessons/phase-5.md`): with the `onClicked` listener emptied, step 3 fails reading `{ sidebar: false, popup: false }`; the build before `close()` failed at step 5's "the sidebar closing itself"; without `app.vue`'s `pointToolbarAtSidebar`, step 4 fails at "the popup pointing the button at the sidebar again"; without `openToolbarPopup`'s restore, step 4 fails at `waitForOpenPanel`.
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
- **How each offender fits** (Facts 13, 18, 21, 22), as built; the owner sees each in pictures before it ships (P71-01's record):
  - **Header** (every signed-in page, `components/Header.vue`): the row tightens (sides 16/12 px, gap 8 px) and the Lock chip keeps its icon; its accessible name stays "Lock wallet". The network chip keeps the ellipsis it has (D19).
  - **Activity rows** (Home, History, a token's page, `TransactionCardLayout.vue`): every row's trailing chips wrap under the title as `wrapTrailing` rows do, the separator left of the clip, and the amount and the row's actions drop under the text, at the right, when they do not fit beside it (D17). A dApp's function name breaks anywhere and is cut only past a third line.
  - **Section headers with an action** (`RecentActivityView.vue`, `GetStartedCard.vue`) and **Home's backup reminder** (`BackupReminderBanner.vue`): they wrap; the reminder's action goes under its message.
  - **Buttons** (`packages/design/src/ui/Button.vue`): every size's label wraps instead of being cut, its height a minimum, CTA sides 8 px; Manage accounts' pair stacks (`settings/accounts/index.vue`); Send's sticky CTA keeps its place.
  - **Settings rows** (`components/ui/Settings/SettingItem.vue`): title and description wrap; the controls go under the text when beside them it would have less than 72 px. **Sub-page titles** wrap (`SubPageHeaderBase.vue`).
  - **Values**: a shortened identifier never breaks. The From/To cards stack (`detail-page.module.css`); a record's value goes under its key (`record-card.module.css`); Send's chosen recipient puts its two buttons under the name and address (`RecipientCard.vue`); a detail's value keeps a gap from its key, and an app's name breaks between words (`detail-page.module.css`); Send's summary strip puts a cell's fact under its name (`PublishStrip.vue`); the capabilities window puts an account's rename link under its address (`AccountSelectRow.vue`) and a contract's name above its six marks in Details, which stay at the right, each column narrowing to its mark (`DetailsTable.vue`); a note's type wraps and its contract goes under it (`notes/index.vue`); a settings row's controls go under its text when its identifier description would not fit whole (`SettingItem.vue`); the execute window puts a detail's value under its name, at the right, when the two do not fit, so a name breaks only inside a word wider than the card (`OperationCard.vue`, `CallArguments.vue`); a contacts import's address change wraps its two forms (`ImportContactsPopup.vue`); the stale-network confirmation puts an account's address under its name, which wraps (`StaleNetworkConfirm.vue`). A complete value a person inspects keeps wrapping as it does today; nothing new is shortened.
  - **Contacts and connected apps** (`ContactRow.vue`, `settings/connected-apps/index.vue`, `[id].vue`): names wrap; a contact's actions go under its text; a connected app's address breaks anywhere.
  - **The dApp windows' identity strip** (`IdentityStrip.vue`), when a person narrows a window: the network goes under the account without its separator, and the NULO mark under both, at the right, only when it does not fit beside them.
  - **Logs window** (`LogsToolbar.vue`, `LogsViewer.vue`, `packages/design/src/ui/Popover.vue`): the toolbar takes its own row above the log, the log keeps inside the window's border, and the Source panel starts at least 8 px inside the view (D21).
  - **Unchanged**: toasts (D20), onboarding (a tab with its own floor), and every other route.
- **Gate in the suite** (committed), inside the visits that already exist, so no page loads twice: `expectFitsNarrow` (`fixtures/type-roles.ts`) lets the page settle (two frames, any transitions, two frames) and a success snack close itself, records each text's fate at the page's own width (painted after its clipping ancestors, cut by an ellipsis or a line clamp, a shortened identifier on one line or split over two), moves to 240, settles again, and asserts `expectLaidOut`, `expectInsideView` (a box past the view fails unless a sideways scroller inside the view holds it, Fact 23) and that no text shown whole at the page's width is gone, newly cut or has a shortened identifier newly split (D18); a planted page proves the three fates and their exemptions. A replaced element is judged by its replacement. Content that lands late and replaces text (Home's token quote, a fee estimate) is waited for by the spec before its sweep, since the narrow pass reads a replacement as text gone. `NARROW_ACCEPTED` names the planned exceptions: the Lock word, the network name's ellipsis, the row separators a wrap leaves left of the clip, and the identity strip's separator. It runs:
  - in every seeded page sweep of `type-roles.test.ts`, the register, legal and restore journeys, and `rows.test.ts`'s dApp rows (a name whole at 360 seeded);
  - on surfaces on demand: overlays through `openAndSweep`, Home's tokens menu opened at 240, the legal sheet, the restore banner, and the logs window (`viewers-csp.test.ts`: the toolbar above the log, the log's box inside its shadow root, Source, Level and the more menu inside the view);
  - in the windows sweep (`network/type-roles-windows.test.ts`), after its 400 px pass;
  - Firefox's `action-popup-layout.test.ts` asserts the real panel 360 px wide.
  - Each check fails on the base (`lessons/phase-6.md`).
- **Proof at 360** (scratch, recorded):
  - **The CSS diff is the main proof**: every rule the branch adds to the built CSS sits inside the media query, and no rule outside it changed but the shell's floor-to-cap, which the real-popup checks hold (I3).
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
- **D12, narrow-only rules sit under `@media (width < 359px)`**, and none outside it but the shell's floor-to-cap, which the real-popup checks hold (I3). A viewport query keys on the width, not the surface, so one layout serves the sidebar, a narrowed side panel and a narrowed window alike ("one layout for every width"). 359, not 360: a zoomed 360 px popup can report 359.x px (Fact 19). At 360 px and wider no rule changes, which the CSS diff and the pixel compare prove.
- **D13, the gate is `expectLaidOut` plus two small checks**, run at 240 inside the visits that already exist rather than in a second pass per width (the runtime budget). `expectLaidOut` reads text cut or past its box, and every offender the scratch sweep's box checks found is one; each must fail on the base before its fix (Phase 6 step 3; unverified until then). It reads horizontal spans only (Fact 18), so `expectInsideView` catches a box past the view and the logger gets a vertical check of its own. Two findings were by eye only, labels touching and a shortened value broken over two lines; the pictures cover them.
- **D14, the 240 px work gets an issue** of its own, filed when arc 2 opens, so its PR has something to close. #596 is the sidebar, and #889 closes it.
- **D15, the background opens its popup as on Chrome** (the Opus diff review, Fact 15). Chrome's `action.openPopup` opens the popup whatever the side-panel setting says. On Firefox the background puts the manifest's popup back first, and the popup's own boot points the button at the sidebar again. Restoring it right after `openPopup` resolves would race Firefox's later read of the URL (Fact 15). Rejected: opening the sidebar instead, since the background holds no user input then.
- **D16, the toolbar click toggles** (the Opus diff review). Chrome's `openPanelOnActionClick` toggles its panel, and P71-03 B names Chrome's row, so a second click closes the sidebar.
- **D17, an activity row's amount and actions drop under the text below 359 px** when they do not fit beside it, at the right, and every row's trailing chips wrap under the title as `wrapTrailing` rows do (Fact 21). The planned fit alone left the chip past the row. A narrow rule that sets a gap or a justification on a `Flex` element takes two classes, since the global `gap--N` and `justify-*` utilities are single classes in another chunk and could win (the Opus diff review).
- **D18, the gate reads text fates** (Fact 22, the Codex diff review): text shown whole at the page's own width that is gone or newly cut at 240 fails, so a row's title and description wrap, its controls go under the text, a sub-page title wraps, a shortened address goes under its label, and a section header with an action wraps.
- **D19, the header row tightens below 359 px** (sides 16/12, gap 8, the Lock chip icon-only): with the word dropped alone, the chip still ended 14 px past the row.
- **D20, toasts unchanged**: a toast card is already `calc(100% - 32px)` wide. The only toast with an action follows a network send and closes itself after 6 s, so no check opens one at 240; the gate waits for a success snack to close rather than judge it mid-close.
- **D21, three changes outside the media query, each inert at 359 px and wider**: the activity title's trailing slot gains a wrapper with `display: contents`, which generates no box; the activity separators gain a testid; `Popover`'s 8 px left clamp applies only when `(width < 359px)` matches. The CSS diff and the 360 px pixel compare hold them.
- **D22, arc 1 stands as built** (P71-02's result, 2026-10-21): the owner's passkey unlock from the sidebar on a Mac "worked perfectly", so the passkey step keeps running in place there.
- **D23, the restart gap is a known limit** (P78-12 A, #1004): no background start at Firefox launch.
- **D24, the placeholders stay** (P78-13 A, #1005).
- **D25, nothing beyond the 240 px layout for the sidebar's width** (P78-11's note): neither Firefox's `sidebar_action` nor Chrome's side panel takes a width from an extension.

## Security & Adversarial Considerations

- **The sidebar** is a persistent extension document hosting every popup route, as Chrome's side panel already does. Only the user can open it, and the extension only on user input; no page can frame or script it. The key needs no permission. dApp approvals still open their own windows.
- **The toolbar listener** (Phase 5) acts only on the toolbar click Firefox dispatches (a page cannot dispatch it), and toggles only the add-on's own sidebar. It reads no message and carries no data. `setPopup` takes a constant or `null`, never a value from storage. Config writes reach the background only over ports that already refuse untrusted senders.
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
  - Turning it on opens the sidebar and closes the page it was turned on in, as on Chrome. From then on the toolbar button opens the sidebar, and a second click closes it, as Chrome's button does with its panel (D16).
  - Turning it off closes the page it was turned off in, the sidebar included, and the toolbar button opens the popup again.
  - With it on, onboarding's "Open wallet" and a passkey window's return open the popup, as on Chrome (D15).
- **Every page below 360 px (arc 2)**, P71-01 B: "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The page added: "That is a layout change on every page, planned and shown to you in pictures before it ships."
  - Each fit is listed under § Architecture, arc 2; the pictures in the draft PR show every page, surface and window at 240 and 360, and the revamped sidebar at 340.
  - At 360 px and wider nothing changes, proven pixel by pixel.
  - Signed off: P78-11, approved as pictured (2026-10-21).
- **At install** (P71-04 A): no sidebar opens. Firefox lists Nulo in View → Sidebar and, with the revamped sidebar, in its launcher.

## Arc 1

### Phases 1–4 ✓

The manifest key and pin, the driver and both scenarios, the pictures, and the arc gate. Each gate's outcome is in `lessons/phase-2.md` to `phase-4.md`.

### Phase 5: the Display row on Firefox ✓

1. Merge `origin/dev` (no rebase).
2. Add `sidebarAction()`, `hasSidePanelSurface()` and `isFirefoxSidebar()`; the row's gate, toggle and testid; the search context; `toolbar-sidebar.ts` and its registration.
3. Add the unit tests (§ Architecture).
4. Add the driver pieces: the shared pointer click, `clickInActionPopup`, `actionPopupShows`, `setSidebarKind`, `sidebarShows`, `closeSidebar` and `triggerToolbarAction`, and their `FIREFOX.md` row. Then add the scenario per kind and update `settings-routes.test.ts`.
5. With load1 under 150, rebuild the armed Firefox build and run `firefox-sidebar.test.ts` three times at retry 0, then on Chrome (skipped).
6. Negative controls (uncommitted): the `onClicked` listener emptied must fail step 3's read; the build without `close()` must fail step 5; the build without `app.vue`'s re-apply must fail step 4.

**Gate**:
- `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run check:plans`, `bun run audit:vue`;
- step 5 at exit 0, and step 6 failing where it must;
- the full smoke suite on Firefox and `settings-routes.test.ts` on Chrome, at retry 0;
- the full Firefox network suite, since the background registers a listener before it boots: #889's required `extension-network-e2e-firefox-status`, which runs it at retry 0 on the pushed head (`pr-extension-network-e2e-firefox.yml`); a local rerun of that 3-hour suite on the shared host adds nothing.

Then the Codex loop and an Opus review over the phase's diff, and a push to #889.

## Arc 2: every page fits down to 240 px

Branch `firefox-sidebar-1-a2` off `origin/dev`; one draft PR → `dev`, which leaves draft only after the owner's look at the pictures.

### Phase 6: the shell, the inventory, the fits and the 240 px gate ✓

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

### Phase 7: proof that 360 is unchanged ✓

1. Diff the built CSS of `origin/dev` and the branch: every added rule inside the media query, nothing else changed but the shell's floor-to-cap.
2. Build both with the smoke flags into their own directories, and shoot every page, surface and window at 360 on each, stabilised as § Architecture says. Use Chrome and Firefox, light and dark. The windows come from the network lane on each build.
3. Compare pixel by pixel (scratch; `sharp` raw buffers), with the noise and positive controls first.

**Gate**: the CSS diff clean; the noise control at zero and the positive control found; zero changed pixels on every pair. A difference is a regression to fix, never a mask. The counts go in `lessons/phase-7.md`.

### Phase 8: pictures ✓

Headful under `xvfb-run -a -s "-screen 0 1440x1000x24"`, from a build of the branch:
- Firefox's sidebar, set to exactly 240, 340 and 360, whole window via `drawSnapshot`;
- Chrome's popup page at 360 and at 240;
- each light and dark, every page, every surface the gate opens, and every window;
- saved to `~/.cache/nulo-backlog/firefox-sidebar-1/shots/w240/`, with an index for the report's `SHOTS_READY w240` list.

**Gate**: a picture for each page × width × theme × browser, with nothing cut by eye; the windows included.

### Phase 9: arc gate ✓

`bun run audit:vue`, `bun run test:all`, then the full smoke suite on both browsers at retry 0, since every page's layout changed. Then the network specs that measure windows or rows on both browsers (`type-roles-windows`, the execute and capabilities window specs), and `rows.test.ts`, which moves `--base-width` at run time. CI runs the full network lanes on the PR.

**Pass**: exit 0, with one rerun for a known flake. The PR body states each browser's smoke wall-clock before (the `dev` run at the base) and after.

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #596 | 1 | 1–5 | `Closes #596` (#889) |
| #593 | none | none | stays closed; commented (D5) |
| #985 (D14) | 2 | 6–9 | `Closes #985` (#986) |

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
| P71 delta, round 3 | Codex, resumed | conditional approve | a port whose send throws stops reading as connected at once and is dropped once that request fails; the shell's exemption repeated in the CSS proof, D12 and Phase 7 | none |
| Phase 5 diff, final | Codex, fresh | request changes | step 4 sends onboarding's real "Open wallet" message instead of restoring the popup by hand, so a restore that races Firefox's later URL read fails it | none |
| Phase 5 diff | Opus 5.5, diff | request changes | the background's own popup open restored (D15), which also covers a backup restored during onboarding; `closeSidebar` proves the close; the scenario per sidebar kind; the click toggles (D16); a shell page's boot re-applies the setting, which repairs a failed or interrupted apply; `FIREFOX.md` | none |
| P71 delta | Opus 5.5 lens | conditional approve | `getPopup` read before each trigger; both surfaces read as one opens; the click on a stopped background; D10 reworded; the `openPopup` known limit (D15); the full Firefox suites and `audit:vue` in Phase 5, the search test and `app.vue` comment; `expectInsideView`; overlays, dropdowns, toasts, sheets; `width < 359px` with nothing outside it; `wrapTrailing` reused; the CSS diff, controls and stabilised builds; 240 inside existing visits; Chrome's popup headful; arc 2's records on #889's branch; "Lock wallet"; the 340 px picture | a classic-scrollbar known limit: a media query's `width` includes the scrollbar (Fact 19), so the query reads what the popup has today |
| arc 2 diff, 1 | Codex, gpt-6.1-sol | request changes | the gate reads text fates; a wider box only inside a sideways scroller inside the view (Fact 23); `display: contents` on the trailing slot; every Button label wraps; Settings rows' controls under the text; the Popover clamp; transitions settled | the Lock word and the network name's ellipsis (planned fits); a record value's two-line clamp, which it has at 360 too |
| arc 2 diff, 1 | Opus 5.5, diff | request changes | the same; onboarding out of the 240 check; the comments | none |
| arc 2 diff, 2 | Codex, resumed | request changes | dApp function names wrap below 359 px, seeded whole at 360 in `rows.test.ts`; the Popover clamp only below 359 px; a replaced element judged by its replacement; clipping ancestors counted; the log's box read inside its shadow root | none |
| arc 2 diff, 3 | Codex, resumed (the last) | request changes | a row's actions go under its text with no side reservation, pending rows with one and two actions checked; a recipient's name wraps; replacements matched one to one; a held snack released before the wait | none |
| arc 2 diff, final | Opus 5.5, diff | request changes | the amount and actions packed right instead of split by two auto margins; two classes where a global `Flex` utility could win; the stale confirmation's name wraps; a function name cut only past a third line; the comments | the separator exemption by testid, the `wrapTrailing` design; Chrome's real popup at 240, which never opens narrower than 360 |
| arc 2 delta | Opus 5.5, diff | request changes | the dApp windows' network under the account with no separator (no dangling `·` beside a long name); a deterministic detail gap; a wrapped title row's 4 px line gap; the page settles before the snack wait | an import's arrow trailing the saved address on its line, which still reads as "becomes"; a third line in Send's strip, which needs a strip narrower than 240 gives |
| arc 2 last fixes | Opus 5.5, diff | conditional approve | the Details table's head and rows share one grid's columns (subgrid), so each mark sits under its heading; its rows' vertical padding; a note header's rule at two classes; the fee wait treats the Fee Juice nudge as settled | a per-request fee flag: the wait already settles on every terminal state the readout has |
| arc 2 execute rows | Opus 5.5, diff | request changes | the split fate told lines apart by one rect's bottom, which never clears the next line's top at `line-height: 1` (every `AddressDisplay`): lines are now told apart by their tops; the planted page draws its identifiers in their own face at `line-height: 1`, and fails with the old reading; a negative control: the windows spec without the execute rows' narrow rules reports the splits | none |
| arc 2 rebase and account switcher | Opus 5.5, diff | conditional approve | the Details table's narrow grid stopped at 194 px between 253 and 358 px: a leading flexible track spans the panel, the marks at the right under their glyphs (a replica measured on both engines at 182 to 300 px); its comment | Manage accounts' hidden rows put their undo control on its own line at 240 under the 14ch floor, nothing hidden or cut |

## Seeds

```
/goal Phase 5 of implementations-plan/firefox-sidebar-1/plan.md ✓ with its gate in the transcript and #889's five required checks green; arc 2 (Phases 6-9) ✓ on firefox-sidebar-1-a2 with the CSS diff clean, the 360 px pixel compare at zero and the 240 px checks green on both browsers; arc 2's draft PR open with the pictures; both Codex loops converged (gpt-6.1-sol, high).
```

```
/loop 20m Drive implementations-plan/firefox-sidebar-1 per its plan.md and the README § Post-implementation standard at 993b3efc: run the next phase's gate at retry 0 with load1 under 150, settle open questions with Codex (gpt-6.1-sol, high), add no copy, background wake or layout change outside the plan, never merge; stop when #889's required checks are green and arc 2's draft PR is open, and report.
```

