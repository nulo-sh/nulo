---
plan: lock-window-1
tier: mid
status: completed; arc 1 merged (#1272), arcs 2-3 delivered (#1289, #1291) with this close-out
issues: "#1183 #1225 (arc 1, merged), #1138 (arc 2), #1218 (arc 3, closed by the close-out); #1186 did not hold"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: three sonnet explorers; Codex gpt-6.1-sol at high (dual audit, resumes, two fresh final passes); one Opus Plan leg
base: origin/dev at 78f5f9171 (arcs 2-3: origin/dev at d1165460c, arc 1 merged)
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- Date: 2026-10-28.
- Status: completed, delivered as a stack on `dev`: #1272 (arc 1, merged as d1165460c), then #1289 (arc 2), #1291 (arc 3) and this close-out, awaiting the merge.
- Shipped:
  - #1272: on a profile switch the lock screen's password field is empty and masked; on a lock the Account and Recovery phrase backup pages go back to their first step, and Recovery phrase also on a switch; a second reveal's countdown is never shown disabled. Closes #1183 and #1225.
  - #1289: a worker restart over an import or a profile create that had opened its session ends the flow on the lock screen and releases its own window; the completions stop at a synchronous fence once the shell ended them. Closes #1138. The #1138 action-list replay is red on the base and green on the fix.
  - #1291: a fee payer's address edit re-reads its row under the service's lock, and the Edit popup keeps a rename another window made meanwhile; a protocol discovery that a network reset or removal ended logs at debug.
- Kept as recorded exceptions: the other #1218 sites, background writes that record work already done and writes a person or a dApp asked for (D1-D4; the owner, OA-1: A), stated in #1218's dispositions comment.
- Did not hold: #1186 (D10), answered on the issue.
- Superseded: the poller fence and KL-2 (alternative F); the seeder's session guard (alternative E); the issue's seed 1003 replay, replaced by a hand-trimmed action list (Phase 2, step 6).
- Lessons: none promoted. `lessons.md` holds 8183 of its 8192 bytes and none of its entries is superseded; the candidates stay in [lessons/phase-2.md](lessons/phase-2.md) and [lessons/phase-3.md](lessons/phase-3.md).
- Known limits: #1293 (KL-3), #1294 (KL-4).
- Open items: none from this lane. #1218 closes when this stack lands (OA-1 A recorded, OA-3 and D11 built).
- Seeds retired: the `/goal` and `/loop` seeds below. Do not run them.

# lock-window-1: screens that outlive a lock, and writes that do

Three arcs and a docs-only close-out, stacked on `dev`. Arc 1 (merged as #1272) makes the lock screen and the two export pages drop what was typed or revealed under a session once it ends or the profile changes. Arc 2 lands an import, a New profile or a first-profile create that a worker restart overtook on the lock screen. Arc 3 makes a fee payer's address edit save over the row as it stands at the write, and logs a discovery that a network reset ended at debug. Every other #1218 site is a recorded exception; the close-out closes #1218. The owner answered every ask on 2026-10-27: "ok go with your proposals, fix all." Evidence: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Findings and dispositions

Every path is a code trace at the base (recon.md § Claims checked). The rule the #1218 dispositions follow: **a background write that records the outcome of work already done lands**, because a refused one leaves a row that no later run is sure to repair. Each background site below is such a write; the first final pass showed that even the poller, which looked retryable, is not (D1).

| Site | Path | Label | Disposition |
|---|---|---|---|
| B1 tx poller | a batch starts under session S; the receipt read or finality proof resolves after a lock; the commit seals and writes under the kept row keys (#1055) | plausible, traced | kept (D1) |
| B1b | a profile switched away keeps its rows polled under the new session, on its own endpoint | demonstrated by a pinned test | kept (D2) |
| B2 authwit reconcile | follows a tx commit; its only second chance is the Finalized commit | traced | kept (D3) |
| B3 seeder markers | a pass starts under S; a marker write lands after a lock: the attempt record, a preview's verdict (`seeder.ts:549-557`), the marker after a landed persist | traced | kept (D4) |
| B3' seeded row | the lock lands inside `persistToken` (local reads and two writes, no fetch) | traced | known limit KL-4 (D4) |
| B4 stale row | `updateFpcAddress` writes the row it read before its PXE calls | traced | **arc 3** (D5; owner, OA-3: fix) |
| B5 registry status, revoke prune | mirror a proven tx; the popup reads only the stored status | traced | kept (D3) |
| B4, B6-B9 person or dApp asked | the write lands after a lock; refusing it removes the row after unlock | traced | kept (owner, OA-1: A) |
| B9 incoming cursor, journal create | the reset runs once per added account; the record is of work the person started | traced | kept (D3) |
| #1218 "Also": discovery log level | a network reset deletes the network between discovery's liveness check and its fenced write; the catch logs warn and error while the session is live (`fpc/service.ts:194-202`) | traced | **arc 3** (D11) |
| #1183 | type for A, pick B, pick A: the text is back and Continue is on | demonstrated (agent session) | **arc 1** (D8) |
| #1225 | a lock that leaves the export page mounted keeps the typed passwords, the approval and the words | traced | **arc 1** (D9) |
| #1138 | restore finalizes, the worker restarts, the reconnect settles, `awaitProfileActivation` resolves on the stale flag: Home with no session | demonstrated (chaos seed 1003, 2 of 2) | **arc 2** (D7), widened to New profile and the first-profile create (D14; owner, OA-2: A) |
| #1186 | SECURITY.md already says a lenient session persists a bearer under either unlock (#1142, 518170a18) | did not hold | a comment on the issue (D10) |

## Outcome & Quality Bar

For a person who locks the wallet, lets it lock, or switches profile while a page is open, and for the maintainer who reads the chaos oracle O3 ("no write for a profile that is locked out"):
- A secret typed or revealed under a session is gone from the page once the session ends or the profile changes, and the page shows its first step, as Unlock method does. A second reveal after the reset behaves like the first, its auto-close included.
- An import, a New profile or a first-profile create whose session a restart dropped lands on the lock screen, never on a Home with no session.
- A fee payer's address edit never brings back a fee payer removed meanwhile, nor drops a rename made meanwhile.
- Every #1218 site carries a written disposition on the issue, so an O3 hit on a `txs`, `authRegistry` or `tokenSeeded` row reads as a recorded exception with its reason, not a new bug.
- Good enough: the person-asked sites stay as they are (the owner, OA-1: A); the chaos harness is not extended, and whether O3 encodes the exceptions is the chaos plan's call.

## Architecture & Implementation

### Arc 1 — the lock screen and the export pages (#1183, #1225)

- `export/account.vue` (D9) calls the existing `watchLockStart(() => appStore.isLogined, …)` (`popup/locked-state.ts:164-172`; fires on true → false, `flush: "sync"`, never on mount) with what its profile-type watcher runs: `resetFlow()` (which drops the approval, the file password and the payload) then `applyQueryPreselect()`.
- `export/seed.vue` (D9) gets `resetReveal()`, run by `watchLockStart` and by a new profile-id watcher, as `account.vue`'s is. It invalidates `revealFence`, clears `words`, `password` and `isWrongPassword`, sets `isStarted` and `isUnlocked` back to false and calls the countdown's `clear()`. It never navigates: `handleClose` would race the lock landing. A reveal that settles after a switch is discarded, so it marks no profile's "phrase saved" either; the comment at `seed.vue:86` is rewritten to say the read asks for the profile the reveal began under. `unlock-method.vue` and `change-password.vue` stay as they are.
- `composables/useSecretCountdown.ts`: `start()` also sets `isAutoCloseDisabled` back to false: a countdown it arms is never shown as disabled. Today `start()` runs once per mount (`seed.vue` `showWords`), so nothing a person sees changes; the reset makes a second reveal possible, and without this the second countdown would fire under a hidden timer after an earlier "keep open". `start()` already replaces `closeDeadline`.
- `pages/auth.vue` (D8): the profile-id watcher (`:322-327`) also clears `password`, clears `isWrongPassword` and sets `isPasswordType` back to masked, but only when the previous id was defined. On a `known: false` mount, the first profile's arrival clears nothing.

### Arc 2 — an import or a new profile a restart overtook (#1138)

- `popup/lock-landing.ts` (D7, D14): `LockLandingState` gains two raw facts: `holdsSession` (the shell's `isLogined`) and `onOpeningRoute` (a route whose flow opens a profile's session: `popup-import` and `popup-profile-new`; New profile and the first-profile create are both `popup-profile-new`, reached from the lock screen's chooser and from Register). After the `!hasProfile` branch, `decideLockLanding` returns a new action, `end-flow`, when `holdsSession && onOpeningRoute`, so every branch stays unit-testable. `app.vue` fills both fields from `appStore.isLogined` and `route.name`. Its `end-flow` ends the opening flows (below), releases the own window, then runs `lock`: `lockedState.enter`, which clears `isLogined` and lands on the lock screen with the shell's profile selected. Released, an own import window's unlock goes Home; kept, `followOwnRoute` holds the flow across the lock screen and `postAuthRoute` would mount a fresh import form (`own-window.ts:160,168`). The header comment gains one sentence: a flow past the moment it opened its profile runs over that session.
- `popup/opening-flow.ts` (new, D16): one module-level run fence (`createRunFence`). `endOpeningFlows()` invalidates it; `openingFlowLive()` gives a page a snapshot at setup. The landing's navigation is not awaited (`app.vue` `route: (path) => router.push(path)`), so a completion that settles before it commits still sees its own route; the fence tells it synchronously that the shell owns the window.
- `pages/import.vue` (D7, D16): takes `openingFlowLive()` at setup and sets an `isUnmounted` flag in `onBeforeUnmount`. After its wait, `completeImport` releases no own window, shows no toast and pushes no route once the flow was ended or the page has gone. The shell's landing owns the route by then, and Home's restore banner (`utils/restore-outcome.ts`) carries a skipped account state after the unlock.
- `pages/profile/new.vue` and `new-profile-helpers.ts` (D14, D16): the page passes `flowLive: openingFlowLive()` in the helper's deps. `handOffCreatedProfile` returns before any routing once the flow is ended, as it does once the page has left (`left()`), and shows no toast after its awaited navigation once the flow is ended. The open path needs nothing new: its next `assertActive` reads the `isLogined` the lock cleared and hands off, which then returns. An ordinary lock in that tail keeps today's hand-off: the fence moves only on `end-flow`.
- `tests/e2e/helpers/profile-chaos/restart.ts` and `network-drivers.ts` (D17): `restartBackground` takes whether the page's flow opened its session, and `restoreHeld`'s `compete` passes `p.stage === "account-state"`. An opened flow's page expects the lock screen, or its own page when the restart came before the shell marked it open (the landing then settles it, and the completion's own wait ends it on the lock screen). A flow that opened nothing keeps the strict `kept` expectation. No new action: the model's `restoreHeld` already expects committed-then-locked on the lock screen.
- Out of reach, unchanged: a restart before the shell bootstrapped the created profile (`isLogined` never set). The helper's start wait (30 s) ends in its hand-off: the lock screen with the created profile selected and its "Open the wallet again to unlock your new profile" toast.

### Arc 3 — a fee payer's address edit, and a discovery a reset ended (#1218)

- `wallet/services/fpc/service.ts` `updateFpcAddress` (D5): inside the lock, right before the write, re-read the row with `requireOwnedRow(await this.storage.get(id), profile.id)` and write `{ ...current, address }`. A rename made during the PXE checks survives. A row removed during them (Delete, a chain purge, a profile purge) fails with the existing "Invalid id" and is never written back; each of those removers emits `onFpcDeleted` first, so the Edit popup closes with its "FPC was deleted" toast. `updateFpc`, `deleteFpc`, `clearChainState` and `purgeForProfile` take the same lock, so the re-read sees each of them whole or not at all. The checks before the lock keep reading the first row: its type, chain and protocol slot, which no rename changes.
- `popup/components/popups/EditFpcPopup.vue` (D5, a review fix): the save takes the person's rename as it stood at the press. Read again after the address call, `nameChanged` compares against the row the other window's rename updated (`onFpcUpdated`), so the save wrote the old name back over the rename the service kept.
- The discovery's catch (`fpc/service.ts:195-202`, D11): after the session check, a network no longer live since the discovery's mark (`isNetworkLive(network.id, since)`) ends the discovery with one fixed `debug` line, "Protocol FPC discovery stopped: its network was reset or removed", as the session's end does. A failure while both stand still logs at warn and error.

### #1218 — dispositions, then closed

The dispositions comment on #1218 stands (OA-1 A recorded). Arc 3 builds OA-3 and D11, the last open reasons; the close-out closes #1218 and adds one follow-up comment saying so.

### Alternatives not taken

- (A) **Strict P5 everywhere**, the competing outline. Each write checks its own row's profile's session: the poller polls only the open profile's rows; B2, B5 and the person-asked sites refuse too, and a reconcile at unlock heals what they strand. Rejected: it adds a recovery lifecycle, and it changes what a person sees at OA-1's sites and when a switched-away profile's history settles.
- (B) **A guard in `SealedEntityStorage`** that refuses any write for a profile with no live session. Rejected: the lane rules out a global guard, and it would refuse the deliberate post-lock writes: the journal's `session_ended` records and a send's recording (#1055).
- (C) **#1138 option (b) alone**: the import completion asks the worker. Rejected: `route-guard.ts:39-40` bounces `/popup/auth` back to Home while `isLogined` holds, so (b) must clear the flag through the shell's locked state, which the landing already owns.
- (D) **#1138 read literally** (the import route always auth-required): a restart before finalize would unmount the import's rollback screen whenever a profile is selected (`backup-restore-sw-restart.test.ts:276-323`; `SelectProfilePopup.vue:74-77`). **Keyed on `isLogined` on every route**: also moves Delete profile and the dApp windows. Both rejected; New profile and the first create joined by the owner's answer (D14).
- (H) **OA-3 by a version check** (a revision field on the fee-payer row, compared at the write). Rejected: a stored-shape change, and the lock already orders every writer of the row, so a re-read inside it is the whole fix.
- (E) **Seeder: bind the pass to its session** (in `guardsHold`, or at each marker write). Rejected: the pass counts an attempt before its preview, and at the cap (3) no later pass repeats it. A lock and re-unlock during the capping attempt then leaves a default "failed" that today is seeded.
- (F) **Poller: re-check the batch's session before the commit** (the earlier arc 1). Rejected after the first final pass. A refused poll is not always polled again: a Dropped row's watch is evicted at its 30-minute window even while locked (`transaction/service.ts:521-526`) and is never re-armed (`:170-175`), so a mined transaction can stay Dropped; and a lock longer than `waitForTx`'s 120 s bound (`:373-377`) makes a registry toggle skip its status write. It would also close no property O3 checks: D2 lands the same write, for a profile with no open session, by design.
- (G) **Countdown: the page resets the composable's refs itself.** Rejected: the inconsistency is `start()` arming a timer under a disabled flag, so the fix belongs in `start()`; a `reset()` method would add a method for one caller.

## Decision ledger

| Id | Decision | Why | Panel |
|---|---|---|---|
| D1 | B1 kept: the poller's commit is a deliberate exception (revised) | it records the chain's verdict on a transaction already sent; a refusal strands a Dropped row at its window and a toggle past 120 s (alternative F); D2 lands the same write by design; the issue's own "done when" foresees it ("a transaction's final state may be one") | rounds 1-2 approved the fence; first final pass 1-2 showed the stranding; resolved by F |
| D2 | B1b kept | pinned by `sealed-transactions.composition.test.ts:270-293`; polled on the row's own endpoint, sealed under its own kept keys | both: agree |
| D3 | B2, B5 and the revoke prune, the incoming cursor reset and the journal create are deliberate exceptions | each records the outcome of work already done; refusing strands a row no later run repairs (B2's one second chance can be refused too) | both: agree, B2 qualified (Codex) |
| D4 | The seeder's markers are a deliberate exception; the `persistToken` window is KL-4 | what it writes after a lock records a step it took, and the attempt cap means a refused record is never repeated (alternative E); its pass already stops at its next step once its profile is not open (`guardsHold`) | Codex r1 2, r2 1-2; Opus 3, 4a |
| D5 | The `updateFpcAddress` re-read ships in arc 3 | it changes what a race shows ("Invalid id" in the Edit popup), so it waited for the owner: OA-3, "fix" (2026-10-27) | Codex 5, Opus 9; the owner |
| D6 | Withdrawn with D1's fence | it named the poller's composition tests | — |
| D7 | #1138: the landing locks an import that holds a session; the departed page's completion stays silent | the owner's direction (2026-10-26: "the lock landing should treat the import route as auth-required, with an e2e proof"), read as the post-finalize case (D) and confirmed (2026-10-27); the completion would otherwise toast and push over a later page | revised after Opus 2, 4b, 6; Codex 3; the owner |
| D8 | #1183: the watcher clears; an in-flight unlock already discards itself (`moved()`, `auth.vue:121-129`) | the issue's fix | both: agree |
| D9 | #1225 reuses `watchLockStart`; `start()` re-enables the countdown (alternative G) | the follower exists and is tested (`locked-state.test.ts:441-451`); a second reveal must not inherit "keep open" | Opus 7; first final pass 3 |
| D10 | #1186: a comment, no change | the sentence is right at the base; the composition test pins the behaviour | both: agree |
| D11 | The discovery log level ships in arc 3, beside OA-3's change | same file; a network reset is an expected end of a discovery, as a lock is, and a warn line reaches every user's log | lead; the owner ("fix all") |
| D12 | Deviation: the chaos model cites `seed.vue` and `auth.vue` by line, which recon missed; arc 1 moves the three citations in `tests/e2e/helpers/profile-chaos/model.ts` | `profile-chaos-model.test.ts` requires each cited line to hold its fragment; a line number is upkeep, not a harness change | lead |
| D14 | New profile and the first-profile create take the import's landing through the same raw fact; their completion stops at the landing's signal (D16) | the owner, OA-2 option A (2026-10-27); `activateCreatedProfile` re-checks `isLogined` after each await, but its hand-off reads a route the landing's pending navigation has not yet moved | the owner; amendment review, Codex 3 |
| D16 | `end-flow` ends the opening flows synchronously and releases the own window before it locks | the landing's navigation is still pending when `isLogined` clears, so a completion can still see its route and toast or route over the lock screen; a kept own import window would return to a fresh import after the unlock | amendment review, Codex 1 and 3 |
| D17 | The chaos driver's restart expects the lock screen for a flow that opened its session | it named the page `kept` from the URL alone, so the fixed landing would time the driver out; a flow that opened nothing stays strict | amendment review, Codex 2 |
| D15 | #1218 closes at the close-out | OA-1 A is recorded in the dispositions comment, and arc 3 builds OA-3 and D11 | the owner's answers |
| D13 | A reset rejects a passkey prompt the page left open, and each passkey path checks its run after the lookup and after the answer; the reveal guard is freed by the reset and released only by its own run | the reset must not leave a prompt for the ended session, nor let a late lookup raise one; `unlock-method.vue`'s and `export/full.vue`'s resets already reject theirs, and an ordinary lock closes it with the page | Codex arc r1 1-2 (closing is within the first-step return), Opus arc 1 (asked whether closing needs the owner); Codex r2: no owner decision |

## Assumptions

**Facts** (recon.md, with lines): F1 row keys outlive a lock and a switch (#1055). F2 a Dropped row's watch is evicted at its window on any loop and not re-armed after a restart (`transaction/service.ts:170-175,521-526`). F3 the export routes are auth-required, and the lock screen is `auth.vue`. F4 `watchLockStart` fires synchronously on a true → false change and never on mount. F5 `useSecretCountdown.clear()` cancels the timers only; `disable()` zeroes the deadline and sets the flag. F6 #1142 fixed SECURITY.md. F7 the seeder counts an attempt before its preview and skips an entry at the cap (`seeder.ts:98-101,538-545`).

**Inferences** (to attack):
- I1 A reset that fires while a reveal is in flight cannot show its words: `revealFence.invalidate()` makes `isCurrent()` false, and `showWords` runs only under it.
- I2 Scenario B usually has the shell's session open at the kill (`useProfileBootstrap.ts:257` runs on finalize's activation); the action-list replay (Phase 2, step 6) is the red-on-base proof either way.
- I3 Re-enabling in `start()` changes no current path: no caller starts after `disable()` today.
- I4 After `end-flow`, neither completion routes nor toasts: the fence moves before `isLogined` clears, each completion checks it before routing (and New profile's hand-off again after its awaited navigation), and New profile's open path meets the cleared `isLogined` at its next `assertActive`.
- I5 Every writer and remover of a fee-payer row runs under `FpcService.lock`, so a re-read inside it is current at the write. The one remover outside it, a profile deletion's keyless sweep (`profile-deletion/coordinator.ts:146-147`), runs after the locked `purgeForProfile` and after the row keys are dropped, so no write can follow it.

**Asks**, all answered by the owner on 2026-10-27 ("ok go with your proposals, fix all."): OA-1 A (keep), OA-2 confirmed and widened to New profile and the first create (A), OA-3 fix.

## Security & Adversarial Considerations

- **Threat model.** A person at a machine that was unlocked, then locked, or switched to another profile, must not find a secret a page kept: a typed password, an approval, a file password, revealed words. An attacker who reads storage (T1) sees row changes; code execution in the extension (T4) is out of model (#1055).
- **What arc 1 must not break.** The reveal and export run fences (`revealFence`, `runs`) stay; the reset invalidates them, so a late RPC answer can neither write a payload back nor land in another profile's flow. The clipboard scrub timer still outlives the page (`useSecretClipboardCopy`).
- **What arc 2 must not break.** The landing still settles an import or a New profile with no session; the route guard and the locked state are reused, not bypassed. A departed page's completion cannot push a route over a later page, and New profile's hand-off still lands a created profile that never opened on the lock screen.
- **What arc 3 must not break.** The address checks (deployed, a Sponsored FPC, not the protocol slot) still run before the write; the re-read only narrows what is written. A removed fee payer is never written back.
- **Residual by design.** T1 still sees the D1-D4 writes for a locked-out profile, and node reads already in flight finish after a lock; the lane binds no background work to a session. A recovery phrase copied to the clipboard outlives a lock until its scrub; out of scope.
- **Input validation, crypto, supply chain, least privilege.** No new input crosses a trust boundary. No new dependency, key or permission.
- **Logging.** One fixed `debug` line replaces a warn and an error for a discovery a network reset ended (D11); it names no value.

## Phases

### Arc 1

**Phase 1 — the lock screen and the export pages.** ✓ Steps:
1. Change `export/account.vue`, `export/seed.vue`, `useSecretCountdown.ts` and `auth.vue` as § Arc 1 says.
2. Add tests:
   - `export/account.test.ts`: a lock while a file password and an approval are held. Expect every secret ref empty and the first step shown.
   - `export/seed.test.ts`: a lock, and a profile switch, each while the words show after "keep open". Expect the words, the password and the wrong-password state cleared, and the first step shown. Then reveal again: the countdown shows and its disable link is back.
   - `export/seed.test.ts`: the existing case "a reveal marks the profile it was asked for, even when another became active during the read" (`:183-193`) now pins the opposite: a reveal settling after a switch shows no words and writes no reminder. Red on the base. The mounted-reveal control (`:154`) stays.
   - `useSecretCountdown.test.ts`: `disable()` then `start()` arms a countdown that is not disabled and fires `onTimeout`.
   - `auth.test.ts`: type, switch to B and back. Expect an empty field and Continue off. Also: a switch clears a wrong-password state; the mask comes back (`mountReal`); the first profile's arrival clears nothing (a control, green on the base).
3. Take light and dark screenshots of the three pages after the reset, at 360×600, from a scratch script outside the repo.
4. Comment on #1218 (§ #1218) and on #1186 (D10).

Validation gate. From the repo root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run audit:vue`. Pass: green; each regression case red against the base page or composable. Smoke e2e, from `apps/extension`, on an armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `bun run test:e2e -- auth-flows security security-backup account-import-export keyboard-guards --retry=0`. Chrome only: the arc touches no fixture, focus order, window, user activation or WebAuthn path; CI's required Firefox smoke lane runs on the PR. Layers: lint, typecheck, component, smoke.

Gate run (at the code head, before the review loop): `bun run audit:vue` exit 0 (942 files, 15 940 tests; lint, `typecheck:all`, build), after one red run on `profile-chaos-model.test.ts` (D12). The nine regression cases red against the base sources (the two "keep open" seed cases also with only `start()` reverted); the first-profile control green. Smoke, armed Chrome build, retry 0: 6 files (`security` also matched `security-reset`), 23 tests, 3:36. Screenshots: `screenshots/arc1/`, from a scratch spec that also asserts, in the browser, the empty, masked field and the disabled Continue after the switch.

Final gates after the review loop (head before this record): lint, `typecheck:all`, `test:all` and the same smoke specs on a fresh armed build, all pass (smoke 3:43). The arc adds no e2e scenario.

### Arc 2

**Phase 2 — the landing for an import and a new profile.** ✓ Steps:
1. Change `lock-landing.ts`, `app.vue`, `opening-flow.ts`, `import.vue`, `profile/new.vue`, `new-profile-helpers.ts` and the chaos driver as § Arc 2 says.
2. In `lock-landing.test.ts`, add: an import that holds a session ends its flow (`end-flow`); New profile (the first create's route too) that holds a session ends its flow; either holding none settles, so an own import window keeps its flow; a page that needs no session and opens none (Register) settles while holding one (the control); an auth-required page that holds a session still locks. The existing cases stay.
3. In `pages/import.test.ts`, add: a completion that resolves after the flow was ended, the page still mounted (the landing's navigation pending), releases no window, shows no toast and pushes no route; the same after the page unmounted; a mounted completion with its flow live does all three (the control).
4. In `new-profile-helpers.test.ts`, add: the flow ended during the created profile's tail, the route still on New profile: no route, no toast; a hand-off whose awaited navigation settles after the flow ended: no toast. The existing failure hand-off and successful-create cases are the controls.
5. In `backup-restore-sw-restart.test.ts` scenario B, change only the post-kill terminal observation. Accept the lock screen, or the errors screen's Continue followed by the lock screen. Log which path ran. Assert the page never reaches `/popup/general`. Keep the no-rollback, never-torn and reopen assertions.
6. Replay the #1138 action list once on the base build and once on the fix (seed label 1138; the list goes in a scratch file outside the repo):
   ```json
   [{"action":"createPassword","params":{"ref":"P1","name":"Chaos 1","password":"S1","double":false}},
    {"action":"createPassword","params":{"ref":"P2","name":"Chaos 2","password":"S2","double":false}},
    {"action":"exportBackup","params":{"file":"F1"}},
    {"action":"deleteProfile","params":{"via":"settings"}},
    {"action":"restoreHeld","params":{"file":"F1","stage":"account-state","competing":"restart","ref":"P3","password":"S4"}}]
   ```
   The issue's seed 1003 no longer reaches the case: the model has drifted since the issue, its plan holds no `restoreHeld` step, and on the base it meets filed finding #1132 first. Expect on the base the driver's diagnosis at step 4, Home while the worker holds no session; on the fix, green.

Validation gate. From the repo root: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, then `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-sw-restart.test.ts` (Chrome; the scenario is Chrome-only), and the step 6 replay: `NULO_E2E_BROWSER=chrome NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1138 NULO_E2E_CHAOS_ACTIONS=<the list's file> NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/profile-chaos.test.ts`, from the repo root. Pass: green; the replay red on the base and green on the fix. Record the scenario's runtime before and after. Layers: unit, component, network e2e. New profile is proven at the unit layer: its landing is the pure decision, and its completion's stop is the helper's, both unit-tested; a restart in its last second has no deterministic e2e hold point.

Base run (d1165460c plus the amendment, Chrome, retry 0): scenario B passes (scenario 25 969 ms, file 70 299 ms); the action list is red at step 4, `restoreHeld`'s driver could not finish: "the popup holds Home while the worker holds no session" at `#/popup/general`.

Final gates (at 68442891d, `origin/dev` merged; Chrome, retry 0): lint, `typecheck:all`, `test:all` (173 s) pass. Scenario B passes on both paths across two runs: the errors screen's Continue, then the lock screen (scenario 21 758 ms, file 61 529 ms), and the landing's `end-flow` straight to the lock screen (scenario 25 180 ms, file 78 050 ms, scenario A, which the arc does not touch, 52 s against 39 s on the base run, so the spread is the shared host's load). The action-list replay is green on the fix (no violation; the step's log gap across its planned restart is the harness's exemption), red on the base. No scenario added. ✓

### Arc 3

**Phase 3 — the fee payer's address edit and the discovery's log level.** ✓ Steps:
1. Change `fpc/service.ts` as § Arc 3 says.
2. In `fpc/service-create.test.ts` (its harness; the header widens from creation to write fences), add: a rename landing during the address check survives the edit; a delete landing during it rejects with "Invalid id" and leaves no row; an edit with nothing concurrent stores the new address under the same name (the control); a network reset during a registration ends the discovery at debug with no warn or error line. The existing "a registration that fails while its session is live is still logged at error" is that last case's control. In `EditFpcPopup.test.ts`, add: a rename from another window during an address save stays (no rename call follows); a name and an address the person typed both save, the address first (the control).

Validation gate. From the repo root: `bun run lint`, `bun run typecheck:all`, `bun run test:all`. Pass: green; each regression case red against the base `service.ts`. Layers: lint, typecheck, unit and component (no e2e drives the address edit).

Final gates (at 4bbc970d3, `dev` unchanged since arc 2's merge): lint, `typecheck:all`, `test:all` (179 s) and `check:plans` pass. The three service regression cases and the popup's are red against the base sources; the controls are green on both. No e2e scenario added. ✓

## UI impact

- Lock screen (`auth.vue`): after a profile switch, the password field is empty and masked, and Continue is off. Before: the earlier text, its mask state and a wrong-password shake.
- Back up profile › Account and › Recovery phrase: when the wallet locks with the page still mounted, the page returns to its first step, and a passkey prompt it had open closes, as it does when a lock unmounts the page. Recovery phrase also does so on a profile switch. Before: the page kept its step.
- Home's "save your recovery phrase" reminder: a reveal that settles after a profile switch no longer marks the earlier profile's phrase saved, since its words are no longer shown. Before: the words showed under the new profile and the earlier profile's reminder went away.
- An import that a worker restart overtook after its restore: the lock screen, with no "Profile imported" toast after the unlock. Before: Home with no session behind it. The import's errors summary is not shown; Home's restore banner names a skipped account state after the unlock (the owner, OA-2).
- New profile and the first-profile create, when a worker restart overtakes them in their last second, after the new profile opened: the lock screen with the new profile selected, and no toast. Before: Home with no session behind it (the owner, OA-2: A). When the restart cuts a call that last step had in flight, Home and the "Something went wrong" toast can show for a moment before the lock screen, as they did before this change: the call fails before the shell learns of the restart.
- An import or a New profile still in progress, in a popup that another window's unlock marked open: a restart sends it to the lock screen (KL-3).
- Settings › Fee payers › Edit: a rename made in another window during the address check survives the address edit; a fee payer removed meanwhile is never brought back: the popup closes with its "FPC was deleted" toast, as it does today (the owner, OA-3).
- #1218's other sites: none; they are recorded exceptions.

No copy or layout changes. Every line above has the owner's sign-off (2026-10-27: "ok go with your proposals, fix all."). Each PR body carries its screenshots where a screen changes.

## Known limits (filed closed)

- KL-3 (#1293): an import still before its finalize, or a New profile before its create, in a popup whose shell another window's unlock marked open, is unmounted by a restart (OA-2 showed it to the owner for the import; D14 extends it). Reopen on a report.
- KL-4 (#1294): a lock inside `persistToken`'s own window still lands the seeded token row. Reopen if the campaign meets O3 on a seeder-written `tokens` row.
- (KL-2 was withdrawn with the poller fence, alternative F.)

## Delivery

- Arc 1: branch `lock-window-1-a1` off `worktree-lock-window-1` (which holds this plan), then `gh stack init --base dev lock-window-1-a1` (an existing branch is adopted). PR title: `fix(popup): the lock screen and export pages drop what a session left typed` (≤ 92). Body: `Closes #1183`, `Closes #1225`, the screenshots, the gates, a pointer to the #1218 comment.
- Arc 1 merged as #1272 (d1165460c), so the remaining layers start a new stack from `origin/dev`:

| Layer | Branch | Title (≤ 92) | Body |
|---|---|---|---|
| 1, arc 2 | `lock-window-1-a2` off `origin/dev`; `gh stack init --base dev lock-window-1-a2` | `fix(popup): an import or a new profile a restart overtook lands on the lock screen` | `Closes #1138`; the UI impact lines and under them the owner's OA-2 words; the e2e runtime before and after; the replay result |
| 2, arc 3 | `gh stack add lock-window-1-a3` | `fix(fpc): an address edit re-reads its fee payer; a reset discovery logs at debug` | the UI impact line and the owner's OA-3 words; closes nothing (#1218 closes at the close-out) |
| 3, close-out | `gh stack add lock-window-1-close-out` | `docs(plans): close lock-window-1 with its outcome and archive it` | `Closes #1218`; docs only |

- Before each PR opens: `git fetch origin` and merge `origin/dev` into the stack, keeping both lanes' changes (lane `lock-ux-1` builds on `auth.vue` and the lock landing).
- `code_review: off` on every arc. No lane split: one session runs the layers in order.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 78f5f9171. What is specific to this plan:
- **Loop placement.** The Codex loop runs per arc at its boundary, while the arc is the stack tip. Start it with `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume it with `resume-codex.sh` and the fix diff. Hard stop at three rounds.
- **Arc map for the prompt.** Arc 1 (merged) reset three pages and the countdown; arc 2 changes the lock landing for an import and a new profile, their completions and the chaos driver's restart expectation; arc 3 changes `fpc/service.ts`'s address edit and discovery catch.
- **Opus leg.** One Opus `general-purpose` review runs beside each arc's first round.
- **Cross-arc pass.** After arcs 2 and 3, one fresh Codex session reads the net diff from d1165460c with the cross-arc ask.
- **Delivery.** `gh stack submit --auto`, then `gh pr edit` for each body; no label at creation. Then `gh pr checks <n> --watch` for each PR.
- **Close-out.** As the standard's step 4. `Known limits:` names KL-3 and KL-4 as closed `known-limit` issues. `Open items:` none from this lane, and one line: #1218 closes when this stack lands (OA-1 A recorded, OA-3 and D11 built). A follow-up comment on #1218 says the same.
- **Teardown** (standing authorization). Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/lock-window-1/plan.md` succeeds, run `agent-worktree done lock-window-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high): `reject`. Each blocking finding and what the plan did with it:
- (1) Ownerless rows dispatch after an awaited re-read. Accepted: the fence's invariant was stated for profile rows only (moot after F).
- (2) At the cap, a refused marker strands. Accepted: verdicts keep the epoch rule (D4, alternative E).
- (3) The departed import page's completion still runs. Accepted: the `isUnmounted` guard (D7).
- (4) Scenario B cannot reach the new assertion. Accepted: the terminal observation is rewritten, and a chaos replay is the red-on-base proof (since the amendment, the #1138 action list).
- (5) Arc 1 is visible through D5. Accepted: D5 is now OA-3.
- (6) The preview-lock test passes on the base. Accepted: tests retargeted (moot after E).
- Agreed: alternative A rejected, D3, D4's journal concern, D7's narrow field, D9.

**Round 1, Opus** (Plan): `conditional approve`. Each condition and what the plan did with it:
- Scenario B rework and the import guard: accepted as above. The seeder refusal through `guardsHold`: accepted, then withdrawn in round 2.
- B3' and D7's reading go to the owner: accepted, as KL-4 (a background row, not a person's ask) and OA-2.
- Also accepted: raw facts in `LockLandingState`, `watchLockStart` in place of a new composable, a silent capture in the poller and KL-3 (the last two moot after F).

**Round 2, Codex** (resumed): `reject`. Each finding and what the plan did with it:
- (1) The session in `guardsHold` strands the capping attempt (`seeder.ts:98-101,538-545,561`). Verified and accepted: the seeder left arc 1 (D4, alternative E).
- (2) The added checks do not stop every preview. Moot once the seeder was out.
- (3) KL-2 and KL-3 have observable outcomes. KL-3 went into OA-2; KL-2 was argued as a known limit, then withdrawn with the fence after the first final pass.
- Agreed: the departed-page guard, the scenario B rewrite with the replay, D5's move, the raw landing facts, KL-4.

**First final pass, Codex** (fresh session): `reject`. Each finding and what the plan did with it:
- (1) KL-2 turns a correct toggle into a stale one under the same ordering; "UI impact: none" was wrong. (2) A refused poll of a Dropped row near its window is never polled again. Both verified (`transaction/service.ts:170-175,373-377,521-526`). Resolved by alternative F: the poller stays as it is and B1 is a recorded exception (D1), which leaves no stranded outcome and no visible change. Arcs reshaped: arc 1 is now the screens, arc 2 the landing.
- (3) `clear()` keeps "keep open" for a second reveal. Verified (`useSecretCountdown.ts:28-52`). Accepted: `start()` re-enables (D9, alternative G), the reset clears the wrong-password state, and the test reveals twice.
- (4) The security text promised no node work after a lock. Accepted: the claim is gone; in-flight reads are a stated residual.
- (5) The smoke gate needed an armed build and a working directory. Accepted: both are spelled out; Firefox is argued out of the local gate.
- Agreed: alternative A rejected, D3, D4, `watchLockStart` reuse, composition fit, no new dependency or permission.

**Second final pass, Codex** (fresh session): `conditional approve`. Each condition and what the plan did with it:
- (1) OA-1 option B names a toast shown on the lock screen, which arc 1 touches, while OWNER-ASKS said no ask concerns arc 1's surfaces. Verified: the network add's toasts (`NewNetworkPopup.vue:118-141`) render in the app shell's `ToastManager` (`app.vue:620`), over whatever page is open, the lock screen after a lock. Resolved by correcting the text, not the rule: OWNER-ASKS now names the overlap, and OA-1 locates the toast in the network add, whose answer changes nothing arc 1 builds; arc 1 changes the lock screen's form fields and no toast.
- (2) The network gate runs `e2e:agent` from the wrong directory without `NULO_E2E_PROVERLESS=1` and with two retries. Verified (`package.json:20`, `proverless-guard.sh:16,59`, `vitest.e2e.network.config.ts:27`). Accepted: the gate and the replay run from the root with both flags.
- (3) The seed reset contradicts `seed.test.ts:183-193`, which pins a stale reveal marking its profile. Verified. Accepted: that case is rewritten to the new contract and listed under UI impact (Home's reminder).
- (4) `gh stack init` has no `--adopt`. Verified (`gh stack init --help`). Accepted.
- Agreed: B1's exception, the countdown fix at its cause, the reuse of `watchLockStart` and the run fences, I1 and I3.

**Second final pass, resumed to verify**: `conditional approve`. (2)-(4) verified in the plan. (1): no implementation dependency or architectural defect, but the toast is seen on the lock screen, which arc 1 touches, so under the surface rule arc 1 waits for the orchestrator's determination. No new material defect. The plan stops at its approval gate here.

**Arc 1, Codex** (fresh session, then resumed): round 1 `changes requested`. (1) A reset left the reveal guard held, so the next press did nothing until the discarded answer settled. (2) A late passkey lookup opened the old profile's prompt over the reset page, and an open prompt survived the reset. (3) The account lock test did not pin the file passwords, the typed password or the made file. All verified and fixed (D13), each with a test red against the pre-fix pages. Round 2 `approve with nits`: one test title claimed more than it proved; renamed. No owner decision in closing the prompt.

**Arc 1, Opus** (`general-purpose`, beside round 1): `approve with nits`. (1) The passkey reveal kept going after a reset: folded into D13. (2) No test pinned `countdown.clear()` in the reset: added, red when the line is removed. (3) The seed profile-id watcher's default flush: not taken, the path needs a reveal answer and a profile change in one checkpoint, which separate port messages do not produce.

**Amendment for the owner's answers, Codex** (gpt-6.1-sol, high, fresh session): `changes requested`. The widened predicate and arc 3's re-read sound; each finding and what the plan did with it:
- (1) A kept own import window returns to a fresh import form after the unlock (`own-window.ts:160,168`, `auth.vue:111`). Verified. Accepted: `end-flow` releases the own window before it locks (D16); a session-less import settles and keeps its flow.
- (2) The chaos driver names the import page `kept` from its URL alone (`restart.ts:58,66`), so the fixed landing would time out `restoreHeld`'s competing restart. Verified (`network-drivers.ts:143`). Accepted: the driver learns whether the flow opened its session (D17); the session-less case stays strict.
- (3) I4 assumed the landing's navigation had committed when `isLogined` clears; it has not (`app.vue:300,312`), so New profile's hand-off can still pass `left()` and toast. Plausible (an in-memory reproduction toasted; browser timing unverified). Accepted: a synchronous fence (D16), checked by both completions; the import's guard takes it too, as its completion has the same window.
- Agreed: the first create is covered (`useProfileBootstrap.ts:234,257`), the named routes keep passkey and onboarding pages out, I5 holds, D11's liveness check, the gates are executable.
- Also folded: the issue's seed 1003 no longer reaches the case on the base (no `restoreHeld` step; it meets #1132 first), so step 6 replays a hand-trimmed action list instead.

**Arc 2, Codex** (fresh session): round 1 `changes requested`. (1) New profile's open path never read the fence, so after `end-flow` and an unlock of the same profile, a tail resuming from its pointer write pushed Home over a later page. Verified; fixed: `assertActive` reads `flowLive()` too, with a test red against the round's code. (2) Nit: scenario B observed the landing but would miss a passing Home. Taken: a page-side latch from before the kill, on every committed URL (round 2's nit: a 100 ms poll could miss one). Its settlement wait was not taken: once `end-flow` unmounts the import, nothing presses Continue, so the completion never runs; on the Continue path the lock screen is the completion's own last push.

Round 2 `approve with nits`: every fix verified (its in-memory reproduction re-run against both helpers), no new production defect; one nit, the latch's sampling, taken.

**Arc 2, Opus** (`general-purpose`, beside round 1): `approve with nits`. Should-fix: the New profile UI impact line overclaimed. A restart rejects the tail's in-flight call before the reconnect boot runs, so the hand-off still reads the stale session and shows Home and its toast, until the boot locks Home (an auth-required page) and the lock closes the toast. Same as before the change, and the end state is right. Taken as a wording fix to the UI impact line. Telling a dropped connection apart in the hand-off would be new design. Also taken: the hand-off test now drives the realistic branch (the tail's call rejected while the stale session reads open); a departed import page recovers nothing (`recover` checks the page and the fence), tested; the stale `app.vue` comment. Not taken: one base run of the new scenario B (the fix run took the errors screen path, the base's path too, so scenario B reads red on the base only in I2's timing; the action-list replay holds the red-on-base proof); merging `OPENING_ROUTES` into `PROFILE_FREE_ROUTES` (different facts: a page that needs no profile need not open a session); a test of `opening-flow.ts` alone (three lines over the tested `createRunFence`).

**Arc 3, Codex** (fresh session): round 1 `changes requested`. (1) The Edit popup undid the fix: it re-read `nameChanged` after the address call, so another window's rename, delivered as `onFpcUpdated`, read as this save's and the old name was written back (`EditFpcPopup.vue:79,129-134,151-156`; reproduced in memory). Verified; fixed: the save takes the rename at the press, with a component test red against the earlier popup and a control for both edits. (2) Nit: a delete closes the popup on its event before the edit returns, so "Invalid id" is not what a person sees. Taken in the UI impact line. (3) Nit: I5 overclaimed; the profile deletion's keyless sweep removes rows without the lock, after the locked purge and the dropped row keys. Taken in I5 and the comment. Also taken: a unit case for a liveness read that fails in the failure path (the failure stays at error).

Round 2 `approve with nits`: every fix verified (the handlers and the discovery run in memory), no regression; two nits taken: § Arc 3 still named "Invalid id" as what a person sees after a delete, and a test helper's comment narrated it.

**Arc 3, Opus** (`general-purpose`, beside round 1): `changes requested`. The same popup revert (should-fix) and the same delete wording (should-fix; the popup closes with "FPC was deleted" and its disconnect fails the pending call), both taken above. Nits: the debug line also covers a removed network, now "its network was reset or removed"; the comment's "every writer", taken with Codex (3). Not taken: a test that pins the re-read inside the lock (no ordering a unit case can drive tells the two apart without reaching into the lock), and the hidden popup's late error flash on its next open (older than this change, and no screen shows it closed).

**Cross-arc pass, Codex** (fresh session, net diff from d1165460c, with the standard's two rules verbatim): round 1 `changes requested`. (1) New profile's hand-off kept going past an `end-flow` that landed during its pointer write: its `unless` and the check after it read the route only, so the ended hand-off selected the created profile and pushed the lock screen over the shell's landing (reproduced in memory). Verified; fixed on arc 2's layer: the hand-off's `left()` reads the fence too, with a test red against the previous helper. (2) Nit: a narrating test-helper comment, deleted. Round 2 `approve`: both verified, no regression across the arcs. Seams checked sound: the fence moves before arc 1's synchronous resets run, the own window is released before the lock, and arc 3's re-read and the popup's captured rename keep a concurrent rename. Gates at the restacked tip: lint, `typecheck:all`, `test:all` (184 s) pass.

## Seeds

Not run; the orchestrator spawns each arc.

```
/goal Arcs 2 and 3 and the close-out of implementations-plan/lock-window-1/plan.md each have every phase marked ✓ with its gate pasted, a converged Codex loop quoted, and an open PR in the lock-window-1 stack on dev; bun run test:all and bun run lint exit 0 on the stack tip.
```

```
/loop 15m Drive implementations-plan/lock-window-1 forward per its plan.md: rebuild the task list from the phase headers, run the next phase's gate, run each arc's Codex loop at its boundary, open PRs only after the loops converge; never merge.
```
