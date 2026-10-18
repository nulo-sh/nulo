---
plan: ui-dedupe-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 0fe841be
standard: implementations-plan/README.md § Post-implementation standard, read at 0fe841be
---

# ui-dedupe-1: six dedupe refactors from decision page 37

Six owner picks (page 37, 2026-10-17), all option A, all with no screen change; each Decision block is on its issue. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Gate log: `STATUS.md`. The plan runs past the 350-line `mid` target because it carries six arcs, two of them composite designs; the trade-offs live once, in the ledger.

| Arc | Issues | PR line | Released when |
|---|---|---|---|
| A1 | #541 export run, #518 config restore | `Closes #541 #518` | now |
| A2 | #519 the pre-OPFS IndexedDB layer | `Closes #519` | now (no file in common with a running lane) |
| A3 | #520 `updateSetting` | `Closes #520` | sheet-1 merges (it edits `settings/display.vue`) |
| A4 | #517 the countdown Close | `Closes #517` | onboarding-3's recovery-phrase change merges (`seed.vue` is the sole consumer) |
| A5 | #548 token-balance family | `Refs #548` | PR #678 and sheet-1 merge; OA-1 answered or not |
| A6 | #548 journal family | `Closes #548` | A5 merges |

Every arc is one PR against `dev`, not stacked (orchestrator rule D-orch-1). A1 runs on `worktree-ui-dedupe-1`, which carries this plan. Each later arc branches from `dev` at its release as `ui-dedupe-1-aN` and merges `dev` again before its PR.

## Outcome & Quality Bar

- **For whom**: the next maintainer of these files. The issues' history shows the same fix made once per copy (#206, #209, #268, #269). A person using the wallet must see no change.
- **Excellent**:
  1. Each rule lives once. A later change to it is one edit, and a test names the miss. For the export, a source pin makes a new await impossible to add without a row in the supersede table.
  2. Behaviour is identical for every sequence the services can produce. The existing tests pass unchanged, except a test that pins only deleted code, which goes with that code. Each migrated view or page gets a component test that proves the shared piece is wired.
  3. The backup export keeps every rule the owner named: one fence, one scrub, a superseded run that publishes nothing and writes nothing, no secret that outlives its run.
- **Good enough**: no abstraction beyond the one each decision names. An option exists only for a recorded, observable difference.

## Assumptions

**Facts** (verified at `0fe841be`):
- F1. #541's import half shipped in #623 (`e021210a`): the `kind` union and `openSelection` (`utils/full-backup-helpers.ts:42-131`). The issue's import claims no longer hold. `backup` stays `unknown` until validation, which is correct.
- F2. `export/full.vue` uses `RunFence.snapshot()` (`:331`, `:393`, `:429`, `:449`). It has 17 `isCurrent()` checks, five of them in catch paths. The scrub is at `:473-484`. The profile-switch watcher resets 11 refs, scrubs and rejects the ceremony (`:506-525`).
- F3. `full.test.ts` and `full-passkey.pins.test.ts` mock by module path (`@/utils` is mocked as a barrel, `full.test.ts:121`) and assert on the DOM.
- F4. Backup composables build per-run clients and disconnect them in `finally` (`useFullBackupImport.ts:307-311`, `:426-462`; `full-backup-restore.ts:585-652`). CLAUDE.md § Composables says a C1 hook never connects or disconnects.
- F5. `ConfigService.restore` (`config/service.ts:62-85`) matches `restoreRows` row for row. No test pins its log order. The log CSV export neutralises formula triggers (`components/JsonViewer/logs-csv.ts:29-31`).
- F6. With a store injected, `@aztec-labs/pxe@6.0.0-rc.3` opens no IndexedDB (`dest/entrypoints/client/lazy/utils.js:35`). `opfs-storage.test.ts:100-103` asserts zero `pxe/*` databases after real PXE use, proverless.
- F7. `updateSetting` is byte-identical on `display.vue:79-89`, `privacy.vue:48-58` and `developer/index.vue:88-98`.
- F8. `Button`'s default slot is a direct child of its root (`packages/design/src/ui/Button.vue:138`).
- F9. `useTokenBalanceSnapshot` returns its Added, Updated and Deleted handlers, and each parent subscribes them (`TokensView.vue:216-218`, `BalanceView.vue:234-236`). It always subscribes `onConnected` itself (`:113`).
- F10. CI's network shards run proverless. Only the canary jobs prove, on both browsers (`_extension-network-e2e.yml:72-78`). Local `e2e:agent` proves unless `NULO_E2E_PROVERLESS=1` (`scripts/e2e/agent.sh:89-121`).

**Inferences** (each checked by its gate):
- I1. Moving the stages verbatim, called directly by the page's handlers, adds no microtask. `reset()` stays synchronous inside the `flush: "sync"` watcher.
- I2. A pixel-identical countdown Close on `Button` needs local overrides, and the pixel proof finds them. The plan names no fixed count.
- I3. A token-balance row's account and chain are fixed at creation (`token-balance/service.ts:291-300`). An id re-minted after a worker restart with a missed Deleted is out of normal use, and no plan step depends on I3.

**Asks**: OA-1 (A5/A6 behaviour) and OA-2 (A1: the open-run hop) are in `OWNER-ASKS.md`, each with what ships now. Neither concerns what a person sees on A1's surface.

## Architecture & Implementation

### A1.1 (#518): config restore through `restoreRows`

- `config/service.ts` `restore` filters `configProps` by `RESTORABLE_CONFIG_KEYS` first, warning once per skipped key. It then returns `restoreRows(allowed, async (cp) => { await this.setValue(cp.key, cp.value); return cp })`.
- The warning becomes `this.logWarn("Skipping a non-restorable config key from backup", { configKey: cp.key })`. The message is fixed, and the backup-supplied key travels as a named property, not inside a finished string.
- The new order is accepted: every skip warning now logs before the first write.
- **Tests**: `config/service.test.ts` keeps its three cases and adds two:
  - the warnings precede the first write (a capturing logger, and a store that records each write);
  - a rejecting write yields `{ ...cp, restoreError }` and the loop goes on.

### A1.2 (#541): the export run object

- **New `apps/extension/src/composables/useFullBackupExport.ts`**, a C1 composable in `useFullBackupImport`'s shape. The stages move verbatim from `full.vue:60-525`, with the same import paths (the tests mock `@/utils` as a barrel). It owns:
  - **one fence**: one `RunFence`;
  - **one `ExportRun` record per create**: `{ isCurrent, clients }`. It holds nothing else: key material, the envelope and `credentialData` stay locals of the run, as today;
  - **the sealed artifacts**: `pretty`, `compact`, `sealed`, plain closure fields, never reactive;
  - **the flow refs**: `password`, `repeatedPassword`, `isAgreed`, `backupStatus`, `isBusy`, `isDownloading`, `showRecommendation`, `dekReplaced`, `chainStateOmitted`, `unopenedImportedKeys`, `isWrongPassword`, `isPasswordMismatch`, `canDownload`. The scrub is complete by construction, and no page ref is lent to it.
- **Its options** are `{ runCeremony, leaveAfterPasskeyFailure }`, the two things that belong to the page's shell. It calls `useAppStore()`, `useToast()` and `useConfirm()` itself, and reads `managers`.
- **It returns** the refs above, plus `handleBackup()`, `handleEncrypt()`, `downloadBackup(encrypted)`, `handleDownloadClick()`, `reset()` and `dispose()`. The template keeps its names and markup byte for byte.
- **One scrub, `discard()`**, in today's order: invalidate the fence, disconnect the active run's clients, null the artifacts, null both passwords.
  - `reset()` is `discard()` plus today's flow resets.
  - `dispose()` is `discard()` plus a `disposed` flag. Every action checks the flag first, so nothing starts after unmount (lessons: a C1 `dispose()` is terminal).
- **The page keeps** the pending-reset notice, the passkey ceremony instance, the own-window move, `onKeydown`, the `flush: "sync"` profile watcher (`reset()`, the ceremony reject, the notice re-read), `handleAgree` (the pending-reset check, then `isAgreed`, then `handleBackup()` for a passkey profile; D107) and `onBeforeUnmount` (listener removal, then `dispose()`).
- **Await boundaries**: none is added, removed or moved. Every check moves check for check.
  - Two pre-existing gaps stay as they are (D104):
    - **The open-run hop**. `openRun` returns after its last check, and `handleBackup` resumes without one (`full.vue:317-342`). A discard in that microtask lets the superseded run build clients and call the key export. The service's run fence refuses it after a profile switch; after an unmount, a passkey export's sealed result is dropped and the run's own `finally` disconnects its clients. It publishes and writes nothing. Closing it is OA-2.
    - **A requested download completes.** `downloadFile` awaits compression before `chrome.downloads.download` (`utils/files.ts:56-71`). Only its toast is fenced, as today.
- **Client ownership (D105)**: the run, not the page, owns its clients. It builds them when the run opens and disconnects them in its `finally` and in `discard()`, as `useFullBackupImport` and `full-backup-restore` already do. CLAUDE.md § Composables gains one sentence naming this exception for backup runs. The rule then matches the code.
- **Not changed**:
  - `account.vue`: its fence is the shared `RunFence`, and it holds one payload and one password.
  - The import side (F1).
  - `validateAndMigrateBackup`'s trust-gate order (checksum, compat epoch, version range).
  - The block-listed roots.
- **Tests**:
  - `full.test.ts`, `full-passkey.pins.test.ts` and `account.test.ts` stay byte-identical and green.
  - New `useFullBackupExport.test.ts` holds the **supersede table**. Each row is an await of a run, for both profile types:
    - `captureRunFence`
    - the open-run hop
    - `getPasskeyCredentialId`, `runCeremony`
    - `exportFullBackupKeys` or `exportPasskeyBackupKeys`
    - each slice read
    - `assertRunFence`
    - `sealFullBackupText`
    - `downloadFile`
    - the confirm callback
  - For each row, `reset()` while it is pending, then the await settles. Every row settles both ways (resolve and reject), since five checks sit in catch paths.
  - Each row asserts:
    - no artifact, so a later download writes nothing;
    - no flow-state write and no toast after the reset;
    - the run's clients are disconnected.
  - A **successor row**: `reset()`, a new `handleBackup()`, then the old run settles. The new run's `isBusy` stays true, and the active run still holds the new run's clients (`full.vue:365-366`).
  - A **success control** for each row: the same run without the reset publishes.
  - The open-run row pins today's behaviour (labelled a pre-existing pin, OA-2).
  - A **source pin** counts the composable's `await`s. A new await fails it with "add its row to the supersede table".

### A2 (#519): retire the pre-OPFS IndexedDB layer

- **A2.1, the premise.** `frozen-account-canary.test.ts` gains one check after its prove: the popup's `indexedDB.databases()` lists no `pxe/` name.
  - That canary proves on both browsers in CI for every Aztec bump (F10), so it is the standing guard. The distinct failure it catches is an upstream proving path opening a plaintext `pxe/` store, which no unit layer can see. It adds about 0 s.
  - Run it with `opfs-storage.test.ts` locally with the prover on, on Chrome and Firefox, before deleting anything.
  - A `pxe/` database on either browser stops A2. Nothing is deleted, #519 gets a comment with the evidence and `6.0.0-rc.3`, and the arc reports `ARC_FAILED`.
- **A2.2, delete** from `packages/aztec-runtime/src/pxe/service.ts`:
  - `BlockedDeletePolicy`, `LEGACY_SWEEP`, `VERIFIED_ERASE`, `isLegacyPxeDb`, `deleteDb`;
  - the IndexedDB arm of `sweepOrphanStores`, and `sweepLegacyIndexedDbs`;
  - `clearChainState`'s delete and `eraseProfile`'s loop;
  - `chainDataDirPrefix` with its own case in `chain-coordinates.test.ts`.
  - The OPFS orphan sweep, its barrier and `boundary-refactor.pins.test.ts` stay.
- **Tests**:
  - `service-idb-delete.test.ts` is deleted. First, its cases that pin surviving behaviour move into `service.test.ts` at the surviving order: the erase and purge call order without the IndexedDB steps, the profile fence held until the erase settles, and the barrier and lifecycle release.
  - A tick-distance pin is re-derived exactly from the last surviving operation, never as a range.
  - `service.test.ts:488-508` and `:522-529` used an IndexedDB failure to prove the retry-stop release and the generation fence. They are driven instead through a rejecting surviving step (the OPFS store removal).
  - The IndexedDB case in `service-sweep.test.ts:120-149` goes, and so do the `indexedDB` stubs that only fed the layer.
- **E2E**: `opfs-storage.test.ts` loses its seeded legacy database and the sweep check (`:105-120`, `:148-155`). It keeps `:100-103`, and its header comment is updated.
- **Docs**: `ARCHITECTURE.md:104`, `packages/aztec-runtime/README.md:63`, `pxe/spec.ts:113`, `pxe/client.ts:518`, `chain-coordinates.ts`.

### A3 (#520): one `updateSetting`

- **New `apps/extension/src/composables/useSettingUpdate.ts`**: `useSettingUpdate(configService, settings, applySetting)` returns `{ updateSetting }`.
  - The body is today's, byte for byte, with `useToast()` called inside.
  - `applySetting` stays unawaited.
  - Developer's cascade re-enters the returned `updateSetting`, which works because the page's `applySetting` is a hoisted function declaration.
- The three pages delete their copies. `lock.vue` is not touched, since its writes differ (F7).
- **Tests**:
  - `useSettingUpdate.test.ts` meets the 10-case floor:
    - an unknown key or an unchanged value writes nothing;
    - the write comes before the apply;
    - a failed write toasts the exact label and never applies;
    - the cascade writes both keys in order;
    - the apply receives the key and the value.
  - `display.test.ts` and `developer/index.test.ts` each gain the failed-write case that `privacy.test.ts:126-139` already has.
- **Out of scope**: the F-21 comment on #520 names four more items (setting row markup, the profile-flow failure notice, explorer links, the hero observer). Page 37 decided only `updateSetting`. Before `Closes #520` merges, A3 files them as one new `enhancement` issue (dedupe first) whose Record cites the comment.

### A4 (#517): the countdown Close on the design `Button`

- **First**: if onboarding-3 removed the last consumer of `SecretCountdownClose`, comment on #517 and close it as superseded. A4 ends there.
- Otherwise `SecretCountdownClose.vue` renders `<Button variant="cta_outline" :class="$style.countdown_cta" data-testid="close-btn" @click="emit('close')">`, with the label and the progress bar in the default slot. The local `.cta`/`.cta_outline` copy goes, and the ghost link is unchanged.
- **Local overrides** keep today's drifts (owner: "the two drifts stay as overrides"), plus whatever else the pixel proof finds (I2):
  - the dotted ring;
  - the filled `:active`, which today shows only on a keyboard press without hover, since the later `.cta_outline:hover` wins;
  - the bezier transition.
  - Each override wins by specificity, placed between `Button`'s rules and the hover rule it must lose to (`.countdown_cta.countdown_cta:active`). It never relies on stylesheet order.
- **Proof, by #225's method** (`implementations-plan/archive/forms-and-contacts/lessons/phase-2.md`):
  - a scratch spec, not committed, over a base build and a change build;
  - 360×600 captures of the whole recovery-phrase screen in these states: rest, hover, focus-visible, active by a held mouse, active by a held Space, countdown on, countdown off;
  - light and dark, on Chrome and Firefox;
  - the progress animation paused at fixed points and transitions settled;
  - sha256 equality, with a control pair that must differ.
  - Any difference is an `OWNER-ASKS.md` entry with both captures, and A4 ships nothing visible.
- **Tests**: `SecretCountdownClose.test.ts` keeps its 11 cases, mounting the real `Button`. One case proves the override class lands on the root `<button>`. jsdom cannot compute `:focus-visible`; the pixel proof covers it.

### A5 (#548): the token-balance family

- **The rule for every difference**. Each view keeps every behaviour a person can observe and every behaviour a test pins. A difference that only a sequence the services cannot produce would show converges onto the family rule, with its trace in the ledger.
- **`useTokenBalanceSnapshot` becomes the family's one mirror**. Its rules are Home's: dedupe on Added, ignore an unseen Updated, unfiltered Deleted, refetch after the first reconnect, dirty refetch, a 2 s retry after a refused read, no loading state on a refresh. The parent still subscribes the handlers it takes (F9).
- **Always**:
  - `replaceOnAdded` (Holdings; the decision's deliberate difference);
  - `reset()`, which clears the fence, the retry and `connectsSeen` for a popup that is mounted once and shown many times;
  - `usePrices.fiatOfRow(row)`, which replaces the four pricing lambdas (Holdings' `?? 0n` is dead behind `safeFiatOf`).
- **Select token** subscribes `(tb) => inActiveScope(tb) && onBalanceUpdated(tb)`. That is a parent's choice, and it keeps both pinned tests (`useTokenBalanceSnapshot.test.ts:142` and `SelectTokenPopup.test.ts:351`).
- **Send** keeps its own identity read and failure card (`send.vue:651-679`). It uses the hook only for its Added and Updated handlers over its rows, as today. It never calls the hook's fetch, and it takes `reconnect: "off"`. That option exists only while OA-1 keeps Send's rule.
  - Converging, by trace: Send's Added gains the chain scope and the id dedupe. Send selects by token id, and token ids are per chain, so the screen is the same.
- **Observable differences: OA-1 decides**.
  - What ships now keeps each one as an option.
  - **Holdings**:
    - a loading state on every refresh (`loadingOnRefresh`);
    - its error shown over a loaded list;
    - no auto-retry (`retryOnReject: false`);
    - a refresh on every connect (`reconnect: "every"`);
    - an unseen Updated inserted (`insertUnseenUpdated`).
  - **Select token**:
    - no auto-retry;
    - a reconnect that blanks the list and re-runs the pins.
  - **Send**: no reconnect refetch, and no Delete.
  - If the owner picks convergence, those options and their tests are not built.
- `send-balance-events.ts` and its test are deleted.
- **Tests**:
  - the hook's suite gains a case per option and an unseen-Updated case;
  - `holdings.test.ts` gains reconnect, Delete and unseen-Updated cases;
  - the suites of `SelectTokenPopup`, `send`, `send.integration`, `BalanceView` and `TokensView` pass unchanged;
  - one send case proves an account switch never lands the old account's balance.
- **At release**: rebuild recon's #548 table at the arc's base, since PR #678 changes `holdings.vue` and `BalanceView.vue`. One Codex consult settles any changed row before code.

### A6 (#548): the journal family

- **New `apps/extension/src/utils/journal-mirror.ts`**, pure reducers over `(rows, op, { accept, place: "front" | "back" })`:
  - a known Updated is replaced in place, for every caller (today's rule: `activity.vue:97-99`, `RecentActivityView.vue:584-586`, `TokensView.vue:229-233`);
  - a new row (Added, or an unseen Updated) goes to the `place` edge. Activity and RecentActivityView use `front`, so a re-added known row moves to the front as today. TokensView and the store use `back`, so a re-added known row is replaced in place;
  - an unseen Updated is inserted (all four copies do this);
  - an Updated that fails `accept` removes its row (Activity's non-terminal rule);
  - Deleted is unfiltered.
- **New `useJournalMirror({ client, read, accept, place, onRecord, onSnapshot })`**, C1, for the three views. It returns:
  - `rows`;
  - `begin()`;
  - `resnapshot(run = begin())`, so RecentActivityView's sync scope watcher, its `onMounted` and its retry timer share one run as today (`RecentActivityView.vue:609-631`, `:741-756`, `:791`);
  - `invalidate()`;
  - the three handlers;
  - `dispose()`, which is terminal.
- `onRecord` fires only for an accepted Added or Updated, never for a Deleted or a refused event. RecentActivityView's three record clears match only account and token (`:290-294`), so a foreign event must not reach them. `onSnapshot` carries the recent-terminal scan (`:627`).
- **Migrations**:
  - RecentActivityView keeps its 2 s retry and its flat task and cancel state (#152).
  - Activity's terminal list and TokensView's `token_import` list gain the fence. TokensView pushes a duplicate when an Added arrives for a row already listed. Whether that happens is a release check: a snapshot can include a row whose Added is still being delivered (`operation-journal/service.ts:140-143`, `:326`, `:523-526`). If the check shows that overlap, TokensView keeps its append until OA-1 decides. Otherwise the ordering evidence is recorded and it converges onto replace-in-place (D603). No row changes its position because of the move: a reducer test and a TokensView case prove `[A, B]` stays `[A, B]` through an update of B.
- **`app.store.ts`'s in-flight tracker** uses the reducers with `place: "back"`. It keeps its lifetime client, its suspend-on-lock and its revision settle loop.
- **Tests**:
  - the reducer suite;
  - `useJournalMirror.test.ts` (10-case floor, terminal `dispose`, `onRecord` never on a refused event);
  - Activity, TokensView and in-flight cases for the paths recon found unpinned;
  - every existing suite unchanged.
- **At release**: any newly observable difference becomes an OA-1 entry before code.

## Security & Adversarial Considerations

- **Threat model**:
  - The export page holds the plaintext master key, the entropy and the imported-keys key between assembly and scrub.
  - The risk is not a remote attacker. It is a future edit that lets a superseded run (after a profile switch, a lock or an unmount) publish an artifact or write state for the wrong profile.
  - A1.2 makes the artifacts unreachable from the page script. Its table and await-count pin fail on a missed check.
- **A superseded run may**: disconnect its own clients; clear the active run if it still holds it; start and finish its key-export RPC after the open-run hop, after which the service's fence or the next page check drops the result (OA-2); complete a download the person already requested.
- **A superseded run may not**: write artifacts or flow state; toast; release `isBusy` or `isDownloading`; open a ceremony; touch a successor run's clients. A1.2's table pins each of these.
- **Hostile input**: a backup file is attacker-controlled.
  - A1.1 keeps the allowlist ahead of every write, and stops putting a backup-supplied key into a finished log string.
  - A1 leaves the import trust-gate order and the block-listed roots (`nulo:core:profiles`, `nulo:core:auth-registry-enabled`) untouched.
- **A2 privacy**: `eraseProfile`'s loop is today's only removal of a `pxe/` IndexedDB. If the premise were wrong, a plaintext store would survive "delete profile". So the premise is proved prover-on on both browsers before deletion. After deletion, the canary check fails the next Aztec bump that opens one.
- **Least privilege, crypto, supply chain**: no dependency, permission, key or workflow change. `sealFullBackupText` and `assembleFullBackup` are called unchanged.

## UI impact

- A1, A2, A3, A5, A6: none. The lane brief: "UI impact: none … behaviour-identical by construction". A5's convergences ship only on OA-1's answer.
- A4, the countdown Close on Settings, Backup, Recovery Phrase: none, proven pixel-identical. The PR body carries before and after screenshots in both themes. A pixel difference is an `OWNER-ASKS.md` entry, not a shipped change.

## Phases and validation gates

**G-fast**, after every step: `bun run lint && bun run typecheck:all`, plus the touched suites (`bun run --cwd apps/extension test -- <files>`, or `bun run --cwd packages/<pkg> test -- <files>`).

**Phase gates** add `bun run test` and `bun run test:all`.

**E2E runs last**, only with `load1 < 150` (`uptime`), never two `e2e:agent` runs in this worktree, always at retry 0.
- **Smoke**: first build the armed bundle for the browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`. Then run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <file> --retry=0`.
- **Network**: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/<file>`. The prover is on unless `NULO_E2E_PROVERLESS=1`.

A pass is exit 0, with every named test green and none skipped that ran on base. "Unchanged" is both `git diff --quiet origin/dev...HEAD -- <files>` and `git diff --quiet HEAD -- <files>`, which covers committed, staged and unstaged edits.

- **A1.1** ✓. G-fast; `config/service.test.ts` green (5 cases).
- **A1.2** ✓ (on the merged head 3eff8665: lint, typecheck:all, test:all, check:plans; smoke Chrome 4 files 9/9 in 108 s, Firefox 2 files 9/9 in 192 s).
  - G-fast.
  - `full.test.ts`, `full-passkey.pins.test.ts` and `account.test.ts` are unchanged and green.
  - `useFullBackupExport.test.ts` is green.
  - The phase gate.
  - Smoke on Chrome: `backup-roundtrip`, `security-backup`, `passkey-backup`, `own-window`.
  - Smoke on Firefox: `passkey-backup`, `passkey-toolbar-panel` (the WebAuthn and own-window path moved).
- **A2.1** ✓ (pxe `6.0.0-rc.3`, pre-deletion tree at 9b599dae: Chrome 3/3 in 238 s, Firefox 3/3 in 346 s, no `pxe/` database on either). Network, prover on, on Chrome and Firefox: `opfs-storage`, `frozen-account-canary`, with the new check. Record each outcome and the Aztec line in `lessons/phase-2.md`. A2 holds two browser windows (premise and post-deletion), so it is an exception to once per arc.
- **A2.2** ✓ (on the merged head 2bbf7340: lint, typecheck:all, test:all, check:plans, grep gate; network prover-on retry 0: Chrome `opfs-storage` + `frozen-account-canary` 3/3 in 379 s, Firefox 3/3 in 457 s at f34e1935, Chrome `stale-network-reset` 2/2 in 310 s at 5e6018dd; Codex clean in round 2).
  - G-fast and the phase gate.
  - Network on Chrome and Firefox: `opfs-storage`, `frozen-account-canary`.
  - Network on Chrome: `stale-network-reset` (the chain purge).
  - `git grep -nE "LEGACY_SWEEP|VERIFIED_ERASE|deleteDb|isLegacyPxeDb|chainDataDirPrefix" -- ':!implementations-plan'` prints nothing.
- **A3** ✓ (on 2c674859, dev 138e0ded: lint, typecheck:all, test:all, check:plans; smoke Chrome 20/20 in 88 s, one standing `test.skip`; Codex clean in round 2). G-fast; the three page suites and `useSettingUpdate.test.ts`; the phase gate; smoke on Chrome: `appearance`, `settings-routes`, `sw-resilience`.
- **A4** ✗.
  - G-fast.
  - `SecretCountdownClose.test.ts`; the phase gate (the design package included).
  - The pixel proof: every hash equal, every control unequal.
  - Smoke on Chrome and Firefox: `security-backup`, `keyboard-guards`.
- **A5** ✗.
  - G-fast.
  - The suites of the hook, `holdings`, `SelectTokenPopup`, `send`, `send.integration`, `BalanceView` and `TokensView`.
  - The phase gate.
  - Smoke on Chrome: `rows`, `navigation`, `token-list`. Smoke on Firefox: `token-list` (focus moves on a pick).
  - Network on Chrome: `send-picker`.
- **A6** ✗.
  - G-fast.
  - The suites of the reducers, the mirror, `activity`, `RecentActivityView`, `TokensView` and `app.store.in-flight`.
  - The phase gate.
  - Smoke on Chrome: `rows`, `navigation`.
  - Network on Chrome: `cancel-mid-prove`, `in-flight-send-guard`.

## Decision ledger and audit verdicts

Ids are per arc (D1xx is A1, and so on), so parallel arcs never collide. Round 1 (2026-10-17): Codex `reject`, Opus `conditional approve`. Final fresh Codex pass: `conditional approve` (F1, F2), then F3 on resume, then **`approve`** once all three were applied. The verdict for each finding is in the right column.

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D101 | #541 = the export run only; the import half is recorded as shipped (F1) | redo the union | Codex and Opus agree |
| D102 | composable plus explicit `ExportRun`; checks kept; the composable owns password, repeat and agreement; options are `{ runCeremony, leaveAfterPasskeyFailure }` | run-step sentinel (new mechanism, moves timing); an artifacts-only holder (leaves the checks on the page) | Opus O5 adopted; Codex C9 handled by D105 |
| D103 | warnings first, accepted and pinned; a structured property | keep interleaving (a callback slot in `restoreRows` for one caller) | both agree; Codex notes the property does not redact, and it does not need to |
| D104 | the open-run hop and the in-flight download stay as today; the hop goes to OA-2 | a quiet fix (the owner's #541 rule) | Codex C1 adopted as an ask; the table rows from Opus O3 adopted |
| D105 | per-run clients are owned by the run; CLAUDE.md names the backup-run exception | do-the-thing fns in the options (disguises ownership) | Codex C9; round 2 confirms |
| D106 | `dispose()` is terminal (a `disposed` flag) | `discard()` alone | Opus O4 adopted |
| D107 | at implementation: no `agree()` (the page sets the returned `isAgreed`, one line for one caller); the TS port reads the store's profile through one cast accessor, as the JS page did unguarded; the source pin counts 12 awaits, each a table row | an `agree()` wrapper; optional chaining on the profile (would turn today's throw into a silent `false`) | implementer |
| D108 | A1 review round 1 (Codex `findings`, Opus `findings`, no behaviour difference found by either): the hop row now discards inside the hop (the fence's `profileId` read after openRun's last check), red when the check is added; the successor row scrubs while the successor is active (red when the `activeRun` guard goes); one comment marks the kept hop; `find(...)!` keeps base's assembly-failure path; the CLAUDE.md line names the export's scrub alone; the await pin ignores comments; five comments trimmed | Opus F3, a passkey hop row (the hop is one shared line, and the passkey key-export rows already pin the dropped sealed keys); trimming the template's comments (the template stays byte-identical) | Codex F1–F3, Opus F1, F2, F4 and comments |
| D109 | A1's PR title says `via` and backticks the identifier: the planned title was 95 characters, and commitlint's `subject-case` refuses a bare camelCase word | the planned title | implementer |
| D201 | the premise check lives in `frozen-account-canary` (proves, both browsers, every bump) | `delete-after-prove` (proverless in CI); a scratch probe | Opus O6 adopted |
| D202 | IndexedDB-stimulus tests are re-driven through a rejecting OPFS step; tick pins are re-derived exactly | delete them | Codex C3 adopted |
| D203 | at implementation: the canary's check pairs the empty `pxe/` list with a control (the `pxe` OPFS root exists after the proves); five stale "PXE IndexedDB" lines the plan did not list (`ARCHITECTURE.md:127`, `CLAUDE.md` § Persisted-storage, `backup-migration-registry.ts`, `contact/service.ts`, `network/service.test.ts`) name the OPFS store; `service.test.ts`'s two IndexedDB-only honesty cases go, since the re-driven teardown case already proves both clears reject on a failed removal | a bare empty-list assertion; leaving the five lines | implementer |
| D204 | A2 review round 1 (Codex `findings` 1, Opus `findings` 3, neither found a behaviour difference): stage 6 refuses any OPFS root entry but `pxe` (an upstream fallback pool would pass a `pxe`-exists control) and any IndexedDB name but `keyval-store` (a `pxe/` prefix saw one regression only); "opens no IndexedDB" corrected, since bb.js's CRS cache lives there; one more stale "IDB" comment; the sweep log's doubled slash; two history comments rewritten as invariants | a `pxe/` prefix check with a `pxe`-exists control | Codex F1, Opus F1–F3 and nits |
| D205 | A2's PR title lower-cases `OPFS` and backticks `IndexedDB`: commitlint's `subject-case` refuses both as planned | the planned title | implementer |
| D301 | `updateSetting` only; the F-21 items are filed as a new issue | take F-21 | both agree |
| D302 | at implementation: the composable's catch has no binding (Biome warns on an unused `catch (err)` in a `.ts` file); Developer drops its now-unused `useToast`; the F-21 items are #735, re-verified at `138e0ded` | a byte-identical `catch (err)` with a lint warning | implementer |
| D303 | A3's PR title backticks the identifier and lower-cases the page names: commitlint's `subject-case` refuses the planned title | the planned title | implementer |
| D304 | A3 review round 1 (Codex `clean`, Opus `findings` 1, no behaviour difference found by either): Developer's page case pins its whole cascade, and the composable's hand copy goes, keeping one re-entry case; the pre-existing double apply is closed known limit #736. Round 2: Codex `clean` | a composable copy of the page's cascade (stays green when the page drifts) | Opus F1 |
| D401 | the design `Button` with its slot and local overrides by specificity | a new global CTA class; an overlay slot | both agree; Opus O9 and Codex C8 adopted |
| D501 | one mirror per family | one generic mirror (outline B) | both agree |
| D502 | the store uses the reducers, `back` | the full composable | both agree; Opus O7 adopted |
| D503 | Select token's gate is a parent wrapper; both pins kept | converge (I3) | Opus O1, Codex C6 |
| D504 | Send keeps its read and failure card; it uses only the hook's handlers | Send calls `fetchTokenBalances()` (it would show 0 instead of Retry) | Codex C2, Opus O2 |
| D505 | observable differences are options until OA-1; only unreachable sequences converge | converge by "race window" | Codex C5 and C10, Opus O11 adopted |
| D506 | `accept` dropped: Select token's hidden gate is unreachable, since `close()` disconnects (`packages/extension-messaging/src/background/client.ts:96-115`) | keep it | Opus O8 |
| D601 | the mirror exposes `begin`/`resnapshot`/`invalidate`; `onRecord` only on accepted events; `onSnapshot` separate | a lifecycle owned only by `dispose()` | Codex C7, Opus O7 |
| G | gate fixes: smoke armed build, exact specs and runners, `origin/dev...HEAD` plus `HEAD` | — | Codex C4, Opus O10; final pass F2 |
| D602 | a known Updated stays in place for every caller; `place` decides only where a new row goes | move a known row to the front (reorders Home's imports) | final pass F1 |
| D603 | TokensView's Added-on-a-listed-row converges only if A6's release check shows no snapshot/Added overlap; else it keeps its append pending OA-1 | assert the sequence cannot occur | final pass F3 |

## Delivery

- **One PR per arc** against `dev`, opened only after its gate passes and its Codex loop converges. Open it without labels. Afterwards add `e2e:extension-smoke` (A1, A3, A4, A5, A6) or `e2e:extension-network` (A2, A5, A6) only if the path filter skipped a suite the arc needs.
- **The PR body** states:
  - what changed and why;
  - each validation run with its outcome;
  - the per-browser e2e wall-clock before and after for A2;
  - the arc table's PR line;
  - and it ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Titles** (each at most 93 characters):
  - A1 ``refactor(backup): one run object for the full-backup export; config restore via `restoreRows` `` (D109)
  - A2 `refactor(pxe): retire the pre-OPFS IndexedDB cleanup, guard that no pxe store opens one`
  - A3 ``refactor(settings): one `updateSetting` for display, privacy and developer`` (D303)
  - A4 `refactor(ui): the countdown Close renders the design Button, pixel-identical`
  - A5 `refactor(tokens): one balance mirror for Home, Holdings, Select token and Send`
  - A6 `refactor(activity): one journal mirror for Activity, Home and the token list`
- **Close-out**: it ships as the final commits of the last arc's PR (A6, or the last that merges if one is dropped). Until then each arc PR updates this plan's marks and ledger, and `index.md`'s status line.
- **Parallelism**: A1 and A2 share no file. They run in sequence because one e2e host budget serves both. Lanes are not recommended.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `0fe841be`. What is specific here:

- **Step 1** is absent (`code_review: off`).
- **Step 2, per arc** at its boundary, before its PR:
  - `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`;
  - resumed with `resume-codex.sh <session> <followup> <codex-dir> high`;
  - a hard stop at three rounds;
  - one Opus 5.5 review (`general-purpose`) of the diff alongside round 1.
  - Arc map line: "arc N of 6, unstacked PRs on dev; later arcs build the settings, countdown and mirror dedupes."
  - A1's prompt adds the owner's ask, verbatim: review adversarially "a run that outlives its fence; a selection that reaches a blocked root; a superseded run that writes". The existing backup tests must pass unchanged. A behaviour change found necessary is a stop and an OWNER-ASKS entry, never a quiet fix.
  - Log each round in `lessons/phase-N.md` and the ledger.
- **No cross-arc pass**: the arcs are unstacked and land weeks apart. Each arc's loop also reads the earlier arcs as merged.
- **Step 3**: A2's body carries A2.1's evidence. A4's body carries the screenshots.
- **Step 4**: with the last arc, per the standard; § Where open work lives applies as written there. Known limits: none filed at plan time. Promote a lesson only if it generalises.
- **Step 5**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-dedupe-1/plan.md` succeeds, run `agent-worktree done ui-dedupe-1 --merged`. Each later arc's worktree follows the orchestrator's naming.
- **While implementing**: comments follow CLAUDE.md § Code-comment style. Log attempts in `lessons/phase-N.md`. Stop after three failures on one step.

## Seeds (not run; the orchestrator owns spawning)

```
/goal Arc <N> of implementations-plan/ui-dedupe-1/plan.md is done: every phase of the arc marked ✓ with its gate's output in the transcript, LESSONS_FILE=implementations-plan/ui-dedupe-1/lessons/phase-<N>.md printed, the Codex loop converged (a resumed pass with no new material finding quoted), the arc's PR open against dev with its PR line, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive arc <N> of implementations-plan/ui-dedupe-1 forward per its plan.md: reality-check plan.md and lessons/, pick the next ✗ step, run G-fast after each edit and the phase gate before ✓, e2e last and only with load1 < 150, the Codex loop at the arc boundary, then the PR; never merge.
```
