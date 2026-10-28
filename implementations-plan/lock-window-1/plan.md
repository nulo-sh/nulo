---
plan: lock-window-1
tier: mid
status: awaiting approval (final pass: conditional approve, the orchestrator's call on OA-1's overlap)
issues: "#1183 #1225 (arc 1), #1138 (arc 2); #1218 dispositions only; #1186 did not hold"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: three sonnet explorers; Codex gpt-6.1-sol at high (dual audit, resumes, two fresh final passes); one Opus Plan leg
base: origin/dev at 78f5f9171
trunk: dev
post_implementation_hardening: not scheduled
---

# lock-window-1: screens that outlive a lock, and writes that do

Two arcs and a docs-only close-out, stacked on `dev`. Arc 1 makes the lock screen and the two export pages drop what was typed or revealed under a session once it ends or the profile changes. Arc 2 lands an import that a worker restart overtook on the lock screen. Every #1218 site gets a written disposition on the issue and none changes code here. Evidence: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Findings and dispositions

Every path is a code trace at the base (recon.md § Claims checked). The rule the #1218 dispositions follow: **a background write that records the outcome of work already done lands**, because a refused one leaves a row that no later run is sure to repair. Each background site below is such a write; the first final pass showed that even the poller, which looked retryable, is not (D1).

| Site | Path | Label | Disposition |
|---|---|---|---|
| B1 tx poller | a batch starts under session S; the receipt read or finality proof resolves after a lock; the commit seals and writes under the kept row keys (#1055) | plausible, traced | kept (D1) |
| B1b | a profile switched away keeps its rows polled under the new session, on its own endpoint | demonstrated by a pinned test | kept (D2) |
| B2 authwit reconcile | follows a tx commit; its only second chance is the Finalized commit | traced | kept (D3) |
| B3 seeder markers | a pass starts under S; a marker write lands after a lock: the attempt record, a preview's verdict (`seeder.ts:549-557`), the marker after a landed persist | traced | kept (D4) |
| B3' seeded row | the lock lands inside `persistToken` (local reads and two writes, no fetch) | traced | known limit KL-4 (D4) |
| B4 stale row | `updateFpcAddress` writes the row it read before its PXE calls | traced | owner ask OA-3; a race shows "Invalid id" where today the row comes back |
| B5 registry status, revoke prune | mirror a proven tx; the popup reads only the stored status | traced | kept (D3) |
| B4, B6-B9 person or dApp asked | the write lands after a lock; refusing it removes the row after unlock | traced | owner ask OA-1; unchanged now |
| B9 incoming cursor, journal create | the reset runs once per added account; the record is of work the person started | traced | kept (D3) |
| #1218 "Also": discovery log level | a network reset deletes the network between discovery's liveness check and its fenced write; the catch logs warn and error while the session is live (`fpc/service.ts:194-202`) | traced | deferred to the `fpc/service.ts` arc OA-3 carries (D11) |
| #1183 | type for A, pick B, pick A: the text is back and Continue is on | demonstrated (agent session) | **arc 1** (D8) |
| #1225 | a lock that leaves the export page mounted keeps the typed passwords, the approval and the words | traced | **arc 1** (D9) |
| #1138 | restore finalizes, the worker restarts, the reconnect settles, `awaitProfileActivation` resolves on the stale flag: Home with no session | demonstrated (chaos seed 1003, 2 of 2) | **arc 2** (D7); its reading and New profile: OA-2 |
| #1186 | SECURITY.md already says a lenient session persists a bearer under either unlock (#1142, 518170a18) | did not hold | a comment on the issue (D10) |

## Outcome & Quality Bar

For a person who locks the wallet, lets it lock, or switches profile while a page is open, and for the maintainer who reads the chaos oracle O3 ("no write for a profile that is locked out"):
- A secret typed or revealed under a session is gone from the page once the session ends or the profile changes, and the page shows its first step, as Unlock method does. A second reveal after the reset behaves like the first, its auto-close included.
- An import whose session a restart dropped lands on the lock screen, never on a Home with no session.
- Every #1218 site carries a written disposition on the issue, so an O3 hit on a `txs`, `authRegistry` or `tokenSeeded` row reads as a recorded exception with its reason, not a new bug.
- Good enough: the person-asked sites stay as they are until OA-1 is answered; the chaos harness is not extended, and whether O3 encodes the exceptions is the chaos plan's call.

## Architecture & Implementation

### Arc 1 — the lock screen and the export pages (#1183, #1225)

- `export/account.vue` (D9) calls the existing `watchLockStart(() => appStore.isLogined, …)` (`popup/locked-state.ts:164-172`; fires on true → false, `flush: "sync"`, never on mount) with what its profile-type watcher runs: `resetFlow()` (which drops the approval, the file password and the payload) then `applyQueryPreselect()`.
- `export/seed.vue` (D9) gets `resetReveal()`, run by `watchLockStart` and by a new profile-id watcher, as `account.vue`'s is. It invalidates `revealFence`, clears `words`, `password` and `isWrongPassword`, sets `isStarted` and `isUnlocked` back to false and calls the countdown's `clear()`. It never navigates: `handleClose` would race the lock landing. A reveal that settles after a switch is discarded, so it marks no profile's "phrase saved" either; the comment at `seed.vue:86` is rewritten to say the read asks for the profile the reveal began under. `unlock-method.vue` and `change-password.vue` stay as they are.
- `composables/useSecretCountdown.ts`: `start()` also sets `isAutoCloseDisabled` back to false: a countdown it arms is never shown as disabled. Today `start()` runs once per mount (`seed.vue` `showWords`), so nothing a person sees changes; the reset makes a second reveal possible, and without this the second countdown would fire under a hidden timer after an earlier "keep open". `start()` already replaces `closeDeadline`.
- `pages/auth.vue` (D8): the profile-id watcher (`:322-327`) also clears `password`, clears `isWrongPassword` and sets `isPasswordType` back to masked, but only when the previous id was defined. On a `known: false` mount, the first profile's arrival clears nothing.

### Arc 2 — an import a restart overtook (#1138)

- `popup/lock-landing.ts` (D7): `LockLandingState` gains two raw facts: `holdsSession` (the shell's `isLogined`) and `onImportRoute` (the `popup-import` route). `decideLockLanding` returns `lock` when `onAuthRequiredRoute || (holdsSession && onImportRoute)`, after the `!hasProfile` branch, so every branch stays unit-testable. `app.vue` fills both fields. `lock` runs `lockedState.enter`, which clears `isLogined` and lands on the lock screen. The header comment gains one sentence: an import past its finalize runs over the session it opened. The comment at `tests/e2e/helpers/profile-chaos/restart.ts:56-57` gains the same exception.
- `pages/import.vue` (D7): `completeImport` sets an `isUnmounted` flag in `onUnmounted`, the idiom of `auth.vue:61,305`. After its wait, once the page has gone, it releases no own window, shows no toast and pushes no route. The shell's landing owns the route by then, and Home's restore banner (`utils/restore-outcome.ts`) carries a skipped account state after the unlock.

### #1218 — dispositions, no code

One comment on #1218 carries the dispositions table above with each reason, names OA-1, OA-3 and D11 as what keeps it open, and KL-4. #1218 stays open.

### Alternatives not taken

- (A) **Strict P5 everywhere**, the competing outline. Each write checks its own row's profile's session: the poller polls only the open profile's rows; B2, B5 and the person-asked sites refuse too, and a reconcile at unlock heals what they strand. Rejected: it adds a recovery lifecycle, and it changes what a person sees at OA-1's sites and when a switched-away profile's history settles.
- (B) **A guard in `SealedEntityStorage`** that refuses any write for a profile with no live session. Rejected: the lane rules out a global guard, and it would refuse the deliberate post-lock writes: the journal's `session_ended` records and a send's recording (#1055).
- (C) **#1138 option (b) alone**: the import completion asks the worker. Rejected: `route-guard.ts:39-40` bounces `/popup/auth` back to Home while `isLogined` holds, so (b) must clear the flag through the shell's locked state, which the landing already owns.
- (D) **#1138 read literally** (the import route always auth-required): a restart before finalize would unmount the import's rollback screen whenever a profile is selected (`backup-restore-sw-restart.test.ts:276-323`; `SelectProfilePopup.vue:74-77`). **Keyed on `isLogined` on every route**: also moves New profile, the first create, Delete profile and the dApp windows. Both rejected; New profile is OA-2.
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
| D5 | The `updateFpcAddress` re-read is OA-3 | it changes what a race shows ("Invalid id" in the Edit popup) | Codex 5, Opus 9 |
| D6 | Withdrawn with D1's fence | it named the poller's composition tests | — |
| D7 | #1138: the landing locks an import that holds a session; the departed page's completion stays silent | the owner's direction (2026-10-26: "the lock landing should treat the import route as auth-required, with an e2e proof"), read as the post-finalize case (D); the completion would otherwise toast and push over a later page | revised after Opus 2, 4b, 6; Codex 3 |
| D8 | #1183: the watcher clears; an in-flight unlock already discards itself (`moved()`, `auth.vue:121-129`) | the issue's fix | both: agree |
| D9 | #1225 reuses `watchLockStart`; `start()` re-enables the countdown (alternative G) | the follower exists and is tested (`locked-state.test.ts:441-451`); a second reveal must not inherit "keep open" | Opus 7; first final pass 3 |
| D10 | #1186: a comment, no change | the sentence is right at the base; the composition test pins the behaviour | both: agree |
| D11 | The discovery log level waits for the `fpc/service.ts` arc | same file and same catch as OA-3's change; a warn line during a network reset is the whole consequence | lead; not yet audited |
| D12 | Deviation: the chaos model cites `seed.vue` and `auth.vue` by line, which recon missed; arc 1 moves the three citations in `tests/e2e/helpers/profile-chaos/model.ts` | `profile-chaos-model.test.ts` requires each cited line to hold its fragment; a line number is upkeep, not a harness change | lead |
| D13 | A reset rejects a passkey prompt the page left open, and each passkey path checks its run after the lookup and after the answer; the reveal guard is freed by the reset and released only by its own run | the reset must not leave a prompt for the ended session, nor let a late lookup raise one; `unlock-method.vue`'s and `export/full.vue`'s resets already reject theirs, and an ordinary lock closes it with the page | Codex arc r1 1-2 (closing is within the first-step return), Opus arc 1 (asked whether closing needs the owner); Codex r2: no owner decision |

## Assumptions

**Facts** (recon.md, with lines): F1 row keys outlive a lock and a switch (#1055). F2 a Dropped row's watch is evicted at its window on any loop and not re-armed after a restart (`transaction/service.ts:170-175,521-526`). F3 the export routes are auth-required, and the lock screen is `auth.vue`. F4 `watchLockStart` fires synchronously on a true → false change and never on mount. F5 `useSecretCountdown.clear()` cancels the timers only; `disable()` zeroes the deadline and sets the flag. F6 #1142 fixed SECURITY.md. F7 the seeder counts an attempt before its preview and skips an entry at the cap (`seeder.ts:98-101,538-545`).

**Inferences** (to attack):
- I1 A reset that fires while a reveal is in flight cannot show its words: `revealFence.invalidate()` makes `isCurrent()` false, and `showWords` runs only under it.
- I2 Scenario B usually has the shell's session open at the kill (`useProfileBootstrap.ts:257` runs on finalize's activation); the chaos seed 1003 replay is the red-on-base proof either way.
- I3 Re-enabling in `start()` changes no current path: no caller starts after `disable()` today.

**Asks** (proceeding on the assumption shown): OA-1 person-asked writes across a lock (assumed: unchanged). OA-2 #1138's reading and New profile (assumed: the narrowed reading; New profile unchanged). OA-3 the FPC address re-read (assumed: not shipped).

## Security & Adversarial Considerations

- **Threat model.** A person at a machine that was unlocked, then locked, or switched to another profile, must not find a secret a page kept: a typed password, an approval, a file password, revealed words. An attacker who reads storage (T1) sees row changes; code execution in the extension (T4) is out of model (#1055).
- **What arc 1 must not break.** The reveal and export run fences (`revealFence`, `runs`) stay; the reset invalidates them, so a late RPC answer can neither write a payload back nor land in another profile's flow. The clipboard scrub timer still outlives the page (`useSecretClipboardCopy`).
- **What arc 2 must not break.** The landing still settles an import with no session; the route guard and the locked state are reused, not bypassed. A departed page's completion cannot push a route over a later page.
- **Residual by design.** T1 still sees the D1-D4 writes for a locked-out profile, and node reads already in flight finish after a lock; the lane binds no background work to a session. A recovery phrase copied to the clipboard outlives a lock until its scrub; out of scope.
- **Input validation, crypto, supply chain, least privilege.** No new input crosses a trust boundary. No new dependency, key or permission.
- **Logging.** No new log line.

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

**Phase 2 — the import landing.** Steps:
1. Change `lock-landing.ts`, `app.vue` and `import.vue` as § Arc 2 says.
2. In `lock-landing.test.ts`, add two cases: an import that holds a session locks; an import that holds none settles. The existing cases stay.
3. In `pages/import.test.ts`, add: a completion that resolves after the page unmounted releases no window, shows no toast and pushes no route; a mounted completion still does all three (the control).
4. In `backup-restore-sw-restart.test.ts` scenario B, change only the post-kill terminal observation. Accept the lock screen, or the errors screen's Continue followed by the lock screen. Log which path ran. Assert the page never reaches `/popup/general`. Keep the no-rollback, never-torn and reopen assertions.
5. Replay chaos seed 1003 once on the base build and once on the fix, with the issue's command (§ #1138 Record). Expect O1 on the base and none on the fix.

Validation gate. From the repo root: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, then `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-sw-restart.test.ts` (Chrome; the scenario is Chrome-only), and the step 5 replay: the issue's command with `NULO_E2E_RETRY=0` added, from the repo root. Pass: green; the replay red on the base and green on the fix. Record the scenario's runtime before and after. Layers: unit, component, network e2e.

## UI impact

- Lock screen (`auth.vue`): after a profile switch, the password field is empty and masked, and Continue is off. Before: the earlier text, its mask state and a wrong-password shake.
- Back up profile › Account and › Recovery phrase: when the wallet locks with the page still mounted, the page returns to its first step, and a passkey prompt it had open closes, as it does when a lock unmounts the page. Recovery phrase also does so on a profile switch. Before: the page kept its step.
- Home's "save your recovery phrase" reminder: a reveal that settles after a profile switch no longer marks the earlier profile's phrase saved, since its words are no longer shown. Before: the words showed under the new profile and the earlier profile's reminder went away.
- An import that a worker restart overtook after its restore: the lock screen, with no "Profile imported" toast after the unlock. Before: Home with no session behind it. The import's errors summary is not shown; Home's restore banner names a skipped account state after the unlock (OA-2).
- #1218: none; no site changes.

No copy or layout changes. The lane brief pre-clears the first two as mirrors of Unlock method's reset; OA-2 carries the third to the owner. Each PR body carries its screenshots.

## Known limits (filed closed at the close-out)

- KL-3: an import still before its finalize, in a popup whose shell another window's unlock marked open, is unmounted by a restart (OA-2 shows it to the owner). Reopen on a report.
- KL-4: a lock inside `persistToken`'s own window still lands the seeded token row. Reopen if the campaign meets O3 on a seeder-written `tokens` row.
- (KL-2 was withdrawn with the poller fence, alternative F.)

## Delivery

- Arc 1: branch `lock-window-1-a1` off `worktree-lock-window-1` (which holds this plan), then `gh stack init --base dev lock-window-1-a1` (an existing branch is adopted). PR title: `fix(popup): the lock screen and export pages drop what a session left typed` (≤ 92). Body: `Closes #1183`, `Closes #1225`, the screenshots, the gates, a pointer to the #1218 comment.
- Arc 2: `gh stack add lock-window-1-a2`. Title: `fix(popup): an import a restart overtook lands on the lock screen` (≤ 92). Body: `Closes #1138`, the e2e runtime before and after, the replay result.
- Close-out: `gh stack add lock-window-1-close-out`, docs only.
- `code_review: off` on every arc. No lane split: the arcs are independent but short, and one session runs them in order.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 78f5f9171. What is specific to this plan:
- **Loop placement.** The Codex loop runs per arc at its boundary, while the arc is the stack tip. Start it with `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume it with `resume-codex.sh` and the fix diff. Hard stop at three rounds.
- **Arc map for the prompt.** Arc 1 of 2 resets three pages and the countdown; arc 2 changes the lock landing and the import page's completion.
- **Opus leg.** One Opus `general-purpose` review runs beside each arc's first round.
- **Cross-arc pass.** After both arcs, one fresh Codex session reads the net diff from 78f5f9171 with the cross-arc ask.
- **Delivery.** `gh stack submit --auto`, then `gh pr edit` for each body; no label at creation. Then `gh pr checks <n> --watch` for each PR.
- **Close-out.** As the standard's step 4. `Known limits:` names KL-3 and KL-4. `Open items:` names #1218 (OA-1, OA-3, D11) and whatever OA-2 leaves.
- **Teardown** (standing authorization). Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/lock-window-1/plan.md` succeeds, run `agent-worktree done lock-window-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high): `reject`. Each blocking finding and what the plan did with it:
- (1) Ownerless rows dispatch after an awaited re-read. Accepted: the fence's invariant was stated for profile rows only (moot after F).
- (2) At the cap, a refused marker strands. Accepted: verdicts keep the epoch rule (D4, alternative E).
- (3) The departed import page's completion still runs. Accepted: the `isUnmounted` guard (D7).
- (4) Scenario B cannot reach the new assertion. Accepted: the terminal observation is rewritten, and the seed 1003 replay is the red-on-base proof.
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

## Seeds

Not run; the orchestrator spawns each arc.

```
/goal Arcs 1 and 2 of implementations-plan/lock-window-1/plan.md each have every phase marked ✓ with its gate pasted, a converged Codex loop quoted, and an open PR in the lock-window-1 stack on dev; bun run test:all and bun run lint exit 0 on the stack tip.
```

```
/loop 15m Drive implementations-plan/lock-window-1 forward per its plan.md: rebuild the task list from the phase headers, run the next phase's gate, run each arc's Codex loop at its boundary, open PRs only after the loops converge; never merge.
```
