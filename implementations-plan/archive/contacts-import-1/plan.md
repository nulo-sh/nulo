---
plan: contacts-import-1
tier: light
status: completed (#74)
issues: [45, 43, 44]
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high, resumed once for the fix-up) + one Opus Plan-agent review
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-10-09
- **Status**: delivered in [#74](https://github.com/nulo-sh/nulo/pull/74), one arc (Phases 1-3), single-layer stack on `dev`. The merge that lands it closes this plan.
- **Shipped**:
  - #45: `pickFile` settles a closed chooser. A `cancel` listener removes the hidden input and rejects with `FilePickCanceledError`; the contacts import and the full-backup import return on it with nothing shown or cleared, and the account import already swallowed it. Headless Firefox fires no `cancel` by itself, so the Firefox pick driver is unchanged.
  - #43: the contacts import is pinned to the `RunFence` captured before its rows are shown. `getContacts`, `addContact` and `updateContact` take it as an optional trailing argument: asserted before the contact lock, acting for its profile, re-checked synchronously right before each write. A fenced call that fails makes the popup probe the fence; a failed probe stops the import (no further write or sender registration) and toasts `Import incomplete · N contacts written`.
  - Validation, final head, retry 0: lint, typecheck:all, test:all (extension 10536 passed), audit:vue, armed builds, smoke (`contacts-import`, `contacts`, `account-import-export`, `backup-roundtrip`, `backup-imported-account`) 16/16 on Chrome and on Firefox, check:plans 0. Codex r1 approve with fixes, Opus review alongside, all folded; Codex r2 clean.
- **Dropped**: #44, already fixed on `dev` by #41 (3b80761) with its test; verified and commented on the issue, no code.
- **Deviations**: D10 (the run reaches `applyImportRows` through `deps`, keeping its signature line byte-identical beside #56), D11 (`logImportErrors` shared by both toasts), D12 (pictures from the smoke harness; the "today" fact corrected: a lock mid-import shows "Error occurred during import").
- **Open items**: none kept here. [Follow-ups](../../follow-ups.md) took the two owner calls of [OWNER-ASKS.md](OWNER-ASKS.md) (the toast's wording, recommended B; what stops an import), both shipped in their ship-now forms.
- **Lessons**: none promoted. `lessons.md` sits 28 B under its 8,192 B budget; the adjacent-hunk merge rule is general git behaviour and stays in [phase 2](lessons/phase-2.md), the throwaway-branch `commit -a` slip in [phase 3](lessons/phase-3.md).
- **Seeds retired**: the `/goal` and `/loop` in § Seeds are retired. Do not run them.

# Contacts import 1: a closed file chooser, a staged-row edit, a profile switch mid-import

Three bugs in the contacts import, filed by the owner on 2026-10-08. Recon is in [recon.md](recon.md); the owner calls are in [OWNER-ASKS.md](OWNER-ASKS.md).

- **#45** Closing the file chooser leaves the import waiting and the hidden input in the page. Phase 1. No screen changes.
- **#43** An import writes its remaining rows to a profile switched to mid-import. Phase 2. One new toast (OWNER-ASKS.md; the ship-now form is built in).
- **#44** A staged row that would change a saved contact cannot be edited. **Already fixed on `dev`** by PR #41 (3b80761), with a test. Phase 3 verifies it; Delivery comments on the issue. No code.

## Scope

**In:** `pickFile` and its callers' cancel handling; the contacts import's session pin (the composable, three `ContactService` methods, their spec); a toast for a stopped import; the tests for each.

**Out, with reason:**
- Any change to `EditContactPopup.vue`: #44 is fixed (F5).
- Any change to the selection screen (`ImportContactsPopup.vue`): it keeps its unfenced book read; the confirm-time fenced read refuses a run whose session ended while the screen was open (D4).
- A new e2e for the cancel: Puppeteer's `FileChooser.cancel()` is the same synthetic `cancel` event the unit test dispatches (D5). The pick-surface smoke files run on both browsers instead, as the proof the listener breaks no real pick.
- The doc comment on `applyImportRows` (`useContactImportExport.ts:193-196`): open PR #56 edits it. This plan leaves those lines alone, so the two merge line-clean.
- What a lock does to toasts (`popup/scope-epoch.ts` closes the open toast on a lock, by design): unchanged. OWNER-ASKS ask 1 names its effect on the new toast.
- No storage migration: no persisted shape changes.

**UI impact:**
- The contacts import result toast. New: `Import incomplete · N contacts written` (`kind: "error"`), shown when the import stops early (OWNER-ASKS asks 1 and 2). Before: in that moment the import either wrote the remaining rows to the new profile and showed a success toast, or (after a plain lock) showed "Error occurred during import", because the next row's read failed and aborted the import ("Import ended with errors" only when the lock landed during the last row's write; checked on Chrome, see D12). Every existing label is unchanged. The PR attaches screenshots of the new toast (Phase 3).
- No other surface. Closing the file chooser leaves the contacts import, the account import and the full-backup import (onboarding and popup) exactly as they are today: nothing is shown, nothing selected is cleared.

## Outcome & Quality Bar

**For whom:** a person managing contacts in Settings → Contacts, sometimes with more than one profile, sometimes with the wallet open in two windows.

**What excellent looks like:**
1. Closing the file chooser leaves every pick surface exactly as it was before the click and leaves no hidden input behind, on Chrome and on Firefox. A unit test proves the settle; the pick-surface smoke on both browsers proves no real pick broke.
2. A contact row confirmed in one session of one profile is written to that profile or not at all, whatever happens in another window. No write starts after the wallet sees the session end, including a switch that lands while the write waits for its lock. A test drives that race.
3. A stopped import says so, with the number of contacts the wallet confirmed writing, whichever request the stop interrupted. Nothing is written or registered after the import sees the stop.

**What good enough looks like:** the stop rule is the session fence the wallet already uses for the full-backup export; the plan does not build a profile-only variant for this flow. A write that already started may finish in its own profile.

## Assumptions

### Facts (verified at 61060c0)

- **F1.** `pickFile` settles only in `input.onchange` (`apps/extension/src/utils/files.ts:99`); nothing listens for `cancel`; the input appended at `:97` stays on a cancel. #45's line numbers hold.
- **F2.** The three production callers of `pickFile`: `useContactImportExport.ts:128` (`if (!file) return`; a rejection other than `FileTooLargeError` toasts "Error occurred during import"); `popup/pages/settings/accounts/import.vue:58` (its catch swallows everything but `FileTooLargeError`: "Cancelled picker: leave the form as-is"); `composables/useProfileImportFlow.ts:239` (`cappedBackupPick` rethrows into `useFullBackupImport.ts` `runPickBackupFile`, where a falsy file clears the chosen backup and a rejection fills "Failed to read the backup file").
- **F3.** The pick tests drive the input through the `onchange` property and pin the settle tick count (3) and "input removed before settle" (`utils/files.test.ts:5-12`, `utils/files.settle.pins.test.ts`).
- **F4.** Firefox's floor is 153 (`apps/extension/manifest/manifest.firefox.config.ts:38`); file inputs fire `cancel` there and in current Chrome.
- **F5.** #44 is fixed on `dev`: `EditContactPopup.vue:69` `isEditedContact` treats `targetId` as the edited contact (PR #41, merged 2026-10-08T14:40Z, 27 minutes after the issue). The test "import mode: the saved contact a row would write is not its duplicate, …" (`EditContactPopup.test.ts:379`) covers it with an "Already exist" control and passes at 61060c0. At 3b80761^ the check was `c.id !== contactToEdit.value?.id`.
- **F6.** #43 holds, with moved lines: `ContactService.getContacts` `:72-77`, `addContact` `:101-135` (stamps the row with `captureExecutionFence().profileId`, then awaits the contact lock, an id allocation and the write), `updateContact` `:137-159` (`requireOwnedRow` against the active profile, inside the lock). `applyImportRows` pins only the network (`useContactImportExport.ts:201`).
- **F7.** `ProfileService.captureRunFence` / `assertRunFence` (`wallet/services/profile/service.ts:534-544`) bind a popup run to one session of one profile in one worker. `assertRunFence` throws `SessionEndedError` on a lock, an unlock (the same profile's included) or a worker restart; on a begun deletion of its profile while the session is still open it throws the plain deletion `Error` (`profile-deletion-state.ts:21-23`, pinned as not `SessionEndedError` in `service.integration.test.ts:568-579`). `isFenceLive` (`:549`) answers the same question synchronously, without the worker check. `SessionEndedError` crosses the port as its class (`packages/extension-messaging/src/errors.ts:387`, `REBUILT_AS`).
- **F8.** Contact RPCs are served only to same-extension contexts (`isTrustedInternalSender`, `packages/extension-messaging/src/background/service.ts:45`). The service never logs request params.
- **F9.** `addSender` cannot register in another profile: the network id must belong to the active profile (`NetworkService.getNetwork` → `requireOwnedRow`).
- **F10.** A lock routes the importing popup to `/popup/auth` (`popup/locked-state.ts`); the contacts page unmounts and calls `contactService.disconnect()`, which rejects every pending request of the client the composable holds with the plain `CLIENT_DISCONNECTED_MESSAGE` error (`packages/extension-messaging/src/background/client.ts:80-90`). The next request reconnects.
- **F11.** Smoke e2e does not build: it loads `apps/extension/dist/<browser>` as it is (`tests/e2e/FIREFOX.md`, `tests/e2e/global-setup-smoke.ts:45-49`). `audit:vue` builds Chrome only, without the e2e flags.

### Inferences

- **I1.** Whether the importing popup sees the lock event before or after the import's next request fails is a race. The design does not depend on it: "stopped" is decided by asking the fence, not by which error arrived (D7).
- **I2.** Imports are small (capped at `MAX_CONTACT_IMPORT_BYTES`), so a fence check per contact call, plus one probe after a failure, costs nothing a person notices.
- **I3.** No existing caller passes a third argument to `getContacts`/`addContact`'s fence slot or a fourth to `updateContact`, so an optional trailing `fence` changes no existing call.
- **I4.** Headless Firefox under Puppeteer BiDi may fire `cancel` on a file input's `click()` by itself. If it does, the Firefox pick driver loses its input and every Firefox pick smoke fails. Phase 1 checks this first (step 1) and has a contingency.

### Asks

- **A1 (owner, OWNER-ASKS ask 1):** the toast's wording and kind. Ship-now: `Import incomplete · N contacts written`, `kind: "error"`.
- **A2 (owner, OWNER-ASKS ask 2):** what stops an import. Ship-now: any end of the session the rows were shown in (a profile switch, a lock or auto-lock, a re-unlock, a worker restart, a begun deletion of the profile).
- **A3 (orchestrator):** #44 is fixed by #41. Delivery comments on it and leaves it open (common rule); close it, or have the PR carry `Closes #44`.

## Architecture & Implementation

### #45: a closed chooser settles the pick

`files.ts` gains `FilePickCanceledError` beside `FileTooLargeError`. `pickFile` adds, before the click (so the `delay` path is covered), `input.addEventListener("cancel", …, { once: true })`, which removes the input and rejects with `FilePickCanceledError`. Both paths remove the input with `input.remove()` (idempotent), so a late second event never throws. The `onchange` property, its body and its tick count stay as they are.

A typed rejection, not `resolve(null)`: `runPickBackupFile` reads a falsy file as "drop the chosen backup" (pinned by "a null pick DROPS the previous selection"), so a null cancel would clear a person's chosen backup, which a cancel never does today. Callers tell the cancel apart by class:

| Caller | Change |
|---|---|
| `useContactImportExport.ts` `importContacts` | catch: `FilePickCanceledError` returns with no toast, before the `FileTooLargeError` branch; `finally` clears staging as today |
| `popup/pages/settings/accounts/import.vue` | none: its catch already leaves the form as-is |
| `composables/useFullBackupImport.ts` `runPickBackupFile` | catch: `FilePickCanceledError` returns first; the chosen backup, its name and any Retry stay |

### #43: the import is pinned to one session of one profile

The pin is the existing `RunFence`. The popup captures it once, when the rows are staged for the selection screen; every contact call of the import carries it; the background proves it live and acts for its profile.

**Background (`wallet/services/contact/spec.ts`, `service.ts`).** Three methods take an optional trailing `fence?: RunFence` (type from `wallet/services/profile/spec.ts`):

```ts
getContacts(fence?: RunFence): Contact[]
addContact(name: string, address: string, fence?: RunFence): Contact
updateContact(id: string, name?: string, address?: string, fence?: RunFence): Contact
```

- No fence (`undefined` or `null`): behaviour unchanged. A `null` widens nothing: it is the same as omitting the argument.
- With a fence:
  1. Before the contact lock: `await this.profileService.assertRunFence(fence)`, as `addContact` calls `captureExecutionFence()` today. Never inside the lock: `assertRunFence` takes the profile facade lock.
  2. The method acts for `fence.profileId`: `getContacts` filters by it; `updateContact` checks ownership against it; `addContact` uses the fence in place of `captureExecutionFence()` and stamps `fence.profileId`.
  3. Inside the contact lock, right before `storage.set` (after the id allocation or the row read): `if (!this.profileService.isFenceLive(fence)) throw new SessionEndedError()`. Synchronous, so nothing can interleave between it and the start of the write. `addContact`'s deletion assert and its compensate-after-write stay as they are, on the fence's epoch.
- One private helper returns the profile a read or update acts for (the fence's after its assert, else `requireActiveProfile`).
- The client needs no edit: `definePassthroughsExhaustive` forwards every argument, and its types follow `Methods`.
- Result: a fenced write lands in the fence's profile or not at all, and none starts after the worker sees the session end. A write already started when the session ends may finish, in its own profile.

**Popup (`useContactImportExport.ts`).**

1. After the file is parsed and before the selection screen opens, `importContacts` opens the run's own `ProfileServiceClient` (connect/disconnect as `exportContacts` does) and captures the fence. A failed capture (a locked wallet; unreachable from this page) ends the import through the existing catch, before any row is shown.
2. `applyImportRows` passes the fence to every `getContacts`, `addContact` and `updateContact` call (the plan read at confirm, each per-row re-read, each write).
3. When a fenced call rejects, the import asks the fence: `await profileClient.assertRunFence(fence)`. If the probe rejects, for any reason, the run is **stopped**: no write and no sender registration after it, the failed row is not counted, and the tally records `stopped: true`. A probe that fails on transport (a timeout, a lost port) also stops the run: the import cannot prove its session is still live, so it ends and reports what it wrote; it never retries. If the probe passes, today's handling applies: a failed read aborts the import, a failed write is counted and the loop goes on.
4. The tally counts `written`: writes the wallet confirmed. A write whose reply was lost in the stop may still be saved without being counted (OWNER-ASKS ask 1 says so).
5. `importContacts` chooses the toast: `tally.stopped ? toastStoppedImport(…) : toastImportOutcome(…)`. `toastStoppedImport` logs the errors before the stop as today and opens `{ kind: "error", label: "Import incomplete · N contacts written" }` (`1 contact written`). `toastImportOutcome` is not edited: it already scores about 15.

`applyImportRows` must stay under the complexity budget (cognitive ≤ 15, ≤ 80 lines): extract the per-row step and the "call, then probe on failure" wrapper into helpers instead of nesting.

### Data and control flow (one row of a fenced import)

```
popup: getContacts(fence) ─► SW: assertRunFence ─► filter by fence.profileId
popup: stillAsShown? ── no ─► refused (today)
popup: addContact(name, addr, fence) ─► SW: assertRunFence ─► lock ─► id ─► isFenceLive? ─► set(fence.profileId)
   any rejection ─► popup: assertRunFence(fence) ── rejects ─► stopped (no sender, no more rows)
                                                  └ passes ─► today's handling
popup: row.isSender ─► addSender(pinned network)   (only if not stopped)
```

### File-level change map

| File | Change | Phase |
|---|---|---|
| `apps/extension/src/utils/files.ts` | `FilePickCanceledError`; `cancel` listener; `input.remove()` on both paths | 1 |
| `apps/extension/src/utils/files.test.ts` | cancel test | 1 |
| `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts` | cancel branch in `importContacts`' catch | 1 |
| `…/contacts/useContactImportExport.pins.test.ts` | early-exit row for a closed chooser; `@/utils` mock gains the class | 1 |
| `…/contacts/useContactImportExport.test.ts`, `.spaced-name.test.ts` | `@/utils` mock gains the class | 1 |
| `apps/extension/src/composables/useFullBackupImport.ts` | cancel branch first in `runPickBackupFile`'s catch | 1 |
| `apps/extension/src/composables/useFullBackupImport.stages.test.ts` | cancel test | 1 |
| `apps/extension/tests/e2e/fixtures/browser/firefox.ts` | only if Phase 1 step 1 shows I4 true: the contingency | 1 |
| `apps/extension/src/wallet/services/contact/spec.ts` | optional `fence` on three methods, documented | 2 |
| `apps/extension/src/wallet/services/contact/service.ts` | fence handling; one helper; in-lock `isFenceLive` | 2 |
| `apps/extension/src/wallet/services/contact/service.test.ts` | `FakeProfileService` gains `assertRunFence`, `isFenceLive` and a session counter; fence tests | 2 |
| `…/contacts/useContactImportExport.ts` | capture at staging; fence on every call; probe; `written`; `toastStoppedImport` | 2 |
| `…/contacts/useContactImportExport.test.ts`, `.pins.test.ts`, `.spaced-name.test.ts` | `ProfileServiceClient` mocks gain `captureRunFence` / `assertRunFence`; write and read assertions carry the fence; stop table | 2 |
| `…/contacts/useContactImportExport.composition.test.ts` | popup `ProfileServiceClient` mock gains `captureRunFence` / `assertRunFence`; the `svc` profile stub gains `assertRunFence` / `isFenceLive` over a session counter; switch test + control | 2 |
| `implementations-plan/contacts-import-1/**` | status, lessons | all |

### Trade-offs and alternatives not taken

- **Popup-only pin** (check the fence, then write as today): two RPCs, so a switch between them still writes that row to the new profile. Rejected (D1).
- **A profile id instead of the run fence** (`expectedProfileId`): survives a lock and re-unlock of the same profile, but needs a new error class wired into `REBUILT_AS` and a second guard beside an existing one. Rejected (D2); the owner can still ask for a profile-only trigger (ask 2).
- **Cancel resolves `null`**: clears a chosen backup (F2). Rejected (D3).
- **Classify the stop by error class** (`SessionEndedError`, disconnect): the error depends on which request the page unmount or the worker restart interrupted, and a deletion fails the fence with a plain error (F7, F10). Rejected for the probe (D7).
- **Map every fence failure to `SessionEndedError` in the service** (Codex r1 #2): the probe makes the error class irrelevant to the popup, and the unfenced path keeps its pinned deletion error. Not needed.

## Security & Adversarial Considerations

- **Threat model.** The contact RPCs are served only to the extension's own pages (F8); no dApp or content script reaches them. The adversary is a race, not a person: two windows of one wallet, one importing, one switching profiles or locking. The asset is profile separation: a contact (a name and an address, personal data) must not appear in a profile it was not confirmed for.
- **The new parameter only narrows.** A fenced call proceeds only if the fence names the live session of this worker (`assertRunFence` checks the worker id, the session serial and the profile id; `isFenceLive` re-checks serial, profile and deletion epoch before the write). So a fenced call reads or writes only the profile that is active anyway. A forged, stale or malformed fence (a string, missing fields, another worker's id) is refused; `null` or `undefined` is today's unfenced behaviour. No new capability, no new privilege.
- **Race windows, closed or bounded.**
  - Switch between the confirm and the first write: the confirm-time fenced read refuses it (the fence dates from when the rows were shown).
  - Switch between the fence check and the write: the in-lock `isFenceLive` refuses the write (test in Phase 2).
  - Switch during the write itself: the write finishes in the fence's profile, never another.
  - Deletion of the pinned profile: `assertRunFence` and `isFenceLive` both refuse once it begins; `addContact`'s compensate-after-write stays.
  - Worker restart: the new worker's id differs, so every later fenced call and the probe refuse.
  - A probe that fails on transport stops a run whose session may still be live. That errs toward writing less: the import reports what it wrote and never continues on an unproven session.
- **Sender registrations** stop with the rows; they could not cross profiles even before (F9).
- **Logging.** No new log line. The stop logs nothing; the probe's error is dropped. Errors before the stop keep today's per-error `console.error` (operation + error), which this plan does not widen. The deletion error, which names a profile id, never reaches the popup's tally, because a probe failure ends the run without recording it.
- **File input (#45).** The cancel path reads no file and parses nothing; the byte cap and the decompression path are untouched.
- **Crypto, supply chain, least privilege:** N/A. No dependency, permission, workflow or key changes.

## Implementation phases

### Phase 1: a closed chooser settles the pick (#45)

Warning: do steps 1-3 before any other step. Step 3 decides whether the Firefox driver needs a change.

1. Add `FilePickCanceledError` to `files.ts`, beside `FileTooLargeError`.
2. In `pickFile`, add the `cancel` listener before the click. It removes the input and rejects with `FilePickCanceledError`.
3. Check I4 now. Build Firefox with the smoke flags (gate below). Run `contacts-import.test.ts` on Firefox. If it passes, go to step 4. If a pick fails because the input left the page, apply the contingency in `fixtures/browser/firefox.ts` `pickFile`:
   - Before `open()`, add a capturing `cancel` listener on the page's `window` (through `page.evaluate`).
   - The listener acts only when `event.target` matches the pending-input selector. It then calls `stopImmediatePropagation()`, so the input's own listener never runs, and removes itself.
   - Remove the listener in a `finally` around the open, wait and upload, so a thrown pick never leaves it armed. Do not rely on `{ once: true }`: an unrelated `cancel` would use it up.
   - Say why on the driver, per `FIREFOX.md`'s one rule. Log the finding in `lessons/phase-1.md`.
4. In the change handler, replace `document.body.removeChild(input)` with `input.remove()`. Change nothing else there.
5. In `importContacts`' catch, return on `FilePickCanceledError` with no toast, before the `FileTooLargeError` branch.
6. In `runPickBackupFile`'s catch, return on `FilePickCanceledError` before anything else.
7. Add the `FilePickCanceledError` class to the three `@/utils` mocks that do not spread the original module.
8. Add the tests below.

**Tests:**
- `files.test.ts`: "a closed chooser rejects with FilePickCanceledError and removes the input". Dispatch `new Event("cancel")` on the mounted input. The existing pick tests are the success control.
- `useContactImportExport.pins.test.ts`, early-exit table: a row "chooser closed" that rejects with `FilePickCanceledError`. Expect no toast, staging cleared, no service call.
- `useFullBackupImport.stages.test.ts`: "a closed chooser keeps the chosen backup and shows no error". Expect `selectedBackup` unchanged and `fillError` not called. "a null pick DROPS the previous selection" stays as the control.

**Validation gate:**
- Commands:
  - `bun run lint` and `bun run typecheck:all`
  - `cd apps/extension && bun --bun vitest run src/utils/files.test.ts src/utils/files.settle.pins.test.ts src/composables/useFullBackupImport.stages.test.ts src/composables/useProfileImportFlow.test.ts src/popup/components/modules/settings/contacts/`
  - Armed builds, both browsers: `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then the same with `build:firefox`
  - Pick-surface smoke, Chrome: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/contacts-import.test.ts tests/e2e/account-import-export.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`
  - The same with `NULO_E2E_BROWSER=firefox`
- Pass criteria: every command exits 0. The three new tests pass. `files.settle.pins.test.ts` passes unchanged. Every pick-surface smoke test passes on both browsers.
- Layers: lint, typecheck, unit, smoke e2e (Chrome, Firefox).

### Phase 2: the import is pinned to one session of one profile (#43)

1. In `contact/spec.ts`, add the optional trailing `fence?: RunFence` to `getContacts`, `addContact` and `updateContact`. In each method's TSDoc, say what the fence does.
2. In `contact/service.ts`, add the private helper that returns the profile a read or update acts for.
3. Use the helper in `getContacts` and `updateContact`. In `addContact`, use the asserted fence in place of `captureExecutionFence()` when a fence is given.
4. In `addContact` and `updateContact`, add the `isFenceLive` check inside the lock, right before `storage.set`.
5. In `importContacts`, open the run's `ProfileServiceClient` and capture the fence after the parse, before the selection screen opens. Disconnect it in `finally`.
6. Pass the fence to every contact call of the run.
7. Wrap each fenced call: on a rejection, probe the fence; a failed probe stops the run.
8. Count `written`. Add `toastStoppedImport`, and choose it in `importContacts` when the tally is stopped.
9. Update the test mocks, as the change map says. Add the tests below.

**Tests:**
- `contact/service.test.ts`, describe "run fence":
  - "a switch after the fence check refuses the write and stores nothing". `FakeProfileService.assertRunFence` resolves, then switches to profile B. Expect `addContact` and `updateContact` to reject with `SessionEndedError`, and storage unchanged.
  - "a fence that is not live is refused, and no fence is today's behaviour". A table: a dead fence (switched before the call), a fence from another worker, and a string all reject `getContacts`, `addContact` and `updateContact` with `SessionEndedError` and write nothing. `null` behaves as no fence (control).
  - "a live fence acts for its profile". `addContact` stamps the fence's profile; `getContacts` returns its rows (success control).
- `useContactImportExport.pins.test.ts` (or `.test.ts`), one table, "a dead fence stops the import where it fails". Fail points: the plan read, a re-read, an add, an update, and a write that rejects with the plain disconnect error. In each, `assertRunFence` then rejects. Expect no later write, no sender for the failed row or after it, and `Import incomplete · N contacts written` with the right N. One more stop row: a write fails with an ordinary error and the probe then fails on transport; expect the same stop. Control row: a write fails with an ordinary error while the fence is live; expect today's behaviour (the loop goes on, the sender is still attempted, "Import ended with errors").
- `useContactImportExport.composition.test.ts`:
  - "a profile switch mid-import writes nothing more, to either profile, and the toast reports it". Three new rows; the first carries `isSender`. `accountState.addSender` records the sender, then switches `activeProfile` to p2. Expect p1 to hold row 1 only, p2 to hold nothing, no sender after row 1, and `Import incomplete · 1 contact written`.
  - Control: the same file without the switch writes all three rows to p1, with today's toast.

**Validation gate:**
- Commands:
  - `bun run lint` and `bun run typecheck:all`
  - `cd apps/extension && bun --bun vitest run src/wallet/services/contact/ src/wallet/services/cross-profile-isolation.test.ts src/wallet/services/profile/ src/popup/components/modules/settings/contacts/ src/popup/components/popups/`
  - `git diff 61060c0 -- apps/extension/src | grep -E '^-.*label:'`
- Pass criteria: the first two commands exit 0 and every new test passes. Every line the `grep` prints is a label that also appears, unchanged, on an added line of the same diff: no existing toast label was removed or edited.
- Layers: lint, typecheck, unit, composition.

### Phase 3: verify #44 and run the full gates

Warning: `audit:vue` builds Chrome without the e2e flags and overwrites `dist/chrome`. Run it before the armed builds, never after them.

1. Do not change `EditContactPopup.vue`. Run its tests and confirm they pass.
2. Run `bun run test:all`, then `bun run audit:vue`.
3. Run the armed builds for both browsers again (the Phase 1 commands).
4. Run the contacts and pick-surface smoke on both browsers.
5. Take a screenshot of the new toast for the PR. Render it with the extension's toast component in a local Storybook story or a local dev run. Do not commit the helper.
6. Stage the plan files and run `bun run check:plans`.

**Validation gate:**
- Commands:
  - `cd apps/extension && bun --bun vitest run src/popup/components/popups/EditContactPopup.test.ts`
  - `bun run test:all`
  - `bun run audit:vue`
  - Armed builds, both browsers (Phase 1)
  - `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/contacts-import.test.ts tests/e2e/contacts.test.ts tests/e2e/account-import-export.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`
  - The same with `NULO_E2E_BROWSER=firefox`
  - `bun run check:plans`
- Pass criteria: every command exits 0. For a red e2e that looks environmental, rerun the same file on the base commit first (lessons.md, Agent tooling). If the base is green, the red is real: fix it. If the base is red too, record it in `lessons/phase-3.md` and rerun once.
- Layers: unit, composition, smoke e2e (Chrome, Firefox), build.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | The background checks the fence on every contact call of the import, and again synchronously right before each write | a popup-only check before each row | Only a check inside the write closes the switch between the check and the write (F6). The in-lock re-check was Codex r1 #1. |
| D2 | Reuse `RunFence` | an `expectedProfileId` and a new error class | Existing, already used by the full-backup export, stricter. Cost: a lock or re-unlock mid-import stops it too (OWNER-ASKS ask 2). |
| D3 | Cancel rejects with `FilePickCanceledError` | resolve `null` | `null` clears a chosen backup (F2). |
| D4 | Capture the fence when the rows are staged; the confirm-time fenced read refuses a dead one | capture at confirm (the first draft), with an `appStore.profile` comparison | Codex r1 #4: capture after confirm pins whichever session is live then (a lock and re-unlock between them goes unseen). Capturing before the rows are shown binds the run to the session the person reviewed them in, and still pins "the profile active at confirm", because a different one means a dead fence. It also drops the comparison and its mock churn. |
| D5 | No new e2e for the cancel | a Chrome-only e2e with `FileChooser.cancel()` | Puppeteer's cancel is the synthetic event the unit test dispatches. The pick-surface smoke on both browsers proves the listener breaks no real pick (Opus r1 #2). |
| D6 | (superseded by D4) | | The first draft compared the fence with `appStore.profile?.id` at confirm. |
| D7 | Decide "stopped" by probing the fence after any failed fenced call | classify by error class | The rejection depends on which request a lock's page unmount or a worker restart interrupted, and a deletion fails the fence with a plain error (Opus r1 #1, Codex r1 #2, #3). |
| D8 | `written` counts writes the wallet confirmed | count persisted rows | A dead fence cannot read the pinned book back; a lost reply can undercount by one, which the toast's ask names. |
| D9 | Stop toast in its own function | a first branch in `toastImportOutcome` | That function already scores about 15 (Opus r1 #3). |
| D10 | (implementation) The run reaches `applyImportRows` through `deps`: `ContactIoDeps = ContactIoServices & { run }`, the composable-level interface renamed `ContactIoServices` | a third parameter on `applyImportRows` | Git conflicts on adjacent edits, and open PR #56 edits the line right above the signature. Keeping the signature byte-identical keeps the two line-clean (`lessons/phase-2.md`). |
| D11 | (implementation) The error-logging loop moves into `logImportErrors`, shared by both toast functions | duplicate the loop in `toastStoppedImport` | One copy of the PII rule. `toastImportOutcome` loses only the loop; its labels are untouched (the Phase 2 label check prints nothing). Deviation from "not edited". |
| D12 | (implementation) The toast pictures come from the Chrome smoke harness (`shotSend`), a throwaway spec that locks the wallet from a second window during a 500-row import, run on the arc build, on an option-B build and on a base-code build (local branches, never pushed) | a Storybook story (Phase 3 step 5 as written) | The owner decides from real-wallet pictures of the moment the toast appears. The base-code run also corrected the "today" fact: a lock mid-import shows "Error occurred during import", not "Import ended with errors". |

## Audit verdicts

### Codex, round 1 (gpt-6.1-sol, high, session 01a12011): reject

| # | Finding | Disposition |
|---|---|---|
| 1 High | A switch while the write awaits the contact lock or its reads still writes to A; "no more rows" is not enforced | Accepted: in-lock `isFenceLive` before `storage.set` (D1). The plan now says "no write starts after the worker sees the end"; a started write may finish in its own profile. |
| 2 High | A begun deletion fails `assertRunFence` with a plain error, not `SessionEndedError` (F7 was wrong) | Accepted as a fact fix (F7). Fixed by the probe (D7) rather than by mapping errors in the service. |
| 3 Medium | A worker restart rejects in-flight requests with a plain disconnect error; the count can undercount | Accepted: the probe covers it (D7); `written` defined as confirmed writes (D8), named in ask 1. |
| 4 Medium | Capture after confirm cannot tell a lock and re-unlock of the same profile apart | Accepted: capture when the rows are staged (D4). |
| 5 Medium | Where the toast shows, and a lock closing it, need a decision | Accepted as an owner ask (ask 1, "where it shows"). |
| 6 Medium | The Firefox smoke would run a stale build | Accepted with Opus #2: armed builds of both browsers in Phases 1 and 3. |
| 7 Low | Tests miss the stop at a write, and the composition mock lacks `captureRunFence` | Accepted: the stop table and the mock edits (Phase 2). |
| 8 Low | Logging claim too broad; refuse an explicit `null` fence | Logging: accepted, claim narrowed (Security). `null`: kept as "no fence", because it grants nothing that omitting the argument does not; tested as such. (The first rationale, that Chrome's port turns a trailing `undefined` into `null`, was wrong: `wrapParams` keeps the arity, `packages/extension-messaging/src/utils.ts:17-43`. Codex r2 #2.) |

### Opus 5.5 Plan agent, round 1: conditional approve

| # | Finding | Disposition |
|---|---|---|
| 1 High | The stop toast depends on which request the page unmount rejects | Accepted: the probe (D7) and the stop table, which includes a disconnect row. |
| 2 High | Smoke does not build; headless Firefox may fire `cancel` by itself | Accepted: armed builds; the pick-surface smoke in Phase 1 on both browsers; Phase 1 step 1 checks I4 first, with a driver contingency. |
| 3 Medium | `toastImportOutcome` is near the complexity cap | Accepted (D9). |
| 4 Medium | OWNER-ASKS's "your words" claim is wrong; no `UI impact` line; no screenshot | Accepted: ask 1 corrected (the count comes from the lane brief); `UI impact` added; Phase 3 step 5. |
| 5 Medium | No popup-level test of the stop at a write | Accepted: the stop table. |
| 6 Low | Composition mock churn under-counted | Accepted (change map). The `appStore.profile` part fell away with D4. |
| 7 Low | No test for the null and forged fence | Accepted (service table). |
| 8 Low | Plain-language and order fixes | Accepted: the label check is a command, the flake rule follows lessons.md, the #44 comment is in Delivery. |

Assumption attack (Opus): F7 corrected; D6 superseded; F8 line fixed; the "nothing after the stop" wording narrowed; the stop trigger is its own owner ask, with the worker restart listed; #44 fixed and #45 changing no screen both confirmed.

### Codex, round 2 (resumed session 01a12011, fix-up review): conditional approve

Conditions: document probe-failure stops, correct the transport assumption, make the Firefox contingency exception-safe. Round-1 findings 1-7 judged resolved at plan level; 8's logging part resolved. Also confirmed: the in-lock check needs no incarnation test (the pre-lock assert covers this worker, and a restart cannot resume the old continuation); `EntityStorage.set` dispatches synchronously (`packages/wallet-core/src/storage/entity_storage.ts:189-190`), so the pre-write check closes the window; the armed build flags match CI.

| # | Finding | Disposition |
|---|---|---|
| 1 Medium | Any probe rejection stops the run, a transient one included; the stop policy names only session ends | Accepted: Popup step 3, Security and OWNER-ASKS ask 2 now say a failed check stops the run; the stop table gains a transport-failed-probe row. |
| 2 Low | The `null` rationale was wrong (`wrapParams` keeps a trailing `undefined`) | Accepted: rationale corrected; `null` stays "no fence". |
| 3 Medium | The Firefox contingency must match the pending input, stop it before the input's listener, and clean up in `finally` | Accepted: Phase 1 step 3. |
| 4 Low | Phase 1 ran step 3 before the class it needs; the diagnostic used a 900-second file | Accepted: steps reordered; the diagnostic runs `contacts-import.test.ts`. |

### Post-implementation, Codex round 1 (gpt-6.1-sol, high, session 01a12045, the arc diff from 61060c0): approve with fixes

No production bug found. Run with the Opus diff review alongside.

| # | Finding | Disposition |
|---|---|---|
| 1 Medium | The race test captured one fence for both writes; the profile reset after the add ended the session, so the update was refused at entry and never reached its in-lock check (removing `updateContact`'s check stayed green) | Accepted: one fresh fence per write and an asserted switch flag; removing only the update's check now fails its row. |
| 2 Low | Three comments: a four-line sender comment, a doc comment restating `STOPPED`, a backup-import comment describing old behaviour | Accepted: shortened or deleted. |

### Post-implementation, Opus 5.5 diff review (alongside Codex round 1): no production bug

| # | Finding | Disposition |
|---|---|---|
| 1 Medium | Same as Codex r1 #1 | Fixed with it. |
| 2 Low | The other-worker fence row was forged after the session had ended, so it was refused as dead and its incarnation never decided | Accepted: only the "session ended" row ends the session; the worker row is refused by its incarnation (shown red with the fake's incarnation check removed). |
| 3 Low | No test for a failed `captureRunFence` (Popup step 1) | Accepted: an early-exit row in the pins table. |
| 4 Low | The backup-import cancel comment describes old behaviour | Same as Codex r1 #2. |

### Post-implementation, Codex round 2 (resumed session 01a12045, the fixes in `ba2a09c`): clean

No new material findings. The loop converged after two rounds.

## Delivery

One arc, one PR, on the lane's single-layer stack.

| Arc | Phases | Stacks on | `/code-review` |
|---|---|---|---|
| contacts-import-1 | 1, 2, 3 + close-out commits | `dev` | off |

- Stack: `gh stack init --adopt worktree-contacts-import-1 --base dev`. Publish only after the Codex loop converges: `gh stack submit --auto`, then `gh pr edit` the body. Open it without labels. Add `e2e:extension-smoke` afterwards only if the smoke path filter skipped the run.
- PR title (76 characters): `fix(contacts): settle a closed file chooser and pin an import to its profile`.
- PR body: what changed and why, per issue; the validation run with outcomes; `Closes #45`, `Closes #43`; the #44 note (fixed by #41; see below); the ship-now toast label, quoted with the owner asks' path; the toast screenshot; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- After the PR exists, comment on #44: name PR #41, commit 3b80761, and the test "import mode: the saved contact a row would write is not its duplicate, …". Leave it open unless the orchestrator says otherwise (Ask A3).
- Commits: conventional, lower-case subject, signed, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (the lane's trailer).

## Post-implementation

Run in this order after Phase 3 is green. Single arc: one loop, over the whole diff from `61060c0`.

1. **Codex audit.** Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, with the prompt file under `~/.cache/nulo-backlog/contacts-import-1/`. Send it the diff (`git diff 61060c0...HEAD`), this plan.md with its Decision ledger, and the adversarial ask: "What could go wrong? What would an attacker target? What are we trusting that we shouldn't? Where are the race windows?" Include both rules below verbatim.
2. **Iterative fix loop.** Check each finding against the repo first, because Codex can misread code. Apply the accepted fixes and commit them. Log the round (consult + verdict) in `lessons/phase-3.md`. Then resume the same session (`resume-codex.sh`) with the fix diff for a re-review. Stop when a round yields no new material findings. Rejected nitpicks do not count. Still material after 3 rounds? Stop and report `ARC_FAILED`.
3. **Delivery.** Open the PR only now (see Delivery). Then run `gh pr checks --watch`.
4. **Close-out**, as the PR's final commits:
   - Write an `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, what was dropped and why (#44 fixed by #41), open items, and one line retiring the `/goal` and `/loop` seeds.
   - Merge `origin/dev` first, and read what changed in `index.md`, `lessons.md` and `follow-ups.md`.
   - Promote generalizable gotchas to `implementations-plan/lessons.md`, one line each with a link. Deduplicate and stay under 8 KiB.
   - Move open items to `implementations-plan/follow-ups.md`. Delete any entry this lane resolves.
   - Delete `STATUS.md`.
   - In its own commit, `git mv implementations-plan/contacts-import-1 implementations-plan/archive/contacts-import-1`. Repair the links the extra level breaks. Move the index line to `archive/index.md`.
   - Push. Report, and wait: merging is the orchestrator's call.
5. **Teardown after the merge.** When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/contacts-import-1/plan.md` succeeds, run `agent-worktree done contacts-import-1 --merged`. This session did not enter through `EnterWorktree`, so there is nothing to exit. On a refusal, relay its output and stop; never force. This step needs no further approval. A `/loop` session checks for the merge on every firing. A `/goal` session arms one background wait right after its wrap-up report: `until <the check above>; do sleep 300; done`, run with `run_in_background` at the maximum timeout.

**No-over-engineering rule** (verbatim in every Codex prompt, initial and resumed): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**Comment-quality rule** (verbatim in every Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

## Seeds

Drafts until the orchestrator approves the plan. Use exactly one per session. **Recommended: `/goal`**, because completion shows in the transcript.

```
/goal All phases marked ✓ in implementations-plan/contacts-import-1/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/contacts-import-1/lessons/phase-N.md printed for each phase; /code-review NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol converged over the whole diff, evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; one PR into dev created only after that, shown by `gh pr view` output; its close-out commits archived the plan (`git show --stat` of the archive-move commit in the transcript); `bun run test` and `bun run lint` both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/contacts-import-1 forward. Never idle waiting for input. Each firing: (1) read plan.md and lessons/ (the authoritative state), judged against its Outcome & Quality Bar; if the plan is gone from the live path, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/contacts-import-1/plan.md` — success means merged: run `agent-worktree done contacts-import-1 --merged`, report, clear this loop and stop; failure means delivered: babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step of plan.md, run lint and the touched tests after each edit, commit. (4) Stuck on a decision: consult Codex (gpt-6.1-sol, high), log it in lessons/, act. Never merge, never push to main, never expand scope. (5) Same step failed 5 times: stop and reassess with Codex. (6) Phase gate green: paste it, mark ✓, write lessons, print LESSONS_FILE. (7) All phases ✓: run the Post-implementation section of plan.md in order, then report and stop.
```
