---
plan: backup-import-export
tier: mid
status: arcs 1 (#246), 1b (#247) and 2 (#418) merged; arc 3 revised 2026-10-14 against the signed page 1, waiting on the orchestrator's approval
issues: "#146, #203, #207, #223, #226 (arc 1); #148 in-repo half (arc 1b, stays open); #147, #191, #221 (arc 2); #189, #192, #230, #231 and the OA-9 residual of #226 (arc 3); #98 not planned (OA-5 C)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet) for the arc 3 revision; dual audit (Codex gpt-6.1-sol high + one Opus Plan agent) over the revised sections, one resumed Codex round
post_implementation_hardening: not scheduled
---

# Backup import and export: key wipes, decoders, the migration engine, the account-state slice, restore outcomes

Fourteen issues on backup and storage integrity, in four arcs and a close-out.

- **Shipped.** Arc 1 (#246): one unseal wipe order, strict hex, the migration watchdog, the restore Enter guard, the generated-profile-id rule. Arc 1b (#247): the `@aztec-labs/pxe` patch that heals a half-registered account. Arc 2 (#418): an edited Local Network reads its true status and travels in the backup; the export drops PXE-provided contracts; #221 closed as not planned. Their phases, decisions and review findings are in [lessons/phase-1.md](lessons/phase-1.md), [lessons/phase-1b.md](lessons/phase-1b.md) and [lessons/phase-2.md](lessons/phase-2.md); the planning rounds are in [lessons/phase-0.md](lessons/phase-0.md).
- **Arc 3 (this revision).** A backup profile part that is not the wallet's shape shows the integrity message (OA-9 B, #226). The import's warning reads on light, a Retry that fails again names the networks, and the notice and the viewer name them (#189). A restore that did not finish is remembered per profile and shown on Home; "Restore again" takes the same backup file and restores only the account state of the networks it names, into the same profile (#192). The account file must be protected before Download (#230). The full-backup page warns when imported accounts will not restore (#231).

Recon: [recon.md](recon.md) (arcs 1 and 2) and [lessons/phase-3.md](lessons/phase-3.md) (the arc 3 re-verification). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md).

## Scope (arc 3)

**In:** #189, #192, #230, #231; OA-9 B, the one part of #226 that arc 1 did not build.

**Out, with reason:**
- #98: OA-5 = C. The close-out closes it as not planned (D-arc3-9).
- #148: arc 1b shipped the in-repo half; P1-08 builds no in-app recovery; the upstream report is the owner's to file (D-arc3-10).
- #146 and #226's id rule: shipped in arc 1 (`migrator.ts:76-92,164-183`; `profile/repository.ts:30-32`).
- account-session-life's backup autocomplete (#208): that lane's next arc; arc 3 changes `useFullBackupImport`'s options and result additively only (D-arc3-11).
- No storage migration (pre-production). The reminder is a new `nulo:ui:` key, not a backup slice; no backup shape changes.

## Owner records (decision page 1, signed 2026-10-14, plus the chat addendum on #189)

| Record | Issue | Pick | Phase |
|---|---|---|---|
| OA-9 (P1-18), P1-19 | #226 | B: the integrity message for a malformed profile part; the fresh-id rule stands | 3.1 |
| P1-02 + addendum, P1-03, OA-2 (P1-10), OA-3 (P1-11) | #189 | names, not a count; `--txt-warning` on light; the notice names networks (A); the name beside the id (B) | 3.2 |
| P1-01, OA-4a (P1-12), OA-4b (P1-13) | #192 | A: the Home banner; the restored profile only; a deleted network drops out | 3.3, 3.4 |
| OA-7 (P1-16) | #192 | B: Restore again restores only the named networks, into the same profile; its words are OA-10 | 3.5 |
| P1-06, OA-8 (P1-17) | #230 | approved; information accepted | 3.6 |
| P1-07 | #231 | approved | 3.7 |
| P1-04 + OA-5 (P1-14) | #98 | C: not carried | none |

## Outcome & Quality Bar

**For whom.** A person who restored a full backup, often on a fresh install after losing a device, whose restore did not finish for a network; a person who exports one account or a whole profile to keep it safe.

**What excellent looks like.**
1. A restore that did not finish is never silent: a page closed mid-tail, a failed Retry or a second window leaves the Home banner naming at least every network still unrestored, in the owner's words, and no network the restore did not cover. Proven by unit tests on the record and smoke e2e on both browsers.
2. Restore again only ever restores the account state of the named networks, from the exact backup that armed the reminder, into the same profile incarnation. Another, stale or tampered file changes nothing. Proven by unit tests over the real validation gate and a network e2e that sees the PXE lack, then hold, the backup's sender.
3. No screen produces an unprotected account file, and a backup that will lose imported accounts says so before the download.

**Good enough.** One new page. Restore again reuses the import's form, gates, warning, Retry and tail. No View-errors redesign.

## Assumptions

### Facts (verified at 1ba770cf; [lessons/phase-3.md](lessons/phase-3.md))

- F21. The account-state tail runs in the page after `finalizeRestore` (`useFullBackupImport.ts:410-425`) on one 45 s budget (`importChainSync.ts:29`) and records outcomes once, after every network settled (`:64-82`). Its retry context lives in the page (`full-backup-restore.ts:656-664`).
- F22. The networks stage binds every account-state row to the seeded network of its `chainId` and drops the rest (`full-backup-restore.ts:290`, `utils/full-backup-helpers.ts:488-523`). The backup carries no network rows.
- F23. `validateAndMigrateBackup` checks the checksum, the compat epoch and the schema-version range, then migrates (`useFullBackupImport.ts:86-151`); it does not check `profile`. The profile service reads `type`, `name` and `id` (`profile/service.ts:2243,2252`); the page replaces the name with its prompt's answer first (`useFullBackupImport.ts:294,327`).
- F24. A restore's row commit removes `profileUiKeys(id)` first (`profile/service.ts:1471-1497`); profile deletion removes them too (`profile-deletion/coordinator.ts:135`). Neither takes a page's Web Lock. An unfinalized import stays unlock-refused and is reaped after seven days (`profile/service.ts:199,1656-1690`).
- F25. `AccountStateService.restore` uses the network rows its caller passes, schema-checked only (`account-state/service.ts:305-311,381`). A registration lands in the PXE of the row's `profileId` (`network/spec.ts:94-97`). The PXE client stamps each operation with that profile's current incarnation (`packages/aztec-runtime/src/pxe/client.ts:244-262`). A contract launch awaits its artifact check before the PXE call (`account-state/service.ts:415`), and a caller may stamp the generation itself (`client.ts:538-541`). So a page holding stale rows after a delete and same-id re-import reaches the successor.
- F26. `ContactService` takes an optional `RunFence`, asserts it before each write and checks `isFenceLive` synchronously right before the write starts (`contact/service.ts:228-246`); `captureRunFence`/`assertRunFence`/`isFenceLive` live at `profile/service.ts:541-564`, `getPxeGeneration` beside them. `AccountStateService` resolves its services at `init()` (`account-state/service.ts:59-62`).
- F27. Profile activation empties `appStore.networks` before it reloads them (`useProfileBootstrap.ts:61-63`). Rename and delete update the list (`stores/app.store.ts:503-510`). `migrationIdle` has no timeout (`utils/storage.ts:32-66`).
- F28. `interceptRpc` refuses or redirects on both browsers (`tests/e2e/FIREFOX.md:47`). The e2e restore gate releases itself after 20 s (`src/e2e/chrome-storage-restore-gate.ts:22`). `navigator.locks` is in use on both browsers (`popup/windows/execute/scope-follow.ts:47`); jsdom has none.
- F29. #189: the warning and its tag use `--yellow` (`ImportFullBackupForm.vue:102,192-194`); light `--txt-warning` is `#7f6200`, dark is `var(--yellow)` (`packages/design/src/base.css:124,187`). The onboarding notice keeps the console sentence (`onboarding/pages/import.vue:98-108`); the viewer gets the raw log (`popup/pages/import.vue:137-142`).
- F30. #230: Create fetches a plain body, Download is enabled on it, `handleDownload` checks nothing, and Protect really encrypts (`export/account.vue:117-171,182-197`). Seven e2e specs take plain account files from that path through `exportAccountBody` or `exportImportedAccountBody` with `encrypt` false (`tests/e2e/helpers/account-io.ts:97-170`), three of them in the network suite.
- F31. #231: `resealImportedKeys` counts unopened rows and only logs the count (`account/service.ts:871-895`). The passkey probe is the private `exportPasskeyCredential` (`profile/service.ts:1788-1857`), called by the RPC `exportPasskeyBackupMaterial` (`:1917-1925`) and by `exportPlain` (`:1738`); `full.vue` reads the rows separately (`full.vue:107,197-199`). `unsealImportedSigningKeyV2` is `@nulo/wallet-crypto`'s.

### Inferences

- I8. Two concurrent runs over one profile's reminder need two pages on that profile while the lease hides the banner. One run's start or end can then move the lease early. Registrations are idempotent, so the cost is a banner shown up to 45 s early. A known-limit candidate.
- I9. Background removals (F24) can race a page's read-modify-write and leave an orphan record. The next row commit under that id or Dismiss removes it, and the banner shows only ids of the active profile's own networks. A known-limit candidate.
- I10. The stored checksum is already printed in the backup file; storage read access lets someone recognize a file they already hold, and storage write access gives far more.

### Asks

- A11. **OA-10, the Restore again words.** Working assumption: the recommended words ship, and the PR waits on the sign-off.
- A12. **OA-11, the export agree-gate sentence** ("Anyone holding the plain file can spend from this account."). Working assumption: unchanged.

## Architecture & Implementation (arc 3)

**OA-9 B (#226).** After migration, `validateAndMigrateBackup` refuses a `profile` that is not a plain object, whose `type` is neither `"password"` nor `"passkey"`, or whose `name` is not a string, with the existing integrity title and message (one constant pair, shared with the checksum refusal). The `id` is not checked: the shipped rule replaces any id the wallet would not generate. `BackupProfile` narrows to `{ id: unknown; name: string; type: "password" | "passkey" }`.

**#189.** Pure helpers beside `restoreWarningText`:
- `retryResultText(names)` returns "Retry didn't work · Testnet still not restored", joined as the warning joins names.
- `restoreNoticeText(names)` returns "Some entries from the backup couldn't be restored." plus " Testnet and Local Network didn't finish restoring." when names exist.
- `withNetworkNames(log, byId)` returns a copy in which each row with a known `networkId` gains `network` before it. The log's rows stay untouched: `retryReplacedRows` matches them by identity.

`useFullBackupImport` keeps the restored networks and a `retryFailedAgain` boolean; the names are `unrestoredNetworkNames`. `showErrorLog` (its type in `useProfileImportFlow.ts:47,381` too) gains `{ byNetworkId, unrestored }`: the popup's viewer gets `withNetworkNames(...)`, the onboarding notice `restoreNoticeText(unrestored)`. Both pages render the line above Retry (testid `import-full-backup-retry-result`). The warning sentence and its tag label take `--txt-warning`; the border is unchanged.

**#192, the record.** `apps/extension/src/utils/restore-outcome.ts`, through `@/utils/storage` only:

```ts
/** `nulo:ui:restore-outcome@<profileId>`: the networks one restore run has not restored. */
type RestoreOutcome = { run: string; backup: string; networkIds: string[]; leaseUntil: number }
armRestoreOutcome(profileId, backup, networkIds): Promise<string | undefined> // fresh run, lease set; overwrites
admitRestoreOutcome(profileId, run): Promise<RestoreOutcome | undefined>        // lease set; the current record
finishRestoreOutcome(profileId, run, restoredIds): Promise<void>               // drop restored ids, lease 0
clearRestoreOutcome(profileId): Promise<void>                                   // Dismiss
readRestoreOutcome(profileId, now?): Promise<RestoreOutcome | undefined>        // decode only
```

- `backup` is the restored envelope's verified checksum; `validateAndMigrateBackup`'s ok result gains it.
- Page writes run inside `navigator.locks.request("nulo:restore-outcome@<profileId>")`: read, decode, write. Admit and finish write nothing on an absent record or another run's.
- A network leaves the record only when it restored. That means its outcome record and every child carry no `restoreError` (`restoredNetworkIds(records)`, pure, over the raw `"outcomes"` records: the collected `outcomeRows` drop successful rows, `full-backup-helpers.ts:416`). Retryable and permanent failures stay, by the owner's standing rule: be told whenever part of a backup does not restore (security-fixes-1 OA-3 A, P1-01's basis). An emptied record is removed.
- The decoder requires a 32-hex `run`, a 64-hex `backup`, at most 64 `networkIds` of at most 64 characters, and a finite `leaseUntil`. Anything else reads as absent and is removed under the lock. This is the only delete a read makes.
- The lease: arm and admit set `now + 60 s` (the 45 s budget plus slack), finish sets `0`. A reader shows nothing while it is live; one more than 60 s ahead counts as expired.
- A run that never finishes leaves its armed set (a page closed mid-tail). So the banner names at least every network still unrestored; one the worker completed after the page died stays named until Restore again re-registers it, idempotently.

**The tail is fenced.** `AccountStateService.restore` gains a required `RunFence`. On entry it asserts the fence, refuses every network row whose `profileId` is not the fence's, reads the profile's `pxeGeneration` once and checks `isFenceLive` again. Every PXE call of the run carries that generation on its `NetworkInfo`, so the offscreen refuses an op against a same-id successor (F25). Each launch checks `isFenceLive` synchronously right before its PXE call, after the artifact check, as `ContactService` does (F26). `finalizeRestore` returns the import's fence, captured inside its own critical section (its one caller is `useFullBackupImport.ts:413`), so the tail is bound to the session that call opened and never to a same-id successor a later capture would see; Restore again captures it on mount and reads the record by its `profileId`. `AccountStateRetryContext` carries `{ profileId, run, fence }`. A registration already sent when the fence dies finishes in its own profile.

**Wiring in the import.** A helper `finalizeWithReminder` arms (best effort: a failure is logged as a fixed category, and the restore goes on without a reminder) and then calls `finalizeRestore`. It keeps `executeRestore` inside its 80-line budget. The arm's set is `accountStateNetworkIds(data)`: the normalized, remapped networks with registrable work, the same set the tail runs; an empty set arms nothing. `restoreAccountStateStage` and `retryAccountStateStage` admit at start. After `runImportChainSync` resolves, they finish with `restoredNetworkIds` over the raw outcome records, only if `assertRunFence` still passes; otherwise they write nothing. `runImportChainSync` is unchanged: no per-network hook, since `migrationIdle` and a lock wait must not hold the tail's single record (F27).

**The banner (P1-01 A, OA-4a A, OA-4b A).** `RestoreOutcomeBanner.vue` (L4) sits in `general.vue` right after `<RecoveryModeBanner />`. It uses `Banner` (warning, vertical, testid `restore-outcome-banner`) with the signed words. The two buttons sit in the description slot, composing `type--label` as `Banner`'s own action does: testids `restore-outcome-restore` and `restore-outcome-dismiss`. The banner is a computed over a record snapshot and `appStore.networks`:
- It re-reads on mount and on profile change. It also re-reads on `chrome.storage.onChanged` for its key (the `usePinnedTokens` pattern) and at the lease's end (one timer). Both are cleared on unmount, and a read that resolves after a profile change is dropped.
- It shows only while `appStore.networks` is loaded for the active profile (non-empty, every row its own). It names the record's ids found there, so a deleted network drops out and none found hides it (OA-4b). It never deletes (F27).
- Restore again routes to `/popup/restore-again`; Dismiss clears the record.

**Restore again (OA-7 B).**
- The page `popup/pages/restore-again.vue` (L6, `isAuthRequired`) owns its profile and network clients and passes them to `useRestoreAgain` (C1). It asks for no secret but the file's own and runs no ceremony, so it serves both profile types.
- It reuses `ImportFullBackupForm` with a new `askNewPassword` prop (default `true`) that hides the New Password section. The page's buttons carry `restore-again-*` testids.
- It shares the import's capped pick (exported from `useProfileImportFlow.ts`), `readBackupFile`, `openEncryptedBackup` (moved to `full-backup-helpers.ts`), `validateAndMigrateBackup`, `restoreAccountStateStage`, `retryAccountStateStage` and the text helpers.
- Enter follows the import page: the decryption field's Enter decrypts, Restore's button is the keyboard path, and there is no document-level Enter.

Sequence:
1. On mount, capture the fence and read the record. Resolve its networks from the loaded `appStore.networks`; with none, return Home.
2. Pick the file, and decrypt it when encrypted.
3. On Restore, run `validateAndMigrateBackup` (a refusal shows the import's copy). Require `checksum === record.backup` (a mismatch shows the OA-10 refusal). A refusal never touches the record.
4. Admit. The run proceeds with the admitted record's ids that are among the named networks; an absent record returns Home.
5. `planRestoreAgain(data, named)` keeps only the account-state slice, bound by `remapNetworkIdByChain` to the named networks; every other chain drops.
6. Run `restoreAccountStateStage(planned, named, networkService, io, { profileId, run, fence })`, then finish as above.
7. All restored: the OA-10 toast, then Home. A retryable failure left: the import's warning, Retry, View Errors and Continue. Only permanent failures left: the OA-10 line, View Errors and Continue. A Retry that fails again shows the P1-02 line. A profile change while mounted returns Home and writes nothing.

**#230.** `exportAccount` keeps its `encrypt` parameter. `canDownload` is `fileStatus === "protected"`, and `handleDownload` checks it again. The plain body fetched at Create never reaches a download. The banner copy becomes P1-06's, and the testids stay. `exportAccountBody` and `exportImportedAccountBody` keep their signatures: with `encrypt` false they download the protected file and decrypt it in the test (`decryptAccountExport`, `@nulo/aztec-runtime`).

**#231.**
- Password path: `resealImportedKeys` returns `{ rows, unopened }`, and `FullBackupKeys` gains `unopenedImportedKeys`.
- Passkey path: a new RPC `AccountService.exportPasskeyBackupKeys(fence, credentialData)` reads the rows once and passes them to an in-process (non-RPC) `ProfileService` method beside `exportPasskeyBackupMaterial`. That method counts, under the probe DEK, the rows that do not open, wiping each plaintext at once, and returns `{ credentialId, dekSealed, dekReplaced, unopened }`. The DEK never leaves `ProfileService`. `exportPlain`'s call passes no rows. The fence is asserted before and after.
- `full.vue`'s passkey branch switches to the new RPC and holds the rows. `exportPasskeyBackupMaterial` goes if `full.vue` was its only caller.
- The P1-07 banner (testid `backup-imported-unopened-banner`) shows when the count is above zero and `dekReplaced` is false.

### File-level change map

| Phase | File | Change |
|---|---|---|
| 3.1 | `apps/extension/src/composables/useFullBackupImport.ts` (+ test), `full-backup-restore.ts` | profile-part refusal; `BackupProfile` |
| 3.2 | `components/composite/import/restore-warning.ts`, `ImportFullBackupForm.vue` (+ tests) | three helpers; `--txt-warning` |
| 3.2 | `composables/useFullBackupImport.ts`, `useProfileImportFlow.ts` (+ tests), `onboarding/pages/import.vue`, `popup/pages/import.vue` | `retryFailedAgain`, networks, `showErrorLog` names, the line |
| 3.3 | `utils/restore-outcome.ts` (new, + test), `utils/profile-ui-keys.ts` (+ test) | the record; its prefix |
| 3.3 | `wallet/services/account-state/{service,spec,client}.ts`, `profile/{service,spec}.ts` (+ tests) | the `RunFence` per launch; `finalizeRestore` returns the fence |
| 3.3 | `composables/full-backup-restore.ts`, `useFullBackupImport.ts` (+ tests) | checksum; `finalizeWithReminder`; admit and finish; `restoredNetworkIds` |
| 3.4 | `popup/components/modules/general/RestoreOutcomeBanner.vue` (new, + test), `popup/pages/general.vue` | the banner |
| 3.5 | `popup/pages/restore-again.vue` (new), `composables/useRestoreAgain.ts` (new, + test), `full-backup-restore.ts` (`planRestoreAgain`), `utils/full-backup-helpers.ts`, `useProfileImportFlow.ts`, `ImportFullBackupForm.vue` | Restore again |
| 3.4-3.5 | `apps/extension/tests/e2e/restore-outcome.test.ts` (new), `tests/e2e/network/restore-again.test.ts` (new) | e2e |
| 3.6 | `export/account.vue` (+ new `account.test.ts`), `tests/e2e/helpers/account-io.ts` | Download only once protected |
| 3.7 | `wallet/services/account/{spec,client,service}.ts`, `profile/service.ts` (+ tests), `export/full.vue` (+ test), `tests/e2e/backup-imported-account.test.ts` | the unopened count; banner |

## Security & Adversarial Considerations

- **Threat model.** (a) A hostile file offered to Restore again: a plain backup's checksum is recomputable, so all of it is attacker-controlled. (b) Tampered `chrome.storage.local`: the record is forgeable. (c) Racing extension pages and the worker: a second page, Dismiss, deletion, a reused profile id, a profile switch. (d) Key material in memory (#231). (e) A plaintext key file on disk (#230).
- **The second import path** (Sequence 2-6). A file passes the import's own gates first: size cap, parse, decrypt, checksum, compat epoch, version range, migration. `checksum === record.backup` then admits only the exact backup that armed the reminder; forging one needs a SHA-256 second preimage. Rows bind by chain to the admitted networks among the active profile's own (`createdNetworkIds` are those ids; the normalizer bounds the slice), and the `RunFence` refuses every launch once the session, the profile or its incarnation moved, every op carrying the generation read under the live fence (F25, F26). Nothing outside account-state registrations is written.
- **A tampered record.** Its ids select only among the active profile's own networks. Its checksum selects which file restores: an attacker who can write storage and also gets the person to pick their file gets that file's contracts and senders registered. A plain import of the same file gives as much, and storage write gives far more. A far-future lease is capped; a malformed record is removed. Exploitability beyond storage write: none found by trace.
- **Races.** One Web Lock per profile serializes the pages' writes (not the worker's removals: I9). A run's token keeps one restore of a reused id from editing another's record, and admission lets no run start from a record that is gone.
- **Input validation.** OA-9 B refuses a profile part of the wrong shape. Network names are user-controlled and render through interpolation only.
- **Key material.** #231's count runs inside `ProfileService` under the probe DEK; each plaintext is wiped before the next; nothing is logged, resealed or returned.
- **Logging.** New lines carry counts, fixed categories and caught errors as `{ error }` only. Never a network name (user text, it may hold a URL), a URL, the checksum, a run token, a profile id or a row.
- **Least privilege, supply chain.** No workflow, permission, secret or dependency change.

## Phases

Arcs 1, 1b and 2: every phase ✓ (1.1-1.5, 1b.1, 2.1-2.4); gates and results in `STATUS.md` and the arc lessons.

Every arc 3 gate includes `bun run lint` and `bun run typecheck:all`. Unit tests run per file: `cd apps/extension && bun --bun vitest run <files>`; the record's tests stub `navigator.locks` with a FIFO lock. Smoke e2e needs the armed build for each browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`. Run it as `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`, adding `NULO_E2E_BROWSER=firefox` for Firefox. Network e2e: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files> --retry=0` from the repo root; it leaves its own bundle in `dist`, so rebuild the armed build before the next smoke run. Never run two `e2e:agent` runs in this worktree at once. A gate passes only when every named test ran. Every changed popup surface gets a light and a dark screenshot, saved under `screenshots/` and attached to the PR. Every fixture that feeds an import carries a real checksum and 8-hex network ids, as the wire does. Phases 3.2-3.5 also run `src/utils/storage-facade-ban.test.ts src/utils/copy-dash-ban.test.ts src/utils/type-role-ban.test.ts`.

### Arc 3: warnings, outcomes, export rules

#### Phase 3.1: a malformed profile part shows the integrity message (OA-9 B, #226) ✓

1. Add the check after migration. Share the integrity copy as one constant pair. Narrow `BackupProfile`.
2. Add one test per refused class: not an object, an unknown `type`, a non-string `name`. Add a control: a valid part with an odd `id` passes and restores under a fresh id.

UI impact (OA-9, quoted): "The existing integrity message for any malformed profile part: "Backup Integrity Check Failed" / "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file." (what a bad checksum already shows), right after Restore, before anything is written."

Validation gate: lint; typecheck; `src/composables/useFullBackupImport.test.ts`. Pass: exit 0; each refused class fails before `profileService.restore` runs. Layers: lint, typecheck, unit.

#### Phase 3.2: the import's warning, failed-Retry line and names (#189) ✓

1. Add the three helpers with tests: one and two names; no names; a row without `networkId`; the original rows unchanged.
2. Add `retryFailedAgain` and the restored networks; pass the names to `showErrorLog`; render the line on both pages.
3. Set `--txt-warning`. Remove the console sentence.
4. Extend `tests/e2e/import-errors-scroll.test.ts`: a Retry that fails again shows the line; the onboarding notice names the network.

UI impact (P1-02 with the addendum, quoted): "The line above Retry after a Retry that fails again reads "Retry didn't work · Testnet still not restored" (two: "Testnet and Local Network still not restored")". (OA-2 A): "Some entries from the backup couldn't be restored. Testnet and Local Network didn't finish restoring." ("Testnet didn't finish restoring." for one; as B when no network failed). (OA-3 B): `"network": "Testnet", "networkId": "3f2a9c1e"`. (P1-03): "Light-theme warning text uses --txt-warning (#7f6200, 5.28:1 on the page; today 1.56:1); dark unchanged." "Check the developer console for details." is removed.

Validation gate: lint; typecheck; `src/components/composite/import/ src/composables/ src/popup/pages/import.test.ts` and the three ban tests; smoke `tests/e2e/import-errors-scroll.test.ts` on both browsers. Pass: exit 0. Layers: lint, typecheck, unit, component, smoke e2e.

#### Phase 3.3: remember a restore that did not finish (#192) ✓

1. Add `restore-outcome.ts` and its prefix in `PROFILE_UI_KEY_PREFIXES` (F24). Add the `RunFence` to `AccountStateService.restore`. Thread the checksum. Add `finalizeWithReminder`, admit and finish.
2. Add record unit tests:
   - Each malformed shape reads as absent and is removed. A far-future lease reads as expired. A live lease hides the record.
   - Admit and finish on another run's record, or on none, write nothing. A Dismiss queued behind a finish leaves no record.
   - A full success leaves no record. A wrong-network refusal and a refused contract stay in it. Only restored networks leave, computed through the real error collector with one restored network beside one failed.
   - A record survives a read made while the network list is empty.
3. Add `AccountStateService` tests: a row of another profile is refused; a launch after the fence dies is refused and recorded; a delete and same-id re-import during the artifact check sends nothing under the successor's generation; a same-id successor restored between finalization and the tail gets nothing (the fence `finalizeRestore` returned); a live fence registers (control).
4. Add import tests:
   - The arm runs after the networks stage with the remapped ids, before `finalizeRestore`.
   - An arm failure does not fail the restore.
   - A finish whose fence died writes nothing.
   - Retry admits and finishes the same run.
   - An item with no registrable work is never armed.

UI impact: none (no reader until 3.4).

Validation gate: lint; typecheck; `src/utils/restore-outcome.test.ts src/utils/profile-ui-keys.test.ts src/wallet/services/account-state/ src/composables/` and the ban tests. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 3.4: the Home banner (#192, P1-01 A) ✓

1. Add `RestoreOutcomeBanner.vue` and mount it.
2. Add component tests:
   - One name and two names; a renamed network shows its new name.
   - A deleted network drops out, and none left hides the banner.
   - Dismiss clears; Restore again routes.
   - Nothing shows with no record, a live lease or a list not yet loaded.
   - Another profile's record never shows (OA-4a). A storage change and the lease's end each re-read.
3. Add smoke SE1 and SE3 (budget table), on both browsers.

UI impact (P1-01 A, quoted): "A Home warning banner under the recovery banner: "Some networks weren't restored" / "<names> didn't finish restoring. Restore the backup again to bring them back." with Restore again (opens the full-backup import) and Dismiss." OA-7 B replaces "opens the full-backup import" with the Restore again page. (OA-4a A): "the reminder shows only while that profile is active, and returns when they switch back." (OA-4b A): "the reminder stops naming it; if it was the last one, the reminder disappears."

Validation gate: lint; typecheck; the banner test and the ban tests; smoke `tests/e2e/restore-outcome.test.ts` on both browsers. Pass: exit 0. Layers: lint, typecheck, component, smoke e2e.

#### Phase 3.5: Restore again (#192, OA-7 B, OA-10) ✓

1. Move `openEncryptedBackup`, export the capped pick, add `askNewPassword`.
2. Add `planRestoreAgain`, `useRestoreAgain` and the page with the OA-10 words.
3. Add `planRestoreAgain` tests. It keeps only named networks of a matching chain, and drops other chains and every other slice. A hostile slice (not an array, oversized, duplicate ids) reaches the normalizer's violations.
4. Add `useRestoreAgain` tests over the real `validateAndMigrateBackup` and fake clients:
   - Refusals: another backup gives the OA-10 refusal; a tampered body gives the integrity message; an old compat epoch, a too-new schema and a failed migration each give their copy; a wrong decryption password gives the existing error. None makes a restore call or touches the record.
   - Scope: the restore call carries only the admitted networks and their rows.
   - Outcomes: success finishes, toasts and goes Home; a retryable failure keeps the network; a permanent one shows the OA-10 line; a Retry that fails again shows the P1-02 line.
   - Races: a record dismissed before admission returns Home with no call; a record of another run is untouched; a profile change mid-run writes nothing and returns Home.
5. Add smoke SE2 and network NE1.

UI impact (OA-7 B, quoted): ""Restore again" asks for the backup file again and restores only the account state of the networks the reminder names, into the same profile." The page's own words are OA-10's, signed or swapped before merge.

Validation gate: lint; typecheck; `src/composables/ src/utils/full-backup-helpers.test.ts src/components/composite/import/` and the ban tests; smoke `restore-outcome.test.ts` on both browsers; network `tests/e2e/network/restore-again.test.ts` on Chrome, then Firefox. Pass: exit 0; every scenario ran. Layers: lint, typecheck, unit, component, smoke e2e, network e2e.

#### Phase 3.6: protect the account file before Download (#230) ✓

1. Add `canDownload` and the handler re-check. Set the P1-06 copy.
2. Add `account.test.ts`. Download is disabled at the ready stage and enabled once protected. A forced press at the ready stage writes nothing. A passkey profile is redirected.
3. Make both e2e export helpers decrypt the protected download when `encrypt` is false.

UI impact (P1-06, quoted): "Download stays disabled until the file is protected with your password, as on the full backup for a password profile. The "Account file is ready" banner becomes the instruction: "Protect your account file" / "Encrypt the file with your profile password before you download it. Without a password, anyone who opens the file controls this account."" (OA-8, accepted): no screen produces an account file without a password.

Validation gate: lint; typecheck; `src/popup/pages/settings/security/export/`; smoke `account-import-export.test.ts backup-imported-account.test.ts imported-account-lifecycle.test.ts legal-acceptance.test.ts` on both browsers. Pass: exit 0. Layers: lint, typecheck, component, smoke e2e.

#### Phase 3.7: warn when imported accounts will not restore (#231)

1. Return the count on the password path. Add `exportPasskeyBackupKeys` and the counting `ProfileService` method. Switch `full.vue`'s passkey branch. Show the P1-07 banner.
2. Add tests on both paths:
   - One unopened row shows the singular banner, three the plural, zero none.
   - `dekReplaced` shows only the existing banner.
   - The passkey count uses the probe DEK, even in a degraded session.
   - The counted rows are the rows the file carries.
   - A count that throws aborts the export with the DEK wiped, and is not reported as `dekReplaced`.
   - `exportPlain` still returns the credential id.
3. Extend `backup-imported-account.test.ts`: corrupt one imported-key row before export; the banner shows.

UI impact (P1-07, quoted): "When imported-key rows do not open, the page shows a warning banner beside the existing ones, and Download stays available: "Some imported accounts are not in this backup" / "N imported accounts could not be opened, so they will not be restored. Import their keys again after the restore." ("1 imported account" in the singular)."

Validation gate (also the arc gate): `bun run audit:vue`; `bun run test:all`; the armed builds, then the whole smoke suite (`bun run test:e2e -- --retry=0`) on Chrome and Firefox; the whole network suite on Chrome in two selections, since the guard refuses a marked file on a default run: the unmarked files (`bun run e2e:agent $(cd apps/extension && grep -L -- @requires-proverless tests/e2e/network/*.test.ts) --retry=0`), then the marked ones (`grep -l`) under `NULO_E2E_PROVERLESS=1`, `backup-restore-sw-restart.test.ts` among them; on Firefox, `restore-again.test.ts`, `imported-account-execution.test.ts` and `account-balance-orphans.test.ts`, then `incoming-arrival.test.ts` under `NULO_E2E_PROVERLESS=1`. Pass: all exit 0; every named spec ran (Chrome-only specs skip on Firefox by the driver's list). Layers: lint, typecheck, unit, component, smoke e2e on both browsers, network e2e.

### E2E runtime budget and the owner's chaos cases

| Scenario | Failure mode it proves | Why a cheaper layer cannot | Owner's chaos cases | Browsers | Estimate |
|---|---|---|---|---|---|
| SE1: a seeded record shows both names; a rename shows the new name; a second popup page's Dismiss hides the first page's banner; re-seeded, Restore again refuses another valid backup, then a tampered one | the key, decoder, live network rows, storage events across pages, the new route and the Firefox picker disagree in a real build | unit and component tests fake storage, events, the store and the picker | a second window; a renamed and a deleted network; a wrong and a tampered file | Chrome, Firefox | 35 s |
| SE2: with the local node refused, Continue shows the banner the real import armed; Restore again fails, and its Retry fails again with the line | the real import arms the remapped id and finishes; Restore again drives the real worker, probe and fence | the arm, admit and finish cross page, worker and storage | a Retry that fails again | Chrome, Firefox | 45 s |
| SE3: the import page closes while a stub holds the local node; the test ends the lease in storage (its timing is unit-proven); the reopened popup names the network | a page closed mid-tail leaves its armed record | only a real page close drops the page's in-memory state | a close mid-tail | Chrome, Firefox | 25 s |
| NE1: a real backup, whose sender no contact names, imports with the local node refused; Continue; the refusal lifts; a successful read shows the sender absent (a failed read never counts); Restore again with the same file shows the toast; the banner is gone and the sender is present | Restore again registers the backup's account state into the same profile's PXE | only a real PXE and node register senders | the partial restore end to end | Chrome, Firefox | 75 s |
| #189 and #231 extensions | the line and notice in both shells; the unopened banner on the real export | the shells and the export wire real services | a Retry that fails again (`import-errors-scroll`) | both | +7 s |

NE1 declares its budget (`{ timeout }`) like any long network file, measured then tightened. The PR body states each browser's smoke and network wall-clock before and after; the Firefox network shard 4/5 runs near its limit (#410).

Every chaos case also has unit tests (Phases 3.3-3.5). A reused profile id and a profile switch mid-run are unit-only (run token, `RunFence`); a worker killed mid-tail is `backup-restore-sw-restart`, in the arc gate. No seeded chaos job (D-arc3-19).

## Decision ledger (arc 3)

Earlier rows: D1-D16 in [lessons/phase-0.md](lessons/phase-0.md); D-orch-1 to 4 and D-arc1-1 in [lessons/phase-1.md](lessons/phase-1.md); D-arc1b-1 to 3 in [lessons/phase-1b.md](lessons/phase-1b.md); D-orch-5 to 10 and D-arc2-1 to 3 in [lessons/phase-2.md](lessons/phase-2.md). D-orch-4 (branch from `dev` after a squash merge), D-orch-7 (pins move, never loosen) and D-orch-8 (proportion) bind arc 3. "C" is Codex round 1 and "O" the Opus audit, with finding numbers.

| # | Decision | Alternatives | Panel | Why |
|---|---|---|---|---|
| D-arc3-1 | OA-9 B refuses a non-object part, an unknown type and a non-string name; the id stays under the fresh-id rule | check the id too; the type only | C, O: no objection | Both signed records hold. |
| D-arc3-2 | The record: per profile, a run token, the checksum, a lease set at arm and admit and released at finish, page writes under one Web Lock, a runtime decoder | the 10-second renewal (D12); a background service owning the record | C, O: keep the fixed lease and token; O10, C5: the lock does not cover worker removals | The 45 s budget bounds a run, so no timer; a service adds an RPC surface for one UI key. Residuals I8, I9. |
| D-arc3-3 | Restore again binds to the exact backup by its verified checksum | the profile's account addresses; any valid backup | C, O: checksum | It is computed and verified already; an address binding admits a stale export. |
| D-arc3-4 | A new page and composable reusing the import's form, gates, tail, Retry and decrypt chain | a `networksOnly` mode of `useFullBackupImport` | C, O: reject the mode | The import composable is at its budget; every stage would branch. |
| D-arc3-5 | `askNewPassword` on `ImportFullBackupForm`; two buttons in the banner's slot | copy the blocks; an `actions` array on `Banner` | — | A copy rots apart; no shared-package option for one caller. |
| D-arc3-6 | No per-network hook; one finish write after `runImportChainSync` resolves | the `onSettled` hook (draft) | O4 | A lock or `migrationIdle` wait would hold the tail's single record; a dead page's worker keeps registering anyway. |
| D-arc3-7 | A network leaves the record only when it restored, read from the raw outcome records; a network the normalizer cut never does | settle by retryability (draft) | C2; C2-2; X-1 | Retryable is not restored: a wrong-network refusal would have toasted success. A cut is permanent, like a refusal. |
| D-arc3-8 | The read never deletes except a malformed record; display filters by the loaded network list | prune at read (draft) | O1, C3 | Activation empties the list (F27); a prune there erased OA-4a's reminder. |
| D-arc3-9 | #98 closes as not planned at close-out, quoting OA-5 C; reopen if the owner reverses OA-5 or a user reports a deleted default token returning after a restore | carry the markers | owner | OA-5 = C. |
| D-arc3-10 | Nothing remains for #148 here; it stays open `blocked:external`; Outcome lists it under Open items | close it | owner (P1-08) | The report is outward-facing and the owner's. |
| D-arc3-11 | `useFullBackupImport` changes are additive only | reshape its options | — | account-session-life's #208 builds on these entry points next. |
| D-arc3-12 | No composition test in arc 3 | one for the partial restore | — | `registerSender` and artifact hashing fall outside COMPOSITION-TESTS.md (D1, D6). |
| D-arc3-13 | `AccountStateService.restore` takes a required `RunFence`: the fence's rows only, one generation stamped on every op, a synchronous liveness check before each PXE call | rows re-read service-side; an async assert per launch (r1) | C1, O11; C2-1, C3-1 | The existing pattern (F26) closes the stale-row path to a successor and a mid-run switch, for the import's Retry too. |
| D-arc3-14 | Admission returns the current record; work uses its ids | proceed from the mount-time snapshot | C4 | A record dismissed or finished elsewhere authorizes nothing. Dismiss during a running run only hides the reminder (two pages on one profile). |
| D-arc3-15 | The banner re-reads on storage changes and at the lease's end | mount and profile change only (draft) | C3 | A lease that ends, or a write elsewhere, otherwise leaves a stale banner. |
| D-arc3-16 | #230 keeps `encrypt`; Download only once protected | protected body at Create, plaintext mode dropped (draft) | O8 | Protect stays a real encryption, as on the full backup; the page holds the password anyway. |
| D-arc3-17 | #231's count runs inside `ProfileService` on rows `AccountService` passes | an `inspectDek` callback (D15) | O12 | The DEK never leaves `ProfileService`; no callback contract. |
| D-arc3-18 | NE1 refuses the node instead of holding the restore gate; absence is read after the refusal lifts | the gate (draft) | C6, O2; C2-4 | The gate releases itself at 20 s (F28), so the held call registered the sender. |
| D-arc3-19 | The chaos cases as named interleavings at their cheapest layer; no seeded chaos job | a seeded `restore-again-chaos` beside `send-chaos` | O3 | A second chaos job touches five CI files and the seed rules; OWNER-ASKS offers it. |

## Audit verdicts

- **Earlier rounds.** Planning rounds 1 and 2 and the final pass (2026-10-09): Codex reject, then conditional approve, then reject on one finding; Opus conditional approve. All 51 findings were accepted; the tables are in [lessons/phase-0.md](lessons/phase-0.md). The arc implementation reviews (arc 1: 4 Lows; arc 1b: 5 Lows, 1 partly rejected; arc 2: 7 Low/Nit/Info) each converged in two rounds; their tables are in the arc lessons files.
- **Arc 3 revision, Codex round 1 (2026-10-14; gpt-6.1-sol, high; session 01a13bf1-c4b6-7333-81d2-d52f0f2eb0af): reject.** C1 (High) stale rows reach a same-id successor: D-arc3-13. C2 (High) non-retryable read as restored: D-arc3-7. C3 the banner's missing re-reads and the empty-list prune: D-arc3-8, D-arc3-15. C4 stale admission: D-arc3-14. C5 worker removals outside the lock: I9. C6 NE1 cannot prove registration: D-arc3-18. C7 (Low) armed-build steps and NE1's budget: Phases preamble, budget table. C8 (Low) names in logs: Security, Logging. Facts: F23, F25 and I10 restated. All accepted.
- **Arc 3 revision, Opus 5.5 Plan: conditional approve.** O1 the prune during a profile switch: D-arc3-8. O2 the gate: D-arc3-18. O3 the chaos note: D-arc3-19. O4 the hook: D-arc3-6. O5 the arm: `finalizeWithReminder`, best effort. O6 the lease before validation: Sequence 3-4. O7 the specs on plain account files and the full network suite: Phase 3.6, the arc gate. O8 Protect: D-arc3-16. O9 F24, F25, F30, F31 and I10 restated. O10: I9. O11: D-arc3-13. O12: D-arc3-17. O13 `retryFailedAgain`, the `showErrorLog` type, Enter, the lock stub, the SE2 overlap, the OA-4b note, the ban tests. All accepted.
- **Arc 3 revision, Codex round 2 (resumed): conditional approve.** C2-1 (High) the per-launch async assert left a window between the artifact check and the generation capture, and rows of another profile: D-arc3-13. C2-2 the filtered rows hold no successes: D-arc3-7. C2-3 the default network run refuses marked files: the arc gate's two selections. C2-4 a cold PXE read under the refusal: D-arc3-18. C2-5 OA-10's switch row promised a rollback: reworded. All accepted.
- **Arc 3 revision, Codex round 3 (resumed, last): conditional approve.** The four other fixes verified. C3-1 (Medium) a fence captured by a second call after `finalizeRestore` could be a same-id successor's: `finalizeRestore` now returns it (D-arc3-13). Accepted; no fourth round (the standard's three-round stop), and the implementation's review loop re-checks it.
- **Arc 3 implementation, Codex round 1 (2026-10-14; gpt-6.1-sol, high; session 01a13c7b-ac9d-7362-b631-a121c1ea02e3): conditional approve.** C3-1 verified in code. CR1-1 (Medium) error rows in the restore log line: taken. **Opus 5.5 diff review: approve with fixes.** O-1 a Retry under an ended fence offered forever: taken, no new words. O-2 one port re-opened after Back mid-run: known limit. O-3 the same-hold test, O-4 `joinNames`: taken. O-5 the singular "they" of P1-07's words: asked in the PR. Tables in [lessons/phase-3.md](lessons/phase-3.md).
- **Codex round 2 (resumed): conditional approve.** CR2-1 (Low) Restore again stranded when the fence ends between its check and the stage's: taken (checked after the stage). CR2-2, CR2-3 comments: taken. **Codex cross-arc pass (fresh; session 01a13c90-bac8-7333-8a86-9928f14d07ca): conditional approve.** X-1 (Medium) a network the normalizer cut counted as restored (the export has no count cap): taken, D-arc3-7 now excludes it. X-2 `{ error }` in the reminder's logs: rejected, it is the logging policy's form. X-3 comments: taken in part.
- **Codex round 3 (resumed): approve.** **Cross-arc round 2 (resumed): approve.** Both loops converged with no new finding.

## Delivery

- Branch `backup-import-export-arc-3`, off `origin/dev` 1ba770cf (D-orch-4), carrying the planning commit. One plain PR against `dev` (`gh pr create --base dev`), opened without labels; add `e2e:extension-network` only if the path filter skips that suite.
- Title (86 characters): `feat(backup): remind of unrestored networks, restore them again, protect account files`.
- Body, beyond the standard's: the screenshots in both themes, the OA-10 words for sign-off, `Closes` for #189, #192, #230 and #231, and `Refs #226`.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at 175d826863bd11bff60c46b26277817982c66ac0, with these values:
- Review loop: Codex `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`; on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`, then log and continue. An Opus 5.5 diff review runs beside round 1. Arc map: "arc 3 of 3; arcs 1, 1b and 2 are merged". The cross-arc pass reads the squash commits of #246, #247 and #418 plus this branch's diff.
- Close-out, as this PR's final commits. The Outcome lists shipped #246, #247, #418 and this PR; known limits I8 and I9 if the review keeps them; open item #148; then the line retiring the seeds. Close #98 as not planned with its comment (D-arc3-9); comment on #148 (D-arc3-10).
- Teardown: slug `backup-import-export`, `--trunk dev`.

## Seeds

```
/goal Every phase 3.1-3.7 in implementations-plan/backup-import-export/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/backup-import-export/lessons/phase-3.md printed per phase; the Codex fix loop (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) and the cross-arc pass each converged, quoted; the arc 3 PR exists against dev with the close-out commits (git show --stat of the archive move); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/backup-import-export arc 3. Each firing: read plan.md, STATUS.md, OWNER-ASKS.md, lessons/phase-3.md; if the plan moved to archive/ and FETCH_HEAD has it, run agent-worktree done backup-import-export --merged --trunk dev and stop. Otherwise take the next unticked phase, run its gate, commit, mark ✓; a decision a person would make goes to OWNER-ASKS.md; never merge, publish or widen scope; five failures on one step: reassess with Codex.
```
