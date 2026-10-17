---
plan: backup-restore-1
tier: mid
status: planned, awaiting orchestrator approval
issues: "#671 (arc 1 Closes), #663 (arc 2 Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan); one fresh Codex pass
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# backup-restore-1: what a person is told around restore, a paused reset and the migration barrier

Four picks the owner signed on decision page 38, plus #663 and #671, in three arcs. Each arc is one PR against `dev`, not stacked. Arc 1 changes what a paused network reset and the migration barrier say, stops endpoint edits while a reset holds the network, and ends #671's stuck import screen. Arc 2 keeps a restored imported account whose network the new profile lacks, and names it in the restore warning. Arc 3 adds the export-page warning once PR #705 has landed. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

The signed picks, quoted by id and text in each PR body:
- **P38-04 = C**: "Both A and B." (A: a warning on the full-backup export page. B: the restore warning names the account and the network to add.)
- **P38-05 = D**: "C now, B as a follow-up plan." (C: drop "nothing is lost", name the imported accounts on the paused screen and the Delete chain confirmation. The export-first button waits for B, because key exports stay refused while a paused reset holds the keys.)
- **P38-09 = A**: "Refuse endpoint edits on a network a paused reset names, with a reason line on the network page."
- **P38-10 = B**: "Keep the reinstall advice after a sentence naming what the phrase does not recover (imported accounts, passkey profiles)."

**Issue claims that did not hold** (at 2c0df3b9): #663 holds as written. #671 holds, with one gap in its fix sketch: inside the existing `try`, a throw reaches `runRestoreFailurePath`. With no profile created, that path sets the status to `""`, not `failed`, and shows the raw engine text (`full-backup-restore.ts:892-940`). D7 covers both.

## Outcome & Quality Bar

- **For whom:** a person who restores a full backup into a new profile, or who meets a paused network reset or the migration barrier. In each case they decide what to keep or delete from what the screen says.
- **Excellent:** (1) every screen that leads to deleting imported keys names those accounts before the delete; (2) a restored imported account whose added network is missing comes back when that network is added, and the restore says so by name; (3) no screen says "nothing is lost" or "the phrase recovers your accounts" where that is untrue; (4) a malformed backup ends the import with a message, never a spinner that stays.
- **Good enough:** the network is named by chain ID (OA-1). An account held on a chain that no node serves any more stays held (OA-2, known limit K1). The paused screen gets no export button until the follow-up exists (#710). No change to the backup format, the trust-gate order or the reset journal.

## Assumptions

Facts (verified at 2c0df3b9; recon has the line references):
- F1 `restoreAccountsStage` passes the whole imported-key slice to `restoreImportedKeys`, which writes every row it can rewrap. The start-up sweep deletes a key row with no account row. No worker restart follows a restore.
- F2 `AccountService.restore` refuses a row whose chain has no network row in the profile, before the L1 cross-check (`account/service.ts:976-979`). Reseeding creates Testnet and Local only. Testnet's chain ID moves at every testnet reset (`network/seeds.ts:46`, #427).
- F3 Seeding runs only for a profile with no networks (`network/service.ts:255-330`), so a held row meets a network only through `addNetwork` or a reset's rewrite. Adding a network needs Developer Mode, which a restore does not carry (`config/spec.ts:15-24`).
- F4 The integrity coordinator re-derives derived rows only (`account-integrity/coordinator.ts:207-215`). A chain with imported rows only is `clean`, with or without a network row (`stale-network/classify.ts:31-55`). Activating a network runs `ensureDefaultAccount`, which ignores imported rows, so a derived default still appears (`account/service.ts:269-283`).
- F5 The journal entry carries `type` and `name`; `journalView` drops `type` (`network-reset/service.ts:333-344`). Once `purged` is true, imported entries hold the only copy of their resealed keys. A rewrite can move the network onto a chain that already holds rows (`network/service.ts:999-1023`), and `deleteNetwork` purges the row's current chain.
- F6 A chain-changing resume keeps the primary endpoint only if it equals the journal's `probedEndpoint` (`network/service.ts:1027-1041`). No endpoint mutator reads the journal. A running reset's takeover covers every popup route (`popup/stale-takeover.ts:33-41`).
- F7 `SettingItem` with no click listener renders inert and undimmed; `disabled` dims it (`SettingItem.vue:70-82, 178-181`). The drawing shows undimmed rows.
- F8 The takeover has a yellow `notice` slot (`StaleNetworkTakeover.vue:260`), the box the paused drawing uses.
- F9 The import pages stop at the warning while the restore log has a row (`useFullBackupImport.ts:661-666`). `collectRestoreErrors` keeps only `profileId` and `chainId` of an account or key row, never its name or address, and caps the rows (`utils/full-backup-helpers.ts:257-306, 348-358`). Account names have no length limit (`account/spec.ts:196`). `sanitizeString` (`utils/string.ts:34`) is the cleaner the restore already uses for the profile name.
- F10 PR #705 rewrites `full.vue` into `useFullBackupExport.ts`. `executeRestore` is at 78 of its 80 lines (`useFullBackupImport.ts:383-491`).

Inferences (the implementer verifies in phase and logs the result):
- I1 The popup asks only for accounts of chains that have a network, so a held row stays off every screen until one exists. The service does not enforce it: per-chain reads, profile-wide reads, address ownership and export all see held rows (ledger R0). The restart test (phase 4) proves the row and key survive.
- I2 After a network for that chain appears, the held row is listed and its key opens. The restart test writes a network row for chain 1337 after the second boot and reads `getAccounts` for it. Signing uses the unchanged imported-account path; no test here claims it.
- I3 `getStaleNetwork(id)` returns the journal view without a node probe only while the journal exists. So the page reads names only when the pending reset is not running, accepts `null`, and re-checks its read counter after the last await.

Asks (the working assumption holds unless the orchestrator overrides it at approval):
- A1 OA-1 to OA-6 each ship their "what ships now" form. The arcs do not wait for answers.
- A2 Arc 3 starts only after PR #705 merges. The orchestrator releases it.
- A3 P38-05's B (an export of a paused reset's imported accounts) is filed as #710, an `enhancement` for the next decision page.

## Architecture & Implementation

**D1 Hold, do not drop (#663).** `AccountService.restore` writes an imported account row whose chain has no network row in the profile. It skips the L1 cross-check for that row only, because no network exists to check against. The row is "held": its key restores with it (D2), the start-up sweep keeps the key because the account row exists, and the account appears when the person adds a network for that chain. The holding state is the account row that already exists; "re-attach" is the existing per-chain read. A derived row on such a chain is still refused with today's message. It re-derives when the network is added, and a held derived row could make `classifyChains` call the chain unclassifiable.
- Absence is read with the existing `getNetworksRaw(profileId)`, once per restore. A row on a chain that has a network goes through `getL1ChainIdStored` as today, so a tampered seeded row still fails its validation. No new public method.
- Obligations D1 creates, each tested or recorded: held rows survive restart (phase 4), travel in every later backup, are purged with the profile (`profile-deletion/coordinator.ts:93`), count in the arc 3 banner, get no dependent rows (D2b), and carry D3's limit. A held row on a chain that no node serves again stays until the profile is deleted (K1). It is invisible, does no harm, and its key travels in later backups.
- Rejected: a separate store for held accounts with a re-attach step on network add (new state and lifecycle for what the row already does). Rejected: exempting restore-written key rows from the sweep (keeps a key with no account row, and loses the name). Rejected: Outline B (below).

**D2 Keys follow the restore's own accounts.** (a) `restoreAccountsStage` passes `restoreImportedKeys` every key row that does not parse, so the service records its schema error as today. It also passes every well-formed row whose `accountScopeKey(chainId, address)` is a restored account, held ones included. (b) The account-owned slices (transactions, authwits, token balances) keep using the allow-set without held accounts. A held account brings back its row and key only. Its chain's other state is dropped, as a restore already drops every state row of a network it does not re-create. That avoids authwits a later backup would not export (`auth-registry/service.ts:629-645`) and balances that cannot re-link. (c) A well-formed key row that matches no account row of the backup is dropped without a log row, as today's outcome (the sweep deleted it) was silent. Recording it, as "Skipped: no account in this backup uses this key", would stop the import at the warning: OA-5 asks, and the arc ships without it. A key whose account was refused is explained by that account's own error.

**D3 A held row keeps the backup's L1 claim.** No hook re-checks it when a network is added. Path: a doctored backup, then a network added for that chain whose L1 differs. Consequences: the account's export file names that L1, which `importAccount` ignores (`account/service.ts:1007-1012`); a later in-place rotation can find the chain unclassifiable if it also has derived rows; a Mainnet L1 claim makes a later reset of that network refuse (`network-reset/service.ts:434`). A hostile backup can already block the profile it restores with one doctored derived row beside a genuine one (`classify.ts:33-42`), so the restored profile was the file's to shape anyway. Disposition: known limit K2, a closed `known-limit` issue filed at close-out. It reopens on a report of a mismatched held account, or when custom networks leave Developer Mode. Rejected: a `registerChainAdded…` subscriber in `addNetwork` and the reset rewrite (a coordination hook on two paths, for a doctored-file case).

**D4 Held accounts reach the person.** One helper in `full-backup-restore.ts`, `settleHeldAccounts`, keeps `executeRestore` under its line budget. It runs `reconcileImportedAccounts` and subtracts the scopes it dropped from the held list by `{ chainId, address }`. It records one log row per held account in one collector call, `{ profileId, chainId, restoreError: C8 }`, so the cap bounds the batch and no name enters the log. That row replaces today's "No network for chain <n> in this profile" for the same account. So the page stops at the warning and shows Continue, View Errors and Back as drawn, with no page logic change. `useFullBackupImport` exposes `heldAccounts: Array<{ name, chainId }>`, each name cleaned with `sanitizeString(name, 32)` and trimmed. `restoreWarningText` gains a third argument that words them (C6), listing at most three names (OA-4). Each import page passes it, one binding each. Rejected: a held marker on the service's `Restored<Account>` (a public RPC shape the composable can do without).

**D5 The paused screen and the delete confirmation name what a delete removes.** `StaleNetworkView.reset` gains `imported: string[]`. `buildView`'s journal branch fills it with the journal's imported entries, `done` or not. It adds the live imported rows on the network's current chain that no journal entry names by old or new address; after a rewrite, that catches a held row the reset moved onto. Names are cleaned like D4's and all listed, as the progress screen already lists every account. The running placeholder sets `[]`. The `paused` screen sets `notice` from `copy.pausedImported` when the list is non-empty, and `paused().body` loses ", so nothing is lost" (C1, C2).

**D6 Endpoint edits refuse while a reset holds the network (P38-09).** A private `refuseWhileResetHolds(profileId, networkId)` in `NetworkService` throws `${ERR_RESET_PENDING}: …` when `staleNetworks.getJournal(profileId)?.networkId === networkId`. It runs inside each of the four mutators' `lock.withLock`, right after `requireOwnedRow`. Capture writes the journal under the same lock, so no edit interleaves with a capture. Before capture a run has no journal, but the capture's own check refuses a moved primary (`network/service.ts:963`), and a run's takeover covers the page (F6). The reset's rewrite and `deleteNetwork` do not use these methods. Set-primary is refused too, since it is the edit the resume overrides. The guard trusts a decoded journal; an undecodable one reads as absent (`stale-network/repository.ts:149`), which is out of scope. Rejected: a UI-only lock (a second popup or a stale page still writes).
- Network page: it reads `getPendingReset()` with the read-counter pattern of `full.vue:142-151`, subscribed to `onStaleNetworkChanged`. When the reset names this network and is not running, it reads `getStaleNetwork(id)` for `reset.imported` (I3). While a reset holds the network, the rows render without `@click` and without their edit and delete actions (F7). Add endpoint is `disabled`, and C4 sits under the Endpoints label. The Delete chain confirmation appends C3. A mutator that loses a race with the read refuses, and the page shows its existing failure toast; no new copy.

**D7 #671.** In `validateAndMigrateBackup`, a `try`/`catch` around the checksum's `JSON.stringify` alone returns `INTEGRITY_REFUSAL`: a body that cannot be re-serialised cannot be verified. WebCrypto and migration failures keep their own paths. `runRestoreBackup` also moves the gate inside its existing `try`, so no other throw leaves the status at `progress`. Restore again shows the integrity message for the same file. Rejected: the move alone, which shows "Maximum call stack size exceeded" under "Import failed".

**D8 Barrier copy (P38-10).** One sentence in `MigrationBarrier.vue`'s terminal `sub` (C5). No copy module for one string.

**D9 Export warning (P38-04 A), arc 3.** `seeds.ts` exports `isSeedChain(chainId)`; `network/service.ts:641` reuses it. The export run object from #705 counts the imported-key rows the file carries on chains that are not seed chains. A `warning` Banner (C7, testid `backup-imported-network-banner`) shows when the count is above zero and the keys-lost banner is not shown (OA-6).

**Copy (final words for the owner's sign-off in each PR; the drawings' words are placeholders; no em dash joins clauses):**
- C1 paused body: "Something stopped the reset part-way. Nulo saved your accounts before it removed anything."
- C2 paused notice: "“Savings” and “Trading” are imported accounts. Deleting Testnet deletes them." / one: "“Savings” is an imported account. Deleting Testnet deletes it."
- C3 Delete chain confirm, appended: "It also deletes the imported accounts “Savings” and “Trading”." / one: "It also deletes the imported account “Savings”."
- C4 endpoints reason line: "Testnet’s reset is paused. Endpoints can be edited once it finishes."
- C5 barrier: "Your funds are safe. Your secret phrase still recovers your accounts. It does not recover imported accounts or passkey profiles. Reinstall the extension to start clean."
- C6 restore warning, held part, between the existing lead and choices: "The imported account “Savings” was not restored. Add the network with chain ID 1337 to restore it." Plural forms follow `joinNames`. Past three names: "“A”, “B”, “C” and 2 more imported accounts" (OA-4).
- C7 export banner: title "Some imported accounts need their network"; body "1 imported account is on a network you added. A restore re-creates only the default networks, so add that network again to restore it."
- C8 View Errors row of a held account: "Waiting for a network with chain ID 1337".

## Security & Adversarial Considerations

- **Threat model.** A backup file is hostile input: the person may restore a file someone gave them. Stored rows can be malformed. No dApp surface changes.
- **Held rows (D1, D3).** A hostile backup can plant dormant imported accounts on any chain the new profile lacks. Restore rewraps each key under its `(chainId, address)` binding but does not derive the address from the key. Signing and export do, and fail closed (`account/service.ts:614, 661`). A held account surfaces only if the person adds a network for that chain, in Developer Mode. Restoring a backup already gives it the new profile's accounts, so no boundary is crossed. Held rows skip only the L1 cross-check (K2) and bring no dependent rows (D2b).
- **Untrusted names (D4, D5).** Every name the wallet now speaks inside a sentence is cleaned with `sanitizeString(…, 32)`, which removes bidi, zero-width and control characters. The restore warning lists at most three (OA-4). The restore log never carries a name or an address, and keeps its cap and its count-only `console.warn`.
- **Keys (D2).** Fewer keys are written than today, and none outside the restore's accounts. No new crypto; rewrap stays in `@nulo/wallet-crypto`. No key material reaches a log line.
- **Endpoint guard (D6).** The guard sits in the service, so a second popup or a stale page cannot write around the UI. It fails closed while a journal names the network; `deleteNetwork` stays the exit.
- **#671 (D7).** A deeply nested file ends in the integrity refusal. Nothing is written before the gate, as before.
- **Supply chain, least privilege.** No dependency, workflow or token change.

## UI impact

Light and dark screenshots of each surface go in its PR body, with the pick quoted.
- Paused-reset takeover (arc 1, P38-05): C1, plus the C2 notice when the delete would remove imported accounts. No export button.
- Delete chain confirmation on a network a reset holds (arc 1, P38-05): C3 appended.
- Network page while a reset holds it (arc 1, P38-09): rows inert without edit or delete actions, Add endpoint disabled, C4 under Endpoints, as `p38-endpoints-a`.
- Migration-blocked barrier, terminal (arc 1, P38-10): C5.
- Import of a deeply nested backup (arc 1, #671): before, a spinner that never ends; after, the existing integrity refusal, on the import page and in Restore again.
- Import warning after a restore with held accounts (arc 2, P38-04 B): C6. In View Errors, C8 replaces the account's "No network for chain" row.
- Full-backup export page (arc 3, P38-04 A): the C7 banner above the protect banner.

## Arc 1 — the paused reset, its network page, the barrier and #671 (Closes #671)

### Phase 1: the barrier sentence (P38-10) and the nested backup (#671)
- `components/MigrationBarrier.vue`: C5. `MigrationBarrier.test.ts`: pin the exact terminal `sub` (today it pins substrings).
- `composables/useFullBackupImport.ts`: D7.
- Tests (`useFullBackupImport.test.ts`): build an envelope nested one million arrays deep in a loop. It gives `failed` and the integrity title, writes no profile, and a second pick of a valid backup is accepted. A gate that throws a plain `Error` leaves the status off `progress`. `useRestoreAgain.test.ts`: the nested envelope gives the integrity refusal.
- **Gate** (from the worktree root): `bun run lint`; `cd apps/extension && bun --bun vitest run src/components/MigrationBarrier.test.ts src/composables/useFullBackupImport.test.ts src/composables/useRestoreAgain.test.ts`. Pass: exit 0. Layers: lint, unit, component.

### Phase 2: name what a delete removes (P38-05)
- `wallet/services/network-reset/spec.ts`: `reset?: { …; imported: string[] }`. `network-reset/service.ts`: `buildView` fills it (D5).
- `components/stale-network/copy.ts`: C1, `pausedImported` (C2), `deleteChainImported` (C3). `StaleNetworkTakeover.vue`: the `paused` screen sets `notice`.
- `popup/pages/settings/networks/[id].vue`: the pending-reset read (D6) and C3.
- Tests (`network-reset/service.test.ts`): the journal view lists imported names only, `done` ones included; a derived-only journal gives `[]`. A held imported row on the target chain after the rewrite is named too. A name with bidi characters comes back cleaned. `StaleNetworkTakeover.test.ts`: two imported names show C1 and C2; a derived-only paused screen shows no notice. `[id].test.ts`: the confirm ends with C3 when the reset holds the network, and is unchanged otherwise.
- **Gate:** `bun run lint && bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/network-reset src/components/stale-network src/popup/pages/settings/networks`. Pass: exit 0. Layers: lint, typecheck, unit, component.

### Phase 3: refuse endpoint edits while a reset holds the network (P38-09)
- `wallet/services/network/service.ts`: `refuseWhileResetHolds` in the four mutators. `[id].vue`: inert rows, disabled Add, C4. `copy.ts`: C4.
- Tests (`network/service.test.ts`): one per refused mutator with a journal naming the network, each leaving the stored row byte-identical. Control: a journal naming another network lets each edit through. Control: while the guard refuses, the reset's rewrite and `deleteNetwork` still succeed. `[id].test.ts`: while held, no `endpoint-edit-btn` or `endpoint-delete-btn`, `endpoint-add-btn` disabled, C4 shown, and a row click calls no `setPrimaryEndpoint`. Not held: today's controls render.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test:all && bun run build`. Smoke e2e (host load1 < 150): `cd apps/extension && bun run test:e2e -- tests/e2e/stale-network.test.ts tests/e2e/endpoints.test.ts tests/e2e/settings-crud.test.ts tests/e2e/restore-outcome.test.ts tests/e2e/import-errors-scroll.test.ts --retry=0`. Network e2e, from the worktree root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/stale-network-resume.test.ts tests/e2e/network/stale-network-reset.test.ts tests/e2e/network/endpoint-refused-recovery.test.ts tests/e2e/network/restore-again.test.ts --retry=0`. Pass: all green. No e2e scenario is added: component tests read every new string and control, and service tests pin the refusal.

## Arc 2 — keep held imported accounts and name them (Closes #663)

### Phase 4: hold imported rows; keys follow the restore's accounts (#663 code)
- `account/service.ts` `restore`: D1, with `getNetworksRaw` for absence. `composables/full-backup-restore.ts`: D2 a-c and `settleHeldAccounts` (D4). `useFullBackupImport.ts`: pass the seeded networks, call the helper, expose `heldAccounts`. Test stubs that provide only `getL1ChainIdStored` gain `getNetworksRaw` (`account/service.test.ts`, `composite-key.test.ts`, `full-backup-keys.test.ts`).
- Tests (`account/service.test.ts`, one restore): an imported row with no network is written with no error; a derived row with no network is refused with today's message; a tampered seeded network row still refuses its accounts.
- Stage tests: a refused account's key never reaches `restoreImportedKeys`; a held account's key does; a key row missing `address` still reaches it and is recorded; a well-formed key matching no account is not written; a held account's authwit and balance rows are not restored; of two same-name held accounts on one chain, one keyless, only the keyed one stays in `heldAccounts`; held log rows carry no name and respect the cap.
- Restart test (`account/full-backup-keys.test.ts`): export with an imported account on chain 1337, restore with Testnet and Local only, then boot a second service collection over the same store. The account row is unchanged, and its key row unseals to the original signing key. The same steps on the base SHA leave no key row (the red proof, logged).
- **Gate:** `bun run lint && bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/account src/wallet/services/network src/composables`. Pass: exit 0. Layers: lint, typecheck, unit.

### Phase 5: the restore warning (P38-04 B)
- `restore-warning.ts`: `restoreWarningText(networkNames, hasOtherErrors, held)` words C6. `ImportFullBackupForm.vue`: a `heldAccounts` prop. `popup/pages/import.vue` and `onboarding/pages/import.vue`: one binding each.
- Tests: `restore-warning.test.ts`, exact strings for one held account, two on one chain, two on two chains, four (the cap), and held beside network-retry names. `ImportFullBackupForm.test.ts`: a held-only log shows the warning with C6.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test:all && bun run build`. Smoke e2e: `cd apps/extension && bun run test:e2e -- tests/e2e/restore-outcome.test.ts tests/e2e/import-errors-scroll.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`. Network e2e: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-integrity.test.ts tests/e2e/network/backup-edited-local-network.test.ts tests/e2e/network/restore-again.test.ts --retry=0`. Pass: all green. No e2e scenario is added: the restart test proves the key survives, which a browser cannot show better.

## Arc 3 — the export warning (P38-04 A; starts after PR #705 merges)

### Phase 6
- `network/seeds.ts`: `isSeedChain`; `network/service.ts:641` reuses it. #705's export run object: the count (D9). The page: the C7 banner.
- Tests: C7 shows for one imported-key row on chain 1337, and not for rows on Testnet or Local. With the keys-lost banner shown, C7 does not show.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test:all && bun run build`. Smoke e2e: `cd apps/extension && bun run test:e2e -- tests/e2e/backup-roundtrip.test.ts tests/e2e/backup-imported-account.test.ts tests/e2e/passkey-backup.test.ts --retry=0`. Pass: all green.

## Competing outline (B): drop and tell

Filter the key slice (D2a) and never hold. The restore warning names the account and its chain and says to import it again from its account file; the export banner says it will not be restored. Smaller: no change to `AccountService.restore`, no K2. Against: the key in the backup becomes unreachable in the product, because every restore makes a new profile, so the network cannot be added first. Recovery then needs an account file the person may not have kept. It also changes what B's "the network to add" promises. On a dead chain (K1) D1 does no better today, but the key still travels in later backups. Chosen: D1.

## Decision ledger and audit verdicts

Round 1, Codex (gpt-6.1-sol high, session `01a14b4c`): **conditional approve** (resolve R1-R5, correct the trust and visibility claims, strengthen controls and gates, surface the visible choices). Round 1, Opus Plan: **conditional approve** (F-1 to F-12). Both preferred D1 to Outline B.

| Id | Finding (path, label) | Disposition |
|---|---|---|
| R0 | Held rows are visible to every per-chain and profile-wide read; "invisible" is a UI fact (demonstrated) | Accepted: I1 rewritten, D1's obligations listed |
| R1, F-6 | A well-formed key with a corrupted scope, or a key row missing fields, is dropped silently by the filter (demonstrated) | Accepted: D2a passes unparsable rows to the service. The outcome for an orphan key and a keyless account is today's (silent); surfacing either changes a screen, so OA-5 asks |
| R2, F-3 | Held accounts' authwits restore but a later backup skips them; their balances fail re-link as new View Errors rows (demonstrated) | Accepted: D2b keeps held accounts out of the owned slices. Rejected: making the authwit backup walk accounts (it would also change hidden-account behaviour, outside this lane) |
| R3 | `{ name, chainId }` cannot subtract reconcile's `{ chainId, address }` drops (demonstrated) | Accepted: D4 carries the scope until the subtraction |
| R4, F-4 | Names bypass the log projection and have no bound (demonstrated) | Accepted: log rows go through the collector with no name; names cleaned and capped |
| R5 | A held row the rewrite moves onto is purged by a delete but not named (plausible) | Accepted: D5 adds live imported rows on the current chain |
| F-1 | On old Testnet chains held rows can never meet a network, and C6 asks for the impossible (demonstrated) | Accepted: known limit K1, OA-2 for the wording, B comparison corrected |
| F-2 | Add network needs Developer Mode, which a restore does not carry (demonstrated) | Accepted: OA-3 |
| F-5 | A lookup returning `undefined` on a failed validation would hold a tampered seeded row (plausible) | Accepted: absence via `getNetworksRaw`, validation unchanged, one test |
| F-7 | `executeRestore` is at 78 of 80 lines (demonstrated) | Accepted: the `settleHeldAccounts` helper |
| F-8 | "A network stub lists it" cannot fail; tests missing (demonstrated) | Accepted: phase 4's tests rewritten. Rejected: a new e2e for held-account signing (signing path unchanged; runtime budget) |
| F-9 | A held Mainnet-L1 row makes a later reset refuse (demonstrated) | Folded into K2 |
| F-10 | "A running reset has a journal" is not always true (demonstrated, harmless) | Accepted: D6 corrected. Rejected: a second guard before the probe (the in-lock guard decides; the probe only costs a request) |
| F-12 | #671 is independent and small | Accepted: moved to arc 1. Arc 2 branches from `dev` once arc 1's PR is open |
| D3 | "No new capability" holds only beside a genuine derived sibling; the AAD binding is not a derivation (demonstrated) | Accepted: D3 and the security section restated |
| D7 | Keep the catch narrow; list Restore again's message change | Accepted |
| Ask | C4 says "paused" during a running reset (Codex) | Rejected: a run's takeover covers the page (F6), so C4 shows only while paused |
| Ask | Held names in View Errors; keys-lost suppression; C7 for re-exported held rows | Accepted: names never enter the log; OA-6 |

**Arc 1 deviations from the plan (implementation).**
- D5: a name that cleans to nothing reads as the default imported-account name, now `DEFAULT_IMPORTED_ACCOUNT_NAME` in `account/spec.ts`, which `importAccount` also uses; the plan named no fallback, and dropping the name would undercount what a delete removes.
- C2 and C3 join names with the existing `joinNames` of `restore-warning.ts` ("A, B, and C" past two), the form C6 already follows.
- D6: the page holds whenever the pending reset names the network, running or not, and reads `reset.imported` only when it is not running.

Final fresh Codex pass (gpt-6.1-sol high, session `01a14b63`): **conditional approve** (condition: an owner ask for D2c's orphan-key warning, with a "what ships now" form). Applied: D2c moved into OA-5, and the arc ships today's outcome. Round-1 dispositions and rejected alternatives held; arc 1 depends on no open ask. Resumed on the change: **approve**.

## Delivery

Three PRs against `dev`, each opened only after its arc's gates pass and its Codex loop converges. No `gh stack` (the orchestrator's D-orch-1). Merge `dev` into the branch before each PR. Open each PR without labels; add `e2e:extension-network` afterwards only if the path filter would skip a suite the arc needs.

| Arc | Phases | Branch | PR title (≤ 93) | Closes | `/code-review` |
|---|---|---|---|---|---|
| 1 | 1-3 | `worktree-backup-restore-1` | `fix(network): name a paused reset's imported accounts; hold endpoint edits while it waits` | #671 | off |
| 2 | 4-5 | `backup-restore-1-arc2`, off `dev` once arc 1's PR is open | `fix(backup): keep restored imported accounts until their network is added` | #663 | off |
| 3 | 6 + close-out | `backup-restore-1-arc3`, off `dev` after #705 merges | `feat(backup): warn on export when imported accounts need an added network` | none | off |

Parallelism: arcs 1 and 2 share only `network/service.ts`, in different methods, so arc 2 need not wait for arc 1's merge. Arc 3 waits on #705. onboarding-3 holds onboarding pages, so arc 2 edits `onboarding/pages/import.vue` by one binding and merges `dev` first.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 2c0df3b9. Specific to this plan:
- **Review loop**, per arc, before its PR: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Prompt: the arc's diff, this plan and its ledger, the arc map ("arc N of 3"), the adversarial ask, and the README's two rules verbatim. Hard stop after three rounds with material findings. On arc 3, also run a fresh session over the net diff from 2c0df3b9 with the cross-arc ask.
- **Approval boundaries.** A fix that adds persistent state, a lifecycle, a coordination protocol, a recovery policy or a public contract stops for the orchestrator (D3's hook is the known example). Copy beyond C1-C8 goes to `OWNER-ASKS.md`.
- **Close-out** on arc 3's PR: file known limits K1 and K2 as closed `known-limit` issues; Open items: #710 and any open owner ask. Then delete `STATUS.md`, archive, and run `bun run check:plans`.
- **Teardown** after arc 3 merges: `agent-worktree done backup-restore-1 --merged`.
- **While implementing:** log attempts in `lessons/phase-N.md`. At each gate run `agent-worktree status backup-restore-1 "phase N green: <next>"`. Stop after three failures on one step.

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal Arc <N> of implementations-plan/backup-restore-1/plan.md is delivered: each of its phases is marked ✓ with its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/backup-restore-1/lessons/phase-<n>.md printed per phase, the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material findings, then the arc's PR is open against dev with `gh pr view` output shown, and `bun run test:all` and `bun run lint` report exit 0.
```

```
/loop 15m Drive arc <N> of implementations-plan/backup-restore-1/plan.md: read plan.md and lessons/ first, run the next pending phase, validate with its gate, commit; at the arc boundary run the Codex loop (gpt-6.1-sol high) until clean, then open the arc's PR against dev. Decide with Codex, never wait. Stop after three failures on one step and report.
```
