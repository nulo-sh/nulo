# Phase 1: arc C1

Every consult, gate and meaningful attempt of arc C1. Paths repo-relative.

## C1.1 design consult (2026-10-25, Codex gpt-6.1-sol, high, read-only)

Asked, before any driver: challenge the pure layer (`apps/extension/tests/e2e/helpers/profile-chaos/model.ts`, `checkers.ts`, `apps/extension/scripts/e2e/profile-chaos-model.test.ts`) for false greens, and five deviations. Verdict: "fix the gaps below before building drivers; several false greens are reproducible in memory." Each finding was reproduced or read in the tree before its disposition; all twelve accepted:

1. A planned restart's unobserved log window stays incomplete (D5 holds, D24). My proposal to count it green after a drain right before the stop was withdrawn: the store persists on a debounce (`apps/extension/src/wallet/logger/store.ts:115-127`) and a timer can log between the drain and the stop.
2. O4 copied raw error text into a violation: the message now names the error's class and the text rides in `detail`, kept only in the local record after masking.
3. `ownerOf` needed the owner to be known, so an unknown owner of a plain root row read as ownerless and passed. Now a sealed row's owner is its envelope's, a plain root row's is its id up to the first separator, a value key has none; a sealed family's row without an envelope is its own violation.
4. O6 passed a profile that imported a file with no sentinel read back, and compared siblings at index 0 only. Now the sentinels must be exactly the model's, and every overlapping index is compared.
5. A held restore's successor did not follow its stage: now per stage and competing step, with a fixed cleanup lock (D22).
6. Delete is reachable twice more: the restored profile once `account-state` holds (`apps/extension/src/composables/useFullBackupImport.ts:483`), and from the lock screen through Forgot password (`apps/extension/src/popup/pages/settings/security/reset.vue:5`) (D22, D23).
7. Background ownership by the step's two endpoints missed `verifyAll`'s intermediate profiles and a restore target's network seeding (`apps/extension/src/wallet/services/network/service.ts:366-380`): a background write may also land for a profile the contract names. Boot integrity verification covers only the active profile (`apps/extension/src/wallet/services/account-integrity/coordinator.ts:112-114`), so no wider rule is needed.
8. Replay lists accepted a reused profile ref (two `P1`s) and an account index of -1: refs a step introduces must be new, indices non-negative integers below the derived count, and a duplicate answer given exactly when the wallet warns.
9. O1 passed an open session with the anchor on the lock screen, and a locked reading that never tried a protected call: both are violations now.
10. O5 passed a settle past its bound when the state was reached: the elapsed time is checked too.
11. The disconnect allowance covered whole families, strict toggles and double unlocks included: scoped by `endsOf` (D24).
12. Several citations pointed at comments or the wrong file: every `code:` source now names the implementing line, and a unit test fails on a cited file or line that no longer exists.

It found the driver split sound (D21).

## C1.1 gate (2026-10-25)

- `profile-chaos-model.test.ts`: 124 tests, 30 consecutive runs at retry 0 on the committed state, 30/30 green (11 s to 35 s per run on a shared host); the three files' SHA-256 matched before and after the 30 runs.
- Fast layers: `bun run lint`, `bun run typecheck:all` and `bun run test:all` green; the first `test:all` caught `browser-seam.test.ts` refusing the model's capability fields under the driver flags' names, so `Caps` names capabilities and the spec maps the facts (D21); the extension suite then passed again, 15,304 tests.
- Every break fixture prints its violation as `[break] <oracle> <label>: …` in the verbose reporter's output; each one fails for its own reason only (two O6 fixtures that also tripped the sentinel or recorded-address check were isolated).

## C1.2 drivers on Chrome (2026-10-25)

Every red seed while the drivers came up was read to its cause before the next run; each was a harness gap fixed in the harness, a model clause the wallet's code contradicted, or a product finding filed.

Harness gaps, fixed where they arose:

1. The log store clears its ring when the config loads (`apps/extension/src/wallet/logger/store.ts:150-153`), so a run that expected id 1 read a gap at boot: the run takes the ids present at its start as the baseline and checks those lines at step 0.
2. Masked details still carried URLs: the mask keeps loopback origins only.
3. With no node behind smoke, the Local Network seed's first reads failed with `Failed to fetch`: the run holds a node stand-in for that origin, and reds on any request it missed. The stand-in's refusal is accepted on such runs only (D25).
4. The popup's router view is unkeyed, so re-opening the route a page already shows kept its last error on screen and the next step read it as its own: `openRoute` leaves the route first. Error snackbars stay until closed, so every step starts by closing them.
5. A confirmation popup's leave never finishes in headless Chrome, and a later step pressed the stale `confirm-submit`: every answer waits for the leave and removes a stuck one (`settleClosedPopup`).
6. Settings pages have no header lock: a lock goes through Home. A route with a query (`#/popup/import?from=/popup/auth`) never matched an exact hash wait: waits compare the route without its query.
7. A successor background still booting closes a port unanswered: a restart settles once a fresh port is answered. The harness's own service probe printed `Unchecked runtime.lastError` as a console error: it reads `lastError`.
8. Delete shows the lock screen before its purge ends, so O3 read tombstone leftovers: the delete settle waits for the tombstone to clear (`apps/extension/src/wallet/services/profile/service.ts:1607`).
9. Chrome's virtual authenticator holds three resident credentials; a fourth create is refused at once with `NotAllowedError`. The planner mints no more than the browser holds (`residentCredentialSlots`, D27).
10. The slot-frame check assumed one frame for `dekSealed`: a password profile seals it as an `EncryptionKey` frame (version 0) and a passkey profile as a `sealFrame` (version 1); the frames are per method.

Model clauses the wallet contradicted, each cited to the implementing line: strict mode is offered to password profiles only (`apps/extension/src/popup/pages/settings/security/lock.vue:195`); a lock deletes a persisted session row even with none in memory (`apps/extension/src/wallet/services/session/session-manager.ts:427`); a refused or cancelled picker import leaves the wallet locked (`apps/extension/src/popup/components/popups/SelectProfilePopup.vue:147`); a password change reopens the session, so its bearer follows strict mode (`apps/extension/src/wallet/services/profile/service.ts:1319`).

Product findings, filed after a dedupe search:

- #1131: a gas-balance retry that outlives its profile's deletion logs at error level (`apps/extension/src/wallet/services/execution/gas-balance-reader.ts:220-235`). S4. A reduced five-step list reproduced it in about one run in five; on the smoke runs, where the first read always fails, it meets four seeds in five.
- #1132: `Client disconnected` reaches the log at error level through Vue's default error handler. S4. Reproduced in one run in four on seed 4's prefix (stack through Vue's runtime core), not in 10 runs on seed 5's.

Both are listed in `KNOWN_FINDINGS` (D26): a seed that meets one stays red and names it, and its run goes on.

## C1.2 gate (2026-10-25)

- Seeds 1-5 on Chrome, retry 0: every seed ran its 25 steps with no violation not filed and no check that threw. Seed 1 incomplete from its planned restart only; seeds 2-5 red on #1131 or #1132 only. Test time per seed 32-53 s with its launch (step time 28-49 s); 0 close failures over 5 launches holding 6 planned restarts.
- I1: coverage lines across the five seeds name every action family but the network ones. I3: every warn and error line was drained in default mode. I4 on Chrome: `verifyAll`'s attempts with another profile's credential were refused. I2 on Chrome: a hold on a second page was acknowledged after 12 ms with no session open.
- `passkey-paths`, `passkey-retry` and `passkey-backup`, unedited: 3 files, 15 tests green on Chrome and on Firefox.
- `profile-chaos-model.test.ts`: 137 tests, 30 consecutive runs at retry 0, 30/30 green, the model, checkers and test files' SHA-256 unchanged over the 30 runs.
- A false green found reading the spec before commit: a seed that met no violation passed with a step it never ran, an unplanned restart or a log-id gap. The spec now fails on `evidenceGaps`, which forgives a planned restart's log window only, with a break fixture per gap; seed 1 replayed after the change still ran every step, its restart the only gap. The 30-run count is repeated on the final head.
- Fast layers after it: `bun run lint`, `bun run typecheck:all` and `bun run test:all` green (extension 15,318 tests).

## C1.3 Firefox smoke (2026-10-25)

Every red read to its cause before the next run:

1. Every first profile create red at step 0 with a `Client disconnected` page error (6 of 6 lone creates, password and passkey alike). The popup's network watcher fires twice on a first profile; the second run's `replaceAccountClient()` disconnects the account client the first run still awaits (`apps/extension/src/popup/app.vue:250`), and the superseded run's rejection is never awaited. The popup prevents every disconnect rejection and logs it at debug (`apps/extension/src/wallet/logger/console-forwarding.ts:16-21`), but a probe showed both browsers' captures report a rejection the page prevented. Firefox met the same rejection after a password change and an account add, so the allowance holds at any step for that exact text (D28).
2. The disconnect allowance never matched on Firefox: Puppeteer's BiDi path builds the page error from Firefox's text, class included (`Error: Client disconnected`), while its CDP path moves the class into the name. Page errors are recorded as `<class>: <message>` on both (D29).
3. After a refused import, a second window's unlock left the anchor on Import, and O1 read that as a lock screen shown while open. The popup leaves only `/popup/auth` and `/popup/register` for Home once a profile is active (`apps/extension/src/popup/should-advance-to-general.ts:3`), so O1's open rule is those two, pinned to the wallet's list, and the driver waits for the anchor to leave them (D30).

Product findings:

- #1133 (new, S4): a lock during a held passkey unlock leaves the bootstrap's `Wallet locked` refusal unhandled, logged at error. 3 of 3 on Firefox with a three-step list, 0 of 2 on Chrome. A temporary diagnostic build, reverted and rebuilt before any further run, named the refused call, `getOrInitNetworks`; the cause stated in the issue (`runActivation` awaits `getProfiles()` before it attaches to the core's promise) is inferred from the code.
- #1131 widened by a comment: the same gas-balance retry logs `Wallet locked` and `PXE_STORE_KEY_MISSING` when a lock, not a delete, ends the session inside its window (Firefox seed 2, `verifyAll`).
- #1135 (new, S4): protocol FPC discovery that a lock interrupts logs `Failed to discover FPC … PXE_STORE_KEY_MISSING` at error, once per FPC. No replay met it (0 of 3 replays of seed 2's prefix, 0 of 7 `verifyAll` steps in one list that repeats it), but five Firefox seeds did (2, 1005, 1008, 1010 and 1018), always at `verifyAll`, which locks each profile it opened: the window is one registration long. Filed on that recurrence, with the replay counts in the issue.
- #1133 widened by a comment: a second window that locks while its own bootstrap runs leaves the same refusal unhandled, as `Wallet locked` (3 of 8 locks in one repeated list) or `Profile locked` (seeds 2 and 1003; 0 of 3 replays of 1003's prefix). Both texts come from the one bootstrap core, whichever call the lock meets first; the `Profile locked` call is inferred from the code (D37).

Facts checked on Firefox: one run minted four passkeys with no refusal (D27's unbounded slots); I2 holds (a hold on a second page acknowledged after 100 ms with no session open); I4 holds (`verifyAll`'s attempts with another profile's credential refused, every Firefox seed).

## C1.3 network spec and baseline (2026-10-26)

- The model test imported `bindProfile` from `state.ts`, which type-imports the browser fixtures, so `tsconfig.scripts.json` compiled the whole e2e graph without its `ProvidedContext` augmentation and `typecheck:all` failed with 18 errors in files the change never touched. `bindProfile` now takes the pure `Bindings` and lives in `checkers.ts`; keep every import of `scripts/e2e/profile-chaos-model.test.ts` on the pure modules (`model`, `checkers`).
- `bun run e2e:agent` exists only at the repository root (`package.json`); from `apps/extension` it is "Script not found".

- The sandbox run's first seeds stopped at their first step on the PXE service's error line for a not-yet-synced header read right after the move to Local Network (#1136, 4 of 5 seeds), and once on a deletion's purge refusal. Both callers recover; filed as one issue, since one logger demotes neither.
- Seed 1002 on the sandbox met O3 on a row added for a locked profile: a fee-payer discovery started before the lock stored its row after it (#1137). The row-seal keys stay in the worker across a lock by design, so the write succeeds; O3's detail now names the change's kind (added, changed, removed) to tell a late write from a late removal. A three-step list reproduced it on its first run.
- A lock from another window routes the import page to the lock screen while the restore's last stages run on and then open the restored profile. The held-restore driver had locked as soon as the page left the import route, and lost the race to that activation (an O1 red on the driver list; temporary harness logging, reverted, named the order). The wallet was already locked when the competing lock landed, so the restore opening its own profile is its designed end: no finding. The driver now waits until the listed profiles and the session hold still for 5 s.
- Firefox refused the held passkey unlock once the playground's window took focus (`NotAllowedError`, shown as a failed unlock): WebAuthn needs the focused window (FIREFOX.md). The driver brings the popup to the front before releasing the hold, as a person returns to the popup to answer.
- A Codex resume can die on "Selected model is at capacity" with exit 0 and no response file; resuming the same session after a pause completed it.
- A signed commit hung twice with the hooks passed; `env -u SSH_AUTH_SOCK git commit` signed at once.
- Codex round 3: the 5 s quiet window could not prove a held restore had ended, and a session left on the wrong profile was hidden by the cleanup lock. Nothing on the page marks the run's end once a lock routes the page away, and on that path the errors screen never renders. The import run now logs one debug line where it ends, and the driver waits for it (D43).
- Seed 1003 on Chrome stopped at `restoreHeld` (account-state, restart) with Home shown while the worker held no session. After the restart, the open import page kept `isLogined`: `/popup/import` is not auth-required, so the reconnect's lock landing settles, and the import's completion read the stale flag as activation (#1138). Replayed 3 of 3. `toLockScreen` now names that state instead of timing out.
- On Firefox, `page.isClosed()` is still false right after `page.close()` resolves; the close event comes later. `abandonCeremony` waits for it with `waitForPopupClosed`. The immediate check failed three Firefox seeds of five.
- Two hand lists cover every held-restore pair the gates had not reached on the final harness (Chrome: lock at account-state, restart at both stages; Firefox: lock at both). Each needs a step between a create and the next lock, or #1137's late fee-payer row stops the list at its first lock. The rollback's `restore failed` line was the only unclassified error (D44).
