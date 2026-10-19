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
status: approved by the final Codex pass; arc 1 next
---

# firefox-sidebar-1: a Firefox sidebar whose passkey steps run in place (#596)

#596 asks for a Firefox sidebar (`sidebar_action`) as the side panel's counterpart. The owner made it conditional (P28-08 note, 2026-10-16): "I think that if the user has side-panel enabled on Firefox, we can skip the pop-up … be sure that the "side-panel" option can be really tested. Because if it can't be tested, then let's keep as-is today." The lane brief makes that a Phase 0 spike.

**The spike meets the condition** (§ Phase 0). At retry 0 the suite opens the sidebar, clicks, types and reads testids, and it proves that a passkey unlock started there runs in place with no window.

Arc 1 ships the sidebar with three parts:
- the popup shell Chrome's side panel loads;
- an e2e spec on the Firefox lane;
- pictures, in a draft PR for the owner's look.

Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Every spike run and consult: [`lessons/phase-0.md`](lessons/phase-0.md).

## Phase 0: the spike

**Setup** (uncommitted):
- **Versions**: Firefox 153.0.4 (the revision puppeteer-core 25.8.0 pins), geckodriver 0.37.1, Bun 1.4.2, Linux, at `993b3efc`.
- **Manifest**: the Firefox manifest gains a `sidebar_action` for `src/popup/index.html` with `open_at_install: false`.
- **Build**, with the smoke flags: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:firefox`.
- **Run**: a scratch spec on the suite's fixtures, `cd apps/extension && NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<spec> --retry=0`.
- **Opening**: `chromeScript` calls `extension.apiManager.global.sidebarActionFor(extension).open(window)`, which is what `sidebarAction.open()` runs. It then finds the document at `SidebarController.browser.contentDocument.getElementById("webext-panels-browser")`.

**Round 0a misread the browser.** Its eleven runs found that the sidebar never took focus and that WebAuthn was refused there. The Opus leg traced why (round 1, finding 1):
- Every read went through `chromeScript`, whose `POST /window` makes Marionette focus the selected tab's browser (`focus` defaults to true; `marionette/browser.sys.mjs` `focusWindow`).
- The focus log shows each activation of the sidebar's remote browser undone by the next action. In run 9, `actionid 43` activates it and `44` deactivates it in favour of the tab's browser.
- The toolbar panel kept its activation through the same calls, which hid the cause.

**Round 0b** sends each input, and reads each outcome during a ceremony, with no window switch in between:

| Probe | Channel | Result (0b runs 2–4, retry 0; run 1's failures are in the lessons) |
|---|---|---|
| Open | `chromeScript` | Works; the page reaches `#/popup/auth` with the service ready. `getViews({ type: "sidebar" })` lists it and `popup` does not, so `passkeyNeedsOwnWindow()` is already false there. |
| Read testids, hash, state | frame script (`evaluateViaFrameScript`) | Works. Each read moves focus to the tab (above). |
| Address it as a Puppeteer page | WebDriver BiDi | Not possible. Its context is content, top-level and in no tab, so it has no navigable id (`NavigableManager.getBrowsingContextById`) and `script.evaluate` answers `no such frame`. Classic `/frame` has no route either: the context has no parent, and `MarionetteCommandsChild.switchToFrame` searches only children. |
| WebAuthn | `host.focus()`, then a frame script, in one privileged script | `hasFocus()` is true, the content process's active context is the sidebar's, and `navigator.credentials.get` resolves `ok public-key`, 3 of 3 per run. |
| Passkey unlock in place | the wallet's Continue, one chrome-context click; outcome read from a control page over BiDi | Unlocked 0.6–0.7 s after the click; no passkey window. |
| Click | chrome-context `/actions` at the element's centre, mapped through `mozInnerScreenX/Y` | Works on Continue, a field and every nav tab inside the view. At 252 px the Settings tab is outside it (Width row); with the sidebar widened to 420 px, all four tabs work. |
| Type | the key source of the same `/actions` payload, after the click | Works: a typed and submitted password unlocks, and the settings search shows its results. |
| Width | none | The old sidebar (Firefox 153's default) opens 240–252 px wide, the revamped one 340 px. The shell's 360 px `min-width` overflows both. At 252 px the Settings tab sits at 273–327 px, outside the view; at 340 px it fits, and the page scrolls 20 px. Widened to 420 px, every tab is reachable. |
| Old and revamped sidebar, headless and headful | the passkey case alone (runs 5, 6a, 6b) | The same result in all four: WebAuthn resolves 3 of 3, and the unlock runs in place with no window. |

Runs and outputs: `lessons/phase-0.md`.

**Verdict: the condition is met.** The owner asked that the side-panel option "can be really tested". On the Firefox lane, at retry 0, the suite can open a Firefox sidebar, drive it, and prove that a passkey step started there runs in place.

Two rules make this hold, and the driver states both:
- an input and the step it starts go in one `/actions` payload;
- outcomes during a ceremony are read from a page opened beforehand, never through a privileged call.

## Outcome & Quality Bar

- **For whom**: a Firefox user who keeps Nulo open in the sidebar. On a Mac, a passkey step started in the toolbar panel opens a window (#593). Started in the sidebar, it runs where they are.
- **Excellent**:
  - a passkey step started in the sidebar runs in place and opens no window;
  - the toolbar popup, its passkey window and the Chrome side panel behave exactly as before;
  - one e2e scenario proves it at retry 0, with no raised timeout and no retry;
  - the sidebar driver follows the panel module's shape and states its focus rule where the next spec author will read it;
  - the draft PR carries pictures of the new surface.
- **Good enough** for the draft: no Display row on Firefox, no width rule, no new copy (OA-1, OA-2); the sidebar does not open at install (OA-3); no Mac run (OA-4). The PR leaves draft only once the owner has answered OA-2 and OA-4 (§ Delivery).

## Assumptions

**Facts** (at `993b3efc`; recon has the citations)
1. Chrome's side panel loads `src/popup/index.html` (`manifest/manifest.config.ts:32-34`). The Firefox manifest strips `sidePanel` and declares no sidebar (`manifest/manifest.firefox.config.ts:12-16`).
2. On Firefox, a passkey step runs in its own window only when it starts in a `popup` view (`utils/browser-surface.ts`). A sidebar is a `sidebar` view (spike), so the step runs in place with no product change.
3. Firefox 153 behaviour around the manifest key (`ext-sidebarAction.js`, `browser-sidebar.js`, `schemas/sidebar_action.json`):
   - it titles a sidebar `default_title`, else the add-on's name ("Nulo V6", which the toolbar button already shows);
   - without a `default_icon` it draws the generic puzzle piece, not the add-on's icons (`ExtensionParent.sys.mjs` `IconDetails`; corrected in arc 1, D7);
   - `sidebarAction.open()` requires user input;
   - an ordinary restart reopens a sidebar that was open;
   - the extension shows its sidebar at install, or after its own update or a startup-cache reset, only when `open_at_install` is true.
4. Marionette's window switch focuses the tab's browser (`focusWindow`), so every `chromeScript` call deactivates a focused sidebar (§ Phase 0).
5. Nothing in the repository lists e2e spec files. The smoke config takes `tests/e2e/*.test.ts` (`vitest.e2e.config.ts:12`), and the Firefox smoke lane runs on any `apps/extension/**` change.
6. `implementations-plan/lessons.md` is 8191 bytes, at its 8 KiB budget.

**Inferences**
- I1: On a Mac, the OS passkey prompt over a sidebar behaves as it does over a tab: the sidebar is not a panel that closes when it loses focus. Plausible but unverified, since there is no Mac run (OA-4).
- I2: Which sidebar a Firefox 153 user gets is not settled. The static default is the old one (`sidebar.revamp` false), and the revamped one is a person's choice or a rollout. The passkey case passes on both, headless and headful (runs 5, 6a, 6b), so the spec drives the default. The pictures show both.
- I3: Chrome's side panel opens near 360 px wide, so the shell fits it. This comes from vendor documentation, not a measurement; Firefox's sidebar opens narrower (measured).

**Asks**: in `OWNER-ASKS.md`, each with what ships now.

**Issue claims**
- #596 holds:
  - no Firefox side panel exists (Fact 1);
  - the e2e suite can drive one (§ Phase 0);
  - a passkey step there runs in place (demonstrated on Linux).
  - "A sidebar document does not close when the OS passkey prompt takes focus" is unverified (I1).
- #593's research comment holds at `993b3efc`. Once this ships, its reopening condition "a Firefox sidebar ships" is met for the sidebar path only. The toolbar panel's window stays as decided (P28-08 C).

## Architecture & Implementation

**Product**: one manifest key. `manifest/manifest.firefox.config.ts` adds `sidebar_action: { default_panel: ManifestConfig.side_panel.default_path, default_icon: ManifestConfig.icons, open_at_install: false }` (`default_icon` added in arc 1, D7).
- The sidebar loads exactly the page Chrome's side panel loads.
- Firefox titles it with the add-on's name, so there is no new copy; the icon is the add-on's own (Fact 3, D7).
- The comment on the stripped `sidePanel` names the sidebar as its Firefox counterpart.

Nothing else changes: the predicate already runs the step in place (Fact 2), and the Display row stays Chrome-only (OA-1).

**e2e driver** (Firefox only, beside `firefox-action-popup.ts`):
- `fixtures/browser/webdriver-classic.ts` gains `WebDriverSession.chromeActions(actions)`. Like `chromeScript` it holds the session exclusively; it switches to chrome context and the first window, sends `POST /actions` and `DELETE /actions`, then returns to content context.
- `fixtures/browser/firefox-sidebar.ts` (new):
  - `openSidebar`, `evaluateInSidebar` and `clickInSidebar(testid)` (reads the rect first, refuses an element outside the sidebar's view, then sends one pointer payload), on a `LOCATE_SIDEBAR` locator like the panel's (D6);
  - every one of them works in the window `chromeScript` and `chromeActions` run in, the session's first browser window. The locator searches only that window, so the sidebar opened, read and clicked is one document even when a second window carries its own sidebar;
  - its header states the two rules from the verdict;
  - it reuses `actionPopupContext` for the session and add-on id, and `evaluateViaFrameScript`.
- `fixtures/browser/index.ts`: `FIREFOX_ONLY.sidebar`.

**e2e spec** `tests/e2e/firefox-sidebar.test.ts`, one scenario per sidebar kind (D8) under `describe.skipIf(!isFirefox)(FIREFOX_ONLY.sidebar, …)`:
- Steps:
  1. Register a passkey profile in a control popup (`registerPasskeyProfile`, `sessionAuthenticator`), note its session's profile, then lock it.
  2. Open the sidebar of the named kind, wait for its lock screen, and start counting `navigator.credentials.get` calls in the sidebar page's own realm (`inPageRealm`, as `armPanelDeath` counts the panel's).
  3. On the control page, assert there is no session row, then start `watchPasskeySurface` (`fixtures/passkey.ts`), whose `chrome.windows.onCreated` counter records every window Firefox opens, whichever API or context opens it, even one that opens and closes between two reads.
  4. Click Continue in the sidebar (`clickInSidebar`).
  5. Read only through the control page: `waitForSessionRow` sees the noted profile's session (the success control), and `readPasskeySurface` counts no window (the never-happens check).
  6. Then, with the ceremony over, poll the sidebar until it reaches `#/popup/general` with its readiness markers: the session row is written before the sidebar routes (0b run 2). The sidebar's count reads exactly one `get`, so the ceremony ran in the sidebar and an unlock without one cannot pass.
- **The recorder is validated once** (uncommitted): with `passkeyNeedsOwnWindow()` forced true, the scenario must fail at step 5 with one window counted. The run goes in `lessons/phase-2.md`.
- **Failure mode**: a passkey step started in a Firefox sidebar opens a window, or Firefox refuses it there. That covers three regressions:
  - a predicate that starts sending sidebars to the window;
  - a manifest that stops declaring the sidebar;
  - a Firefox that stops allowing WebAuthn in a focused sidebar.
- **Why no cheaper layer**: view types and WebAuthn's focus rule exist only in a real Firefox.
- **Estimate**: 25 s. The spike's passkey case, setup included and with three extra WebAuthn probes, measured 19.3–21.7 s headless (runs 2–4). Measured in arc 1: 15.8–20.7 s for the default sidebar, 13.1–15.4 s for the revamped one (`lessons/phase-2.md`).

**Pins**: `src/manifest.test.ts` adds one case. Firefox's `sidebar_action.default_panel` equals Chrome's `side_panel.default_path`, `open_at_install` is false, and Chrome's build has no `sidebar_action`.

**Docs**: `FIREFOX.md` gets two edits.
- **A table row** saying that the sidebar is no BiDi navigable, that it is reached from privileged scope, and that a privileged call moves focus to the tab. It points at the module and the spec.
- **One sentence under "The one rule"** naming the bounded exception both native-surface modules already use: a surface only Firefox has (the toolbar panel, the sidebar) is driven by a module of its own under `fixtures/browser/`, imported only by `FIREFOX_ONLY` specs. Chrome has no counterpart to implement, so nothing goes on the interface.

**Alternatives not taken**
- **A Display row that makes the toolbar button open the sidebar.** It needs a background `action.onClicked` and a popup swap, and it changes Settings on Firefox (OA-1).
- **A width rule for the sidebar.** That is a layout change (OA-2).
- **`focus: false` on `chromeScript`'s window switch.** It would change every Firefox spec's focus, and the panel spec's prompt timing rests on today's behaviour (FIREFOX.md, the panel row).
- **Frame-script clicks through `windowUtils`.** WebDriver actions are the standard input path, and the spike proved them.
- **Injecting a BiDi context for the sidebar.** Firefox gives it no navigable id, so no command could address it.
- **BiDi `script.callFunction` in a `moz:scope: "chrome"` realm** (Opus r1): a privileged read that moves no focus. It would be a second privileged channel beside `chromeScript`; reading outcomes from a page opened beforehand already avoids the focus move.

## Decision ledger

- **D1, the verdict** (pass).
  - Round 0a's "never focused" was the harness's own focus steal (Opus r1 finding 1, verified in the run-9 log and in Marionette's source).
  - Round 0b drives the sidebar through the suite's existing privileged channels plus WebDriver pointer and key actions, Firefox's own input path.
  - Audit trail: Codex r1 questioned 0a's rationale (now moot); Opus r1 rejected 0a; round 2 is pending.
- **D2, the scope.**
  - In: the manifest key, the driver, one scenario, one pin, one doc row.
  - Out: a Display row and a width rule (both owner asks).
  - The persistent view comes with the key at no extra cost, and the motivating behaviour needs no product code (Fact 2).
- **D3, `open_at_install: false`.** Nothing opens without the user, as with Chrome's side panel. The cost (Fact 3): a sidebar left open does not come back by itself after a Nulo update or a startup-cache reset. A plain restart does reopen it. The choice is the owner's (OA-3).
- **D4, the evidence.** This plan and its lessons carry it. The `FIREFOX.md` row is live documentation of a surface the suite now drives. No `lessons.md` line (Fact 6).
- **D5, the issues.** The PR says `Closes #596`. When the PR opens, #593 gets a comment: the sidebar runs the step in place; the panel's window stays as the owner decided; #593 stays closed.
- **D6, no `closeSidebar`** (arc 1, a deviation). No spec closes the sidebar, since the launch is torn down with it, so the module exports `openSidebar`, `evaluateInSidebar` and `clickInSidebar` only.
- **D7, `default_icon`** (arc 1, a correction). The first pictures showed Firefox's generic puzzle piece for Nulo in the revamped launcher: with no `default_icon`, `IconDetails` falls back to its default icon, not the manifest's `icons`, so Fact 3 was wrong. The key now names the add-on's own icons, which is what § UI impact promised ("its name and icon"). The pin covers it.
- **D8, both sidebars driven** (arc 1, from the Opus review). A launch comes up with either sidebar (Phase 0 run 7 and the first pictures got the revamped one unasked), so a spec that does not choose drives whichever it gets, and a regression in one would read as a flake. `openSidebar` takes the kind and sets `sidebar.revamp` before opening, and the scenario runs once per kind (`test.for`). The revamped sidebar is its own Firefox code path (launcher, panel header, width), which is the second scenario's failure mode; it costs 13–15 s.

## Security & Adversarial Considerations

- **New surface**: a persistent extension document that hosts every popup route, as Chrome's side panel already does.
  - The shell already copes with a long-lived document there: auto-lock, secret timers, profile switches.
  - `window.close()` hides the sidebar (`webext-panels.js`, `DOMWindowClose`), just as it closes Chrome's panel.
  - dApp approvals still open their own windows (unchanged).
- **Who can reach it**: only the user, through Firefox's sidebar UI, and the extension, since `sidebarAction.open` requires user input (Fact 3).
  - A web page cannot open, frame or script it.
  - The key needs no permission, so `store/listing.md`'s permission headings and the privacy table do not change.
- **Passkey**: the ceremony in the sidebar is the wallet's ordinary in-page path, and neither the RP ID nor its host permission changes. Firefox allows it only in the focused, active sidebar, the same rule it applies to a tab.
- **Test channels**: `chromeActions` is privileged like `chromeScript`. It exists only in the e2e fixtures, behind geckodriver's `--allow-system-access` (FIREFOX.md).
- **Supply chain, crypto**: no dependency or key change.

## UI impact

- **Firefox sidebar (new surface)**. The lane brief's record: "the plan's `UI impact` line names the new Firefox surface with pictures, and quotes P28-08's condition as met by the spike. Because the surface is new, the PR opens as a draft with the pictures for the owner's look."
  - Nulo appears in Firefox's sidebar list as "Nulo V6" (the add-on's name, which the toolbar button already shows) with the add-on's icon. Opening it shows the shell Chrome's side panel shows: the lock screen and every popup page.
  - A passkey step started there runs in place.
  - **At the width Firefox opens it, the shell is clipped.** The page keeps its 360 px width and scrolls sideways. In the old sidebar (240–252 px) about a third of the page is cut until the person widens the sidebar or scrolls: the network badge and Lock, half of Receive, the end of the balance, and the Settings tab (`screenshots/sidebar-home-opening-width.png`). In the revamped sidebar (340 px) every control shows, and the page still scrolls 20 px. This is named here for the owner's look (OA-2), and the arc does not change the layout.
  - P28-08's condition, "be sure that the "side-panel" option can be really tested", is met by the spike (§ Phase 0).
  - Pictures, taken headful, in [`screenshots/`](screenshots/): the passkey lock screen and Home in the old sidebar at its opening width, with the clipping visible (`sidebar-lock-opening-width.png`, `sidebar-home-opening-width.png`); Home in the revamped sidebar at 340 px, with Nulo's icon in its launcher (`revamped-sidebar-home.png`); Home at 420 px, light and dark (`sidebar-home-420.png`, `sidebar-home-420-dark.png`).
- **At install** no sidebar opens, but Firefox lists Nulo in View → Sidebar and in the sidebar's switcher. With the revamped sidebar, it also adds Nulo's icon to the launcher's tools until the person removes it (`browser-sidebar.js` `registerExtension`). This is pictured.
- **Unchanged**: the toolbar popup and its passkey window, Settings → Display (no row on Firefox), and the Chrome side panel.

## Arc 1

### Phase 1: the manifest key and its pin

1. Add the key and the comment (§ Architecture), and the `manifest.test.ts` case.
2. Build Firefox with the smoke flags; `dist/firefox/manifest.json` carries the key.

**Gate**: `cd apps/extension && bun --bun vitest run src/manifest.test.ts`, then root `bun run lint` and `bun run typecheck:all`. Pass: exit 0. Layers: lint, typecheck, unit.

### Phase 2: the driver and the scenario

1. Add `chromeActions`, `firefox-sidebar.ts`, `FIREFOX_ONLY.sidebar`, the spec and the `FIREFOX.md` row.
2. With load1 under 150 before each run, run the spec on Firefox three times at `--retry=0`, then on Chrome (skipped, exit 0). Record each wall-clock in `lessons/phase-2.md`.
3. Run `passkey-toolbar-panel.test.ts` and `action-popup-layout.test.ts` on Firefox, since they share `webdriver-classic.ts`.

**Gate**: steps 2 and 3, plus `cd apps/extension && bun --bun vitest run scripts/e2e/browser-seam.test.ts scripts/e2e/firefox-driver.test.ts`. Pass: every run exits 0. Layers: unit, smoke e2e.

### Phase 3: pictures

1. A scratch spec (uncommitted), run headful under Xvfb (`HEADLESS=0 xvfb-run -a`), opens the sidebar on a registered profile and captures the browser window. For the revamped shots it sets `sidebar.revamp` before opening.
   - In chrome scope it draws the window's own global with `drawSnapshot`, which composites remote content, so each picture shows the browser around the sidebar.
   - It writes PNGs under `implementations-plan/firefox-sidebar-1/screenshots/`.
2. Take the shots § UI impact lists in the light theme, plus Home in the dark theme.

**Gate**: every listed shot exists as a whole-window picture showing the sidebar's content, the clipping at the old sidebar's opening width, and Nulo's icon in the revamped launcher. A picture of the sidebar's document alone does not pass: it cannot show the width or the launcher. If whole-window capture fails, the phase stops and the failure goes in `lessons/phase-3.md`. Layers: none (evidence).

### Phase 4: arc gate

1. From the root, in order: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`.
2. The armed builds and the full smoke suite on Chrome and on Firefox, at retry 0, because the manifest change reaches every Firefox launch.
3. The full network suite on Firefox, `NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent`. CLAUDE.md requires it for a fixture change, and `webdriver-classic.ts` serves every Firefox network spec.

Pass: every command exits 0, with one rerun allowed for a known flake. The PR body states each browser's smoke wall-clock on `dev` at `993b3efc` (from its CI run) and on the PR's CI run. Chrome skips the new scenario, and the body says so.

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #596 | 1 | 1-4 | `Closes #596` |
| #593 | no arc | none | stays closed; a comment when the PR opens (D5) |

## Delivery

- **One arc, one PR**: `firefox-sidebar-1-a1` off the plan branch (`origin/dev` plus the plan commit) → `dev`, opened **as a draft**. Title (57 chars): `feat(firefox): a sidebar where passkey steps run in place`.
- **Body**:
  - the pictures;
  - P28-08 and the lane brief's record, quoted;
  - the spike's table in short;
  - the scenario's failure mode and measured time, and the Firefox smoke wall-clock before and after;
  - the validation runs;
  - `Closes #596`;
  - the attribution line.
- **Opening**: after Phase 4 and the Codex loop, without labels (the smoke lanes' path filter covers `apps/extension/**`). Do not merge.
- **Leaving draft** needs the owner's explicit sign-off on the surface after the pictures (CLAUDE.md § UI changes), quoted in the PR body, and the owner's answer to OA-2 (the clipped Settings tab at the opening width) and OA-4 (the Mac check, listed in the PR body as a check for the owner). Each answer is either a change or an accepted limit, and an accepted limit is filed as a closed `known-limit` issue. The orchestrator moves the PR out of draft.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `993b3efc`. Specific to this plan:
- **Reviews**: step 1 is absent (`code_review: off`). Step 2 runs once over `git diff origin/dev...HEAD` after Phase 4:
  - `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`;
  - prompts under `~/.cache/nulo-backlog/firefox-sidebar-1/`;
  - hard stop at three rounds, with one Opus review alongside round 1;
  - rounds recorded in `lessons/phase-4.md`.
- **Approval boundary**: a Display row, a width rule, a background listener, a permission, an `open_at_install` flip or any copy is a plan change and stops for the orchestrator.
- **Close-out**: the PR's final commits, after the owner's look, since OA answers can still change the arc:
  - the Outcome, whose Known limits line names every OA the owner accepted as a limit, with its issue;
  - `STATUS.md` deleted;
  - `git mv` into `archive/` in its own commit, with the index line moved.
- **Teardown** after the merge: slug `firefox-sidebar-1`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 (0a plan) | Codex, gpt-6.1-sol | conditional approve | D1's rationale (a `BrowserDriver` sidebar handle respects FIREFOX.md; WebDriver's own keys use the same in-process synthesis); the classic-frame row and run 11 marked inconclusive; Fact 1 narrowed; #596's body to carry the known-limit parts | none |
| 1 (0a plan) | Opus 5.5 lens | reject | 1, the harness's focus steal (verified; it reversed the verdict); 2, run 9's log misread (rewritten); 3, a reopening condition no driver could meet (moot); 4, the proof is Linux-only (OA-4); 5, D1's reason (c) (dropped); 7, the evidence's durability (the driver and spec are now committed, the plan carries the recipe); 8, the classic-frame row overstated (reworded) | 6, `Refs` for a hand-closed issue (moot: the PR closes #596 on merge) |
| 2 | Codex, resumed | conditional approve | 1, poll the sidebar after the session (step 6); 2, the window recorder: `watchPasskeySurface`, no session before the click, a one-off forced-window run must fail; 3, the clipping named in UI impact and owner-gated (OA-2, Delivery); 4, the native-surface exception written into FIREFOX.md; 5, OA-4 answered before the PR leaves draft, and the Known limits line names every accepted OA | none |
| 2 | Opus 5.5 lens | conditional approve | 1, the revamped sidebar (runs 6a, 6b; I2 rewritten; pictures headful, both sidebars); 2, leaving draft needs the owner's quoted sign-off; 3, the locator held to the driver's window; 4, the 0b evidence stated as it stands (runs 1–6, the click row qualified by width); 5, the success control: the noted profile and exactly one `get` in the sidebar; 6, the install-time launcher and menu entries in UI impact, pictured; 7, OA-4 listed in the PR body; 8, the seed's command | none |
| final | Codex, fresh session | conditional approve, then approve on resume | 1, the full Firefox network suite in Phase 4; 2, Phase 3's gate takes only whole-window pictures; 3, each browser's smoke wall-clock in the PR body | none |
| arc 1, loop 1 | Codex, gpt-6.1-sol | approve | 1, a click mapped across different scales (the sidebar zoomed): `clickInSidebar` refuses it by name | 2, readiness markers are not testids: they are the suite's readiness convention (`fixtures/wallet-pages.ts`), not a selection |
| arc 1, loop 1 | Opus 5.5, diff review | request changes | 1, the sidebar kind pinned and both driven (D8); 2, the lock picture retaken on a passkey profile, the password screen's button shown to be disabled, not missing; 3, folded into Codex 1; 4, `chromeActions` reports the actions' own error; 5, `openSidebar` reports a refused open and says what it waits for; 6, the context's doc, FIREFOX.md's exception wording, the manifest pin's comment | 7, the `get` counter counts calls, not successes: no retrying fallback exists, recorded as a limit of the check |

## Seeds

```
/goal Arc 1 of implementations-plan/firefox-sidebar-1/plan.md (Phases 1-4) marked ✓, each backed by its gate passing in the transcript; LESSONS_FILE=implementations-plan/firefox-sidebar-1/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one draft PR from firefox-sidebar-1-a1 to dev opened after that with the pictures and Closes #596; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/firefox-sidebar-1 forward per its plan.md and the README § Post-implementation standard at 993b3efc: reality-check plan.md and lessons/, run the next phase's gate at retry 0 with load1 under 150, decide open questions with Codex (gpt-6.1-sol, high), add no Display row, width rule or copy, never merge; stop after the draft PR's checks are green and report.
```
