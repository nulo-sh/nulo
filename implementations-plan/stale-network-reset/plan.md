---
plan: stale-network-reset
tier: deep
status: approved 2026-10-14; implementing
issues: "refs #324 (first consumer); refs #277 (shares the purge path); #262 stays closed"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: artifact
budget: recon 3 explorers (sonnet); planning legs main + Codex (gpt-6.1-sol, high) + Opus Plan agent; contradiction check (both legs); double audit (fresh Codex + fresh Opus Plan agent); one final fresh Codex pass
base: origin/dev at d01569a2 (facts and line refs); implementation branches from 1ba770cf
trunk: dev
post_implementation_hardening: not scheduled
---

# stale-network-reset: reset one network in place when an update leaves it behind

An extension update can leave a network's stored chain identity, or its account addresses, behind the build. Today the user gets a red header dot, silent balance retries, a refused send, or (when addresses move) a whole-profile dead end ([recon.md](recon.md) § What a user sees today). After this plan the profile opens, only the stale network is quarantined, and a full-screen prompt for that network (layout A) offers to reset it in place.

Paths: `X/` is `apps/extension/src/`, `S/` is `apps/extension/src/wallet/services/`. Recon: [recon.md](recon.md). Normative UI: the PNGs in [ui-spec/](ui-spec/), mapped in § UI fidelity.

## Outcome & Quality Bar

**For whom.** A Testnet user who updates Nulo after Aztec restarts Testnet (#324: rc.1 → rc.3 changes the rollup version and the address separator, so both causes fire at once).

**Excellent, to that user:**
1. The screen names the cause in one line and offers exactly the actions in the mockups (A1, A2, A6).
2. RESET → A3 → A4 → A5 takes seconds and needs no recovery phrase and no key file. Testnet and Local need no node; a custom network needs its node reachable when the reset starts. A network with no accounts resets itself with no screen.
3. Accounts come back with the same names, order and visibility; imported accounts come back from their stored key.
4. Every other network, the profile, password, contacts and settings keep working before and after. For the seconds a reset runs, every network shows its progress and new dApp requests wait (A16). Chaos-tested on Chrome and Firefox.
5. A popup close, a lock or a worker kill mid-reset loses nothing: the next popup open finishes it (A4's footer) and announces it (A5). A reset that cannot run says why and what to do (R1–R4).

**Good enough:** Mainnet is never reset (A6, no destructive action). A mismatch confined to one chain quarantines that chain whatever its cause, so its rows are never used; any mismatch that cannot be confined to one chain keeps today's fail-closed profile block. Custom networks get no network-reset detection (their identity comes from a probe).

**UI impact** (all need owner sign-off): new: a full-screen takeover (A1, A2, both causes, A4, A6, R1–R4), a confirm dialog (A3), a success toast (A5), a Full Backup notice (A11), a send-failure toast (A10). Changed: the Header hides its account block on a quarantined network (A15). Reused unchanged: the dApp "Network not available" window (A12). Unchanged: Home, the networks page, `AccountIntegrityBarrier`, `ConfirmPopup`; the Terms sheet stays hidden while the takeover shows (D14). The mockups were approved on 2026-10-13 and 2026-10-14 (§ Owner decisions); the built screens still need the capture sign-off (§ UI fidelity).

## Assumptions

### Facts (verified at d01569a2)

- F1. Address derivation reads the row's `l1ChainId`, never the composite chainId (`S/account/service.ts:313-317`, `S/network/spec.ts:34-40`). A rollup-only bump keeps every address.
- F2. Seeds are written only into a profile with zero network rows; nothing reconciles rows with seeds (`S/network/service.ts:259-260`, `:307-308`; the seeds at `:97-115`).
- F3. `purgeChain` runs every subscriber, then `clearChainState`, and propagates any failure (`S/network/service.ts:897-922`; its doc comment still says best-effort). It forwards the chainId it is given (`:906`, `:913`). `deleteNetwork` brackets it with `deletingNetworks` + `reservations`, which make `isChainLive` and `isNetworkLive` answer false (`:541-610`).
- F4. The account purge deletes account rows and imported-key rows (`S/account/service.ts:196-210`). Keys are sealed with the profile DEK and AAD `(chainId, address)` (`:60-79`); `unsealImportedScalar` wipes the DEK it is given (`:70-87`). The orphan sweep deletes a key row with no account row (`:162-189`). `commitImportedAccount` stores the ciphertext it is given without opening it (`:592-617`). `exportFullBackupKeys` checks only the run fence (`:846-854`). No RPC deletes an account (`:91-105`).
- F5. `createAccountInternal` picks `max(same type) + 1` and `visible: true`, and resolves L1 through `resolveVerifiedL1ChainId`, which probes the node live for custom rows (`S/account/service.ts:283-340`, `S/network/service.ts:436-452`).
- F6. `verifyProfile` stops at the first Nulo_v1 mismatch and blocks the whole profile (`S/account-integrity/coordinator.ts:136-188`); the operation-time twin does the same and closes the session (`S/account/service.ts:629-660`).
- F7. Every signing path loads the account through `getAccountContract` (`S/account/service.ts:430-450`).
- F8. The dApp dispatcher resolves networks only through `getNetworksRaw` (`packages/wallet-bridge/src/dispatcher.ts:1124`). Discovery calls `servesChain` (`S/wallet-sdk/background.ts:750,1126`); `dropStaleSession` deletes a session whose chain `servesChain` no longer serves (`:1094-1096`). An existing session auto-approves and projects only existing accounts (`:771`; `dispatcher.ts:440-452`).
- F9. `ChainNotSupportedError` exists (`packages/extension-messaging/src/errors.ts:330`); the dApp error envelope projects it (`S/wallet-sdk/error-envelope.ts:94`).
- F10. `PxeServiceClient` has a process-wide admission hook for recovery mode that leaves bare-profileId cleanup calls admitted (`S/pxe/client.ts:9-58`).
- F11. `TransactionService.onAccountDeleted` purges by address and profile, not by chain (`S/transaction/service.ts:297-339`), although transaction rows carry `chainId` (`S/transaction/spec.ts:185`). Deleting accounts on one chain deletes another chain's history for the same address. Demonstrated by code trace; Testnet and a custom Sepolia network share addresses.
- F12. With strict security mode (default on) any worker recycle forces a password unlock; no session is restored silently (`ARCHITECTURE.md` § session model).
- F13. The header chip opens `/popup/settings/networks` (`X/components/Header.vue:152-154`); that page activates a row through `setActiveNetwork` (`X/popup/pages/settings/networks/[id].vue:18`).
- F14. `ConfirmPopup` is a bottom sheet with a centred icon and no list slot (`X/popup/components/popups/ConfirmPopup.vue:57-110`).
- F15. `RestoreGate` is the e2e hold-point pattern, tree-shaken from production and grep-checked (`X/e2e/restore-gate.ts`, `X/wallet/runtime.ts:486-493`).
- F16. The Terms sheet's "Not now" pushes `/popup/legal/declined` (`X/components/LegalAcceptanceSheet.vue:61-64`), whose "Export a backup" goes to `/popup/settings/security/export`, a path the sheet never covers (`X/utils/legal-sheet.ts:4-7`).
- F17. The active account is the popup-owned key `nulo:ui:activeAccount` (an address); the popup keeps it when the address still exists, else picks the first account (`X/stores/app.store.ts:455-479`). Wallet services never write `nulo:ui:` keys.
- F18. The `appStore.network` watcher drives the account load through `createNetworkSwitchHandler` (`X/popup/app.vue:147-164`, `X/popup/network-switch.ts:63-78`).
- F19. The token seeder runs on profile change, active-network change and account added (`S/token/service.ts:193-195`).
- F20. The existing success toast is a dark card with a check-circle and an uppercase title (`packages/design/src/ui/ToastManagerBase.vue:136-146,212-248`); A5's PNG shows a light card, a plain check and sentence case.
- F21. `deleteNetwork` refuses only the active network, and its `finally` clears every holder's `deletingNetworks` mark (`S/network/service.ts:548-563`).
- F22. `Popup` places a growing close area above its content and slides it up; `PopupCard` adds a drag handle and an accent border (`X/components/Popup/Popup.vue:105-140`, `PopupCard.vue:39-52`).

### Inferences (audits attack these)

- I1. A derivation change moves every Nulo_v1 address on a chain, because the KDF and the address formula are uniform.
- I2. In lenient mode an update can restore a session silently, and an operation can trip the runtime block before the boot verification lands. The next unlock heals it into a quarantine.
- I3. No send can be admitted on a chain before it becomes quarantined: the network cause is computed live from the row (§ Records), and a moved address fails `getAccountContract` (F7), which triggers the runtime classification.
- I4. Orphaned pinned-token and fee-selection UI keys are inert: fee selection resolves against current methods and falls back (`X/popup/components/modules/send/fee-privacy.ts:111`).
- I5. Purging a stale chain waits only on that chain's in-flight PXE sync, bounded by #277's retry train (about 6 s per node call).

### Owner decisions

Asked 2026-10-13, answered 2026-10-13 and 2026-10-14. The 2026-10-14 boards sit on the layout A canvas's "Failures and edge cases" page; their PNGs are in [ui-spec/](ui-spec/).

- A1. **Freeze policy (#324).** Non-Mainnet derivation changes ship in place as an update; `REGIMES` stays append-only; Mainnet keeps the new-major rule. "Change the address-freeze rules. Yes." This plan edits no regime; #324 decides the rc.3 re-pin.
- A2. **No accounts, no screen.** A network cause on a seeded row with no account rows at all (an imported row whose key does not open counts) runs by itself at bootstrap or switch, behind the loader: no takeover, A3, A4 or toast (D41). "yes. Let's do that." N = 1 has singular strings (§ Normative copy).
- A3. **A4's step labels.** "Removing old data" with a spinner, then "Removed old data"; pending rows hidden. "Ok, removing old data."
- A4. **A reset that cannot run or fails** shows R1–R4, not a toast (D42). "Ok. Good."
- A5. **Custom networks with moved addresses** get the reset (A2 with the row's name). Their L1 is probed once before anything is deleted; an unreachable node shows R4. "You read that right. Keep the default."
- A6. **Endpoints on a network reset.** A seed primary stays. A user's own primary is probed once and stays primary if it serves the new chain; otherwise the seed endpoint becomes primary, and A1 says so before RESET (D43). No endpoint is deleted. "a line saying 'your current RPC does not support the new network, we will use our default one'. And if someone complains, we implement something else."
- A7. **Hidden and imported accounts** count in N and appear in A3. "Yes."
- A8. **A5** is today's Home with today's success toast: title "Testnet is ready", the variant line as its sub. A completion no popup saw is announced once at the next open, on any network (D44). "Sounds good."
- A9. **Light theme** uses existing tokens and is judged from captures. "Yes."
- A10. **Imported-only chains** get no address-change verdict (the classifier reads Nulo_v1 rows). A send from such an account gets its own toast instead of an unknown status. Its old key file cannot be re-imported after an address change (D46), so no copy suggests it. Known limit.
- A11. **Full backup while a journal exists** is refused: the page shows a notice and disables Continue, and `exportFullBackupKeys` refuses. A backup whose reads straddle a whole reset stays a known limit.
- A12. **dApp notice on a quarantined chain:** "This app asks for a network your wallet doesn't have.", unchanged. "Yes."
- A13. **Target chain already held:** refuse, and say so before RESET (R2): delete the custom copy, then reset. Adoption declined as too complex. "cool."
- A14. **An imported key that does not open** is left out; A3 names it. "You can import it again from its key file." appears only when addresses stay (D46). "Ok."
- A15. **The Header hides its account block** while the active network is quarantined (D45). "less confusing not having any account there than 'PRIMARY ACCOUNT'. But whatever it's simplest and less bug-prone." While a live network's account loads, a skeleton holds its place: "shouldn't we use skeleton so it doesnt just flash out of nowhere? Approved."
- A16. **Run lock** (owner proposal): "lock the user of doing others stuff while we are actually executing the reset + migration". Built as D40: while a run is in flight, every popup shows A4 and new dApp requests wait; nothing of it is persisted.

## Architecture & Implementation

### Shape

Four background pieces, each on an existing mechanism:

1. **Classifier** (pure), `S/stale-network/classify.ts`, fed by the integrity coordinator, which already derives every account row.
2. **Records**, `S/stale-network/repository.ts`: two raw storage keys in the `AccountIntegrityBlockedRepository` pattern (`S/account-integrity/blocked-repository.ts`).
3. **One quarantine reader**, `NetworkService.isChainQuarantined(profileId, chainId)`, called at every chokepoint in § Guards.
4. **`NetworkResetService`** (`S/network-reset/`), an RPC service for the popup only. It runs the reset through `NetworkService.resetChainInPlace`, a chain-scoped transaction purge and `AccountService` re-creation.

In the popup, `StaleNetworkTakeover.vue` replaces Header, RouterView and Navigation in `X/popup/app.vue` while the active network is quarantined.

### Detection

**Triggers.** All run one `classifyChains()`; none probes a node, so detection is deterministic and offline-safe:

| Trigger | Where |
|---|---|
| Every session open (unlock, create, import, `finalizeRestore`, password change) | `verifyBeforeSessionOpen`, inside the facade lock (`coordinator.ts:133`, called at `S/profile/service.ts:1322-1325`) |
| A session restored silently at worker boot (lenient mode only, F12) | `verifyRestoredSessionOnce` (`coordinator.ts:90-131`); an update changes `walletVersion`, so the stamp never skips it |
| A mismatch at operation time | `raiseRuntimeMismatch` asks the coordinator, through a delegate set at start, to classify that chain: a chain-confined mismatch merges that one entry into the record and keeps the session; anything else keeps today's block-and-lock. With no delegate yet, today's block stays (I2) |

A full classification replaces the record; the runtime path merges one entry under the record lock, so it never drops another chain's entry. `NetworkResetService` watches the record and emits `onStaleNetworkChanged`, so an open popup shows the takeover when a verdict lands mid-session.

**Cause table.** Seeds move verbatim from `S/network/service.ts` to `S/network/seeds.ts`.

| Condition, per network row of the profile | Verdict | Screen |
|---|---|---|
| Row of a seeded kind (`testnet`, `local`) whose `chainId` differs from its kind's build seed | `networkReset` | A1 |
| Same, and the row's `l1ChainId` differs from the seed's L1 (the KDF input moves) | `networkReset` + `addressesMoved` | A1 with A2's account line |
| A row exists, every Nulo_v1 row on its chainId derives to another address, and every account row's `l1ChainId` equals the row's | `addressesMoved` | A2 |
| `addressesMoved` on a row whose `l1ChainId` is 1 | `blocked` | A6, no reset |
| Any other mismatch: mixed on one chain, an account with no network row, an L1 disagreement | **profile block, as today** | `AccountIntegrityBarrier` |

- **Custom networks** are always kind `custom` (`S/network/service.ts:513`): never `networkReset`. A custom chain's node reset keeps today's red dot and send refusal (known limit). `addressesMoved` on a custom non-Mainnet chain is resettable (A5).
- **Local Network** is chainId 0 for every sandbox (`S/network/service.ts:141-145`), so a real sandbox restart stays undetectable. A Local row re-keyed off 0, or moved Local addresses, classify like any other chain; the network e2e uses both.
- **Mainnet** is identified by `l1ChainId === 1`, never by `kind`. It has no V6 seed (`X/utils/chain-ids.ts:17-18`).

**Records.**

```ts
// `nulo:core:stale-networks@<profileId>`. Writer: the classifier. Replace semantics; compare-and-set on the digest.
type StaleNetworksRecord = { profileId: string; accountSetDigest: string; entries: StaleEntry[] }
type StaleEntry = { networkId: string; chainId: number; networkReset: boolean; addressesMoved: boolean }

// `nulo:core:network-reset@<profileId>`. Writer: NetworkResetService. At most one per profile.
type ResetJournal = {
  profileId: string; networkId: string; fromChainId: number; toChainId: number; l1ChainId: number   // L1 verified at capture
  cause: { networkReset: boolean; addressesMoved: boolean }
  purged: boolean; switchToSeedNode: boolean; probedEndpoint: { id: string; url: string } | null   // A6, network cause only
  accounts: Array<{ type: 0 | 1; index: number; name: string; visible: boolean; oldAddress: string
                    newAddress?: string; encryptedSigningKey?: string; done: boolean }>   // newAddress + key: imported only
}

// `nulo:core:network-reset-done@<profileId>`. Writer: NetworkResetService at finish, when N > 0. Read and deleted by `takeResetNotice`.
type ResetNotice = { networkId: string; addressesMoved: boolean }
```

`isChainQuarantined(p, c)` is true when the record has an entry for `c`, the journal's `fromChainId` or `toChainId` is `c`, or the row on `c` has the network cause right now (seeded kind, chainId off its seed). The last check is computed live from the row, so a stale seeded chain is quarantined from the worker's first instant, before any classification lands. One `storage.get` of the two keys and the row per call. Record writes are serialized by a module-level `KeyedLock` per profile, a leaf lock (only storage is awaited under it). An undecodable record, journal or notice reads as absent. None of the three keys is in any backup slice (`S/backup/backup-migration-registry.ts`). Profile deletion clears all three next to `integrityBlocked.clear` (`S/profile/service.ts:1527`, `:1610`). `deleteNetwork` refuses while a reset run for that network is in flight; with a journal and no run, it deletes the journal and the record entry under the record lock before its purge (the user's exit from a reset that cannot finish). `addNetwork` refuses a chainId that `isChainQuarantined` names.

### The integrity check becomes chain-aware

`verifyProfile` derives every Nulo_v1 row (the green path already does), reads the rows with `getNetworksRaw` (lock-free, `S/network/service.ts:389`) and classifies:

- **An unclassifiable mismatch exists:** persist the profile block and throw `AccountAddressInconsistencyError`, exactly as today.
- **Otherwise:** write the record with compare-and-set on `accountSetDigest`, clear any profile block, stamp, open. A profile blocked by today's build heals at its next unlock.
- **The compare-and-set fails** (the account set changed during the derivation): re-read and re-classify once. A second failure clears nothing, stamps nothing and refuses the open with a retryable error.

The off-lock boot path writes through `ProfileService.persistIntegrityVerdictIfLive(profileId, write)`, a generalization of `persistIntegrityBlockIfLive` (`S/profile/service.ts:970`), so no write can orphan a record for a deleted profile.

### Guards: every service refuses a quarantined chain

All refusals throw `ChainNotSupportedError` (F9).

| Surface | Chokepoint |
|---|---|
| Sends, authwits, simulations, deploys, PXE scope registration | `AccountService.getAccountContract` and the imported load (F7) |
| `createAccount`, `importAccount`, `ensureDefaultAccount`, `provisionDefaultAccount` | a guard at the top of each; the reset calls the internal path |
| PXE sync, balances, notes on a warm runtime | `registerPxeChainGuard` beside the recovery guard (F10); cleanup calls stay admitted |
| dApp calls | the dispatcher's `getNetworksRaw` adapter returns `[]` for a quarantined chain (F8) |
| dApp connect | `served` gains `&& !quarantined` at `background.ts:750` and `:1126`; `dropStaleSession` keeps the row-based `servesChain`, so A6 drops no session |
| Default-token seeding | `TokenSeeder` treats a quarantined scope like a zero-account scope and burns no attempt (`S/token/seeder.ts:24,78`); the reset triggers a seeding pass after the quarantine lifts (F19) |
| Incoming-transfer polls | a guard refusal is a quiet skip, logged at `debug` |

Still allowed: `getAccounts` and `getNetworks` reads (A3 lists them), every export except a full backup while a journal exists (A11), rename, visibility, and the purge.

### The reset operation

**RPCs** (`S/network-reset/{spec,service,client}.ts`; zod params, `requireActiveProfile` + `requireOwnedRow`; trusted internal ports only):

```ts
getStaleNetwork(networkId: string): StaleNetworkView | null   // first awaits the coordinator's bootVerification
getPendingReset(): { networkId: string; running: boolean } | null   // the active profile's journal; running = the run lock
resetStaleNetwork(networkId: string, confirmed: { networkReset: boolean; addressesMoved: boolean; accountCount: number; unmovableCount: number; switchToSeedNode: boolean; probedEndpoint: { id: string; url: string } | null }): StaleNetworkView
takeResetNotice(): ResetNotice | null   // under the record lock: null while that network's journal exists, else returns and deletes it
event onStaleNetworkChanged: { profileId; networkId; running?: boolean; completed?: { addressesMoved: boolean }; failed?: true }
type StaleNetworkView = { networkId: string; name: string; cause: { networkReset: boolean; addressesMoved: boolean }
  blocked: boolean; accounts: Array<{ name: string; address: string }>   // N = accounts.length, index order, hidden included
  unmovable: string[]; switchToSeedNode: boolean; probedEndpoint: { id: string; url: string } | null   // A14; A6
  heldBy?: { name: string }; otherPending?: { networkId: string; name: string }   // R2; R3
  reset?: { running: boolean; purged: boolean; doneCount: number } }
```

`getStaleNetwork` builds the view from the journal when that network has one, else from the record entry; `cause.networkReset` is always recomputed from the row and the seed, never read from the record (D47). It opens each imported key on the chain (the session holds the DEK): a key that does not open goes to `unmovable`, and one that derives another address sets `addressesMoved`, so A1 never promises unchanged addresses that will move. For a network cause whose primary endpoint is not the seed's, it probes that endpoint once with `createSingleAttemptNode(url, 5000).getNodeInfo()` (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:73`; its socket dies with the budget, unlike the retrying client behind `_probeChainIdentity`). The result is cached in worker memory under (network id, primary endpoint id, URL, target chainId), so a primary changed after A1 misses the cache, is probed again, and fails `confirmed` with `ERR_STALE_CHANGED`. `switchToSeedNode` is true unless the node reports the seed's chainId and L1. `heldBy` names another row on the target chainId; `otherPending` names another network's journal.

`resetStaleNetwork` starts the run in the worker and returns at once; the popup follows events and re-reads the view. With this network's journal present it resumes and ignores `confirmed`. Refusals, and what the popup does:
- `ERR_STALE_CHANGED` (`confirmed` differs from a fresh view): re-read the view.
- `ERR_NOT_RESETTABLE` (Mainnet, a non-quarantined chain, a held target chainId) and `ERR_RESET_IN_PROGRESS` (another network's journal): re-read the view, which shows R2 or R3.
- `ERR_NODE_UNREACHABLE` (a custom row's L1 probe failed at capture; nothing changed): R4.
- A run that fails emits `failed`; the view then has a journal and no run: R1.

**Capture** (only when no journal exists; initial admission needs a fresh view and `confirmed`):

1. `captureRunFence()` (`S/profile/service.ts:540`).
2. For a custom row, verify its L1 now with `resolveVerifiedL1ChainId` (one live probe, F5); refuse with `ERR_NODE_UNREACHABLE`.
3. Read every account on the row's current chainId, hidden included (`getAccountsRaw`).
4. For each imported row, unseal under `(fromChainId, oldAddress)` with one fresh DEK copy (`getProfileDek`, `:1948`; the unseal wipes it, F4), compute `newAddress` with `NuloAccount.fromSigningKey`, and reseal under `(toChainId, newAddress)` with `sealImportedSigningKeyV2` and a second fresh copy, zeroed after (the seal does not wipe it). A key that does not open is left out (A14). A recovery-mode session refuses before anything changes.
5. Write the journal: `fromChainId` = the row's chainId; `toChainId` = the seed's (network cause) or the same; the verified L1; `switchToSeedNode` and `probedEndpoint` from `confirmed`, after re-reading under the network lock that the row's primary still has that id and URL (else `ERR_STALE_CHANGED`, nothing changed); `purged: false`; every `done: false`.

The journal is the only place the list and the resealed keys live once the purge runs: the purge deletes old key rows (F4), and new key rows written early would fall to the orphan sweep.

**Run** (single-flight per profile; `assertRunFence` before each step; each journal write first checks, under the record lock, that the journal still exists):

1. **Validate** (first run and resume alike). Refuse unless the row exists; the row's `l1ChainId` and every captured account's differ from 1; `toChainId` equals the seed's chainId for the row's kind and differs from `fromChainId` (network cause), or equals `fromChainId`; and the journal's `l1ChainId` equals the seed's L1 for a seeded kind, or the row's `l1ChainId` for a custom row (the reset never changes a custom row's L1). Before `purged`, the row's chainId must be `fromChainId`; after, `fromChainId` or `toChainId`. A resume needs no fresh verdict: the purge may already have deleted the rows a verdict reads.
2. **Purge**, if not `purged`. `resetChainInPlace` reserves the network id under the network lock, then releases the lock. Hold point `network-reset-purging`. `purgeChain(profileId, fromChainId, networkId)`, then `TransactionService.purgeForAccounts(oldAddresses, profileId, fromChainId)`, run under the reservation. The transaction purge gains an optional chain filter, and `onAccountDeleted` passes `account.chainId` (F11). Then the run deletes the chain's dApp sessions (`DappSessionService.purgeForChain`): their grants name removed addresses (F8, D48). Release the reservation; persist `purged: true` at once. Hold point `network-reset-purged`.
3. **Rewrite**, when the row's chainId is not `toChainId`, under the network lock: re-read the row and refuse if it is gone or another row holds `toChainId`; set `chainId` and `l1ChainId` from `seeds.ts` by kind; apply A6 (`switchToSeedNode` false keeps the user's primary only while its id and URL still equal `probedEndpoint`; otherwise, or when true, add the seed endpoint if missing and make it primary); keep `id`, `profileId`, `name` and the active pointer; evict `nodes` for both chainIds; emit `onNetworkUpdated`. A resume reruns this step when it did not land.
4. For each entry not `done`: `AccountService.recreateForReset(profileId, toChainId, entry, l1ChainId)`; persist `done`; emit progress; hold point `network-reset-account` after the first.
5. **Finish:** remove the record entry; write the notice when N > 0; delete the journal; trigger a seeding pass for the new scope; emit `completed`.

**`recreateForReset`** is worker-internal, not in `rpcMethods`. Nulo_v1: `createAccountInternal` gains optional `index`, `visible` and verified-L1 overrides, so it never probes after the purge, and keeps every other fence (deletion epoch, `isChainLive`, row lock, `assertStillLive`). Imported: open the journal's ciphertext under `(toChainId, newAddress)` with a fresh DEK copy and check that `fromSigningKey` gives `newAddress`, then `commitImportedAccount` (F4), key row then account row. A row already present is skipped.

**Ordering invariants.**
- `purged` is persisted as soon as both purges succeed, before the rewrite. A crash between them resumes into the rewrite; a crash before it reruns the idempotent purge.
- No re-creation before `purged` is durable: in the address-only case `fromChainId === toChainId`, and a re-run purge would delete new rows.
- A journal that claims `purged` triggers no purge at all.
- Remove the record entry before deleting the journal: the other order, interrupted, shows A2 over correct accounts.
- Targets, the derivation L1 and the purge scope come from `seeds.ts` and the row, never from the journal alone.
- The reservation fences the purge; between purge and rewrite the journal's `fromChainId` and `toChainId` stay quarantined, so no writer reaches either chain.

**Lock order.** The facade (secret or DEK) is taken and released before the network lock. The network lock is held only for the reservation and the row rewrite, so other chains' `getNode` never waits on the purge. Re-creation runs under the tuple lock then the facade, the order `createAccountInternal` already uses.

**Resume** is popup-driven, with no background lifecycle. At every popup bootstrap, `getPendingReset()` returns the active profile's journal, and the popup calls `resetStaleNetwork` for it whatever network is active, in the foreground under the run lock; a second popup joins the single flight. Under strict mode a worker death forces an unlock first (F12), and resume follows. A lock or a profile switch fails the run fence and keeps the journal. Profile deletion removes it; `deleteNetwork` refuses during a run and removes an idle journal (§ Records).

**Run lock** (D40, A16). The single flight's in-memory flag is the lock; `getPendingReset().running` and `running` events expose it. While it is set, every popup shows A4 for the network being reset, whatever network is active (a run with N = 0 shows the loader), and the dApp ingress makes each new request wait for the run to end, at most 60 s, then admits it under the usual guards (beside the Terms check, `S/wallet-sdk/background.ts:1273`). Discovery waits the same way in `handleDiscovery` (`:449`) before its session lookup and connect window, then re-checks the profile and the Terms; its locked queue and dedupe keep their order. It is never persisted: a worker death drops it with the run, and the resume takes it again. A paused reset (a journal, no run) locks only its own chain. Work admitted before the run continues: sends on the quarantined chain were refused at admission (I3), and other chains share no lock with the purge (PXE guards are per `(profileId, chainId)`, `packages/aztec-runtime/src/pxe/service.ts:140-166`; I5).

### UI (layout A)

**Mount.** In `app.vue`, Header, the RouterView block and Navigation become the `v-else` of `<StaleNetworkTakeover v-if="takeover">`. The boot banner, the barriers and `#toast` stay outside. `takeover = shouldShowStaleTakeover(...)` in `X/popup/stale-takeover.ts` (the `lock-landing.ts` pattern): logged in, `appStore.staleNetwork?.networkId === appStore.network?.id`, and the route is not `windows-*`, `/popup/settings/networks*`, `/popup/settings/security/export*`, `/popup/legal/*`, auth or register. While the run lock is set, `takeover` shows A4 for the running network on every route but `windows-*`, auth and register.

**Precedence, top down:** `MigrationBarrier` and `AccountIntegrityBarrier` (z 10000; a profile block withholds the session, so it never meets a takeover) → `GlobalLoader` → the takeover, in normal flow. The Terms sheet does not render while the takeover shows (one condition at its mount in `app.vue`); it returns on Home after a reset or a switch. The lock screen never shows the takeover.

**Popup state.** `appStore.staleNetwork` is set by `syncStaleNetwork(networkId)`. `initNetworks` awaits it, and `initAccount` returns early when it names the active network (`X/composables/useProfileBootstrap.ts:105-119`). The switch handler (F18) first awaits `syncStaleNetwork(target.id)`. When the result names the target, it clears `appStore.accounts` and `appStore.account` without writing `nulo:ui:activeAccount` (so the Header shows A15's empty state, not the last network's account) and skips its account steps. So switching away loads the new network's accounts and switching back shows the takeover. `ensureDefaultAccount` never runs on a quarantined chain. A bootstrap or switch whose view has a network cause, empty `accounts` and `unmovable`, and no `heldBy` or `otherPending` awaits `resetStaleNetwork` behind the loader instead of showing the takeover (A2). The client lives in `managers`; `useStaleNetwork(client)` (C1) filters events and runs the bootstrap resume; `app.vue` owns connect and disconnect.

**Actions.** The chip (its own yellow square, not the header status dot) and SWITCH NETWORK push `/popup/settings/networks` (F13); that route yields. LOCK reuses `useLockWallet(managers.profile)`. RESET TESTNET opens A3. R1's TRY AGAIN resumes through `resetStaleNetwork`; R2's OPEN NETWORKS pushes the networks page; R3's GO TO activates the pending network, which shows its R1; R4's TRY AGAIN repeats the call with the same `confirmed`.

**A3** is `StaleNetworkConfirm.vue` on `Popup` directly, without `PopupCard` (no drag handle, no accent border, F22). Popup already renders a growing close area above its slot (`X/components/Popup/Popup.vue:117,135`), so the slot is the bordered card and one lower spacer with the same `flex: 1`. That centres the card as the PNG shows while keeping Popup's focus trap, scrim, Escape and focus return. `Popup.vue` is unchanged. Escape and a tap on either close area cancel. Initial focus is CANCEL. No document-level Enter; RESET is the keyboard path, uses `refuseRepeatEnter` and disables after its first activation. No positive `tabindex`.

**A4** has no chip, no LOCK and no buttons; its block is centred vertically. It renders `view.reset`: "Removing old data" with a spinner, then "Removed old data" once `purged` (A3); one row per account, "Moved" or "Created" when done, "Moving" or "Creating" with a spinner while current; pending rows hidden.

**A5.** On `completed` for the active network the popup clears `staleNetwork`, assigns the re-read network, and awaits the account load that assignment starts (the switch handler's run, F18), which also sets the active account (F17: kept if its address survives, else the first account). Only then does it push `postAuthRoute()`. Every A5 toast comes from `takeResetNotice()`, called on `completed` and at each bootstrap, so a completion is announced once, by whichever popup takes the notice first, on any network (D44).

**Other surfaces.** Header (A15): the account group (`X/components/Header.vue:224`) renders only when logged in, the active network is not quarantined, and an account is loaded whose `profileId` and `chainId` are the active scope's. A runtime quarantine hides it at once. On a live network whose account has not loaded (any switch, the first paint), `Skeleton` blocks of the same footprint (32 px avatar, two 12 px lines; `packages/design/src/ui/Skeleton.vue`) hold its place. Full Backup (A11): `full.vue` reads `getPendingReset()` and shows the notice above the agreement text, with Continue disabled. A10: `ImportedAccountUnusableError` moves to `packages/extension-messaging/src/errors.ts` as a `WalletError` (code `IMPORTED_ACCOUNT_UNUSABLE`), so it reaches the popup typed, and `transferFailureSnack` (`X/popup/utils/transfer-failure-copy.ts:26`) maps it.

**Copy** lives once in `X/components/stale-network/copy.ts`. "Testnet" is the row's name; the chip and pre-titles use it uppercased. testids: `stale-network-takeover`, `stale-network-title`, `stale-network-reset`, `stale-network-switch`, `stale-network-lock`, `stale-network-chip`, `stale-network-retry`, `stale-network-open-networks`, `stale-network-go-to`, `stale-network-node-line`, `stale-confirm`, `stale-confirm-account`, `stale-confirm-unmovable`, `stale-confirm-submit`, `stale-confirm-cancel`, `stale-progress`, `stale-progress-step`, `full-backup-reset-notice`.

### File-level change map

| File | Change |
|---|---|
| `S/network/seeds.ts` (new), `S/network/service.ts` | seeds moved verbatim; `isChainQuarantined`; `resetChainInPlace` with A6's endpoint rule; `deleteNetwork` refuses during a run and clears an idle journal; `addNetwork` refuses a quarantined chainId; purge doc comment corrected |
| `S/stale-network/{types,classify,repository}.ts` (new) | schemas, classifier, repository with a keyed lock |
| `S/account-integrity/{coordinator,types}.ts` | derive all, classify, compare-and-set, narrow the block; NetworkService dependency; runtime delegate |
| `S/profile/service.ts` | `persistIntegrityVerdictIfLive`; clear both keys on deletion |
| `S/account/service.ts`, `packages/extension-messaging/src/errors.ts` | `ImportedAccountUnusableError` becomes a `WalletError`; six guard sites (`getAccountContract`, the imported load, the four creation entry points); `index`/`visible`/L1 overrides; `recreateForReset`; runtime mismatch through the delegate; `exportFullBackupKeys` refuses while a journal exists |
| `S/transaction/service.ts`, `S/dapp-session/service.ts` | chain-scoped purge; `purgeForChain` for sessions, called by the reset only (D48) |
| `S/pxe/client.ts`, `X/wallet/runtime.ts` | `registerPxeChainGuard`; service wiring; the proverless-only `restoreGate` passed to `NetworkResetService` for three hold points |
| `S/wallet-sdk/background.ts`, `S/token/{seeder,service}.ts`, `S/incoming-transfer/service.ts` | the run-lock wait at ingress; dispatcher adapter; discovery `served`; seeder skip and post-reset trigger; quiet poll skip |
| `S/network-reset/{spec,service,client}.ts` (new) | the RPC service; the run lock; the A6 probe; the notice; watches the record and emits `onStaleNetworkChanged` |
| `X/e2e/restore-gate.ts`, `X/e2e/chrome-storage-restore-gate.ts` | hold points under the existing key, so the bundle grep already covers them |
| `X/popup/pages/settings/security/export/full.vue`, `X/components/Header.vue`, `X/popup/utils/transfer-failure-copy.ts` | A11's notice and disabled Continue; A15; A10's toast |
| `.gitignore` | ignore `apps/extension/tests/e2e/.captures/` (not ignored today) |
| `X/components/stale-network/{StaleNetworkTakeover,StaleNetworkConfirm}.vue`, `copy.ts` (new) | A1, A2, A4, A6, R1–R4; A3 |
| `X/popup/stale-takeover.ts` (new), `X/popup/app.vue`, `X/popup/network-switch.ts`, `X/composables/{useStaleNetwork,useProfileBootstrap}.ts`, `X/stores/app.store.ts`, `X/utils/core.ts` | mount, Terms-sheet condition, state, skips, resume |
| `apps/extension/tests/e2e/helpers/stale-network.ts` (new) + e2e files | `seedStaleNetwork(page, mode)` |
| `CLAUDE.md`, `ARCHITECTURE.md`, `.claude/skills/aztec-update/SKILL.md` | § Docs |

### Trade-offs and alternatives not taken

| Alternative | Why not |
|---|---|
| Delete and re-add the network | `deleteNetwork` refuses the active network; seeding needs a zero-row profile; names and imported keys are lost |
| Create new rows first, purge after (no journal) | In the address-only case the purge deletes the new rows |
| Classify from a node probe | Offline-unsafe and attacker-influenced; staleness is storage versus build |
| Fold the reset into the integrity coordinator | Mixes verification with mutation in a last-phase verifier |
| An overlay takeover (`BarrierOverlay`) | Fights A3's `Popup`; an in-flow `v-else` hides Header and Nav as A1 requires |
| Extend `ConfirmPopup` for A3 | F14; a list slot and alignment flag would fork its layout for one caller |
| A wallet-wide lock while any journal exists | a reset that keeps failing would block every network (D40) |
| More rejected options with their source | § Decision ledger |

## Security & Adversarial Considerations

- **Where the destructive button appears.** Only in the extension popup, never in `windows-*`. The popup is not web-accessible, so no page can frame it (`X/manifest.test.ts:57`). The `network-reset` RPCs accept only trusted internal ports (`packages/extension-messaging/src/background/service.ts:40-50`). A dApp has no route to them and gets `CHAIN_NOT_SUPPORTED` on the quarantined chain.
- **Phishing look-alikes.** A page can imitate the screen in a tab. Nulo's screens never ask for a phrase, a file or a password; A1 says "You do not need your recovery phrase." and A6 "Never enter your recovery phrase anywhere in response to this message." A component test pins no `input`, `textarea` or `a`, and the exact button set.
- **A storage writer** can already delete everything local. A forged record raises the screen; confirming wipes that network's local history, nothing more. A forged journal:
  - cannot purge a chain no row owns: before `purged`, `fromChainId` must equal the named row's chainId, so it can purge only the chain of an existing non-Mainnet row, which a storage writer can already delete; a journal that claims `purged` purges nothing;
  - cannot redirect endpoints, targets or the derivation L1: each must equal `seeds.ts` or the row;
  - cannot plant keys or addresses: each ciphertext must open under the DEK with AAD `(toChainId, newAddress)` and derive `newAddress`;
  - cannot touch Mainnet: the run refuses `l1ChainId === 1` on the row or any captured account;
  - cannot start an unattended reset: A2's automatic run needs the network cause, recomputed from the row and the build (D47);
  - cannot keep a stale node in use beyond what the user set: `switchToSeedNode: false` keeps only the user's own primary, which still fails closed on send.
  A journal resumes without fresh consent; its worst effect is the reset a forged record could already ask for.
- **The fail-closed boundary.** A mismatch confined to one chain is quarantined, so its rows are never displayed or used, whatever its cause. A whole-chain tamper on Testnet reads as A2, and the reset heals it from the master; on Mainnet it reads as A6 and changes nothing. Mismatches that cannot be confined to one chain keep the profile block. Accidental derivation drift is caught before shipping by the KAT (`packages/aztec-runtime/src/account/derivation-vectors.test.ts`).
- **What we trust.** The record and journal are trusted for screens and traffic suppression only, never for key material or targets; the purge scope is the named row's chainId. `confirmed` must match a fresh classification on first admission.
- **Half-completed reset.** Rows are deleted only after the journal is durable; each step is idempotent. The data-loss window is a corrupt journal after the purge: names and imported keys are lost; Nulo_v1 accounts are re-creatable by New account (known limit). A full backup refuses while a journal exists (A11); one whose reads straddle a whole reset is a known limit.
- **The run lock** lives only in worker memory, and a held dApp request proceeds after 60 s, so a stuck or crashed run cannot freeze other networks. The per-chain guards stay the safety boundary; the lock only narrows what runs beside a purge.
- **Endpoint privacy (A6).** Only the user's own primary is probed, a node the wallet already uses; the seed node takes over only after A1 said so and the user confirmed.
- **Logs.** Network id, cause, step and counts only; never addresses, names or ciphertext (`encryptedSigningKey` is already in `REDACTED_KEYS`, `X/wallet/logger/utils.ts:102`).
- **Denial of service.** A forged record that quarantines every chain heals at the next unlock (replace semantics).
- **Crypto and supply chain.** No new primitive and no new dependency: resealing reuses `sealImportedSigningKeyV2` from `@nulo/wallet-crypto`.

## UI fidelity

The mockups are the spec. A deviation is an Ask; none is made silently.

1. **Copy pinned.** `copy.ts` holds every string. Component tests assert rendered text verbatim per variant: A1 (with and without the node line), A2, both causes, A3 (both bodies, the unmovable notice in its forms), A4 (both verbs), A5 (both toasts), A6, R1–R4, the Full Backup notice, A10's toast, and the name and N slots (a renamed network included). `copy-dash-ban.test.ts` and the glossary test stay green.
2. **Order pinned per state.** A1: top bar (chip, LOCK with padlock, divider below), eyebrow, title, body, box (label, account line, keep line, remove line), note, primary, secondary. A2: the same with the notice after the body and no note. A6: top bar, eyebrow, title, body, unlabelled box (three ✓ lines), note, one filled primary. A3: pre-title, title, body, account list, CANCEL, RESET, with a close-area spacer above and below the card. A4: pre-title, title, body, steps, footer, no top bar. R1: top bar, eyebrow, title, body, box, note, primary, secondary. R2: top bar, eyebrow, title, body, numbered box, note, one primary. R3: top bar, eyebrow, title, body, unlabelled box, primary, secondary. R4: top bar, eyebrow, title, body, note, primary, secondary. A1's node line follows the account line; A3's notice follows the list.
3. **Captures.** An opt-in `STALE_NETWORK_CAPTURES=1 bun run test:e2e tests/e2e/stale-network-captures.test.ts` (the `tests/e2e/network/store-captures.test.ts` pattern, no sandbox) renders each state at 360×600, scale 2, dark and light, into `apps/extension/tests/e2e/.captures/`, which this plan adds to the root `.gitignore`.
4. **Side by side.** Each capture sits beside its `ui-spec/` reference in the arc 2 PR body. Every difference in spacing, wrapping, type, colour, borders, button order or dialog placement is listed. A3's card centre is measured against the PNG's.
5. **Owner sign-off** naming each surface is quoted in the arc 2 PR body. An audit's approval is not a sign-off.

**References.** `A1`–`A6` PNGs (2026-10-13), except A4's step labels (A3) and A5, which follows `A5b-as-built.png` (A8). The 2026-10-14 PNGs: `A1b-node-line`, `A3b-cannot-move`, `A4b-removing`, `A5b-as-built`, `R1-paused`, `R2-already-added`, `R3-one-at-a-time`, `R4-node-down`, `A10-imported-unusable`, `A11-backup-notice`, `A15-header`, `A15b-header-loading`.

**Normative copy** ("Testnet" is the row's name; N counts the accounts the reset re-creates; N = 1 reads "Move your account to the new Testnet. Its address stays the same.", "Create your account again, with the same name, at a new address.", and in A3 "moves this account" or "creates this account again at a new address"):

- **A1.** Top bar: chip `TESTNET` (yellow square) · `LOCK`. Eyebrow (yellow refresh icon) `NETWORK RESET`. Title "Testnet was reset". Body "Aztec restarted Testnet. Tokens and history from before the restart no longer exist on it." Box `RESETTING TESTNET IN NULO WILL`: ✓ "Move your N accounts to the new Testnet. Their addresses stay the same." ✓ "Keep your profile, contacts and other networks." ✕ "Remove old Testnet tokens and history from this device." Note "You do not need your recovery phrase." Buttons at the bottom: `RESET TESTNET` (filled), `SWITCH NETWORK` (outline). With `switchToSeedNode`, after the account line (yellow swap icon): "Switch Testnet to Nulo's node, because yours is not serving the new Testnet." With it, the gaps tighten as A1b shows, so both buttons keep their bottom margin.
- **A2.** Same top bar. Eyebrow (yellow warning icon) `WALLET UPDATE`. Title "New account addresses". Body "This version of Nulo gives Testnet accounts new addresses. Your current Testnet accounts do not work with it." Yellow notice "Tokens at your old addresses stay there. This version cannot reach them." Box with the same label: ✓ "Create your N accounts again, with the same names, at new addresses." then A1's keep and remove lines. No note. The same two buttons. **Both causes:** A1 with this ✓ line, no notice.
- **A3.** Over the dimmed screen: pre-title `TESTNET`, title "Reset Testnet?", body "Nulo removes your Testnet tokens and history from this device. Then it moves these accounts to the new Testnet. You cannot undo this." (address variant: "Then it creates these accounts again at new addresses."), account list (name, truncated address), `CANCEL`, `RESET` (red outline). With `unmovable`, a yellow notice after the list: "“Imported 1” cannot be moved because its stored key does not open. The reset removes it from this device." (two or more: "2 imported accounts cannot be moved because their stored keys do not open. The reset removes them from this device."), plus, when addresses stay, "You can import it again from its key file." ("them … their key files").
- **A4.** `TESTNET`, "Resetting Testnet", "Keep this window open. This takes a few seconds." Steps "Removing old data" (spinner) then "Removed old data", "Moved Account 1", "Moving Account 2" (address variant: Created, Creating). Footer "If you close the window, Nulo finishes the reset the next time you open it."
- **A5.** Home on the new Testnet. Today's success toast: title "Testnet is ready", sub "Your accounts kept their addresses." (address variant: "Your accounts have new addresses.")
- **A6.** Top bar: chip `MAINNET` (yellow square) · `LOCK`. Eyebrow (yellow warning icon) `WALLET UPDATE`. Title "Mainnet accounts unavailable". Body "This version of Nulo gives Mainnet accounts new addresses, so it cannot open your current ones." Unlabelled box: ✓ "Your funds stay at your current addresses." ✓ "Nulo does not reset Mainnet and changes nothing on this device." ✓ "Your other networks keep working." Note "Never enter your recovery phrase anywhere in response to this message." One filled button at the bottom: `SWITCH NETWORK`.
- **R1.** A1's top bar. Eyebrow (yellow pause icon) `RESET PAUSED`. Title "Testnet reset did not finish". Body "Something stopped the reset part-way. Nulo saved your accounts before it removed anything, so nothing is lost." Box `TRYING AGAIN WILL`: ✓ "Pick up where the reset stopped." ✓ the account line of A1 or A2 ✓ "Keep your profile, contacts and other networks." Note "Nulo also tries again each time you open it." `TRY AGAIN` (filled), `SWITCH NETWORK` (outline).
- **R2.** A1's top bar. Eyebrow (refresh) `NETWORK RESET`. Title "Testnet cannot be reset yet". Body "Aztec restarted Testnet, and you already added the new one as “My Testnet”. Two networks cannot use the same chain." Box `TO RESET TESTNET`: 1 "Open Networks and delete “My Testnet”." 2 "Come back here and reset Testnet. Your accounts move to the new Testnet." Note "Deleting it removes its data from this device. Funds on the chain stay where they are." One filled `OPEN NETWORKS`.
- **R3.** The active network's top bar and eyebrow. Title "Finish the Testnet reset first". Body "Nulo resets one network at a time, and the Testnet reset has not finished." Unlabelled box: ✓ "Nothing on Local Network has changed." ✓ "Open Testnet to finish its reset. Then come back here to reset Local Network." `GO TO TESTNET` (filled), `SWITCH NETWORK` (outline).
- **R4.** Top bar with the custom name. Eyebrow (yellow no-signal icon) `WALLET UPDATE`. Title "Cannot reach My Devnet". Body "Nulo checks the network's node before it removes anything. The node did not answer, so nothing was removed." Note "Check that the node is running, then try again." `TRY AGAIN` (filled), `SWITCH NETWORK` (outline).
- **Full Backup notice.** Label `FINISH THE TESTNET RESET FIRST`, text "A backup made now would miss the accounts the reset is moving. Open Testnet to finish the reset, then come back."; Continue disabled.
- **A10 toast** (error): title "Cannot send from this account", sub "Nulo cannot use this imported account's key. Send from another account."

## Tests

**Unit and component** (`bun run test`; derivation stubbed as `S/account/service.test.ts:28-36` does):

- `classify.test.ts`: every cause-table row; both causes; L1 move; Local; custom; Mainnet all-moved and mixed; no network row; imported-only chain gives no verdict; hidden rows counted.
- `repository.test.ts`: undecodable reads as absent; compare-and-set skips on a digest change; the lock serializes writes; the predicate covers both chainIds; a failed compare-and-set writes nothing; a runtime merge keeps the other chains' entries.
- `coordinator.test.ts`: existing assertions unchanged (a NetworkService stub joins the harness). New: a resettable mismatch opens, writes the record and clears a prior block; Mainnet writes a record, not a block; mixed blocks; boot never closes on resettable; a digest change re-classifies and a second change refuses the open with nothing cleared; a runtime mismatch on a resettable chain quarantines without closing the session, and a mixed one still blocks.
- `AccountService`: each of the six guard sites refuses; `recreateForReset` keeps index, name and visibility and is idempotent; imported writes key then account; a ciphertext that does not open, or derives another address, is refused; `exportFullBackupKeys` refuses while a journal exists; other exports still allowed.
- `NetworkService`: `isChainLive` is false during `resetChainInPlace`; the network lock is free while the purge runs; after a network reset the row's chainId, l1ChainId and primary endpoint equal the seed and user endpoints are kept; id and active pointer kept; a purge failure leaves the row and throws; `deleteNetwork` refuses during a run and removes an idle journal and its record entry; `addNetwork` refuses a quarantined chainId.
- `NetworkResetService`, with real `sealImportedSigningKeyV2`/unseal and two imported accounts: each journal ciphertext opens under the new AAD with an untouched copy of the profile DEK, and under no other AAD; recovery-mode refusal; an unopenable key left out (A14); `ERR_STALE_CHANGED`; `ERR_NOT_RESETTABLE` (Mainnet, collision, a custom node down at capture); `ERR_RESET_IN_PROGRESS`; two calls run once. Resume: from captured; after `purgeChain` and before `purged` is persisted; from `purged` with the rewrite not landed (both causes); address-only after account deletion; from a partial `done`; a validate-time refusal when the row is gone. A forged journal (another row's `fromChainId`, Mainnet L1, `purged` claimed) purges nothing, and one whose `l1ChainId` differs from the seed or the custom row writes no account; a network cause with `fromChainId === toChainId` is refused; a lock keeps the journal; deletion clears it; finish order; the seeding trigger fires after the lift. Run lock: set for the whole run, cleared after success, failure and a throw, never persisted (a second service on the same storage reports `running: false` beside the journal). Notice: written only when N > 0; `takeResetNotice` returns it once, and nothing while the journal exists (a crash after the notice and before the journal delete, then two popups, gives one toast). A6: no probe when the primary is the seed's; kept when the node reports the seed identity; switched on a mismatch or the 5 s budget, with the request aborted; a primary changed after the view re-probes and fails `confirmed`; a primary change that commits after the fresh view and before capture gives `ERR_STALE_CHANGED`; a primary switched, or its URL edited in place, during the run makes the seed primary. `ERR_NODE_UNREACHABLE`. The view's `unmovable`, `heldBy` and `otherPending`; `cause.networkReset` recomputed when the record disagrees.
- Others: chain-scoped transaction purge keeps another chain's rows for the same address; `purgeForChain` deletes only that chain's dApp sessions, and only a reset calls it (a deleted network keeps them, D48); the PXE guard refuses profile-bound ops and admits cleanup; the dispatcher adapter returns `CHAIN_NOT_SUPPORTED`; discovery keeps sessions; the seeder skip burns no attempt; a poll on a quarantined chain logs no `warn`; the full-backup export refuses while a journal exists; the dApp ingress and discovery each hold a request while the lock is set and admit it when the run ends or at 60 s (fake timers); `ImportedAccountUnusableError` reaches a popup client typed and `transferFailureSnack` maps it.
- Components: `StaleNetworkTakeover.test.ts` (copy and order per state, testids, routes, Lock, the phishing pin, A4 without top bar, A6's single button); `StaleNetworkConfirm.test.ts` (Escape and outside tap cancel, initial focus, double click makes one call, repeat Enter ignored); `stale-takeover.test.ts` (route list, Terms sheet hidden); `useStaleNetwork` (bootstrap resume on another network; with a delayed account read, the route and toast wait until `appStore.account` is set); `network-switch.test.ts` (stale → fresh loads accounts; fresh → stale shows the takeover, clears the account so the Header is A15's empty state, keeps `nulo:ui:activeAccount`, and skips the account steps); bootstrap skips; the view upgrades to the address variant when an imported key derives another address; R1–R4 copy, order and actions; A1's node line; A3's notice; `useStaleNetwork` shows A4 on every network while running, runs a network cause with no account rows behind the loader with no takeover and no toast, and never runs one whose `unmovable` is not empty, and toasts a notice once across two popups; `Header.test.ts` hides the account group on a quarantined network (runtime quarantine without a switch included) and shows the skeleton while the loaded account's profile or chain is not the active one; `full.test.ts` shows the notice and disables Continue.

**Composition**, `S/network-reset/service.composition.test.ts`: the real Network, Account, Token, Fpc, AuthRegistry, OperationJournal, Transaction, DappSession and IncomingTransfer services on `FakeBrowserApi`, PXE client stubbed (`S/network/service.test.ts:566`). It asserts the reset chain's rows are gone, the other chain's rows are byte-identical (same addresses included), and the accounts are re-created. Derivation stubbed (`apps/extension/tests/COMPOSITION-TESTS.md`).

**Smoke e2e**, `tests/e2e/stale-network.test.ts`, Chrome and Firefox. `seedStaleNetwork` re-keys rows after a lock, as `tests/e2e/imported-account-lifecycle.test.ts:120-133` does; addresses come from `deriveNuloAccountAddress` (`tests/e2e/helpers/import-drivers.ts:395`). No node stub: the reset is offline.

| # | Failure mode it proves | Why no cheaper layer | Est. per browser |
|---|---|---|---|
| S1a | Network reset: unlock gives A1; Switch network round trip (the networks page shows no account block); double-click RESET; A4; A5 toast with the account loaded; row chainId equals the seed; addresses, names, indexes kept; Local untouched | the unlock → classify → bootstrap → takeover → router chain runs only in the real shell, and A5's account load races the switch handler only there | 40 s |
| S1b | Address change on Testnet (A2), with one hidden account and one account imported through the UI: Nulo_v1 addresses become the true derivation; the hidden one stays hidden; the imported account survives at its address and its key opens (re-export preview); "new addresses" toast | the journal's reseal, the purge of key rows and the ciphertext check run together only in the real worker. The helper moves only Nulo_v1 address rows, so it needs no DEK; both causes with an imported key are unit-tested with real seal and unseal | 35 s |
| S1c | Mainnet A6: one button; a user-data storage snapshot is unchanged after Switch | only a full popup run shows that no bootstrap, seeder or default-account path writes to Mainnet's rows | 20 s |
| S1d | R2: deleting, from Networks, the network that holds the new chain brings back A1 (D56) | the re-read hangs on the shell's watcher of the network list, and `app.vue` has no harness | 10 s (measured 7.4 s, Chrome) |

A mixed tamper that still blocks the profile is not an e2e: the coordinator unit test and `AccountIntegrityBarrier.test.ts` prove it.

**Network e2e**, `NULO_E2E_PROVERLESS=1 bun run e2e:agent`, Chrome and Firefox, sandbox. All three run in the proverless pool; N2 and N3 carry `@requires-proverless`, because only proverless builds construct `RestoreGate` (`X/wallet/runtime.ts:487`). Re-keying a row's chainId, or moving every address on a chain, is exactly what an update looks like to the classifier, so no rollup knob is needed. Gap: the sandbox keeps its chain state, where a real reset starts empty.

| # | Failure mode | Why no cheaper layer | Est. per browser |
|---|---|---|---|
| N1 `network/stale-network-reset.test.ts` | Both causes on Local (the #324 shape): Local re-keyed off chainId 0 with every address moved, on a profile that never activated Local, accounts funded from the harness. A1 with the address line; after the reset the row is at 0, a fresh PXE store syncs, the balance is right, a send lands, history holds only new rows | a chainId rewrite followed by a real PXE sync, proof and send needs a node | 150 s |
| N2 `network/stale-network-chaos.test.ts` | Stale Testnet next to live Local with a connected playground dApp. Hold at `network-reset-purging`: a popup opened on Local shows A4; a dApp send on Local waits, not refused. Release: the held send lands; the toast shows once; Local rows equal the snapshot plus that send's rows; the dApp session row is unchanged; Testnet accounts sit at the new chainId | a held dApp request crossing a real purge, and a second popup, need the real worker and ports; the 60 s cap and the purge's own-chain drain are unit tests | 150 s |
| N3 `network/stale-network-resume.test.ts` | Stale Testnet, both causes: hold at `network-reset-purged` (purge persisted, row not yet rewritten), the harness sets the stored active network to Local (the run lock leaves the popup no controls), close the popup, `stopBackground`, reopen on Local, unlock: A4 shows on Local while the resume runs, the row is rewritten, accounts come back, the toast shows once, Local still syncs. Then address-only, held at `network-reset-account` with two accounts: no duplicate rows. Pages close first so Firefox can end its event page (`apps/extension/tests/e2e/FIREFOX.md`) | a real worker death and Firefox's event-page lifecycle; unit tests resume from a journal, not from a killed worker | 120 s |

Owner's chaos list → tests: other network keeps working (N2 after the hold, N1; during a run new work waits by design, D40); worker kill and resume (N3); repeated clicks (S1a, unit, component); a send in flight (N2's held send; on the stale chain sends are refused at admission, unit); works after the reset (N1). Budget: about +95 s smoke and +420 s network per browser.

**Running the gates.** Smoke needs the armed build, and `audit:vue` ends with a production build that replaces it, so the armed build always comes after `audit:vue`:

```sh
VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome   # and build:firefox
NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension test:e2e --retry=0 <files>   # smoke defaults to retry 2; add NULO_E2E_BROWSER=firefox
NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent <files>   # builds its own wallet; add NULO_E2E_BROWSER=firefox
```

## Docs

- **`CLAUDE.md` § Account-address freeze.** Rewrite "Runtime mismatch is a handled state": mismatches are classified per chain; a mismatch confined to one chain quarantines it; a non-Mainnet chain whose seeded identity or every derived address moved is offered an in-place reset by a screen that never solicits the seed; Mainnet is quarantined with no reset; anything else withholds the session behind `AccountIntegrityBarrier`, which offers no CTA. Only that bullet: the freeze intro and the bullets above it (A1's policy, the regimes, the extension-major text) belong to the aztec-rc3 plan; whichever PR lands second rebases over the other's text.
- **`ARCHITECTURE.md`.** Session model: a quarantined chain does not withhold the session. dApp scope: `CHAIN_NOT_SUPPORTED` on a quarantined chain; a reset deletes the chain's dApp sessions; new requests wait while a reset runs. Concurrency: secret, then network lock; the purge runs under a reservation, outside the lock; the run lock is memory-only. Storage: the record, the journal, the guards.
- **`.claude/skills/aztec-update/SKILL.md` Branch B.** The client-side reset is the in-place reset the classifier offers on first open: no migration, no network deletion. A reset bump runs S1 and N1 on both browsers. A Mainnet derivation change stays new-major territory.
- **Existing tests unchanged:** `AccountIntegrityBarrier.test.ts` (including `:96`), `runtime-mismatch.test.ts` (the startup-window path), `blocked-repository.test.ts`, the profile delegate tests, the `purgeChain` and `deleteNetwork` tests, `import-paths` and `imported-account-lifecycle` e2e. No existing assertion flips; the owner's decision lands as new tests and doc text.

## Phases

### Phase 1. Seeds, classifier, records ✓

1. Move the seed constants to `S/network/seeds.ts` with no behaviour change.
2. Add `S/stale-network/{types,classify,repository}.ts` with their unit tests.
3. Add `NetworkService.isChainQuarantined`.

**Validation gate:** `bun run --cwd apps/extension test src/wallet/services/stale-network src/wallet/services/network`, `bun run lint`, `bun run typecheck:all`. Pass: all exit 0; the existing network tests pass unedited.

### Phase 2. Narrow the integrity block ✓

1. Make `verifyProfile` derive every row, classify and write the record with compare-and-set.
2. Add `persistIntegrityVerdictIfLive`; clear both keys on profile deletion.
3. Route the runtime mismatch through the coordinator delegate, merging one record entry.

**Validation gate:** `bun run --cwd apps/extension test src/wallet/services/account-integrity src/wallet/services/profile src/wallet/services/account`, `bun run lint`. Pass: green with existing assertions unedited; no new complexity directive.

### Phase 3. Guards ✓

1. Add the six AccountService guard sites.
2. Chain-scope the transaction purge; add the dApp-session chain purge (narrowed to the reset by D48).
3. Register the PXE chain guard; add the dispatcher adapter and the discovery change.
4. Make the seeder and the incoming poll skip quarantined scopes quietly.

**Validation gate:** `bun run test`, `bun run lint`, `bun run typecheck:all`. Pass: all exit 0; each guard test fails when its guard line is removed.

### Phase 4. Reset service ✓

1. Add `resetChainInPlace` with the lock limited to reservation and rewrite.
2. Add the `createAccountInternal` overrides and `recreateForReset` with the ciphertext check.
3. Add the `network-reset` spec, service, client, runtime wiring and the three hold points.
4. Make `NetworkResetService` watch the record and emit `onStaleNetworkChanged`.
5. Make `deleteNetwork` refuse during a run and clear an idle journal; make `addNetwork` refuse quarantined chainIds.
6. Refuse full-backup export while a journal exists, in `exportFullBackupKeys`.
7. Add the run lock, ingress wait, `takeResetNotice`, A6's probe, `switchToSeedNode` and `ERR_NODE_UNREACHABLE`.
8. Move `ImportedAccountUnusableError` into `@nulo/extension-messaging` as a `WalletError`.
9. Add the service unit tests and the composition test.

**Validation gate:** `bun run audit:vue`, `bun run test:ci-gating`, then the armed smoke build and the full smoke suite on both browsers, then `bun run e2e:agent` on both browsers, all as § Running the gates, at retry 0. Pass: all exit 0; no existing e2e regresses on either browser.

### Phase 5. Popup takeover ✓

1. Add the store field, the client in `managers`, `useStaleNetwork`, and the bootstrap and switch skips.
2. Add the bootstrap resume through `getPendingReset`.
3. Add `stale-takeover.ts`, the takeover, the dialog and `copy.ts`; mount them in `app.vue`.
4. Hide the Terms sheet while the takeover shows.
5. Add R1–R4, A1's node line, A3's notice, A4 under the run lock, A2's automatic run and the notice toast.
6. Hide the Header account group on a quarantined network; add the Full Backup notice and A10's toast.
7. Add the component and helper tests.

**Validation gate:** `bun run audit:vue`, `bun run --cwd apps/extension build-storybook`. Pass: green; the copy, order, phishing and keyboard pins pass.

### Phase 6. Smoke e2e, captures, sign-off

1. Add `seedStaleNetwork` and `tests/e2e/stale-network.test.ts` (S1a–S1c).
2. Ignore `apps/extension/tests/e2e/.captures/` in the root `.gitignore`.
3. Add the opt-in captures file; capture every state in both themes.
4. Put each capture beside its reference; send them to the owner; record the quote.

**Validation gate:** the armed smoke build, then `tests/e2e/stale-network.test.ts` and the full smoke suite on both browsers at retry 0 (§ Running the gates), then `STALE_NETWORK_CAPTURES=1 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension test:e2e tests/e2e/stale-network-captures.test.ts`. Pass: both browsers green; every capture produced and none tracked by git; the owner's sign-off quoted.

### Phase 7. Docs ✓

1. Rewrite the `CLAUDE.md`, `ARCHITECTURE.md` and Branch B text.
2. Dedupe, then file each known limit as a closed `known-limit` issue.

**Validation gate:** `bun run check:plans`, `bun run lint`. Pass: both exit 0; the docs name only live paths.

### Phase 8. Network e2e and chaos

1. Add N1, N2 and N3.
2. Measure each scenario and record the numbers in this plan.

**Validation gate:** `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/stale-network-reset.test.ts tests/e2e/network/stale-network-chaos.test.ts tests/e2e/network/stale-network-resume.test.ts`, the same under `NULO_E2E_BROWSER=firefox`, then production `bun run build:chrome` and `bun run build:firefox`. Pass: all three green on both browsers, three runs in a row; `agent.sh`'s positive proverless-stamp check passes; the production bundles hold no `nulo:e2e:restore-gate` string.

## Decision ledger

Sources: **M** main leg, **C** Codex leg, **F** Opus leg; **K** contradiction check; **audit** the double audit and **final** the final pass (C or F names the reviewer).

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | Detection compares storage with the build; no node probe | M, F (C agrees for seeds) | accepted |
| D2 | `addressesMoved` = every Nulo_v1 row on a chain moved and a network row owns it; else profile block | M, F | accepted; C disputes (D20) |
| D3 | Reseal imported keys into the journal before the purge | C, F | accepted (M's unseal-after-purge rejected: a bad key would surface after deletion) |
| D4 | Chain-scoped transaction purge (F11) | C, F | accepted |
| D5 | Reuse `ChainNotSupportedError` | F | accepted (M's new error class rejected) |
| D6 | PXE client chain guard | C, F | accepted |
| D7 | Dispatcher adapter + discovery `served`; `dropStaleSession` unchanged | F | accepted (M's `servesChain` change rejected: it drops Mainnet sessions, against A6) |
| D8 | Seeder skip burns no attempt; a seeding pass runs after the lift | F, K | accepted (the trigger was missing: F19) |
| D9 | Bootstrap and switch skip `ensureDefaultAccount` on a quarantined chain | C, F | accepted |
| D10 | Popup-driven resume at every bootstrap, any active network, in the foreground under the run lock | F, K, owner | accepted (takeover-mount-only resume missed a switch: K) |
| D11 | Targets come from `seeds.ts`; the purge scope is the named row's chainId; a fresh verdict is needed on first admission only, since a resume may follow a purge that deleted the rows a verdict reads | F, M, K, audit | accepted |
| D12 | Run returns at once; progress by events and view reads | C, F | accepted |
| D13 | `confirmed` = cause + count against a fresh classification | F | accepted, the light form of C's token |
| D14 | Terms sheet hidden while the takeover shows; export path yields | M, C, K | accepted; F's "Not now reveals the takeover" was false (F16) |
| D15 | A3 on `Popup`, initial focus CANCEL | M, F, C | accepted |
| D16 | Target chainId held by another row: refuse, shown before RESET as R2 | C, owner | owner A13 (realistic during #324: K); adoption declined |
| D17 | Keep user endpoints; seed endpoint added | M | accepted; its primary rule is superseded by D43 |
| D18 | Three arcs + close-out, merged together | M, F | accepted; C's nightly concern rejected: no arc changes seeds or derivation, so no stale state exists between arcs. #324 (the aztec-rc3 plan) may land first; until arc 2 ships, an rc.1 profile meets today's `AccountIntegrityBarrier` (pre-production, no migration), and no rc.3 build goes to the stores before it |
| D19 | No A5 replay when the reset finished with no popup open | F | superseded by D44 |
| D20 | Historical address verification and a transition manifest | C | rejected: a chain-confined mismatch is quarantined, so its rows are never used, whether the cause is a build change or a tamper; on Testnet the reset heals from the master, on Mainnet nothing changes; verifying V2-separator addresses inside an rc.3 build couples the wallet to old Aztec internals |
| D21 | HMAC-authenticated journal | C | rejected: structural validation (the row-bound purge scope, the `purged` ordering, the ciphertext check, the Mainnet refusal) limits a forged journal to the chain of an existing non-Mainnet row, which a storage writer can already delete |
| D22 | Gate restored chains until boot verification lands | C | rejected: the predicate computes the network cause live from the row, so a seeded chain is quarantined from the worker's first instant; an address-only move fails `getAccountContract` first (I2, I3) |
| D23 | Execution drain, cancellation and a quarantine check at broadcast | C | rejected: no send can be admitted on a chain before its quarantine (I3, D22) |
| D24 | Scoped fee-selection entries | C | rejected: orphaned selections fall back (I4); N1 sends after a reset |
| D25 | Full backup during a reset | C, K, owner | owner A11: refuse, with a page notice |
| D26 | Network e2e with a build-time seed override aimed at the sandbox | C | rejected; K's coverage gap closed by N1 (a chainId rewrite on Local, then a real send) |
| D27 | Runtime mismatch through a coordinator delegate | M, C | accepted (F kept today's block; one path for every trigger is simpler to reason about) |
| D28 | dApp sessions on a purged chain are deleted | C, K | accepted: an address-only reset left sessions that auto-approve with zero accounts (F8); narrowed to the reset by D48 |
| D29 | Await account-purge subscribers on a chain purge | C | rejected: token balances purge through `onTokenDeleted` (`S/network/service.ts:884-886`; not awaited, `S/token/service.ts:253`, and no path depends on it), and the transaction purge is awaited in the run |
| D30 | Purge outside the network lock, under the reservation | C, K | accepted: other chains' `getNode` must not wait on a stale chain's PXE drain |
| D31 | Drop the journal's `activeIndex` | K | accepted: the active account is popup state (F17) |
| D32 | Persist `purged` before the row rewrite | audit (C) | accepted: a rewrite first would leave a resume purging a chain the row no longer names |
| D33 | `deleteNetwork` refuses during a run and removes an idle journal and record entry | audit (C, F) | accepted: the user's exit from a reset that cannot finish |
| D34 | A custom row's L1 is probed once at capture, before anything is deleted | audit (C) | accepted: after the purge no probe may decide anything (A5) |
| D35 | The switch handler awaits `syncStaleNetwork(target)` before its account steps | audit (F) | accepted: switching back to a stale network otherwise loads its accounts |
| D36 | The view upgrades to the address variant when an imported key derives another address | audit (C) | accepted: A1 must not promise unchanged addresses that will move |
| D37 | An imported key that does not open is left out of the reset | audit (C), owner | owner A14: left out and named in A3 |
| D38 | S1b is address-only with a UI-imported account | final (C) | accepted: a stale chainId needs the key resealed under the restored DEK, which a test cannot read; both causes with imported keys stay in unit tests with real crypto |
| D39 | The journal's `l1ChainId` must equal the seed's L1 (seeded kind) or the row's (custom) | final (C) | accepted: closes the forged-L1 path without authenticating the journal (D21) |
| D40 | Run lock in worker memory for a run only: every popup shows A4; new dApp requests and discoveries wait, at most 60 s | owner (A16) | accepted; a persisted lock, or one held while paused, rejected: a reset that keeps failing would block every network, against "only the stale network" |
| D41 | A seeded network cause with no account rows runs by itself behind the loader | owner (A2), delta (C) | accepted; needs the recomputed cause (D47) and empty `unmovable`, which `confirmed` carries |
| D42 | R1–R4 come from the view; R2 and R3 show before RESET | owner (A4) | accepted; replaces the generic toast |
| D43 | A user's primary stays primary only if it serves the new chain; A1 announces a switch | owner (A6), delta (C) | accepted; one single-attempt 5 s probe of the user's own node, cached per endpoint, never blocking; `confirmed` and the journal carry the decision and its endpoint, re-checked under the network lock |
| D44 | A completion no popup saw is announced once at the next open | owner (A8), delta (C) | accepted; one notice key, taken under the record lock and only once the journal is gone |
| D45 | The Header shows its account block only for an account on the active chain | owner (A15), delta (C) | accepted over the empty "PRIMARY ACCOUNT" header; the chain match also hides the previous account during a switch |
| D46 | No copy promises re-importing an old key file after an address change | review 2 | accepted: `decodeAccountExport` refuses a file whose claimed address the current derivation does not give (`S/account/service.ts:831`); known limit |
| D47 | The view recomputes `cause.networkReset` from the row; a network cause needs `fromChainId ≠ toChainId` | review 2 | accepted: A2's automatic run must not start from a forged record |
| D48 | The reset deletes the reset chain's dApp sessions in its own purge step, not through every chain purge | Phase 4 gate | accepted: a chain-purge subscriber also deleted a deleted network's sessions, which `connect-unserved-chain.test.ts` pins as kept until the next connect drops them (so a network added back keeps them) |
| D49 | The unusable-imported-account error never names the account | arc 2 review (C) | accepted: every log line that printed it carried the address; fixed in the message, not at each log site |
| D50 | The popup's per-session stale-network state lives in a session that every lock, unlock and profile change replaces | arc 2 review (C) | accepted: four rounds of fences for one interleaving each showed the class; an ended session writes nothing and holds back nothing of the next |
| D51 | `takeResetNotice(profileId)` hands a notice only to the profile still active | arc 2 review (C) | accepted; a take answered for a profile that ends before the answer lands loses one toast, which a peek-and-acknowledge record would not justify |
| D52 | A dApp window takes no part: no takeover, no resume, no notice, no route | arc 2 review (C) | accepted: a completion routed a dApp window to Home |
| D53 | The takeover closes every popup open over the route when it appears | arc 2 review (C) | accepted: Receive's address outlived a takeover that started under it; listed for the owner's capture sign-off |
| D54 | A run that moves no account shows the loader (a spinner, no copy) in every popup; the popup that started it keeps the loader until the store holds the row's new view | arc 2 loop (C) | accepted: "a run with N = 0 shows the loader" had no screen behind it, so the starting popup stayed interactive while another popup showed A4; listed for the owner's capture sign-off (A4c) |
| D55 | Send and Receive act only on the active network's own account | arc 2 loop (C) | accepted: a stale target's view waits up to 5 s for A6's probe while the store still holds the previous network's account, whose address Receive would show under the new network's name; the buttons look the same and do nothing until the Header shows the account |
| D56 | Adding, renaming or deleting a network re-reads the active network's stale view | final pass (C) | accepted: R2 kept its cached holder after the user deleted it from Networks, with no way to reset; S1d pins the shell's wiring |
| D57 | A10 is captured by an opt-in file of the network suite | Phase 8 | accepted: the Send page reaches a send only over a live node's balance, which the smoke suite has not |

## Audit verdicts

### Contradiction check, 2026-10-13

- **Opus leg (resumed), 12 material.** Accepted: A5 load order, `activeIndex`, endpoint test vs Ask A6, Terms path (F16), `deleteNetwork` journal leak, runtime delegate test and emitter, refusal handling, A2 note, A4 frame, toast style (Ask A8), dApp notice copy (Ask A12), backup (Ask A11), plus minors (chokepoint count, N = 0 and variants, two ledger rows, A5 replay as an Ask).
- **Codex leg (resumed), 14 material.** Accepted: compare-and-set failure path, network lock across the purge, forged `fromChainId`, unchecked ciphertext, backup, resume after a switch, A5 replay as an Ask, Terms precedence, A2 note, seeder trigger, a chainId-rewrite network test, imported-only chains as Ask A10. Rejected with reasons: universal-mismatch as a fail-closed break (D20), in-flight sends (D23, I3), nightly between arcs (D18).

### Double audit, 2026-10-13

- **Codex (fresh, gpt-6.1-sol high): reject.** Blockers: a rewrite before `purged` stranded the resume (D32); an address-only resume had no verdict to read (D11). Majors: a full backup during a reset (A11), a target-collision race (A13, the rewrite re-check), the lenient boot race (D22, the live network cause), imported-only and network-cause copy (D36), A5 waiting on the account load, the e2e gates (§ Running the gates). Minor: a reason per e2e scenario. All accepted except a backup that straddles a whole reset, which is a known limit.
- **Opus (fresh Plan agent): approve with fixes.** 15 findings, all accepted: six guard sites, the emitter in Phase 4, real seal and unseal with two imported accounts in unit tests, an S1b fixture (superseded by D38), the `.captures/` ignore, the A3 order pin, the switch-handler sync (D35), `deleteNetwork` during a run (D33), the networks-page Header (A15), and minors.

### Final Codex pass (fresh, gpt-6.1-sol high), 2026-10-13

**Reject**, with four majors and two minors; each was verified against the code and all six are accepted:

1. A forged journal's `l1ChainId` reached the derivation override (D21 did not cover it): validate it against the seed or the custom row (D39).
2. Capture's DEK use was ambiguous: the unseal wipes its copy, so the seal takes a second copy.
3. S1b's known backup DEK is the source DEK, not the restored one (`S/profile/service.ts:2358`): S1b becomes address-only, so the helper needs no DEK (D38).
4. `RestoreGate` exists only in proverless builds (`X/wallet/runtime.ts:487`): N1–N3 run with `NULO_E2E_PROVERLESS=1`, the existing pool's mode.
5. Popup already has an upper close area: A3 adds only a lower spacer.
6. A switch into quarantine kept the previous network's account in the Header: the handler clears it (A15).

**Verification (same session, resumed): approve.** All six fixes are consistent with the plan and the source; no new material finding. D20, D22–D24, D26 and the rejected halves of D3, D5, D7 and D18 held; D29 holds with a note.

### Review round 2 (owner), 2026-10-14

The owner answered A1–A15 and proposed the run lock (A16). Ten boards for failures and edge cases, and A1's node line, were added to the layout A canvas and approved with the answers. One code finding: an old key file cannot be re-imported after an address change (D46). **Codex delta check (resumed, gpt-6.1-sol high): reject**, four majors and three minors, each verified against the code and all accepted: the automatic run ignored unmovable rows (D41); a crash between the notice and the journal delete could announce twice (D44); the A6 cache ignored a primary changed after A1, and the named probe retries far past 5 s (D43); discovery bypassed the run lock (D40); the Header could show the previous account during a switch (D45); N3's switch was impossible under the lock. **Verification (resumed): approve with fixes**: the endpoint decision also needed a check at commit time (`probedEndpoint`, re-read under the network lock), and the Header predicate kept the quarantine check and gained a profile match; both applied. **Third round: approve with fixes**: an in-place URL edit kept the endpoint id, so `probedEndpoint` binds the URL too; applied. The loop stops here (three rounds). **Owner approval, 2026-10-14:** "Sounds good. But shouldn't we use skeleton so it doesnt just flash out of nowhere? Approved."

### Arc 1 Codex fix loop (gpt-6.1-sol high), 2026-10-14

Over `1ba770cf..5785b342`, then each fix. **Round 1 (fresh): 4 material.** Accepted: a full backup could omit accounts while a reset ran; a capture could write a journal after the profile's deletion cleared it; a network added on the target chain during capture. Rejected: a guard on transaction polling of a quarantined chain, a new guard surface the plan sends to the owner (it reads chain truth for rows the reset deletes). **Round 2 (resumed): 2 material, accepted**: the passkey backup slices re-check the journal after their reads; an obsolete runtime verdict writes nothing. **Round 3 (resumed): 1 material, accepted**: a chain that classifies clean at runtime refuses the operation instead of blocking the profile. **Round 4 (resumed, verifying round 3): "VERDICT: no new material findings".** Fixes in `8eb26c66`, `712809f4`, `f4d8912f`. The network gate then found D48 (`908455f4`); **round 5 (resumed, verifying it): "VERDICT: no new material findings"**.

### Arc 2 Codex fix loop (gpt-6.1-sol high), 2026-10-15

Over the Phase 5–7 commits, fresh; a preliminary pass on the uncommitted code had converged (D49–D53), and this one was told its convergence was not evidence. **Round 1: 3 material, all accepted**: a completion that reached a booting popup before its session began left it on A4 with no account (the resume catches up); Receive could show the previous network's address while a stale target's view waited on A6's probe (D55); an automatic run showed nothing in the popup that started it and A4 in another (D54). The low ones: A1 and A3's type roles, itemized in `lessons/phase-6.md` for the sign-off, and a comment's history. **Round 2 (resumed): 2 material, accepted**: an ended session's automatic run kept the next session behind the loader; the catch-up and the completion event could both run one completion. **Round 3 (resumed): "VERDICT: no new material findings"**. Fixes in `8d28bfd6`, `02d3a5fa`, `5713f56b` (SHAs after the arc was rebased onto the final pass's arc 1 fix).

## Delivery

Trunk `dev`; `gh stack submit --auto`; **merge the whole stack together**. `code_review` is `off` on every arc.

| Arc | Phases | Branch | PR title |
|---|---|---|---|
| 1 | 1–4 | `stale-network-reset-1-quarantine` | `feat(network): classify stale networks per chain and reset them in place` |
| 2 | 5–7 | `stale-network-reset-2-takeover` | `feat(popup): stale network takeover with in-place reset` |
| 3 | 8 | `stale-network-reset-3-e2e` | `test(e2e): stale network reset on a live sandbox, chaos and resume` |
| close-out | — | `stale-network-reset-close-out` | `docs(plans): close stale-network-reset` |

Every body: `Refs #324`. Arcs 2 and 3: each browser's suite wall-clock before and after. Arc 2: the captures beside the references and the owner's sign-off quote. A comment on #277 notes the reset inherits its stall for the stale chain only.

## Post-implementation

Follow [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `d01569a2`. Plan-specific settings:

- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc while that arc is the stack tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. The prompt carries the arc map, this plan and its ledger, the adversarial ask, the two rules verbatim, and a UI-fidelity check against § UI fidelity. A final fresh session covers the net diff from `1ba770cf`.
- Approval boundaries: a change to the record or journal shape, a new guard surface, or any copy change is a plan change that stops for the owner.
- Known limits, each a closed `known-limit` issue: imported-only chains, and the refused re-import of an old key file after an address change (A10, D46); codec-hidden rows on a reset chain; the lenient-mode boot bounce (I2); custom-network node reset not detected; a corrupt journal after the purge; one journal per profile (R3); a full backup whose reads straddle a whole reset (A11); an imported key that does not open is dropped (A14). Filed as #468–#475, with #476 for D51's lost toast; #427 already held the imported-only half of the first.
- #262 stays closed; its admission rules are unchanged, which a review confirms.
- Close-out on `stale-network-reset-close-out`: merge `origin/dev`, reconcile `index.md` and `lessons.md` by reading them, write the Outcome, promote lessons, file open items, `git mv` into `archive/` in its own commit, `bun run check:plans` green. Then report and wait: merging is the owner's call.
- Teardown after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/stale-network-reset/plan.md` succeeds, `ExitWorktree` with `keep` (when entered through `EnterWorktree`), then `agent-worktree done stale-network-reset --merged`. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds

ELI5: https://claude.ai/artifact/YFVfFHJm7zTeQsZQ94uqK1 (private), published from the local, gitignored `implementations-plan/stale-network-reset/eli5.html`. Use exactly one seed per session, inside this worktree (`agent-worktree resume stale-network-reset`).

**Recommended, `/goal`:**

```
/goal All eight phases marked ✓ in implementations-plan/stale-network-reset/plan.md (the phase headers in the file, not the chat or the task list), each ✓ backed by its phase's validation gate, as plan.md defines it, reported passing in the transcript at retry 0; for each phase the agent has printed `LESSONS_FILE=implementations-plan/stale-network-reset/lessons/phase-N.md` in the transcript; `/code-review` was NOT run (plan.md says code_review: off); the codex fix loop (gpt-6.1-sol, high) converged at each of the three arc boundaries and in the final cross-arc pass, each convergence evidenced by a resumed codex pass reporting no new material findings, quoted in the transcript; the arc 2 PR body shows every capture beside its ui-spec reference and quotes the owner's sign-off naming each surface; the stack of three arcs plus the close-out exists on GitHub, created only AFTER all loops converged (`gh stack view` output in the transcript), including the close-out that archived the plan (`git show --stat` of the archive-move commit in the transcript); `bun run test` and `bun run lint` both report exit 0 in the transcript. Never merge: merging is the owner's call.
```

**Fallback, `/loop`:**

```
/loop 15m Drive implementations-plan/stale-network-reset forward. Never idle waiting for my input. Each firing:
1. **Reality check**: read implementations-plan/stale-network-reset/plan.md and lessons/ (authoritative state, not the chat), including its Outcome & Quality Bar and UI fidelity sections: every step is judged against those, not just against "it runs". On the stack, read them from the TOP layer (`gh stack view` names it; `git show <top-branch>:<path>`), never from a lower arc's checkout. If that path is gone, the close-out has run: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/stale-network-reset/plan.md` succeeds → it merged and the plan is done: run the teardown now, without asking — `ExitWorktree` (`keep`) if this session entered the worktree through `EnterWorktree`, then `agent-worktree done stale-network-reset --merged` — report what it removed or, if it refused, its output verbatim (never force past a refusal), clear this loop and STOP. Fails → delivered and awaiting my merge: babysit only (CI per step 2, fixes on the arc they belong to then `gh stack sync`, keep the Outcome true), never resume a phase or read the archived plan as a task list; once every PR is green, report that once and STOP. A live plan.md that already carries an `## Outcome` block means a close-out was interrupted: finish it. Otherwise, native task list empty? rebuild it from plan.md, one task per remaining step; run `git status` and `git log --oneline -5`. If a PR exists, `gh stack view` and `gh pr view --json statusCheckRollup` (no --watch). Without a PR, `gh run list --branch $(git branch --show-current) --limit 1 --json status,databaseId`.
2. **Waiting on CI is fine**: confirm it is progressing (`gh run watch <run-id>` up to 10 minutes; stuck past that → inspect logs, log it as blocked in lessons). Use the wait: review the diff, prep the next phase, strengthen tests. Don't start work that would conflict with the in-flight change.
3. **No task in hand?** Pick the next pending step from plan.md and start it. After each meaningful edit run `bun run lint` + the touched package's tests. Then commit → `gh stack push` (`gh stack sync` if dev or a lower arc moved).
4. **Stuck, or facing a decision you'd normally bring to me?** Call `/codex high` (gpt-6.1-sol) with full context and go back and forth until you reach a defensible decision, then act. Log every consult + verdict in lessons/phase-N.md. Hard limits stay hard: never merge, never publish or deploy, never expand scope beyond plan.md, and any change to copy, screen layout, the record or journal shape, or a new guard surface stops for the owner (plan.md § Post-implementation).
5. **Same step failed 5 times?** Stop retrying; reassess with codex, then continue down the agreed path.
6. **Phase green?** Green means THE PHASE'S VALIDATION GATE as written in plan.md passes at retry 0 (smoke e2e needs the armed build after `audit:vue`; see plan.md § Running the gates). Paste the result, mark ✓ in plan.md, file the lessons entry, print `LESSONS_FILE=implementations-plan/stale-network-reset/lessons/phase-N.md`, advance. Arc boundary crossed (phases 4, 7, 8)? Run the codex loop on the arc diff with the arc map, plan.md's ledger and the no-over-engineering + comment-quality rules until a round yields nothing material, THEN `gh stack add <next-arc-branch>`. Phase 6 needs my sign-off on the captures: ask once, keep working on phase 7 while waiting.
7. **All phases ✓?** Run the final cross-arc pass: FRESH codex session over the net diff from 1ba770cf + cross-arc ask (seams, duplication, plan drift, UI fidelity) + the two rules, same loop-until-clean. Then `gh stack sync` → `gh stack submit --auto` + `gh pr edit` bodies per plan.md § Delivery. Then the close-out: `gh stack add stale-network-reset-close-out`, its commits per plan.md § Post-implementation, `gh stack submit --auto`. Then `gh pr checks --watch`. Then the wrap-up report: what shipped, every contentious decision codex and I debated, each with ELI5 context, and open items by issue number. Surface and stop; merging is my call.

Keep the native task list current (`TaskUpdate`); plan.md stays the source of truth.
```
