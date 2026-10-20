---
plan: exists-notice-1
tier: light
status: arc 1 in review as a draft (OA-1 unsigned)
issues: "#914 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at eb0dd17fa
trunk: dev
post_implementation_hardening: not scheduled
---

# exists-notice-1: a passkey whose profile is already here gets its own refusal and its own words

One arc, one draft PR against `dev` (§ Delivery). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issue, checked (#914)

**Demonstrated.** Initial conditions: a passkey profile "Daily" exists; the wallet is locked. Events: lock screen → profile list → Import → Passkey → pick Daily's passkey. `importPasskeyProfile` throws a plain `Error("Passkey profile already exists")` (S2, `service.ts:2166-2168`; S1, `:2083-2089`, when the handle differs). It crosses the RPC as a message; `handleImportPasskey`'s catch (`useProfileImportFlow.ts:211-217`) shows `passkeyImportFailedNotice()`, which blames the authenticator. Invariant broken: a refusal names its cause. Consequence: the person is sent to try another authenticator. Reproduced on the base build (`screenshots/exists-today-*.png`). Every claim in #914 held; recon found two more flows:

- **F3, Firefox's toolbar panel.** The panel is closed by then; the passkey window says "Couldn't / import the passkey", "Close this window and try again from Nulo." (`passkey-copy.ts:31,49`; `screenshots/window-today-*.png`): the same misdirection.
- **F4, a passkey full-backup restore** reaches S3 (`service.ts:2495-2498`) and shows "Import failed / Passkey profile already exists" in the full-backup box. It already names the cause.

## Outcome & Quality Bar

For a person who imports a passkey that already has a profile here, from the popup, Firefox's panel or onboarding:

- The words say this passkey already has a profile in this wallet and where to find it, in the popup notice and the Firefox passkey window. Every other passkey import failure keeps today's words byte for byte, a plain error with today's very message included.
- The route is typed from service to screen (F1-F3): no code reads a message string, and the component test rebuilds the error from its wire payload before the page sees it.

Good enough: the full-backup box (F4) keeps its words; the way to the profile list stays a sentence, not a button.

## Architecture & Implementation

- **Typed refusal.** `PasskeyProfileExistsError` in `packages/extension-messaging/src/errors.ts`: `CODE = "PASSKEY_PROFILE_EXISTS"`, default message `"Passkey profile already exists"` (today's text, so F4's box and the logs read the same), `details?: { existingProfileName?: string }` as `DuplicateWalletError` has, listed in `REBUILT_AS` so the concrete class is rebuilt. Popup-only RPC: `error-envelope.ts` and `rpc-cancel.ts` get no entry.
- **Throw site** (`wallet/services/profile/service.ts`). Only `assertNotDuplicateCredential` (S1) throws the typed error: `.some` becomes `.find` and the matched live, readable passkey row names itself. In `importPasskeyProfile` and `commitRestoredPasskeyProfileHoldingLock` the S1 call moves above the id check (S2, S3), which stays a plain `Error` with today's text. Both checks run under the same lock before any write, so the refused set is unchanged; only the class differs when both apply. When no live, readable row holds the credential, an id clash (a reserved id, an unreadable row, another credential stored under the same id) keeps today's plain refusal (EN-D2). `restorePasskeyProfile`'s catch keeps flattening to `restoreError` (EN-D5).
- **Popup and onboarding.** `UseProfileImportFlowOptions.notifyImportFailed` becomes `(err: unknown) => void`; `handleImportPasskey` passes its catch's error. `passkeyImportFailedNotice(err: unknown)` (required) returns the exists notice for `err instanceof PasskeyProfileExistsError`, named when `details.existingProfileName` is a non-empty string (the wire is unvalidated; otherwise the nameless form), and today's notice for anything else. Both shells: `notifyImportFailed: (err) => notificationStore.create(passkeyImportFailedNotice(err))`. No new export, so `auto-imports.d.ts` does not change.
- **Firefox window (F3).** `PasskeyStepOutcome` gains `"exists"` (`wallet/services/passkey/spec.ts:64`). `reportToPasskeyWindow` finishes with `"exists"` for the typed error, else `"failed"`. The window (`popup/windows/passkey/index.vue`) gains state `step-exists`: the failed tone, `passkey-window-error`, Close only, as `step-failed`; its title and body from `passkey-copy.ts`. `popupReturn` still fires only on `"done"`.
- **Docs in code:** the outcome contract (`passkey/spec.ts:63,74-77`), the window's state list (`index.vue:13-17`), `importPasskey`'s doc (`profile/spec.ts:322-329`) name the new outcome and class.
- **Not changed:** `useFullBackupImport.ts`, the full-backup box, `NotificationManager.vue`, the create flow.

## Decision ledger

Audit round 1: Codex (gpt-6.1-sol, high) and Opus (Plan), both `conditional approve`; every condition below is folded.

- **EN-D1** A new `WalletError` subclass; not `DuplicateWalletError` with a flag (the warned, confirm-retry path), not a message match.
- **EN-D2** The typed error means "a live, readable passkey profile here holds this credential", proved by S1's credential match. Both legs showed the first draft's id-based typing wrong for an unreadable row (`contains` true, `get` undefined, absent from `getProfiles`): the notice would send the person to a profile the list never shows. A reserved id (a failed purge keeps it across restarts) is the same case. Moving S1 above the id check types exactly the realistic case with no new helper; the rest stays today's plain refusal and notice.
- **EN-D3** The notice is chosen in the pure `passkeyImportFailedNotice(err)`, not by a second injected option: one place, one test, one wiring line per shell (both legs agree). The parameter is required, so a call that forgets the error does not compile.
- **EN-D4** F3 is in scope (both legs agree): Firefox's panel is a first-class surface and the fix is one union member and one window state. `"exists"` never triggers `popupReturn`. The outcome carries no name, so the window's words are nameless.
- **EN-D5** F4 stays as it is (both legs agree): its box already names the cause; new words there mean re-typing `restore`'s result and branching in `useFullBackupImport.ts`, which migration-rule-1 holds. OA-2 asks the owner.
- **EN-D6** The error carries the matched profile's name in `details`, never in its message (logs keep `{ name, message }` only).
- **Rejected:** a credential check on the id branch (Codex, plausible): EN-D2's reorder makes it moot. A security claim that the refusal needs a fresh ceremony (Codex): corrected below.

## UI impact

- **The popup's and onboarding's notice for an existing passkey profile** (`NotificationManager`, `notification-description`): today "Profile import failed / … This authenticator may not be supported … / Note: Windows Hello … / OK"; after, OA-1's recommendation. The lane brief's record: "Build your recommended option. The PR opens as a **draft** and stays one until the owner signs; its body lists the options and quotes no sign-off."
- **The Firefox passkey window after that import** (`passkey-window`, `data-state="step-exists"`): today "Couldn't / import the passkey / Close this window and try again from Nulo."; after, OA-1's window words, under the same record.
- **Unchanged:** every other passkey import failure, a reserved or unreadable clash, the full-backup box (F4), the window's other states. No accessibility change: the window state reuses `step-failed`'s alert dialog, the notice its button.

## Security & Adversarial Considerations

- **Boundary.** Profile and passkey RPCs accept extension pages only (`packages/extension-messaging/src/core/sender-auth.ts`); a response goes to the asking port. A trusted page can hand `importPasskey` credential data without a ceremony, so sender authentication, not WebAuthn, is what stops an outside page probing which passkeys have profiles; this change adds no new probe (today's message already crosses). The dApp envelope maps unknown classes to a constant.
- **Data.** `details` carries a profile name the lock screen already shows; never key material, credential id or user handle. Vue interpolation escapes it. The logger keeps an `Error`'s `{ name, message }` only.
- **Integrity.** The refuse-before-write order holds at every site regardless of `allowDuplicate`; no refusal is loosened. Crypto, storage, supply chain: untouched.

## Assumptions

- **Facts.** (1) S1 at `service.ts:2083`, S2 at `:2166`, S3 at `:2495`; S2 and S3 run before S1 today. (2) `REBUILT_AS` keeps the concrete class; an unlisted code rebuilds as a base `WalletError` (`errors.ts:613-662`; `errors.test.ts:370-387`). (3) Both shells wire the same notice (`popup/pages/import.vue:139`, `onboarding/pages/import.vue:113`). (4) PATH B learns `"done" | "failed"` only (`passkey/spec.ts:64`; `service.integration.test.ts:1154-1162`). (5) F4 flattens to `restoreError` (`service.ts:2465-2472`) and shows it (`full-backup-restore.ts:102-110`). (6) `contains` reads keys, `get` decodes (`entity_storage.ts:176-186`).
- **Inferences.** Onboarding reaches the refusal when the same passkey is imported twice (Back after an import, or a second tab); the profile may be open or locked by then, since S1 reads stored rows, not sessions. #743 edits other hunks of `service.ts`, `service.integration.test.ts`, `onboarding/pages/import.vue` and its test, and `passkey-toolbar-panel.test.ts`: textual merges expected.
- **Asks.** OA-1 (the words; onboarding shows the same ones) and OA-2 (F4). The arc ships OA-1's recommendation as a draft and OA-2's "unchanged".

## Phase 1: the typed refusal and both surfaces (arc 1) — ✓

Change map: § Architecture, plus the tests below. Commit after each step.

1. Add the class, its `errors.test.ts` row (`rebuild: pass`) and its default-message row.
2. Change S1 and the call order. `service.integration.test.ts`: (a) the same passkey imported again rejects with `PasskeyProfileExistsError` naming the first profile (the realistic path, through S1); (b) the "(i)" case asserts the class; (c) one `test.each` over a reserved id (the failed-purge setup), an unreadable row, and a readable row under the same id holding another credential: refused with today's plain error, the stored rows unchanged (read raw, since `getProfiles` hides an unreadable row); a fresh import writing its row stays the success control; (d) a passkey restore over the existing profile returns `restoreError === "Passkey profile already exists"`; (e) PATH B: `:1155`'s outcomes become `["done", "exists"]`. `passkey/service.test.ts`'s popup-return loop gains `"exists"` (no return); `"done"` stays its control.
3. Change the composable, the notice and both shells. `profile-flow-notices.test.ts` pins the exists notice (named and nameless) and today's notice for a plain `Error`, exactly. New `popup/pages/import.passkey-notice.test.ts`: mount `import.vue` with the real `useProfileImportFlow`, a real `createPinia()` and `NotificationManager` under one host attached to `document.body`; mock `@/utils/core`, `browser-surface`, `onboarding-tab` and `vue-router`; stub `PasskeyCeremonyDialog` and emit its `resolve`; `importPasskey` rejects with `walletErrorFromPayload(new PasskeyProfileExistsError(undefined, { existingProfileName: "Daily" }).toPayload())`; read the notice in `document.body`. Its control rejects with `new Error("Passkey profile already exists")` and reads today's notice. `onboarding/pages/import.test.ts`: `handleImportPasskey` with the typed rejection creates the exists notice.
4. Change the window and its copy. `popup/windows/passkey/index.test.ts`: an `"exists"` outcome shows `step-exists`, its words and Close only; the `step-failed` cases stay as controls. `tests/e2e/passkey-toolbar-panel.test.ts:386` waits for `data-state="step-exists"`; its deleted-profile success half stays.
5. Take the pictures (OA-1): Chrome popup and Firefox window, one build per option.

**Validation gate.** From the worktree root: `bun run audit:vue` and `bun run test:all`. Then, armed builds first: `cd apps/extension && NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/passkey-toolbar-panel.test.ts --retry=0` (the touched file, Firefox-only) and `bun run test:e2e -- tests/e2e/passkey-paths.test.ts --retry=0` (Chrome passkey import). Pass: every command exits 0; with the new class kept and the behaviour reverted (service, notice, window), (a), (e), the page test's typed case and the window case go red on assertions, while (c) stays green; typing the id clash instead turns (c) red; no timeout, retry or snapshot changed; the touched e2e file's Firefox wall-clock is recorded before and after.

## Delivery

One arc, one PR, base `dev`, branch `exists-notice-1-a1` off `origin/dev`, opened as a **draft** after the Codex loop converges (OA-1 is unsigned). Title: `fix(passkey): an import of a passkey already in this wallet says so` (67 chars). Body: what and why, the gates with outcomes, the Firefox file's wall-clock before and after, OA-1's options with the pictures, no sign-off quoted, `Closes #914`. No label at creation; add `e2e:extension-smoke` only if the path filter skips smoke. The close-out (Outcome, lessons, `git mv` to `archive/`) lands as the PR's final commits after the owner signs and the orchestrator says so.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at `eb0dd17fa`, single-arc placement: step 1 absent (`code_review: off`); step 2 on `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff origin/dev...HEAD`, both verbatim rules in every prompt, one Opus `general-purpose` review beside round 1, hard stop at three rounds; step 3 as § Delivery (draft, `gh pr checks <n> --watch` once); step 4 after sign-off; step 5 `agent-worktree done exists-notice-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/exists-notice-1/plan.md` succeeds. The orchestrator merges.

## Audit verdicts

- **Round 1, Codex** (`conditional approve`): unreadable or non-matching occupancy must not get the typed notice (accepted, EN-D2); the page test must resolve the ceremony and render the notice (accepted, step 3); pin reserved precedence, the same-message plain control and `"exists"` with no popup return (accepted, steps 2-3); correct the security claim and citations, name `audit:vue` and the e2e timing (accepted). Rejected: a credential check on the id branch (moot under EN-D2).
- **Round 1, Opus** (`conditional approve`): the same unreadable-row finding (accepted); the page test's Pinia, teleport and dialog (accepted); OA-1's window lacks the Firefox note in the failed tone (accepted, fixed); pin `"exists"` in the popup-return loop (accepted); refresh three code docs (accepted); a required parameter and a guarded name (accepted). Onboarding's lock-screen wording went to OA-1.
- **Final fresh Codex pass** (`conditional approve`): the red/green gate could not fail on (c) as written (accepted: keep the class, revert the behaviour); id-clash wording needs "when no credential match exists" (accepted); onboarding's profile may be locked, not open (accepted, Inferences and OA-1); add a readable row holding another credential to (c) (accepted). Reorder confirmed safe: both orders refuse `I ∨ C` before any write, under the same lock, independent of `allowDuplicate`. Resumed on the fixes: `approve`, no new regression.
- **Fix loop, round 1** (Codex session `01a15736-35e9-74b2-9f11-5caae22d0dab`, gpt-6.1-sol high, over `git diff origin/dev...HEAD`): 0 material; two narration comments (`profile-flow-notices.ts`, the page test's helper), removed. **Opus diff review** beside it: clean; nit taken: test (a) holds a second profile so it proves the matched row is the one named; nit declined: `notifyImportFailed`'s doc tail states why the parameter exists.
- **Fix loop, round 2** (same Codex session, resumed on the fix diff): `clean`. Converged.

## Seeds

- `/goal` Phase 1 ✓ in plan.md with its gate passing in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); the draft PR open with `Closes #914`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/exists-notice-1: read plan.md; finish Phase 1 and its gate; run the Codex loop; open the draft PR; watch checks once; never merge; surface OA-1.
