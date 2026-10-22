---
plan: firefox-handoff-1
tier: light
status: approved 2026-10-21 with two conditions (D9, D10); A1 in progress
issues: "#1007"
trunk: dev
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 1362efab8
standard: implementations-plan/README.md § Post-implementation standard, read at 1362efab8
---

# firefox-handoff-1: one card in the Firefox hand-off window; it closes itself and the panel reopens on the result

One arc, one PR against `dev`, `Closes #1007` (related #160). The owner's pick is page 79, P79-01 B (§ UI impact). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks beyond the record: [OWNER-ASKS.md](OWNER-ASKS.md). `archive/firefox-files-1/` is evidence, never instructions.

## Outcome & Quality Bar

- **For whom**: a person on Firefox (a Mac first) who starts Import contacts, Import account's file or Restore again's file from the toolbar panel.
- **Excellent**:
  1. The window that opens shows one card and nothing else: the pick's title, Choose file, Cancel (P81-01 C; the plan drafted a line of why, which the owner dropped). One press on Choose file opens the picker.
  2. The loop closes: when the import ends, or on Cancel, the window closes itself and the panel comes back on the pick's page with the flow's own outcome snack. When Firefox refuses the reopen, the next panel the person sees lands there once, never twice.
- **Good enough**: after a pick, the account import and Restore again go on in their own page in the same window (OA-1); the card copy is the design lane's draft until the owner words it; Chrome does not change.

## Assumptions

**Facts** (verified at `1362efab8`; paths under `apps/extension/src/`):
- F1 `utils/own-window.ts`: the three pages reach their own window only through `leavePanelFor` (:194), which needs `closesOnFocusLoss()`. `captureOwnWindow` (:46) records the flow at boot and strips `window=own` from `ownRoute` (the live hash keeps it until the router moves); `openOwnWindow` reads the panel's browser window as `anchor` (:151); `closeOwnWindow` (:200) only calls `window.close()`, and `goBack` calls it first (`utils/page-back.ts:10`).
- F2 `wallet/utils/toolbar-popup.ts`: `openToolbarPopup` treats a refusal as a debug line (:26); `focusReturns` waits up to `POPUP_RETURN_FOCUS_MS` (3 s) for a window's focus and cleans up its listener and timer (:82); `OPEN_TOOLBAR_POPUP` (`onboarding-tab.ts:25`, a module with no imports) is answered at module scope after `isSenderAtUrl` (:54).
- F3 Nothing lands the panel anywhere but Home: `default_popup` is `#/popup/general`; `postAuthRoute` returns `pageAwaitingAuth || ownRoute || "/popup/general"` (:130) and also serves the lock screen, a finished network reset (`app.vue:171`) and the guard (`route-guard.ts:33`).
- F4 Contacts: `importContacts` (`useContactImportExport.ts:158`) picks, parses, opens the selection through the global `PopupManager`, writes, then opens one outcome snack (:438-463) whose label carries counts only; it resolves `void`. The route has no `hideHeader`, so `Header.vue:171` shows the app header.
- F5 Account import: pick, password (sealed file), preview, name, confirm; success snacks "Account imported" (`accounts/import.vue:140`). Restore again: full success snacks "<networks> restored" then `end` → `leave` (`useRestoreAgain.ts:222`); `end` also runs with no snack on mount (no reminder, :136), on a dead fence or nothing carried (:245, :248), on Continue, and on a profile switch (:344). Both routes set `hideHeader`.
- F6 `toast-call-sites.test.ts` accepts one object literal whose `kind` is a literal or a ternary of two.
- F7 `stored-shapes.scan.test.ts`: the `nulo:own-window:` session prefix is owned by `own-window.ts`; a message type registers as `kind: "message"`.
- F8 Measured on Firefox 153 (design lane): a picker opens only from a press in the asking window; a trusted press there runs with `navigator.userActivation.isActive` and headless Firefox cancels the picker at once (`input` fires `cancel`); Puppeteer's `FileChooser` never fires on Firefox, and the suite's `pickFile` fixture feeds the pending input after an evaluated click, which opens no picker (`tests/e2e/fixtures/browser/firefox.ts:611`). A press-free `action.openPopup()` resolves only for the focused browser window. Firefox runs the popup document before the panel shows (FIREFOX.md:40).

**Inferences**:
- I1 Closing the focused card window gives focus back to its browser window within 3 s headless (the passkey return relies on it). On macOS: the owner's Mac check (§ Delivery).
- I2 `sender.tab.windowId` exists for an extension page in a popup-type window (a popup window holds a tab; `closeTabThenOpenPopup` relies on `sender.tab`). Phase 3's e2e proves it.
- I3 The card's press keeps its activation through `pickFile`'s 50 ms timer (Firefox's transient activation lasts 5 s). Phase 3 records it; the OS picker itself only the Mac shows.
- I4 A top-level `await` in `popup/index.ts` builds (`esnext`; `offscreen/index.ts:86` does the same) and costs the Firefox panel one session read.
- I5 `isToolbarPopup()` is already true while the panel's module evaluates (FIREFOX.md:40).
- I6 A Firefox popup that a toolbar mousedown preloads runs its scripts while hidden, and is destroyed when the press is abandoned (Firefox's `ext-browserAction.js`). Its `document.visibilityState` reads `hidden` until the panel shows: unverified, measured first in phase 1.

**Asks**: OA-1..OA-4 in [OWNER-ASKS.md](OWNER-ASKS.md), each shipping its "what ships now" form. For the orchestrator: the brief says the record carries "a snack id"; this plan stores the flow's outcome snack as `{ kind, label }` (D2). #1007's claims hold; "continues through the existing selection list" is true of contacts only (OA-1).

## Architecture & Implementation

**Card mode.** `own-window.ts` names the card flows (`contacts`, `accountImport`, `restoreAgain`) and exports `isCardWindow()`: this document was captured as an own window of one of them and its boot registration read a popup-type window (`ownWindowSettled()`, awaited before the router), so a marked URL in a tab stays today's page. Only the Firefox panel opens those (F1), so Chrome never meets a card. `Header.vue` also hides in a card window.

**The card.** `components/composite/HandoffCard.vue` (L3, no service or store): props `title`, `description`, `busy`; emits `choose`, `cancel`. Upload glyph, title, line, Choose file (`cta`, focused on mount) and Cancel, native buttons, both disabled while `busy`; testids `handoff-card`, `handoff-card-choose`, `handoff-card-cancel`. Layout per the picked picture `p79-ho-card`; type roles as `StatusCard`'s.

**The outcome.** A flow names its own result; nothing reads the snack on screen. `Snack = { kind: "success" | "error"; label: string }`, shown through one helper, `showSnack(openToast, snack)`, whose single call uses F6's ternary.
- Contacts: `importContacts()` resolves `undefined` until its selection settled (a cancelled picker, a refused file, whose snack shows over the card; the `!selection` return) and `{ snack }` on every later path: written, stopped, written with errors, a cancelled or empty selection, a write that throws. The outcome builders become pure (`importOutcomeSnack`, `stoppedImportSnack`) and the composable shows what they return. One `settled` result keeps `importContacts` inside its complexity budget; no suppression.
- Account import: a confirmed import in a card window hands back "Account imported" instead of replacing to Accounts.
- Restore again: `end(state, opts, snack?)` passes `snack` to `leave`; only full success passes "<networks> restored".

**The pages.** Contacts renders only the card in a card window (`busy` while `appStore.contactImports.size > 0`); Choose runs `importContacts()`; a result → `returnToPanel(contacts, result.snack)`. Account import shows the card while no file and no error, Restore again while no backup and no error; after a pick, the page as today. In a card window `closeOwnWindow()` (Cancel, every back arrow) calls `returnToPanel(<the flow's page>)` with no snack, instead of `window.close()`.

**The record.** `nulo:own-window:handback` in `chrome.storage.session`: `{ route, snack? }`. `route` is one of five pages (Contacts, Accounts, Import account, Home, Restore again); `snack` is `{ kind, label, profileId }`: the outcome names the profile of the run that produced it (contacts' run fence, the account import's profile snapshot, Restore again's fence), never the profile at hand-back (D9); label at most 2048 characters, above the longest a flow builds (Restore again names up to 64 networks of 25 characters; counts and network names, never file contents, a file name or a path); an oversized or malformed snack is dropped, the route kept. One record; a later hand-back replaces it.
- `returnToPanel(route, outcome?)`, card window only, single-shot (the first hand-back wins, so a late Cancel cannot replace an outcome): writes the record, sends `RETURN_TO_PANEL` (`nulo:return-to-panel`, beside `OPEN_TOOLBAR_POPUP`) with the opener id whether or not the write succeeded, then closes itself whatever the answer; a failed send leaves the record for the next panel.
- `readHandback()`, Firefox toolbar panel only (`closesOnFocusLoss()`), never rejects: `popup/index.ts` awaits it after `initAppServiceContext()` and before the router exists. A record rewrites the hash with `history.replaceState` and becomes the landing: `postAuthRoute` returns it after an unlock.
- **Consumption**: on the first arrival at the landing route (I6 measured: a preload reads `visible`, so no visibility wait), the panel removes the key only if it still holds the raw value it read, compared before decoding (the `unregister` pattern, :114), shows the decoded snack only when, after its last await, the session is open (`isLogined`) on the snack's `profileId` (a session not yet open defers; another profile removes the record and the snack never shows), and clears the landing, so a later lock, reset or guard bounce goes Home. A preloaded panel whose press is abandoned consumes the record and dies: a known limit.

**The opener.** `openOwnWindow` appends `opener=<anchor id>`; `captureOwnWindow` strips it with the marker and keeps the number.

**The reopen.** The `RETURN_TO_PANEL` handler, registered at module scope beside the existing one: the sender passes `isSenderAtUrl` for the popup document and has a numeric `sender.tab.windowId` of a popup-type window; the opener is a number naming a normal window. It answers `{ ok: true }`, removes the sender's window (ignoring any failure: the window also closes itself), then makes one `openToolbarPopup(opener)` attempt if the opener has focus within 3 s (`focusReturns`, shared with `armPopupReturn`), else nothing. The window id to remove comes only from the sender.

## Phases

Every gate runs `bun run lint`, `bun run typecheck:all`, `bun run test` (pass: exit 0). Smoke: `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e <file>`; Firefox: build with the flags `tests/e2e/FIREFOX.md` names, then the same with `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. `agent.sh` runs only the network config; this arc touches no network spec.

### Phase 1: the record, the opener, the reopen ✓
First measure I6 (scratch, never committed): in the smoke harness, dispatch a toolbar `mousedown` from Firefox's privileged scope and read the preload document's `visibilityState`; log it in `lessons/phase-1.md`.
Files: `utils/own-window{,.test}.ts`, `utils/snack{,.test}.ts`, `popup/index.ts`, `wallet/utils/{onboarding-tab,toolbar-popup,toolbar-popup.test}.ts`, `wallet/index.ts`, `wallet/storage/stored-shapes.scan.test.ts`.
Tests: `captureOwnWindow` strips `opener`; `isCardWindow` for the three flows, not `export`/`import`; `returnToPanel` writes, sends, then closes the window on every answer, with no opener and on a failed send; `closeOwnWindow` hands back in a card window and closes elsewhere; `readHandback` reads once in the panel, nothing elsewhere, never rejects; a bad route drops the record, a bad snack only the snack, and a record with a bad snack is still consumed; consumption waits for arrival on an open session, keeps a record replaced meanwhile, drops another profile's snack unread (with a same-profile control), clears the landing (`postAuthRoute` returns Home afterwards); `showSnack` maps both kinds. Handler: a foreign or non-popup sender is refused; a non-normal opener removes the sender only; a window already gone still reopens; focus within 3 s opens once, none opens nothing (fake timers), with a success control.
Gate: the fast layers. Pass: exit 0; I6 logged.

### Phase 2: the card, the outcomes, the three pages ✓
Files: `components/composite/HandoffCard{,.test}.{vue,ts}`, `components/Header.vue`, `settings/contacts/index{,.test}.{vue,ts}`, `useContactImportExport{,.test}.ts`, `settings/accounts/import{,.test}.{vue,ts}`, `restore-again{,.test}.{vue,ts}`, `composables/useRestoreAgain{,.test}.ts`, the regenerated `types/components.d.ts`.
Tests: `HandoffCard`, CLAUDE.md's ten for an L3. `importContacts`: `undefined` on a cancelled picker and a refused file; `{ snack }` with the shown label after an import, a stopped run, a cancelled and an empty selection. `useRestoreAgain`: full success passes its snack to `leave`, every other end passes none. Per page in a card window: only the card (no header on Contacts); the end calls `returnToPanel` with its route and snack; `undefined` keeps the card; Cancel returns with no snack; a refused account file shows the page with its error. Outside a card window, today's tests pass unchanged.
Gate: the fast layers; `bun run audit:vue`. Pass: exit 0.

### Phase 3: the hand-off e2e, smoke, pictures ✓
File: `tests/e2e/toolbar-panel.test.ts`, the contacts step of "export, restore and the contacts import leave the dying panel…"; FIREFOX.md's panel row if a behaviour it lists changes.
The step: the window shows `handoff-card` and no `contacts-menu-trigger` or header; with `HTMLInputElement.prototype.click` recorded in the window (as `armPanelDeath` records the panel), a trusted press on Choose file clicks a file input while `navigator.userActivation.isActive` (headless cancels that picker and the card stays); the fixture's `pickFile` then feeds a two-contact file; Import selected; from the control page alone, the window is gone, one panel is open and the record is removed; then the panel reads Contacts with "Import completed successfully"; after 3 s no second panel; closed and reopened, it shows Home. Failure modes only a real panel shows: activation lost before the pick, the window not closing, no reopen, a record never consumed. Refusal and Cancel stay at the unit layer: they reuse the same panel boot and handler. Estimate +12 s on the test (29.9 s locally under load for #964); measured.
Gate: Firefox `toolbar-panel.test.ts`, `own-window.test.ts`, `contacts-import.test.ts` at retry 0; the full smoke suite on Chrome and Firefox, each wall-clock before and after; `bun run test:all`; `bun run check:plans` after staging. Pictures, light and dark, in `screenshots/`: the three cards, the reopened panel on Contacts with its snack, the Cancel path, the account import page after a pick (OA-1). Pass: all exit 0, pictures present.

## Security & Adversarial Considerations

- **Threat model.** A picked file still meets `pickFile`'s caps and each parser. The record is wallet-written: a web page cannot reach `chrome.storage.session` (trusted contexts on Chrome, `storage-access.ts`; no content-script access on Firefox) and the manifest exposes no web-accessible page, so no page can open the popup URL with a forged opener. A forged record shows at most a wrong snack on a wallet page: the route is from a closed set, the label is text.
- **The message.** Web pages, content scripts and other extensions fail `isSenderAtUrl`. Only the sender's own popup-type window is ever removed, never a browser window; the opener only names where the popup opens. A same-extension popup window sending it needs a compromised extension page (unsupported, Codex 7).
- **Privacy.** No file contents, file name or path in the record; it dies with the browser session. No new log line but a debug refusal, with no URL or label.
- **Least privilege, crypto, supply chain.** No permission, dependency, credential or cryptography change.
- **Known limits** (closed `known-limit` issues at close-out): a toolbar press dragged off the button runs a preloaded panel that takes the record and is destroyed (I6, D6); two panels shown at once in two browser windows can both show one snack, and a hand-back written between a read and its removal is lost (Codex 3, D4); "Open as Side Panel" (#889) switched on while a card window is open still reopens the panel once, since the reopen points the button back at the popup first; if Firefox refuses that reopen, the record waits for the next toolbar panel, which the sidebar setting does not open; a panel already open when a card window hands back keeps its page (Firefox's `openPopup` returns at once), and the next panel lands on the result once (Codex fix round 1, F1; reopens if the owner asks an open panel to follow a hand-back).

## UI impact

The no-ask record, quoted: P79-01 B, "One card in the window ("Pick the contacts file", why, Choose file, Cancel): finishes the loop, the window closes itself, the panel reopens on the result." (P78-02 settled by it; P79-02: no drop zone.)
- **Firefox hand-off window**, three cards, light and dark. Drafts for the owner's words: "Pick the contacts file", "Pick the account file", "Pick the backup file"; the line "Firefox closes the panel when a file picker opens, so the pick runs here."; Choose file; Cancel. Before: the page the person was on. After: the card alone.
- **Firefox toolbar panel after a hand-off**: before, a click opened Home. After, it reopens by itself on the pick's page with the flow's outcome snack (Contacts; Accounts; Home after a full restore), or lands there next time.
- **The Cancel path**: the panel reopens on the page the pick started from, no snack (OA-2).
- **Account import and Restore again after a pick**: their page in the same window, as today (OA-1). Chrome: none.
- **Signed** on decision page 81, 2026-10-22 (recorded on #1007):
  - P81-01, the card's words: C, "The titles and the two buttons only, no line of why."
  - P81-02 (OA-1), P81-03 (OA-2), P81-04 (OA-3) and P81-05 (OA-4): approve, as built, with no note.
  - P81-06, the Mac check: "Yeap. Worked as described by you, perfectly."

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | The card is a page state in an own window of the card flows; the header hides there | a card route of its own (the File and flow state live in the page) | both agree |
| D2 | Each flow returns its outcome snack; the record holds `{ kind, label }` | the snack on screen (forwards unrelated or stale snacks); an id table (duplicates every builder) | Codex's fix taken; Opus had accepted the screen read with a guard |
| D3 | The background answers, removes the sender's window, then one `openPopup` after `focusReturns` | opening before the close (no focus yet, F8); one attempt with no focus wait (races the OS) | both agree |
| D4 | Compare-then-remove, no lock; the residual is a known limit | a Web Lock over writers and reader | Opus: no lock; Codex: a lock, or a known limit stated accurately |
| D5 | Read before the router, `replaceState`, landing through `postAuthRoute` until first arrival, never fatal | navigating after mount (Home flashes) | both agree, with the landing cleared (Opus 2, Codex 4) |
| D6 | Consume on first arrival on an open session; I6 measured a preload as `visible`, so no visibility wait | consume at boot (an abandoned press loses it) | Codex 1 taken; Opus had judged hover preloads harmless |
| D7 | Accessibility (2026-10-19 delegation): Choose file focused on mount; native buttons; Tab goes Choose, Cancel | no initial focus | both agree |
| D8 | E2E proves activation at the input click; the OS picker is the Mac check | the `FileChooser` event (never fires on Firefox); dropping the press | Codex 5 and Opus 3, merged |
| D9 | Orchestrator condition 1: the outcome snack names its profile and is dropped unread when another profile is active at the reopen; checked at arrival against the live profile, since a boot-time read of the last active profile waits on a running migration (`storageLocalGet`); a return with no snack names no profile and only lands on the page | a known limit (round 1's disposition, superseded) | orchestrator; Codex round 4; as built accepted by the orchestrator on 2026-10-22: the route still lands, since a route from the closed set names nothing of that profile |
| D10 | Orchestrator condition 2: OA-1..OA-4 ship as A and go on the decision page with the card copies, the reopened panel and the Cancel path, as items the owner can change; the PR stays draft until it is signed | waiting for answers | orchestrator |

## Audit verdicts

**Round 1.** Codex (`gpt-6.1-sol`, high, session `01a15f73`): `reject (with blocking findings: premature record consumption, unreliable outcome capture, and incomplete browser-level validation)`. Opus 5.5 Plan: `conditional approve (with conditions: Cancel and back hand back through closeOwnWindow; the landing cleared on first arrival; the e2e picker claim dropped and the Mac check widened; the RETURN_TO_PANEL answer and remove-failure behaviour written down)`.
- Accepted: Codex 1 → D6, I6. Codex 2 → D2, F5. Codex 3 → D4, the known limit restated. Codex 4 and Opus 2, 7 → `readHandback` never rejects, `replaceState`, the landing cleared. Codex 5 and Opus 3 → D8, I3, the Mac check. Codex 6 → the e2e observes from the control page before any panel read. Opus 1 → `closeOwnWindow`'s card branch, tested. Opus 4 → the answer shape, the remove failure, the constant's home. Opus 8 → the exact `settled` rule and the budget. Opus asks a, b → OA-3, OA-1. Opus I5 → I5; F1 nit → F1.
**Round 2.** Codex (resumed): `conditional approve (with conditions: specify removal failure after acknowledgement and compare consumption against the original stored snapshot)`. Both applied: the window closes itself after any answer, the background's removal is best effort; consumption compares the raw stored value, and a record whose snack was dropped is still consumed (a unit case). It found no reason to reopen D4 or the rejected dispositions.
**Round 3.** Codex (resumed): `approve`, no finding.
- Rejected in round 1: Codex 6's refusal and Cancel e2e (no failure mode the unit layer misses; the panel boot and handler are the success path's). Codex 7's registered-id match (needs a compromised extension page). Codex 8 and Opus 6's profile binding, later superseded by the orchestrator's condition (D9).

**Orchestrator approval** (2026-10-21): approved with D9 and D10, and the `{ kind, label }` snack confirmed in place of a snack id. Codex round 4 (resumed, high, on the conditions only): `conditional approve (with conditions: explicitly accept the route-only deviation and specify authenticated profile checks at capture and presentation)`. Applied: the snack is tagged from the originating run, and shown only after the last await on an open session of that profile. Open: the orchestrator's acceptance that D9 drops the snack, not the landing (the arc report asks it).

## Delivery

- One arc, branch `firefox-handoff-1-a1` off `origin/dev` with this plan's commit, one PR against `dev`, not stacked (D-orch-1). Title: `fix(firefox): one card in the hand-off window; the panel reopens on the result` (78 characters). Body: P79-01 B quoted, the asks with their "what ships now", `Closes #1007`, the gates, each browser's smoke wall-clock before and after, the pictures, D7 under the 2026-10-19 delegation.
- Opened after the gates pass and the Codex loop converges, as a draft; it leaves draft when the owner signs the card copies. Never merged by this lane. No labels at creation; `e2e:extension-smoke` only if the path filter skipped smoke. If #889 lands first, merge `origin/dev` and rerun phase 3's gate.
- The owner's Mac check: one press on Choose file opened the picker (contacts, and the account file); the window closed itself; the panel reopened on Contacts with the snack.
- Phases run in order; one sitting, no lanes.

## Post-implementation

The standard at `1362efab8`. Step 1 is absent (`code_review: off`). Step 2 runs once after phase 3 over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding, hard stop at three rounds; one Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Step 3: the draft PR, then `gh pr checks <n> --watch`. Step 4, after the owner's sign-off: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; the known limits filed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green. Step 5, after the merge: `agent-worktree done firefox-handoff-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/firefox-handoff-1/plan.md` succeeds. Open work goes where the standard's table says: an issue, a private draft advisory, or a closed `known-limit` issue.

## Seeds

`/goal` (recommended): `implementations-plan/firefox-handoff-1/plan.md is done: phases 1-3 marked ✓, each backed by its gate reported passing; LESSONS_FILE=implementations-plan/firefox-handoff-1/lessons/phase-N.md printed per phase; the Codex fix loop converged on the arc's diff, quoted; a draft PR against dev with P79-01 B quoted and Closes #1007, opened after the loop; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/firefox-handoff-1 forward per its plan.md (read it and lessons/ first). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol, high) and log each consult. After phase 3, run the Post-implementation loop, open the draft PR against dev, watch checks, report and stop. Never merge.`
