---
plan: lows-1
tier: mid
status: completed
issues: "none public; the findings are tracked privately, so no PR says `Closes #n`"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg in parallel; final fresh Codex pass
base: origin/dev at 7eed331bb
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-06
- **Status**: completed in two arcs. Arc 1 merged as #1693; arc 2 is the PR from `lows-1-a2`, whose final commits are this close-out. The findings are tracked privately, so no PR closes a public issue.
- **Shipped**:
  - Arc 1: a restore opens its profile only on the admission its own commit set; an accepted explicit lock, a deletion, a worker restart and 30 minutes take it back (D1-D5).
  - Arc 2: Settings → Unlock method, the full backup and the account file take the new secret first and run the passkey card in the step it authorizes (OA-1 to OA-4, D6-D9, D15-D17); a lock that leaves the full backup open starts it over (OA-5, D11); password restores share the admission (OA-6, D13); a refused finalize says how to open the profile (OA-7, D14).
  - Pins in each page's and composable's unit tests, the chaos model and drivers, the e2e helpers, and the pictures in `screenshots/`.
- **Known limits**: none filed. The residuals are reported to the orchestrator privately and become `known-limit` issues only after the findings are published.
- **Open items**: none.
- **Dispositions**:
  - The import page shows the OA-7 sentence only when it is open and connected at the refusal; a lock routes it to the lock screen and a worker restart shows "Client disconnected", both keeping the profile (D18): no change.
  - Planning withdrew finalize's post-open re-check (§ Audit verdicts, final pass round 1).
  - No `lessons.md` promotion: its one candidate, vitest's `clearAllMocks` keeping `mockResolvedValueOnce` queues, is documented vitest behaviour, and the file sits at its budget.
- **Seeds retired**: the `/goal` and `/loop` seeds below.

# lows-1: a passkey answer is used in the step that collected it, and an explicit lock ends a pending passkey restore

Two arcs, one PR each against `dev`, no stack (the orchestrator's D-orch-1). **Arc 1** makes a passkey restore need an admission the worker gives at commit and an accepted explicit lock takes back, so a passkey restore locked before its finalize's admission check opens no session (service only, no screen change). **Arc 2** reorders three passkey flows so the new secret is typed first and the passkey card, the commit or the seal run in one step: Settings → Unlock method, Settings → Security → Export → Full backup, and the account file. The owner answered [OWNER-ASKS.md](OWNER-ASKS.md) OA-1 to OA-7 on decision page 111 (2026-11-06); the [owner decisions](#owner-decisions) quote each pick, and arc 2 also carries OA-6 and OA-7. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package.

## Scope

The three findings are tracked privately, with their paths and reproducers; this plan states only the behaviour each change guarantees. All three were re-read at 7eed331bb and still apply, with one change since their base: the unlock-method page already clears its step on a lock (`unlock-method.vue:243-248`), and the account-file page already resets on one (`account.vue:171`).

| Area | What changes | Arc |
|---|---|---|
| Restore | `finalizeRestore` of a passkey row needs the admission its commit set; an accepted explicit lock, a deletion and 30 minutes take it back | 1 |
| Unlock method (passkey profile) | the New Password step needs no card; Save runs the card and the commit; "Use a new passkey" asks the new passkey, then the current one, then commits | 2 |
| Full backup (passkey profile) | the file password comes first; one press runs the card, the export and the seal; only the sealed file is published | 2 |
| Account file (passkey profile) | the file password comes first; Save runs the card, the check, the sealed export and the download | 2 |
| Password restores | the same admission as a passkey restore (OA-6 A); a restore finalize refuses shows its own sentence (OA-7 B) | 2 |

Out of scope, with the reason: the password profile's own flows (`handleContinue`, `change-password.vue`, the password exports), which seal or commit under the credential that authorized them (D10); the file-password pair's single eye toggle, owner-owned UI that holds nothing once no answer is kept; the auto-lock (D4). Residuals that remain after both arcs are reported to the orchestrator privately and become `known-limit` issues only after publication.

## Outcome & Quality Bar

- **For whom:** a passkey-profile owner who changes the unlock method, exports a backup or an account file, or restores a backup; and the maintainer who inherits the profile service.
- **Excellent:** (1) every passkey answer is used in the step that collected it, and no page state holds one while the page waits for typing; (2) a passkey restore whose wallet was explicitly locked after the profile was written, and before its finalize's admission check, ends at the existing "Couldn't open the imported profile" outcome, its profile listed and locked, opening at the next unlock, with no restore marker left behind; (3) each passkey export seals under the pair snapshotted before its card, in the same run, and only the sealed form is published; (4) the service change is one secret-free record on an existing pattern, identity-checked as the rewrap context already is, and the comment at the lock is true again.
- **Good enough:** the password profile's flows keep their shape; no new copy beyond what the owner signs.

## Assumptions

**Facts** (verified at 7eed331bb):
1. `ExpiringStash` wipes on `drop`, `sweep` and expired `take`, checks expiry only on those calls (`has` and `get` check none), and relies on its caller to serialize (`expiring-stash.ts`). The facade lock that serializes it force-releases a holder after 5 minutes (`packages/wallet-core/src/utils/lock.ts`, `MAX_HOLD_MS`); finalize already reads the rewrap context's identity before its first await, so a same-id successor's entry is spared (`service.ts:2293-2324`, pinned by `service.integration.test.ts:4386-4404`).
2. `lockActiveProfile` calls `sweepStalePendingRestore(+∞)` before `close()`, so a failing close still sweeps (`service.ts:896`), unless its handle names a session that was replaced, where it returns first (`:893`; pinned by `service.integration.test.ts:843-868`). Only the popup's lock controls call it (`useLockWallet.ts:60`).
3. `finalizeRestore` already throws `SessionEndedError` (`service.ts:2281`), which survives RPC with its type (`packages/extension-messaging/src/errors.ts:693`); the popup shows a finalize throw as "Couldn't open the imported profile" plus the error's message and keeps the profile (`useFullBackupImport.ts:339-346`; pinned at `useFullBackupImport.test.ts:2068`).
4. `service.passkey-unlock.test.ts:147-159` calls `finalizeRestore` three times on one restore (a password, a wrong answer, the right answer): a refusal must not consume the admission.
5. At 1.0.0 a passkey restore kept its master in memory until finalize, and an explicit lock swept it (`service.integration.test.ts` at face80099, "an explicit lock drops every pending restore secret"), so a worker restart also ended such a restore. At HEAD it does not: the page holds the answer.
6. `changeUnlockMethod` checks the current credential against the row (`service.ts:1246`), opens it (`:1250`) and revalidates the live row under the lock (`:1288`, `:1303`); `exportAccount` and `exportResetHeldAccount` re-check a passkey answer (`account/service.ts:681-731`, `:738-757`) and require `encrypt` with a valid file password (`:108`). These prove the credential opens the row, not that a person is present or a session is live.
7. The chaos model cites `service.ts`, `useFullBackupExport.ts`, `account.vue`, `unlock-method.vue` and `useFullBackupImport.ts` by line, and its transitions encode the current order (`METHOD_CHECKS_HELD`, `ACCOUNT_FILE_*`, `FULL_EXPORT`, `FILE_PASSWORD_BLOCKED`; `tests/e2e/helpers/profile-chaos/model.ts:336-410`).

**Inferences:**
- I1. The 30-minute TTL is the rewrap context's existing bound, reused, not a measured import length. For a passkey restore it adds a finalize deadline: one whose pre-finalize part runs past it is refused and opens at the next unlock.

**Asks** (owner, through the orchestrator): OA-1 to OA-7, all answered on page 111 on 2026-11-06; see [Owner decisions](#owner-decisions).

## Owner decisions

Decision page 111, signed by the owner on 2026-11-06 at 14:12 UTC, no notes. Each pick is quoted as page, item, date, option and the option's sentence.

| Ask | Surface | The owner's pick |
|---|---|---|
| OA-1 | Unlock method, "Use a password instead" | page 111, P111-01, 2026-11-06, A: "Fields first; Save shows the card; the change is made once it is answered. Sentences and the Save label stay." |
| OA-2 | Unlock method, "Use a new passkey" | page 111, P111-02, 2026-11-06, A: "New passkey's card first, then the current passkey's, and the change follows at once. A cancelled second card leaves the new passkey in the password manager, opening nothing (as after a refused import today)." |
| OA-3 | Full backup, passkey profile | page 111, P111-03, 2026-11-06, A: "Continue → pair + “Create protected backup” → card → Creating → Encrypting → warnings + “Download protected backup” → saved. Warnings are read before a file exists, as on a password profile. A cancelled card or a seal failure returns to the typed pair." |
| OA-4 | Account file, passkey profile | page 111, P111-04, 2026-11-06, approved as written: "the empty “Confirm with passkey” step goes; the file-password pair comes right after “Agree & Continue”, and Save shows the card; a cancelled card keeps the typed pair; a failure after the card clears it and says “Failed to create the file”, as a failed Save does today." |
| OA-5 | Full backup after a lock that leaves the page open | page 111, P111-05, 2026-11-06, approved as written: "the page starts over at “Before you continue” after such a lock, as Account file and Recovery phrase already do." |
| OA-6 | Password restores and a lock | page 111, P111-06, 2026-11-06, A: "Same rule for password restores. Cost: a restore whose background worker restarts in the seconds between writing the profile and opening it ends at “Couldn't open the imported profile”; the profile is listed and opens at the next unlock with its password. Comments promising a finish after a restart are corrected." |
| OA-7 | What a stopped passkey restore says | page 111, P111-07, 2026-11-06, B: "“The import stopped before the profile opened. Unlock the profile to open it.” (new copy, only on your word)." |

## Decisions

| id | Decision | Rejected alternative and why |
|---|---|---|
| D1 | `restoreAdmissions`, a second `ExpiringStash<{ capturedAt }>` with a no-op wipe and the 30-minute TTL: set at commit for every restore, swept by `sweepStalePendingRestore` with no exception (so by the accepted lock at `+∞` and by the TTL), dropped by `deleteProfile`. | A lock-generation counter: an RPC contract, and a restarted counter can equal an old one (both legs). `chrome.storage.session`: persistent state and failure handling at the lock (OA-6). The rewrap context: `restoreImportedKeys` takes it before finalize. |
| D2 | Finalize reads `const admission = this.restoreAdmissions.get(id)` before its first await, beside `seenRewrap`. After the marker delete and the active-session no-op, a passkey row is refused unless `admission` is defined and still `this.restoreAdmissions.get(id)`. A successful open drops the entry only if it is still `admission`. A refusal never consumes it (Fact 4). | A post-open re-check that closes the session it opened (round 1): the final pass showed it needs a session-manager change on every open path, beyond this lane; the boundary is reported privately. Capturing after the marker delete: a parked finalize could take a same-id successor's admission. A check before the marker delete: a refused finalize would leave a marker the boot sweep reaps a week later. |
| D3 | The refusal is `SessionEndedError`; its doc widens to name a restore ended before it opened. Its message stayed in arc 1; arc 2's D14 gives the import screen its own sentence (OA-7 B). | A new typed error: new copy and a registry row for no change in what the person can do. `WalletLockedError`: untyped over RPC. |
| D4 | Only an accepted explicit lock, a deletion and the TTL end an admission. A lock the worker refuses as naming a replaced session, and a lock before the commit, end nothing, as at 1.0.0. | The auto-lock too: a short auto-lock would refuse long restores. Moving the sweep above the stale-handle check: an obsolete lock request would then cancel a successor's work. A run-start admission: a new RPC contract. |
| D5 | A passkey restore whose worker restarted before finalize is refused and opens at the next unlock, as at 1.0.0 (Fact 5): shipping behaviour, pinned, and named to the owner (OA-7); D13 extends it to password restores. | Persisting the admission: D1. |
| D6 | Unlock method, "Use a password instead": opens the New Password step with no card. Save validates the pair, snapshots it, then runs the current card, `verifyUnlockCredential` and `changeUnlockMethod` in one `attempt`; `heldAnswer` goes. A failed Save keeps the typed pair; the next Save runs a new card. | Dropping the verify: an answer that does not open the profile would lose its passkey failure copy (the commit's refusals read otherwise). The verify is not the authorization: the commit re-checks. |
| D7 | "Use a new passkey": the new passkey's card, then the current card, the verify and the commit, in one attempt. A cancel at the second card leaves the new passkey on the authenticator, opening nothing (#1151's class). | Asking the current passkey a second time before the commit: three cards. The current order: the verified answer waits on the create prompt. |
| D8 | Full backup, passkey profile: Agree shows the pair. Click and Enter both enter through one function that validates and snapshots the pair, then runs the card, the export, the assembly and the seal in one `runBackup`, publishes only `artifacts.sealed` (status `encrypted`), clears the fields and returns without downloading; Download saves it. A cancelled card, a failed seal or an oversized file returns to the pair step, and the next press runs a new card. The plaintext is never assigned to `ctx`. One helper holds the seal and the size check, used by both unlock methods. Password profiles unchanged. | One press that also downloads: the warnings (replaced key, unopened imports, added networks, recovery mode) would show only after the save (OA-3 B). Reusing `runEncrypt`'s stage transitions: its failure returns to `finished`, a post-card retry stage. |
| D9 | Account file, passkey profile: Save validates the pair and snapshots it with the scope (profile id, chain id, address, held or live) before its first await; then runs the card, returns on `undefined`, runs `verifyExportCredential`, the sealed export with the snapshots and the download; `inScope` is checked after the card and after the verify. `approval` and "Confirm with passkey" go. A cancel keeps the pair; a failure after the card clears it, as today. | Keeping the confirm step and a second card at Save: two cards per file. |
| D10 | The password profile's flows stay: they seal or commit under the credential that authorized them. | Reordering them too: UI changes beyond the findings. |
| D11 | `full.vue` resets on a lock with `watchLockStart`, as `account.vue` and `seed.vue` do; every passkey submit returns while `!appStore.isLogined`. A lock cancels work not yet sent and drops what a late answer would publish; an operation already authorized (its card ran on a pair captured before it) completes, and a download already handed to the browser lands, as today. | `useSecretCountdown` on post-card stages: nothing post-card is held. A cancellation contract for sent work: new protocol, no finding needs it. |
| D12 | Arc 2 opens no draft PR: the spawn prompt of 2026-11-05 (arc 2 starts on the owner's sign-off) supersedes the lane brief's draft line. | — |
| D13 | OA-6 A: finalize refuses any restore, either unlock method, unless its own admission stands. A password restore ended by an accepted lock, a deletion, the TTL or a worker restart is refused as a passkey one is and opens at its next unlock with its password; the comments that promised a finish after a restart (the torn-import age, the boot sweep, the pending-deletion resume) now say finalize is refused, clears the marker and keeps the profile. | Option B's session-storage record and Option C, not picked. |
| D14 | OA-7 B: when finalize refuses with `SessionEndedError`, the import screen keeps "Couldn't open the imported profile" and shows "The import stopped before the profile opened. Unlock the profile to open it." in place of the error's own sentence, for both unlock methods (D13 makes the password restore stop the same way). Any other finalize failure keeps its own message. | Copy for the passkey restore alone: a password restore stopped the same way would read the generic session sentence. |
| D15 | Chaos: `refuse` for a new-passkey change refuses the first prompt the page asks, the new passkey's create, which mints nothing. The unit layer pins a cancel at either card. | Refusing the second card: it leaves a minted credential the model's reserve does not track. |
| D16 | Full backup, passkey profile: a cancelled card, a failed assembly, a failed seal or an oversized file returns to the typed pair (OA-3 names the cancel and the seal failure; the other two are the same class). A card that fails otherwise (no PRF) or a refused key export keeps today's outcome: the "Failed to authenticate by passkey" toast, then the page leaves (back in the toolbar popup, a start-over in its own window, which cannot go back). A passkey run passes `""` → progress → encrypting → encrypted, never `finished`; at `encrypted` it shows the file's warnings and the "Backup is successfully encrypted" banner above Download, as the signed OA-3 A picture does. New testid `create-protected-backup-btn` on "Create protected backup". | Returning to the agreement on an assembly failure: a retry would retype the pair for a failure the pair did not cause. Keeping the pair after a failed card: a change to today's failure screen nobody signed. |
| D17 | Account file, passkey profile: a card failure that is not a cancel (no PRF, a timeout) keeps the existing passkey failure toast and the pair; a refusal after the card (the check, the export) clears the pair and says "Failed to create the file" (OA-4). Focus after that failure returns to the pair's first field: the pair mounts again (`:key`), and its autofocus takes the keyboard. An accessibility call under the owner's 2026-10-19 delegation, over Architecture's "focus moves to the Save button": Save is disabled once the pair clears, so focus there would be lost. | Focusing Save: a disabled control drops focus to the document. |
| D18 | Where the restore refusal shows (observed while capturing the PR's pictures): finalize refuses as D13 says, but the popup's import page shows the D14 sentence only when it is still open and connected at the refusal, as at the 30-minute limit. An explicit lock first sends the page to the lock screen (the profile stays listed and opens at its next unlock), and a worker restart surfaced "Client disconnected" in the capture: the run's finalize never reached the new worker. No change: both outcomes keep the profile and say nothing false. | Mapping a disconnect to the D14 sentence: a finalize that opened just before the restart would be told it stopped. |

## Architecture & Implementation

**Arc 1, service** (`src/wallet/services/profile/service.ts`):
- Field beside `pendingDekRewraps`: `restoreAdmissions = new ExpiringStash<{ capturedAt: number }>(ProfileService.PENDING_RESTORE_TTL_MS, () => {})`, with one doc sentence: what it admits, who takes it back.
- `sweepStalePendingRestore(now, exceptId)`: also `this.restoreAdmissions.sweep(now)`. One comment: `has`/`get` check no expiry, so this sweep, which spares no admission, is what enforces the TTL at finalize entry.
- `commitRestoredProfileHoldingLock`: `this.restoreAdmissions.set(id, { capturedAt: Date.now() })` beside the rewrap stash.
- `deleteProfile`: `this.restoreAdmissions.drop(id)` beside `pendingDekRewraps.drop(id)` (`:1678`).
- `finalizeRestoreHoldingLock`: D2. The capture sits beside `seenRewrap`, with one comment (a same-id successor's admission never stands in for this one); the gate sits between the active-session no-op and the type check; the identity-checked drop follows `finalizeOpenHoldingLock`.
- `lockActiveProfile`'s comment (`:894-895`) names what the sweep ends. `ExpiringStash`'s doc: "entries that expire", not only secret-bearing ones. `SessionEndedError`'s doc (`errors.ts:445-448`) and `finalizeRestore`'s RPC doc (`spec.ts`) name the restore refusal. The three worker-restart comments (`service.ts:194-198`, `:1719-1722`, `:1833-1836`) stay true: they name password imports.
- No change to `useFullBackupImport`: Fact 3.

**Arc 2, pages:**
- `src/popup/pages/settings/security/unlock-method.vue`: `step` gains `"newPassword"`; `isNewPasswordStep` reads it; `handleUsePassword` sets it; `handleSavePassword` (D6) and `handleNewPasskey` (D7); `attempt` returns while `!appStore.isLogined`; `heldAnswer` removed; `onKeydown` unchanged in shape.
- `src/composables/useFullBackupExport.ts`: D8. `runBackup(ctx, filePassword?)` seals inside the run when a passkey pair is given; `protectAndDownload` (and the page's Enter) enter a passkey run from status `""` through the validating function; `canEncrypt` follows. `sealForDownload(ctx, compact, password)` is the shared seal and size check.
- `src/popup/pages/settings/security/export/full.vue`: `handleAgree` stops starting the run; `FilePasswordSection` shows from Agree for a passkey profile; `watchLockStart` → `reset()`; the CTA label per OA-3; `onKeydown` per D8.
- `src/popup/pages/settings/security/export/account.vue`: D9; after a failure the pair mounts again and its first field takes focus (D17).
- `tests/e2e/helpers/profile-chaos/model.ts`: the transitions in Fact 7 change in meaning, not only line; `unlock-method.ts`, `accounts-io.ts` and `backups.ts` drive the new order.
- E2E that drive the old order (recon § Collisions) follow it with the same testids, except `account-file-confirm-passkey-btn`, which goes.

## UI impact

Every line is signed on decision page 111 on 2026-11-06 ([Owner decisions](#owner-decisions)).

- **Settings → Unlock method (passkey profile), "Use a password instead":** before: the card, then the New Password fields and Save. After: the fields and Save, then the card at Save. Signed: page 111, P111-01, 2026-11-06, A: "Fields first; Save shows the card; the change is made once it is answered. Sentences and the Save label stay."
- **Same page, "Use a new passkey":** before: the current card, then the new passkey's. After: the new passkey's, then the current. Signed: page 111, P111-02, 2026-11-06, A: "New passkey's card first, then the current passkey's, and the change follows at once. A cancelled second card leaves the new passkey in the password manager, opening nothing (as after a refused import today)."
- **Full backup (passkey profile):** before: Agree runs the card, then the file password and "Download protected backup". After: Agree shows the file password and "Create protected backup"; a press runs the card and seals; the warnings and Download follow. Signed: page 111, P111-03, 2026-11-06, A: "Continue → pair + “Create protected backup” → card → Creating → Encrypting → warnings + “Download protected backup” → saved. Warnings are read before a file exists, as on a password profile. A cancelled card or a seal failure returns to the typed pair."
- **Account file (passkey profile):** before: "Confirm with passkey", then the file password and "Save account file". After: the file password and "Save account file"; Save runs the card. Signed: page 111, P111-04, 2026-11-06, approved as written: "the empty “Confirm with passkey” step goes; the file-password pair comes right after “Agree & Continue”, and Save shows the card; a cancelled card keeps the typed pair; a failure after the card clears it and says “Failed to create the file”, as a failed Save does today."
- **Full backup after a lock that leaves the page open:** it starts over at the agreement, as the account file and the phrase reveal already do. Signed: page 111, P111-05, 2026-11-06, approved as written: "the page starts over at “Before you continue” after such a lock, as Account file and Recovery phrase already do."
- **Restore, password profile (arc 2):** a password restore ended by a lock, a restart or the TTL before it opened ends at "Couldn't open the imported profile" and opens at its next unlock. Signed: page 111, P111-06, 2026-11-06, A: "Same rule for password restores. Cost: a restore whose background worker restarts in the seconds between writing the profile and opening it ends at “Couldn't open the imported profile”; the profile is listed and opens at the next unlock with its password. Comments promising a finish after a restart are corrected."
- **Restore failure screen (arc 2):** a restore stopped before it opened keeps "Couldn't open the imported profile" and reads "The import stopped before the profile opened. Unlock the profile to open it." in place of "The wallet session that approved this request has ended." Signed: page 111, P111-07, 2026-11-06, B: "“The import stopped before the profile opened. Unlock the profile to open it.” (new copy, only on your word)."

## Security & Adversarial Considerations

- **Boundary:** the profile's credential. What a passkey answer authorizes ends with the step that collected it; an explicit lock the worker accepts after a passkey restore's commit and before its finalize's admission check stops that finalize before it opens, checked under the facade lock, so no page-side check is relied on.
- **Guarantees:** (1) no page holds a passkey answer while it waits for typing; (2) a passkey restore reaches its open only while its own admission stands; (3) a passkey export seals under the pair snapshotted before its card, in the same run, and only the sealed form leaves the run; (4) a page left open after a lock cancels what it has not sent.
- **Least privilege / crypto / supply chain:** no new permission, dependency, key or cipher; the seals stay `sealFullBackupText` and `accountFileBody`; the admission holds no secret.
- **Input validation:** the pair is validated at the press, before any card; the service keeps re-checking every answer and file password (Fact 6).
- **Stated consequence:** D7's cancel leaves a passkey on the authenticator; D5's restart refusal.

## Phase 1 (arc 1): the restore admission ✓

Steps:
1. Make the service changes (Architecture, arc 1), then the doc and comment changes.
2. Add one `describe` to `src/wallet/services/profile/service.passkey-unlock.test.ts`, real crypto, each regression paired with its control:
   - (a) a passkey restore while a session is open, `lockActiveProfile(<that session's handle>)`, then finalize rejects `SessionEndedError`; no profile is active; the restored profile is listed; its restore marker is gone; `unlockPasskeyProfile` with the same answer opens it.
   - (b) control: the same with no lock opens; a second finalize returns without opening again.
   - (c) a lock whose handle names a replaced session leaves the restore to open (the boundary of D4).
   - (d) a same-id successor's admission installed while finalize is parked at the marker delete (the injection of `service.integration.test.ts:4386`): finalize rejects `SessionEndedError` and the successor's admission is still the one stored; installed while finalize's open runs, finalize opens and the successor's admission is still stored.
   - (e) the TTL: finalize at 30 minutes after the commit is refused, one millisecond before it opens (`Date.now` mocked).
   - (f) a restart before finalize (`boot({ api })` over the same storage): finalize is refused and the next unlock opens the row; control: a password restore across the same restart still finalizes (OA-6 unchanged).
   - Extend, rather than duplicate: `service.integration.test.ts:1799` (the lock's sweep, even when the close fails) and `:1816` (a deletion) each also assert that no admission remains.
3. Re-cite the chaos model by a line diff from base (`implementations-plan/lessons.md`, "Moving code the chaos model cites").

**Validation gate:**
- `bun run lint` and `bun run typecheck:all`: exit 0.
- `cd apps/extension && bun --bun vitest run src/wallet/services/profile/ src/composables/useFullBackupImport.test.ts src/composables/useFullBackupImport.stages.test.ts scripts/e2e/profile-chaos-model.test.ts --retry=0`: green. On the base copy of `service.ts` (from 7eed331bb, never `HEAD`), (a), (d), (e)'s refusal and (f)'s refusal fail, and (b), (c), (e)'s and (f)'s controls pass. (f)'s control shares its test with its refusal, so on base the test fails as a whole.
- `bun run test` and `bun run test:all`: exit 0.
- Smoke, on each browser `<b>` (`chrome`, `firefox`): build the armed smoke build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>`, then `cd apps/extension && NULO_E2E_BROWSER=<b> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/passkey-backup.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/restore-outcome.test.ts --retry=0`: green on both. Every later smoke command means this build and these flags; a network run rebuilds `dist/<b>`, so rebuild after one.
- `bun run check:plans`: exit 0.
- Layers: lint, typecheck, unit with real crypto, smoke e2e on both browsers.

**Gate outcome** (2026-11-05, at the round-1 fix commit): lint and typecheck:all exit 0; the unit command green (22 files, 891 tests); on base, 5 of the describe's 8 tests fail and (b), (c) and (e)'s control pass; replacing the identity-checked drop with an unconditional one fails (d)'s open seam; `bun run test` (17456 passed) and `bun run test:all` exit 0; smoke on Chrome 6/6; smoke on Firefox 6/6; `check:plans` exit 0.

## Phase 2 (arc 2): Unlock method ✓

Steps (after OA-1 and OA-2): D6, D7 and D11 in `unlock-method.vue`. In `unlock-method.test.ts`, rewrite or retire the pins that encode the held answer (`:222`, `:251`, `:298`, `:307`, `:458`, `:486`, `:510`, `:597`, `:608`) and pin: (a) "Use a password instead" runs no card; (b) Save or Enter with an invalid pair runs no card; (c) Save snapshots the pair, and a pair edited while the card is open is not the one committed; (d) a failed Save, then Save, runs a second card; (e) a lock while the card is open commits nothing, and removes the step; (f) "Use a new passkey" asks the new passkey, then the current one, and a cancel at either commits nothing. Update the chaos transitions and `tests/e2e/security.test.ts` and `tests/e2e/helpers/profile-chaos/unlock-method.ts`.

**Validation gate** (every command from the repo root unless it starts with `cd`): `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/unlock-method.test.ts src/wallet/services/profile/unlock-method.composition.test.ts scripts/e2e/profile-chaos-model.test.ts --retry=0` green, with (a), (c) and (f) red on the base page; `cd apps/extension && bun run test:components`; smoke (Phase 1's build and flags) `tests/e2e/security.test.ts` green on Chrome and Firefox.

**Gate outcome** (2026-11-06, at 52eff5b6c, every run at retry 0): lint and typecheck:all exit 0; the unit command green; on the base page, (a), (c) and (f) fail; `test:components` 99 files, 1394 passed; smoke `security` 7/7 on Chrome and on Firefox.

## Phase 3 (arc 2): Full backup ✓

Steps (after OA-3 and OA-5): D8 and D11 in `useFullBackupExport.ts` and `full.vue`. In `full-passkey.pins.test.ts`, at the composable boundary, not the DOM alone: (a) Agree runs no card; (b) click or Enter with an invalid pair runs no card; (c) the press seals with the pair captured at it, in the run, and never assigns the plaintext to the context; (d) the run ends at `encrypted` without a download, and Download then saves; (e) a failed seal returns to the pair and the next press runs a new card; (f) a lock while the seal runs publishes nothing and starts the page over. Keep `useFullBackupExport.test.ts`'s password pins green unchanged. Update `tests/e2e/helpers/backup-export.ts` (`downloadPasskeyBackup`) and the e2e that drive the old order: `passkey-backup.test.ts`, `passkey-retry.test.ts`, `toolbar-panel.test.ts`, `own-window.test.ts`, `legal-acceptance.test.ts`, `update-replay.test.ts`, `helpers/handshake-import.ts`, `helpers/profile-chaos/backups.ts`.

**Validation gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/composables/useFullBackupExport.test.ts src/popup/pages/settings/security/export/full.test.ts src/popup/pages/settings/security/export/full-passkey.pins.test.ts scripts/e2e/profile-chaos-model.test.ts --retry=0` green, with (a), (c) and (e) red on base; `cd apps/extension && bun run test:components`; smoke `tests/e2e/passkey-backup.test.ts tests/e2e/passkey-retry.test.ts tests/e2e/own-window.test.ts tests/e2e/toolbar-panel.test.ts tests/e2e/legal-acceptance.test.ts` green on Chrome and Firefox; `update-replay.test.ts` from `v1.2.0` on Chrome and Firefox, as `tests/e2e/README.md` § In-place update runs it (`build-update-candidate.sh <b>`, then `NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.2.0 NULO_E2E_UPDATE_TO=<candidate>` and `--retry=0`), then the armed smoke build again; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/import-handshake-note.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`: green.

**Gate outcome** (2026-11-06, every run at retry 0): the unit command green (with Phase 4's, 31 files, 1318 passed); on base, (a), (c) and (e) fail; `test:components` green; smoke `passkey-backup`, `passkey-retry`, `own-window`, `legal-acceptance` green on both browsers and `toolbar-panel` 6/6 on Firefox (it skips on Chrome by design; the first Firefox batch hit this session's own time bound in its last test, then the file passed alone); `update-replay` from v1.2.0 4/4 on Chrome and 4/4 on Firefox; `import-handshake-note` 2/2 on Chrome and 2/2 on Firefox (the runner first refused the file without `NULO_E2E_PROVERLESS=1`, which it requires: no test ran).

## Phase 4 (arc 2): Account file ✓

Steps (after OA-4): D9 in `account.vue`. In `account.test.ts`, adapt the pins that encode the confirm step (`:345`, `:395`, `:404`, `:420`, `:486`, `:503`, `:540`, `:583`) and pin: (a) no card runs before a valid pair, by click or Enter; (b) Save runs one card, the verify, then `exportAccount` (and `exportResetHeldAccount` for a held row) with the pair and scope captured at the press, and a pair edited while the card is open is not used; (c) a scope change while the card is open exports nothing (control: an unchanged scope exports); (d) a second Save runs a second card; (e) the lock pins stay. Update the chaos transitions and `tests/e2e/helpers/profile-chaos/accounts-io.ts`.

**Validation gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/export/account.test.ts scripts/e2e/profile-chaos-model.test.ts --retry=0` green, with (a) and (b) red on base; `bun run audit:vue` and `bun run test:all` exit 0; smoke `tests/e2e/account-import-export.test.ts` green on Chrome and Firefox; the profile chaos campaign on Chrome and Firefox, `cd apps/extension && NULO_E2E_BROWSER=<b> NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1 NULO_E2E_CHAOS_RUNS=5 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0`, all seven oracles green; `bun run check:plans`.

**Gate outcome** (2026-11-06, every run at retry 0): the unit command green; on the base page, 21 tests fail, (a) and (b) among them; `audit:vue` and `test:all` exit 0 at the close-out head; smoke `account-import-export` 4/4 on Chrome and on Firefox; the chaos campaign, seeds 1-5, 5/5 on Chrome and 5/5 on Firefox with no violation (a seed with a planned restart reads "incomplete", by design). Seeds 1-5 drew no `raceMethodChangeDuringExport`, a Firefox-only race, so it ran three more times on Firefox, all green: a hand list that drives every changed passkey action once (both account-file variants, the passkey backup, a refused and an approved new passkey, the race, `verifyAll`), and seeds 5165 and 7760, found by the planner offline; `check:plans` exit 0.

## Delivery

| Arc | Phases | Branch | Base | PR title (≤ 92) | code_review |
|---|---|---|---|---|---|
| 1 | 1 | `lows-1-a1` | `origin/dev` + the plan commit | `fix(profile): a restore locked before finalize stays locked until its next unlock` | off |
| 2 | 2-4, then the close-out | `lows-1-a2` | `origin/dev` after arc 1 merges | `fix(settings): the unlock-method and export pages take the new secret before the passkey step` | off |

No PR says `Closes #n` (no public issue). Each PR body states what changed and the behaviour it guarantees, the validation runs with outcomes and, for arc 2, the owner's words per surface, screenshots of each changed surface, and each browser's smoke wall-clock before and after for the e2e it changes. No PR body, commit or test name names a finding. Open each PR ready, without labels. Parallelism: none; arc 2 waits on the owner.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at 7eed331bb, with these values:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; per arc, at its boundary, before its PR, with one Opus `general-purpose` review of the arc's diff beside the first round; hard stop at three rounds, then report. Arc 2 also gets one fresh cross-arc pass over the net diff from 7eed331bb.
- **Delivery:** `gh pr create --base dev` per arc; `gh pr checks <n> --watch` to the end.
- **Close-out:** arc 2's final commits. Merge `origin/dev` in first and read `index.md` and `lessons.md`. The Outcome's `Known limits:` and `Open items:` name no advisory id; the orchestrator records the fixes on the private findings.
- **Teardown:** after the close-out merges, `agent-worktree done lows-1 --merged` (trunk `dev` is origin's default).
- **Approval boundaries:** a review finding that adds persistent state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval; any copy or order change beyond OA-1 to OA-7 is a new owner ask.

## Audit verdicts

**Round 1** (2026-11-05; both legs saw outlines A and B, the recon and the asks; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): reject.** Blocking: (1) finalize's ordering against an accepted lock, and (2) the admission's identity across a same-id restore, were under-specified; (3) D9 did not snapshot the pair and the scope before the card; (4) D8's entries, retry and download transitions were unspecified. Also: (5) the lock guarantee's boundary (D4); (6) D11 overstated what a lock cancels; Fact 2's line, a cited test that does not exist at HEAD, I1's rarity claim, the refusal's wording as an ask, the draft-PR line.
- **Opus 5.5 (Plan): conditional approve.** Same D9 gap; the lock guarantee's boundary as residuals; no change for finalize's ordering under the facade lock's hold limit; recon missed `helpers/backup-export.ts` and its callers; the pins and chaos transitions the reorders change; D5 as a change against HEAD to pin and name; widen two docs.
- **Both:** outline A over B in every area (B's epoch can match after a restart; B keeps the plaintext for 60 s and adds a card per flow).
- **Accepted:** (1) and (2) as D2's identity capture and a post-open bracket, over Opus's "no change" (the post-open bracket was withdrawn after the final pass, below); (3) as D9; (4) as D8; (5) as D4's stated boundary, the residuals reported privately; (6) as D11; every factual fix; D5 pinned (test f) and OA-7; the pins, chaos transitions and e2e callers in Phases 2-4; base-failure checks for arc 2.
- **Rejected:** none.

**Final fresh Codex pass, round 1** (new session): **reject.** (1) The post-open re-check could not undo an open without a session-manager change; (2) the admission was captured after the marker delete, so a parked finalize could take a same-id successor's; (3) the re-check's close named no session; (4) the gates lacked the armed smoke build, working directories, the chaos and update-replay opt-ins, `--retry=0` on the network run and `audit:vue`. Also Fact 1's inference, Fact 6's lines, I1, a password-restart control, extending the lock and deletion tests.
- **Accepted:** (2) as D2's capture before the first await (the `seenRewrap` pattern); (4) in full; every factual fix, the control and the test extensions.
- **Reversed with this evidence:** the post-open re-check goes. (1) and (3) show that undoing an open is a session-manager change on every open path, so by § Proportion it stays out of this lane; the boundary is reported privately.

**Final fresh Codex pass, round 2** (resumed): **conditional approve**, conditions: (1) qualify the restore guarantee to the admission gate; (2) keep failure mechanics out of committed files. Both met in this revision; the identity capture, the gates, the tests and the proportion of D1-D11 were verified with no new finding.

**Final fresh Codex pass, round 3** (resumed): **approve**. Both conditions verified on disk; no regression.

**Arc 1 review loop, round 1** (2026-11-05; the diff c4f7767fc..5da0eb198; consult log in [lessons/phase-1.md](lessons/phase-1.md)).
- **Codex (gpt-6.1-sol, high): clean (0 material).** One nit: `finalizeRestore`'s doc claimed a deletion keeps the profile, and named no exception for a lock the service skips or a session already open.
- **Opus 5.5 (general-purpose): 2 material.** The same doc; (e)'s clock read the new admission, so its control could not run on base. Nits: the identity-checked drop had no test; a call-site comment repeated the sweep's doc, and the capture's comment did not cover the drop.
- **Accepted, all:** the doc names the already-open and skipped-lock exceptions and drops deletion (a deleted row is refused as an unknown id, as before); (e) fixes the clock before the restore; (d) gains the open seam; the call-site comment goes and the capture's comment covers the drop.

**Arc 1 review loop, round 2** (resumed, the diff 5da0eb198..6ff9aa4e3): **Codex clean.** Every fix verified, no regression; the loop converged.

**Arc 2 review loop, round 1** (2026-11-06; the diff 5f7da07c5..816c6a356, code and plan; consult log in [lessons/phase-2.md](lessons/phase-2.md)).
- **Codex (gpt-6.1-sol, high): clean (0 material).** Two nits: the chaos `raceMethodChangeDuringExport` doc still described an approved page; a `full.vue` comment narrated its `v-if`.
- **Opus 5.5 (general-purpose): 3 material.** (1) D16 said a failed card returns to the pair, where the code keeps today's leave; (2) the passkey path shows the done banner above Download, to check against the sign-off; (3) the account file's kept pair after a card failure that is not a cancel had no pin. Nits: a sentinel status a passkey run now writes; two stale docs (the legal-acceptance helper, ARCHITECTURE's late-activation paragraph); a flush-count wait.
- **Accepted:** (1) by correcting D16 to the code, since keeping the pair there would change a failure screen nobody signed; (3) as a `PasskeyPrfError` pin (dropping the toast now fails it); every nit, both of Codex's.
- **Answered:** (2) by the signed picture: page 111's OA-3 A frame shows the same banner above "Download protected backup" (D16).

**Arc 2 review loop, round 2** (resumed, the diff 816c6a356..f7642fc11): **Codex clean (0 material).** Every fix verified, no regression; one nit, ARCHITECTURE's late-activation sentence promised a next unlock to a deleted profile too: fixed. The loop converged.

**Final fresh cross-arc Codex pass** (new session, the lane's net diff from 7eed331bb): **clean (0 material).** Two doc nits, both fixed: ARCHITECTURE's late-activation sentence now holds the guarantee to finalize's admission check (D2), and D18 no longer says the run's clients never reconnect.

## Seeds (not run; orchestrator-owned)

```
/goal implementations-plan/lows-1/plan.md: Phase 1 ✓ with its gate pasted, arc 1's Codex loop converged and quoted, its PR open against dev; Phases 2-4 ✓ only after OWNER-ASKS OA-1..OA-5 carry the owner's words; `bun run test` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/lows-1 from plan.md: next pending phase whose owner asks are answered, its gate, its arc's Codex loop, its PR; never start arc 2 without the answers; stop at three red rounds.
```
