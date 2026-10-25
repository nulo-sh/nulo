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
