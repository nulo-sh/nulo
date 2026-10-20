---
plan: firefox-files-1
tier: mid
status: closed (one arc against dev, #964; the merge that lands it closes the plan)
issues: "#160"
trunk: dev
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ f5b7fd5a (rechecked at 05313d5e: no planned file moved)
standard: implementations-plan/README.md § Post-implementation standard, read at 175d8268
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** closed. One arc, #964 against `dev` from `firefox-files-1-a1`, out of draft per the orchestrator's brief (D11). Merging it, the owner's call, closes the plan and #160.
- **Owner decisions:** P74-05 A, P74-06 B, P74-07 C, quoted in § Assumptions and the PR; each the option the plan was built on.
- **Shipped:**
  - P74-05 A: from Firefox's toolbar panel, Import contacts, Import account's file choice and Restore again's file choice reopen their page in the wallet's own window, where a second press picks. One guard, `leavePanelFor(route)`, serves them and the existing profile restore (D13). `closesOnFocusLoss` replaces `passkeyNeedsOwnWindow`. `armPanelDeath` records a file picker opened in the panel, and `toolbar-panel.test.ts` (renamed) drives the contacts hand-off.
  - P74-06 B: an accepted encrypted Full Backup reads "Saved to your downloads" over the reminder, with one focused Close in Download's place; the run's secrets go at that moment. Close shuts the toolbar popup, else acts as the back arrow through the shared `goBack`. I1 checked in Chrome (D12).
  - P74-07 C: the contacts export probes every network at once with a 5 s limit, shows `StatusCard` above the list and disables Export while it runs. A refused network's export fell from 12.05 s to about 0.2 s (I3).
  - Evidence: lessons/phase-4.md, lessons/phase-5.md and lessons/phase-6.md (every phase's gate), and the PR's checks.
- **Known limits:** #960 (a PXE built behind an answering node is not bounded by the probe), #961 ("Saved to your downloads" rests on the browser accepting the file).
- **Open items:** none in the repo. OA-1, OA-2 and OA-4 ship their "what ships now" form; OA-3, the owner's Mac check, is listed as pending in #964.
- **Dispositions:** D11 replaces the plan's draft-until-OA-3; the chrome-extension-debug route for I1 is replaced by the driver's CDP session (D12); the known limit 2 reproduction was not attemptable headless (lessons/phase-4.md).
- **Lessons:** none promoted. The smoke-run collision is already the e2e-testing skill's ("Sharding smoke on one host"), the `Button` stub is `lessons.md`'s Vue line, and `lessons.md` is at its budget.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# firefox-files-1: file pickers leave Firefox's toolbar panel, the full backup says it is saved, the contacts export shows its wait

One arc, one PR against `dev`, `Closes #160`, with the owner's three picks (page 74: P74-05 A, P74-06 B, P74-07 C, § Assumptions) quoted in its body; they are the options the plan was built on. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks beyond the page: [OWNER-ASKS.md](OWNER-ASKS.md). Gate log: [lessons/phase-6.md](lessons/phase-6.md).

## Outcome & Quality Bar

- **For whom**: a person on Firefox (a Mac first) who imports contacts, an account file or a backup from the toolbar panel; anyone who saves an encrypted full backup; anyone who exports contacts on a typical profile (Testnet live, Local Network unreachable).
- **Excellent**:
  1. No file picker starts in Firefox's toolbar panel unless the browser refuses to open the wallet's window (then today's in-panel pick runs). Each picker is reached in the wallet's own 380x660 window, on the page the person was using. Proven in a real Firefox panel with the Mac focus behaviour, which records any picker started in the panel.
  2. After an encrypted full backup is handed to the browser, the page says so and offers one Close, which closes the toolbar popup or panel and elsewhere does what the page's back arrow does. The backup's secrets leave page memory at that moment, not at unmount.
  3. A contacts export's node check costs at most one probe limit (5 s) per run instead of 6 to 60 s, and a working card with Export disabled shows for as long as the export runs.
- **Good enough**: the hand-off reuses the passkey flows' window as is; the done state reuses the existing banner; the card is the full backup's card, shared. No new screen, setting or copy beyond the page's records; the plain passkey file and the other open points wait in [OWNER-ASKS.md](OWNER-ASKS.md).

## Assumptions

**Facts** (verified at `f5b7fd5a`; recon has the evidence; both audit legs re-checked F1-F8):
- F1 `passkeyNeedsOwnWindow()` = `isFirefox() && isToolbarPanel()`, and `isToolbarPanel()` is `chrome.extension.getViews({ type: "popup" }).includes(window)` (`utils/browser-surface.ts`). Nothing about it is passkey-specific; its callers are `auth.vue`, `useProfileCreateFlow.ts`, `useProfileImportFlow.ts`, `import.vue`, `export/full.vue`.
- F2 `OWN_WINDOW_ROUTES` lists `export` and `import`. A window booted on another route is no own window: after an unlock it lands Home, and its back arrow walks history instead of closing it.
- F3 Production `pickFile` callers reachable from the panel: contacts import (`useContactImportExport.ts:156`, with `delay`: the input is clicked 50 ms after the press), account-file import (`settings/accounts/import.vue:65`), restore-again (`useRestoreAgain.ts:144`), and the profile restore, which already moves for every backup kind (`import.vue:151`). The report's "only a passkey restore moves" does not hold; restore-again is the full-backup restore still exposed.
- F4 `SettingsPageShell` and `CollapsingHeroLayout` both render `SubPageHeader`, whose back closes an own window, else walks history, else goes to `backTo` (`SubPageHeader.vue:36-48`).
- F5 `runDownload` resolves once `chrome.downloads.download`'s callback reports no error, which Chrome documents as the download's start, not its completion; the 2 s snack and `markGetStarted` follow, fenced by `ctx.runs.snapshot()`. `backupStatus` stays `encrypted` (or `finished` after a passkey profile's plain file) and Download stays pressable.
- F6 The extension ships Chrome's side panel on the same page (`manifest/manifest.config.ts:32`); no code detects it.
- F7 `getSendersAcrossActiveNetworks` checks networks in turn with the retrying `getNodeStatus`; `probeNodeStatus(id, ms)` is one attempt bounded at `ms` (100..30 000) and throws before its own `try` on a bad or foreign id (`network/service.ts:948-951`). A network not yet bound builds its PXE inside `getSenders`, with node calls no probe bounds.
- F8 PR #944 does not touch `own-window.ts`; its restart-ended routes are `#/windows/*`, which own windows never use.

**Inferences**:
- I1 Chrome lists its action popup under `getViews({ type: "popup" })` and not the side panel or a tab. Unit tests check only the code; phase 4's gate checks Chrome itself once with the chrome-extension-debug skill (the real action popup and side panel) and records it in `lessons/phase-4.md`. A wrong answer would send the side panel down `window.close()`.
- I2 A press in the own window opens the picker on Firefox: a normal top-level document with user activation, and the 50 ms timer of F3 runs inside it. Headless Firefox cannot show it (FIREFOX.md); the owner's Mac check (OA-3) is the proof.
- I3 With the probe, an unreachable network costs nothing when refused and 5 s when silent; a live, bound network costs its `getSenders`. Measured in phase 5 in `contacts-import` (both networks refused) and `network/senders-advanced` (a live, bound network).

**Decisions** (decision page 74, 2026-10-20, recorded on #160; each is the option the plan was built on, so no phase changed):
- A1 **P74-05**, where a file import runs on Firefox's toolbar panel: option A, "The wallet's own window: on Firefox's toolbar panel, Import contacts opens Contacts in the 380x660 window and you press Import contacts once more there. The same hand-off for the account-file import and a password profile's full-backup restore from the panel, the other file pickers." (phases 1, 2)
- A2 **P74-06**, the full backup page after its download: option B, "A done state: the card reads "Saved to your downloads" with the password reminder, and one Close button replaces Download Backup; a second download is no longer offered." (phase 4)
- A3 **P74-07**, the contacts export's wait: option C, "Both: the bounded check and the card." (phases 3, 5)
- A4 → OA-1, OA-2, OA-3, OA-4 ([OWNER-ASKS.md](OWNER-ASKS.md)): what the page's records do not settle, unanswered. Each ships its "what ships now" form, which keeps today's behaviour.

## Architecture & Implementation

**The predicate (F1).** `utils/browser-surface.ts` exports:
- `isToolbarPopup()`: the document is the browser's toolbar popup (Chrome's action popup; Firefox's toolbar or unified-extensions panel): today's private `isToolbarPanel`, exported and renamed for both browsers.
- `closesOnFocusLoss()`, replacing `passkeyNeedsOwnWindow()`: `isFirefox() && isToolbarPopup()`. Its comment states the one cause: Firefox closes its toolbar panel when another window takes focus, an OS passkey prompt (Mozilla bug 2026687) or a file picker. Every caller is renamed; behaviour is unchanged.

**Own windows (F2).** `OWN_WINDOW_ROUTES` gains `contacts: "/popup/settings/contacts"`, `accountImport: "/popup/settings/accounts/import"`, `restoreAgain: "/popup/restore-again"`. Each key is its own flow (`nulo:own-window:<key>`, under the allowlisted session prefix), so each flow has one window and a second start focuses it. The header comment widens to the two causes.

**The hand-offs, at the press** (the record's "press … once more there", the same for all three). Each page's picker handler starts with `if (closesOnFocusLoss() && (await moveToOwnWindow(OWN_WINDOW_ROUTES.<key>))) return`, then runs today's pick:
- `settings/contacts/index.vue`: the Import item's handler, then `importContacts()`; the composable stays surface-agnostic.
- `settings/accounts/import.vue`: `handlePickFile`. In an own window the confirmed import replaces to `/popup/settings/accounts` instead of `router.back()`, which after a lock-screen boot would land on `/popup/auth` and bounce to an empty form (`route-guard.ts:33`).
- `restore-again.vue`: a page handler wraps `pickBackupFile`; `start()` stays in `onMounted` (nothing races it, since the move waits for the press).
A refused move falls through to today's pick: on a Mac the panel dies as today, elsewhere the pick may work (the press's activation may have lapsed over the awaited calls); a refusal with nothing on screen would be worse, and a message would be new copy. Nothing typed is carried: each picker is the page's first step. In the window the person presses the control again (Firefox wants the gesture, I2).

**The working card.** `components/composite/StatusCard.vue` (L3, no service or store import): props `title` (required), `description` (optional); today's `full.vue` markup and styles verbatim (`role="status" aria-live="polite" aria-atomic="true"`, the 28 px accent spinner `aria-hidden`, `type--row-title` at 16 px, a site-sized role, and `type--body`); `data-testid` falls through. `full.vue` drops its private block and CSS for it, keeping `backup-status-card` and both texts.

**The done state (A2 B, an encrypted file).** In `useFullBackupExport.ts`:
- `BackupStatus` gains `"downloaded"`. `runDownload`, on an accepted **encrypted** download of the current run: `markGetStarted` and the snack (unchanged), then `backupStatus = "downloaded"`, `isDownloading = false`, then `discardRun(ctx)`: the artifacts and passwords have no reader once no second download is offered. A plain passkey file keeps today's page (OA-1); a refused or superseded download changes nothing.
- `canDownload` is false in `downloaded`; `onKeydown`'s switch starts nothing there.
- `full.vue`: the done `Banner` shows in `encrypted` (today's title) and in `downloaded` with the title "Saved to your downloads"; the reminder text stays in both. In `downloaded` the bottom renders one `Button variant="cta" data-testid="backup-close-btn"` "Close" instead of Download.
- Close: `isToolbarPopup()` → `window.close()`; otherwise `goBack(router, "/popup/settings/security/export")`, the page's back arrow (an own window closes, else history back, else the Backup page). `goBack` is `SubPageHeader`'s `handleBack` moved to `utils/page-back.ts`, which both call, so the two cannot drift. The page record's "the popup goes back to Settings → Security" (option A) and "back to Settings" (the side panel) name this route: its path is `settings/security/export`, titled Backup.
- Keyboard and focus (the 2026-10-19 delegation): Close mounts in place of the focused Download, so a template ref focuses it after `nextTick`; it carries `@keydown.enter="refuseRepeatEnter"`, since a held Enter on Download would otherwise press it (CLAUDE.md § Keyboard).

**The bounded sender read (A3 C).** In `AccountStateService.getSendersAcrossActiveNetworks`: probe every chain-unique network at once with `probeNodeStatus(n.id, SENDER_PROBE_TIMEOUT_MS)` (5 000, the wallet's other single-attempt probes' limit), each probe caught on its own (a throw counts as not Active and logs today's skip line), then read `getSenders` for each Active network in turn, each in its own `try` as today. The doc comment states the trade: a network slower than the limit exports its contacts as `isSender: false`. The PXE build of a probed, unbound network stays unbounded (F7): the card shows it; known limit (§ Security).

**The export's running state.** `useContactImportExport` returns `exporting: Ref<boolean>`, true from the press to the export's `finally`; a press while it runs starts nothing. `contacts/index.vue`: Export is disabled while `exporting`; `<StatusCard v-if="exporting" title="Exporting your contacts" description="Gathering your contacts into a file." data-testid="contacts-export-status-card" />` sits above the list (the page's placeholder copy).

**Trade-offs** (the ledger has the panel's views): outline B's hand-off in `pickFile` (a DOM util would gain route and window knowledge and disguise the move as a cancel, which `useRestoreAgain.ts:144-151` acts on); a sibling predicate (two names for one cause); a separate `saved` ref (`canDownload` and the Enter case stay live beside it); a deadline around the whole read (it abandons a PXE build it cannot cancel and marks a healthy cold network's senders false); adapting `LoadingState` (five pages change look); tracking the download to completion (§ Security, known limit).

## Phases

Every gate also runs the fast layers: `bun run lint`, `bun run typecheck:all`, `bun run test` (pass: exit 0). Smoke e2e runs at retry 0: `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e <file>`; Firefox: the armed `build:firefox` and env FIREFOX.md names, then `NULO_E2E_BROWSER=firefox` on the same command. Network: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/<file>.test.ts`.

### Phase 1 ✓: one predicate, three own-window routes
Files: `utils/browser-surface{,.test}.ts`, `utils/own-window{,.test}.ts`, the five F1 callers and the test files that mock the predicate (`useProfileCreateFlow`, `useProfileImportFlow`, `onboarding/pages/create`, `auth`, `import`, `import.passkey-notice`, `full-passkey.pins`), the regenerated auto-import files.
Tests: `isToolbarPopup` true on a popup view and false outside one; `closesOnFocusLoss` keeps today's four cases; `test.each` over the three new routes: a marked boot is an own window and `postAuthRoute()` returns its route (the report's Home landing); a second `moveToOwnWindow(contacts)` focuses the registered window.
Gate: the fast layers. Pass: the renamed cases pass with their assertions unchanged.

### Phase 2 ✓: the three hand-offs
Files: `settings/contacts/index{,.test}.{vue,ts}`, `settings/accounts/import{,.test}.{vue,ts}`, `restore-again.vue` and a new `restore-again.test.ts`; `tests/e2e/fixtures/browser/firefox-action-popup.ts` and FIREFOX.md's panel row; `tests/e2e/passkey-toolbar-panel.test.ts`, moved by `git mv` to `toolbar-panel.test.ts`, with its eight references (FIREFOX.md, the e2e-testing skill twice, four spec headers, PRF-NON-PORTABLE.md).
Tests: per page, a press in the panel moves and starts no picker; outside it, the pick runs; a refused move falls through to the pick; the account import in an own window replaces to Accounts. `armPanelDeath` also records a file input's `click` or `showPicker` in the panel (kind `file`), as the OS picker would take focus; `PanelDeathRecord.calls`' doc and the four assertion messages that say "WebAuthn calls" are reworded in the same commit. E2E: in the panel test that already moves export and restore, one more step: press Import contacts in the dying panel; the window lands on `#/popup/settings/contacts?window=own`, the panel is gone, and the record holds no call. Failure mode: the panel starts the picker in itself and dies with it on a Mac; only a real panel shows the Contacts route opening the window, and with the record a regression's timeout message names the picker. The in-window import is `contacts-import`'s, on the driver's seam. Estimate +10 s.
Gate: the fast layers; Firefox `toolbar-panel.test.ts`, `own-window.test.ts`, `contacts-import.test.ts`; Chrome `contacts-import.test.ts`. Pass: exit 0 at retry 0; the test's runtime before and after.

### Phase 3 ✓: the working card, shared
Files: `components/composite/StatusCard{,.test}.{vue,ts}`, `export/full.vue`. Tests: CLAUDE.md's ten for an L3 composite (title; description shown and absent; `role`, `aria-live`, `aria-atomic`; the spinner's size, colour and `aria-hidden`; the testid; the two type roles; reactive text); `full.test.ts` unchanged.
Gate: the fast layers; Chrome `passkey-backup.test.ts` (it watches `backup-status-card` and its texts); the card's capture in both themes before and after equal. Pass: exit 0; equal pairs.

### Phase 4 ✓: the full backup's done state
Files: `composables/useFullBackupExport{,.test}.ts` (`SENTINELS` covers the new status), `export/full{,.test}.{vue,ts}`, `full-passkey.pins.test.ts`, `components/ui/SubPageHeader.vue`, `utils/page-back{,.test}.ts`, `tests/e2e/security-backup.test.ts`.
Tests: the composable: `downloaded` only after the current run's accepted encrypted download; a plain passkey download keeps `finished` and Download; a refused download keeps the status and Download; a download superseded by a profile switch publishes nothing; after `downloaded` the artifacts and passwords are gone and a second `downloadBackup` writes nothing. The page: the swap (title, reminder, Close in place of Download, Close focused, a repeat Enter refused); Close in the toolbar popup calls `window.close()`, elsewhere `goBack`. `goBack`: own window, history, `backTo`, Home, in that order. E2E: `security-backup` asserts the done state after `downloadEncryptedBackup` (Close shown, Download gone) and moves its shot to it. Manual: I1 in Chrome's real action popup and side panel.
Gate: the fast layers; Chrome and Firefox `security-backup`, `passkey-backup`, `backup-roundtrip`. Pass: exit 0 at retry 0; I1 recorded.

### Phase 5 ✓: the contacts export, bounded and shown
Files: `wallet/services/account-state/service{,.test}.ts` (`FakeNetworkService` gains `probeNodeStatus`), `useContactImportExport{,.test}.ts` and the three sibling suites' mocks, `settings/contacts/index{,.test}.{vue,ts}`.
Tests: the service: every network is probed with the limit and none waits on another; `getNodeStatus` is never called (a per-test spy that never answers; `backup()`'s tests keep the fake as is); two probes that answer at the limit finish in one limit (fake timers); Inactive, InvalidChain and a throwing probe each skip only their network; an Active one's senders join. The composable: `exporting` true until the download settles, false after a success and a failure; a stalled sender read keeps it true and a second press downloads nothing. The page: the card and the disabled Export while `exporting`.
Gate: the fast layers; `bun run test:all`; Chrome and Firefox `contacts-import.test.ts` and network `senders-advanced.test.ts`, each export's time recorded (I3). Pass: exit 0 at retry 0.

### Phase 6 ✓: arc gate and pictures
`bun run audit:vue`; `bun run test:all`; the full smoke suite and the full network suite (`bun run e2e:agent`, one run at a time) on Chrome and Firefox, each wall-clock recorded; `bun run check:plans` after staging. Pictures, light and dark: the own window on Contacts after the hand-off (Firefox); the done state (Chrome popup 360x600, Firefox panel); the running card (Chrome popup, held by the capture spec alone, for example a page-realm stub of the sender read; no hook in shipped code). The shots lane's specs (`~/.cache/nulo-backlog/shots-p74/specs/`) show how the panel is drawn. Pass: all exit 0; pictures attached to the PR.

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary. A picked file still passes `pickFile`'s byte caps and each page's parser. An own window's URL carries the route and the marker; the three new routes carry no query. The popup page is not web-accessible, and a marked URL in a tab never registers (`register` wants a popup-type window).
- **Secrets in memory.** The done state releases the export's plaintext artifacts and passwords at the download, not at unmount: a shorter exposure. References are dropped; nothing is erased.
- **The sender read.** The probe is one attempt with `makeSingleAttemptFetch`'s response cap, to endpoints the wallet already calls. A configured endpoint that stalls the probe now costs 5 s, and its network's contacts export as non-senders (the owner's stated price). One that answers the probe and then stalls a cold PXE build still holds the export.
- **Known limits, filed at close-out as closed `known-limit` issues**: (1) that cold PXE build (reopen on a report of an export that outlives its card's welcome, or a cheap way to bound the build); (2) "Saved to your downloads" rests on the browser accepting the file: a Save As dialog cancelled in a surface that outlives it, or a write that fails later, leaves the page saying saved, and the person exports again. Phase 4 tries Chrome's "ask where to save" setting in the side panel; a reproduction there makes it a plan change (a `downloads.onChanged` watch per download: a listener, its removal on settle and dispose, an already-complete check), which stops for approval. The flows also inherit #352 (a second window when the panel restarts a flow during a window's boot) and #728 (a toolbar popup a download closes never shows the done state); both closed limits' reopening conditions cover them.
- **Least privilege, crypto, supply chain.** No permission, dependency, credential or cryptography change.
- **Logging.** No new log line beyond the skip the read already logs; no URL or address reaches one.

## UI impact

The lane brief's records are the whole visible budget:
- Settings → Contacts, Settings → Accounts → Import account, Restore again, from Firefox's toolbar panel: P74-05 A, "The wallet's own window: on Firefox's toolbar panel, Import contacts opens Contacts in the 380x660 window and you press Import contacts once more there. The same hand-off for the account-file import and a password profile's full-backup restore from the panel, the other file pickers." After the import the window shows each page's existing next screen (OA-2).
- Settings → Backup → Full Backup after an encrypted download: P74-06 B, "A done state: the card reads "Saved to your downloads" with the password reminder, and one Close button replaces Download Backup; a second download is no longer offered." Close's rule follows the record's surface text (Chrome's side panel "back to Settings"). A plain passkey file: today's page (OA-1).
- Settings → Contacts during an export: P74-07 C, "Both: the bounded check and the card.", with A's "a working card above the list (copy is a placeholder) and Export contacts disabled while it runs."
- Full Backup's working card (phase 3): none; the same markup and pixels.

Pictures of the result, light and dark (`screenshots/`): `contacts-own-window-firefox-*.png` (the Contacts window the panel's Import contacts opens), `backup-done-chrome-*.png` and `backup-done-firefox-panel-*.png` (the done state, Close focused), `contacts-export-running-chrome-*.png` (the export's card, held 5 s by a node that never answers).

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | Per-page hand-off; a refused move falls through to today's pick | outline B (in `pickFile`); returning with nothing on screen | both prefer A over B; Codex: return on refusal, rejected (a refusal leaves nothing working; a message is new copy) |
| D2 | Rename to `closesOnFocusLoss`, export `isToolbarPopup` | a sibling predicate | both agree |
| D3 | One flow key per route | one shared flow | both agree |
| D4 | `downloaded` in `BackupStatus` for an encrypted file; scrub at the download | a separate `saved` ref; a plain-file done state before OA-1 | both prefer the status; the plain file waits (Codex C9, Opus Ask a) |
| D5 | Close: toolbar popup `window.close()`, else the back arrow's `goBack` | `router.replace` to Backup (Opus: Back then repeats the page) | Opus's fix; Codex agreed on the fallback's destination |
| D6 | Parallel probes at 5 s, each caught; `getSenders` in turn; cold PXE build a known limit | a deadline around the read (outline B) | both prefer A |
| D7 | `StatusCard` L3 from `full.vue` | adapting `LoadingState` | both agree |
| D8 | Rename the panel spec, add one step to its existing move test, record file pickers in `armPanelDeath` | a new scenario with an in-window import (repeats `contacts-import`, cannot prove I2) | Opus's trim plus Codex's no-picker assertion |
| D9 | Hand-off at the press on all three pages | at page open for the account import and restore-again | Opus: the record's literal reading; Codex: page-open races restore-again's `start()` |
| D10 | "Saved" on acceptance, a known limit with a reproduction attempt | a `downloads.onChanged` watch now | Codex: prefer a wording ask to a new lifecycle; Opus: the cost is one more export |
| D11 | The PR leaves draft (`gh pr ready`) once CI starts, with OA-3's Mac check listed as pending in its body | draft until OA-3 passes (audit round 2) | the orchestrator's arc brief, which supersedes the plan; merging stays the owner's call |
| D12 | I1 checked through the e2e driver's CDP session against the armed Chrome build | the chrome-extension-debug skill (no DevTools MCP in the implementing session) | same Chrome, same build; [lessons/phase-4.md](lessons/phase-4.md) |
| D13 | `leavePanelFor(route)` in `own-window.ts` for the four panel hand-offs, the profile restore's included | the guard pasted on each page | implementation review, Opus Low 1 |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a15a4d`): `conditional approve (with conditions: fix the unsafe fallback and reminder condition; resolve download wording and owner asks; strengthen browser validation)`. Opus 5.5 Plan: `conditional approve (with conditions: Close through history, refuseRepeatEnter and a ref focus, trim the e2e into an existing panel test, split rather than time out passkey-backup, measure I3 on a live network, surface the asks)`. Dispositions (C = Codex, O = Opus):
- Accepted: C2 the reminder condition → moot, the done state covers only an encrypted file, whose reminder always shows. C3 → F3 names the 50 ms timer; I2 rewritten. C4/O-security → F5 corrected, known limit (2) with a reproduction attempt, OA-4. C5/O-Ask a → D9 (at the press). C6/O5 → D8. C7/O6/O7 → per-probe catch, I3 measured on both paths, the security claim narrowed. C8 → I1 checked in real Chrome (phase 4), full smoke on both browsers (phase 6), network `senders-advanced` on both. C9 → every OWNER-ASKS entry ships today's behaviour. O1 → D5. O2 → the ref focus and `refuseRepeatEnter`. O3 → the account import replaces to Accounts in an own window. O-Ask b → OA-2; O-Ask d → OA-3; O-nit → `SENTINELS`.
- Rejected: C1 returning on a refused move (D1's reason). O4 splitting `passkey-backup`: moot, a plain file keeps today's page, so the spec's plain-then-encrypt flow is unchanged. O-Ask c: the record's "Settings → Security" names the Backup route (D5), no ask. O-Ask e (the card flashes): a picture shows it held; the running time is the probe's.

**Round 2.** Codex (resumed): `conditional approve (with conditions: enforce the Mac acceptance check and restore the full network validation gates)`. Both accepted: the PR stays a draft until the owner's Firefox check (OA-3) passes on its build; phase 6 runs the full network suite on both browsers. Opus (resumed): `approve`, three Low notes, all accepted: the running card's picture is held by the capture spec alone; phase 2's failure mode is the timeout's message naming the picker; the panel record's doc and assertion labels follow the new kind.

**Final pass** (fresh Codex session `01a15a70`, gpt-6.1-sol, high): `approve`, no new material finding. One Low note applied: D1's fallback "may work" rather than "works". It judged D10's known limit proportionate, D5's shared `goBack` and D9's per-page hand-off right, D6's parallel caught probes sound, and the layers economical. Approval does not authorize the pending UI choices (A1-A3, OA-1..OA-4).

**Implementation review** (whole diff, `git diff origin/dev...HEAD`; [lessons/phase-6.md](lessons/phase-6.md)). Round 1: Codex (gpt-6.1-sol, high, session `01a15ab1`) `approve`, no finding; Opus 5.5 (`general-purpose`) `approve`, two Low notes, both applied (D13; the probe's log line names the probe). Round 2 (resumed, the fix commit): `approve`. Round 3 (resumed, now carrying the standard's two verbatim rules, which rounds 1 and 2 had left out): `changes requested`, three Low comment findings, all applied (the download latch's ordering stated, `StatusCard`'s header cut, three narrating comments deleted). The loop ended at its three-round stop with no material finding open.

## Delivery

- One arc, branch `firefox-files-1-a1` off `origin/dev` with this plan's commit, one PR against `dev`, not stacked (D-orch-1). Title: `fix(firefox): file pickers leave the toolbar panel; backup done state; contacts export wait` (91 characters). Body: the three picks quoted, the OWNER-ASKS answers applied or still pending, `Closes #160`, the validation runs, each browser's smoke wall-clock before and after, the pictures, the accessibility calls (D5's focus and repeat-Enter) under the 2026-10-19 delegation.
- A draft until the picks are quoted and the owner's Firefox check (OA-3) passes on the PR's build; Chrome's check is separate and blocks nothing. Opened without labels, then `e2e:extension-smoke` only if the path filter skipped smoke.
- Phases run in order (phase 2 needs phase 1, phase 5 phase 3). No lanes: one sitting.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `175d8268`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once, after phase 6, over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three rounds. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- Step 3: the PR (Delivery), then `gh pr checks <n> --watch`.
- Step 4, the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome block; the two known limits filed as closed `known-limit` issues; the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green after staging.
- Step 5, after the merge: `agent-worktree done firefox-files-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/firefox-files-1/plan.md` succeeds.

| Where open work lives | Home |
|---|---|
| Work inside the arc | this plan and its PR |
| A bug, gap or deferred refactor that outlives the plan | a GitHub issue with a `Record` link |
| A product call, or a wait outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft advisory, recorded here as "tracked privately" |
| A path needing unsupported conditions, or a consequence that does not matter | a closed `known-limit` issue |

## Seeds

`/goal` (recommended): `implementations-plan/firefox-files-1/plan.md is done: phases 1-6 marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/firefox-files-1/lessons/phase-N.md printed per phase; the Codex fix loop converged on the arc's diff, quoted; the PR exists against dev with the picks quoted and Closes #160, opened after the loop, with gh pr view output in the transcript; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/firefox-files-1 forward per its plan.md (read it and lessons/ first; plan.md is the state). Pick the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. A phase is green only when its gate passes as written. After phase 6, run the Post-implementation loop, open the PR against dev as a draft until the picks are quoted, watch checks, report and stop. Never merge.`
