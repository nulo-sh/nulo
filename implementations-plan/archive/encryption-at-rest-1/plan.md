---
plan: encryption-at-rest-1
tier: deep
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 2f591ddd
trunk: dev
status: completed (delivered as #924, #1029, #1043 and the A4 PR)
issues: "#522 (Closes, last arc)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** delivered in four PRs against `dev`, none stacked: A1 #924 (`6d507c611`), A2 #1029 (`11439b1be`), A3 #1043 (`5c35ca934`), and A4, which carries this close-out and `Closes #522`; its merge closes the plan.
- **Shipped:** every profile-scoped root but the profile row is sealed per row under keys derived from the profile's master, with the dual read for legacy rows and conversion at the profile's unlock: contacts and dApp sessions (A1); the journal and the transaction history (A2); balances, the authwit registry and its flags, the five incoming roots (A3); accounts and imported keys, tokens and the seeder's marker, networks, fee payers and the dApp registration counts (A4). Ids that named an address or a hash take its keyed hash; the integrity stamp and the stale-network record store a keyed digest; the root census refuses an unreviewed plaintext family; the lane's stamps (1, 2 and 4) are additive and pinned; privacy 1.2.3 and the store listing say what is encrypted (OA-3).
- **Review loop:** the plan took the contradiction check, the double audit and the final pass below. The arcs: A1 Codex 3 medium and Opus 3 low, then Codex approve; A2 Codex 1 medium and Opus 1 low, Codex 1 medium, then approve; A3 Codex 2 medium and Opus 3 low, Codex 1 medium, then approve; A4 Codex approve with 2 low and Opus approve with 4 low, Codex 2 low, then approve. Every finding and its fix is in `lessons/phase-1.md` to `phase-4.md`.
- **Gates at the A4 head** (code at `4bc9dc78e`, retry 0): lint, `typecheck:all`, `test:all`, `test:ci-gating` and `check:plans` green; the network gate (`backup-restore-integrity`, `backup-migration-roundtrip`, `profile-reimport-matrix` and nine specs whose readers changed) proverless on Chrome and Firefox, 33 of 33 each; `frozen-account-canary` prover-ON on both; the update replay from v0.31.0 on both, with the identity scan; the full smoke from fresh armed builds on both (Chrome 61 files, Firefox 65, none failed). The table is in `lessons/phase-4.md`; the CI soak of the changed network files is run 39805838159, reported in the PR body.
- **Measured against the 50 ms rule:** A1's contacts list over 2 000 rows, over on Firefox, accepted (P74-03); A3's Home balance read over 2 000 rows, over on Chrome, awaiting the owner (P83-03, below); A4's unlock to Home and incoming load on the recorded install, within it on both browsers (`lessons/phase-4.md`).
- **Deviations:** A1 landed inside 1.0.0 (P74-01); the dApp registration counts, disclosed as plaintext until A4, were sealed in A4 as app permissions; the per-profile value store kind left once no store used it; a failed conversion pass waits for the next worker, not the next unlock (`lessons/phase-4.md` § Review).
- **Dropped:** the `nulo:ui:*` keys left the lane (D26: #1051, #1062); the quieter downgrade read stays proposed, not built (`lessons/phase-3.md`, `phase-4.md`).
- **Owner decisions:** P74-01, P74-02 (OA-4), P74-03 (OA-5) and P70-07 (OA-3), all A, under Outcome & Quality Bar; OA-1 shipped its default A; OA-2 needed no answer.
- **Known limits:** #1052 (KL-1), #1053 (KL-2), #1054 (KL-3), #1055 (KL-4), #1056 (KL-5), #1057 (KL-6), #1058 (KL-7), #1059 (KL-9), #1060 (KL-10), #1061 (KL-11), #1062 (KL-12), each closed with its reopening condition; #1059 records the measured rollback round trip.
- **Open items:** #1050 (the unlock-time migration pass, KL-8) and #1051 (the `nulo:ui:*` keys behind the worker); `BEFORE-LAUNCH.md` § 4's item for the release that publishes privacy 1.2.3; P83-03, the owner's call on A3's Home balance read, on the orchestrator's decision page.
- **Lessons:** one line in `lessons.md` extended (`getAll()` hides a sealed root's unopened rows); the rest stay in `lessons/phase-0.md` to `phase-4.md`.
- **Seeds retired:** the `/goal` and `/loop` under Seeds; they are no live instructions.

# encryption-at-rest-1: seal each profile's rows in `chrome.storage.local` under a key only an unlocked profile derives

Four arcs. Each is one PR against `dev`, not stacked (the orchestrator's D-orch-1), and each lands after #865's registry (its A1) and freeze (its A4, #938) are on `dev`. A1 lands inside 1.0.0 (P74-01, under Outcome), and the 1.0.0 promote waits for it; A2 to A4 land after the promote.

- **A1** builds the sealing layer and proves it end to end on contacts and dApp sessions.
- **A2** seals history (the journal and transactions), including the writes that land after a lock.
- **A3** seals the projections of private state (balances, authorizations, the five incoming roots).
- **A4** seals accounts, imported-key rows, tokens, networks and fee payers, keys the integrity digests, updates the docs and the privacy text (OA-3), and says `Closes #522`.
- **Not in this lane:** the address-bearing UI preference keys (`nulo:ui:*`). They are `structured` shapes, which #865 lets no migration touch and no release remove; moving them needs #865 to grow a retirement path first (D2, follow-up issue).

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

Over the deep tier's 600-line target. The audit trail of four review rounds is recorded inline as the deep tier requires, and the per-arc e2e reader floors and check-then-write inventory are what an implementer needs to keep each arc's gate green.

Path notation:
- Paths are relative to `apps/extension/src/` unless they start with `apps/`, `packages/`, `scripts/`, `tests/`, `legal/` or a root file name.
- `S` = `wallet/services`.
- Line numbers are at `2f591ddd`.

## #522, the lane brief, and what did not hold

- **#522 holds**: every root it lists is a plaintext JSON row (recon, inventory).
  - Its impact line understates the leak. Several storage KEYS carry an address or a hash:
    - `S/account/spec.ts:30-32`;
    - `nulo:core:txs@<txHash>`;
    - the incoming roots' `note:`/`pub:` ids and `p|net|acct` keys.
  - So sealing values alone would leave addresses and history readable.
- **The orchestrator's "no OPFS" holds; one of its reasons does not.**
  - OPFS encrypts nothing. The PXE store's protection is sqlite3mc's cipher under a key we derive (`packages/aztec-runtime/src/pxe/opfs-store.ts:12-14`), so rows moved to OPFS would need this same sealing.
  - The move would also lose:
    - `chrome.storage`'s atomic multi-key `set`, which `S/incoming-transfer/repository.ts:157-161` relies on;
    - the facade barrier (`utils/storage.ts`);
    - the migration engine and the backup migrator, which work on `chrome.storage.local` footprints.
  - The claim that does not hold: "the popup relies on storage change events" for these rows. Content reaches the popup by RPC and service events; no `onChanged` consumer reads a content root (recon, change-event consumers).
- **The brief's "under the existing per-profile key hierarchy" needs a choice.** The three existing per-profile derivations take `HKDF(master ‖ dek)` (ARCHITECTURE §7). But recovery mode has no DEK (`S/profile/spec.ts:176-180`), and it must read accounts and the rows its repair backup carries. D4 settles it: master only, with the residual named.
- **The brief's "#875 adds a per-profile record of offered default networks"** is not in #875's text, and `worktree-mainnet-arrival-1` had no commits at recon time (unverified). Any root it adds is classified by A4's root census (see the root-census row in "Phases and gates" below).
- **The lane brief's late-write site `S/wallet-sdk/queued-journal.ts:295`** is the `WalletLockedError` → `session_ended` classification. The write is `failQueuedIfUnclaimed` (`:251-268`).

## Outcome & Quality Bar

- **For whom:**
  - the person whose browser profile is read while the wallet is locked or the browser is closed (a stolen or shared laptop, a disk image, a synced profile folder, a malicious extension with storage access);
  - the maintainer who adds the next stored root.
- **Excellent:**
  1. Once a profile's conversion completes (it starts in the background at the profile's first unlock on the new build), a test scan of raw `chrome.storage.local` finds none of that profile's contact names, account names, addresses, amounts, origins, tx hashes or note hashes in any key or value of a sealed root, on Chrome and Firefox. The scan covers all of `chrome.storage.local`, minus a reviewed allowlist of the plaintext roots in the boundary table. The allowlist is per field where a record mixes kinds: the `accountSetDigest` fields of the verified stamp and the stale-network record are scanned, never exempt. Two exceptions, both disclosed: legacy tx rows with no `profileId` whose owner cannot be established now (KL-6), and the blocked record and reset journal while they stand.
  2. A sealed row moved to another key, root, profile or profile incarnation reads as absent, stays stored, and logs one fixed category with no content.
  3. No screen changes, except the rare refusal case under OA-4 (accepted, P74-02), which #944 (merged on `dev` as `bf6a25f2`) removes. History keeps "Stopped when the wallet locked" across a lock and across a worker restart. Recovery mode reads what it reads today. A full backup made before or after this release restores.
  4. A crash at any point of a profile's conversion loses no row, and the next unlock finishes it.
  5. The privacy policy stops saying these rows are stored without encryption, and the store listing says "encrypted" where it is true, in the arc that makes it true (OA-3).
- **Good enough** (each listed in Security § What stays visible or in the Known limits table):
  - row counts, sizes, timing, profile names and the listed plaintext exceptions stay visible;
  - a row replayed at its own key is accepted;
  - a same-phrase sibling profile can derive the row keys;
  - a profile not opened since the update stays plaintext until it is opened;
  - the `nulo:ui:*` preference keys stay plaintext (KL-12).
- **Owner decisions** (decision page 74, recorded on #522, and page 70; both 2026-10-20):
  - **P74-01, when A1 lands: A.** "In 1.0.0: #924 lands after #938, after your own build test and one green nightly soak; the promote waits for it." It replaces the merge bar's "after the 1.0.0 promote" for A1 only. To the owner's question about people on an earlier 0.3x build: no uninstall or reinstall. Their rows still read, the first unlock on the new build seals them in the background, an in-place update keeps the data (the update replay), and old backups restore.
  - **P74-02 = OA-4, refusing an app right after the wallet restarted: A, accept** (the orchestrator's call, which the owner delegated). The case is only "They don't match" on the emoji-check window after a background restart. The Allow window is not affected: it answers a request a restart ends, and it reads and deletes no saved connection. #944 (merged on `dev` as `bf6a25f2`) closes the connect and emoji-check windows at every background restart, so that press can no longer happen. What remains is an app listed in Connected apps until the person removes it or it reconnects and passes the check, and nothing is granted meanwhile.
  - **P74-03 = OA-5, a very long contacts list opens a little slower on Firefox: A.** "Accept: only Firefox pays, only with thousands of contacts, and the list still opens in under a third of a second."
  - **P70-07 = OA-3, the privacy text and the listing: A** (decision page 70, 2026-10-20). "A patch bump with these words: not material, nothing new is collected or shared." Privacy 1.2.3 carries the signed wording; the manifest's `changes` is the owner's line.

## UI impact

- **A1-A4: none on screen**, except the one case under OA-4 below. Every screen reads the same values through the same RPCs.
  - The conversion runs in the background after the unlock completes, while reads still accept the old rows, so the first unlock gains no wait.
- **Text that changes, asked (OA-3):** `legal/privacy.md:69-72` says these rows are "stored without application-level encryption". The store listing's account-address row (`apps/extension/store/listing.md:51`) and its storage line (`:69`) can say "encrypted" once it is true. A4 does not merge until the owner signs the new wording and picks the version bump.
  - Any privacy version bump, patch included, shows the existing "Privacy Policy updated" line under Settings → About's Privacy Policy row (`popup/pages/settings/about.vue:127`, `utils/legal-about.ts` `isOlder`) until the policy is opened. The manifest's `changes` entry is the owner's text. No component changes.
- **Not changed, asked (OA-1):** profile names stay readable on the lock screen and the picker. "A. Keep" ships.
- **Changed in one rare case, accepted (OA-4, P74-02 A; #944, merged as `bf6a25f2`, removes it):** "They don't match" on the emoji-check window, pressed after the background restarted while the window was open. Today the refusal deletes the app's remembered grants and the window closes. After A1 there is no row key, so the refusal returns `unavailable`. The window then stays open and shows its existing message, "The connection ended, but this app could not be removed. Remove it in Settings, Connected apps." (`popup/windows/verify/index.vue:109,251`). The grants stay until removed there, and the next connect shows the emoji check again (KL-11).
- **Not changed, by design:** the recovery-mode banner (`popup/components/modules/general/RecoveryModeBanner.vue:11-12`). Recovery mode holds the master and reads every sealed root except dApp sessions, as today (D4).

## Architecture & Implementation

### Boundary (D2)

| Root (construction site) | Decision | Why |
|---|---|---|
| `nulo:core:contacts` (`S/contact/service.ts:59`) | sealed, natural random id | who the person pays |
| `nulo:core:dappSessions` (`S/dapp-session/service.ts:111-115`) | sealed, natural 64-hex id, MAC kept inside (D17) | which apps, which accounts, which grants |
| `nulo:journal` (`S/operation-journal/service.ts:104`) | sealed, natural 16-hex id | origin, amount, recipient, call, tx hash |
| `nulo:core:txs` (`S/transaction/service.ts:118`) | sealed, keyed-hash id | the tx hash in today's key links on-chain activity |
| `nulo:core:token-balances` (`S/token-balance/balance-repository.ts:23`) | sealed, numeric id | private balances, a projection of the encrypted PXE store |
| `nulo:core:auth-registry` (`S/auth-registry/service.ts:124-132`) | sealed, numeric id | what was authorized, with tx hashes |
| `nulo:core:auth-registry-enabled` | sealed, account segment keyed-hashed | the key names the account |
| `nulo:core:incoming-transfers` (`S/incoming-transfer/repository.ts:59`) | sealed, `kind:p\|net\|` prefix kept, hash tail keyed-hashed | amounts, senders, note and tx hashes |
| `incoming-arrivals`, `-trust`, `-public-cursors`, `-balance-outbox` (`repository.ts:71` and siblings) | sealed, `p\|net\|` prefix kept, account/contract segments keyed-hashed | receipt ids holding hashes (`arrival-state.ts:33-36`); the keys name accounts and contracts |
| `nulo:core:accounts`, imported-key rows (`S/account/service.ts:148`, `imported-keys-repository.ts:21`) | sealed, address segment keyed-hashed; the signing key keeps its DEK box inside | names and addresses. The pre-open check and recovery mode read them with the master (D4) |
| `nulo:core:tokens`, `token-seeded@p` (`S/token/service.ts:174`, `seeder.ts:748`) | sealed, numeric id / value | which assets a person tracks; deleted defaults; verified pins |
| `nulo:core:networks`, `nulo:core:fpcs` (`S/network/service.ts:237`, `S/fpc/service.ts:70`) | sealed, natural random id | custom endpoints and names; chosen fee payers |
| `nulo:ui:pinnedTokens@p`, `nulo:ui:feePaymentMethods@p`, `nulo:ui:sendFeePaymentMethods@p`, `nulo:ui:activeAccount` | plaintext, disclosed (KL-12) | pinned token contracts, fee-payer picks and the last-selected account address. They are `structured` shapes written by the popup through the facade; #865 refuses their removal without a migration and refuses every migration over them, and its writer test holds each to a live writer. Moving them is a plan of its own once #865 can retire a structured shape (follow-up issue) |
| `nulo:core:dappRegistrations@p` (`S/dapp-session/registration-allowance.ts`, from #976) | plaintext, disclosed; A4's root census classifies it | per chain, each origin that registered with the profile and how many times. Added on `dev` after A1 was planned, so A1 does not seal it |
| `nulo:core:active-network@p` | plaintext | a random network id, meaningless without the sealed network row |
| `nulo:core:profiles` | plaintext | the key source, and the picker and lock screen show the name (OA-1) |
| tombstones, restore-pending | plaintext, disclosed | the id reservation and the torn-restore gate run before unlock. A tombstone holds the deleted profile's addresses and token ids only while its deletion runs; it is cleared once every purge succeeds (`S/profile/service.ts:1625`) |
| integrity verified stamp, stale-network record | plaintext, keyed digest from A4 | Both carry `accountSetDigest`, the literal list of every account's chain, index and address (`S/account-integrity/types.ts:15-28`), written at every green verification (`coordinator.ts:225-230`) and kept until deletion. A4 stores `base64url(HMAC(K_idx, accountSetDigest(rows)))` instead, at write and at compare. Every writer and reader holds the profile's keys: the pre-open check after the fill, `classifyRuntimeMismatch` while unlocked, and the stamp read for the active profile (`coordinator.ts:115`). A 1.0.x literal stamp mismatches once and forces one re-derivation, the stamp's own fail-safe |
| integrity blocked record, the reset journal and notice | plaintext, disclosed | read before unlock (`AccountIntegrityBarrier.vue:39`) or from change events. The blocked record holds addresses only while a block stands; the reset journal only while a reset runs |
| config, token list, prices, legal, `nulo:schema:*`, `lastActiveProfile`, onboarding, `restoreOutcome@p` | plaintext | device-wide or pre-unlock control state; no user content |

### Envelope and row layout (D3)

- **Stored value:** `JSON.stringify({ profileId, sealed })`, where `sealed` is the base64 frame.
  - It stays a JSON string, the only form the migration engine's staging reads (`packages/wallet-core/src/migration/staging.ts:27-31`).
  - It keeps the field name `profileId`, so every existing keyless purge predicate `raw.profileId === p` keeps matching sealed rows (`S/purge-rows.ts:56-84`, `S/contact/service.ts:212-216`, `S/operation-journal/service.ts:240-244`).
  - No sealed root's schema has a `sealed` field (checked), so an envelope is never confused with a legacy row.
- **Keyed-hash ids** follow one rule. A storage key keeps its scope segments (root, profile, network or chain id) and replaces every segment that carries an address or a hash with `base64url(HMAC(K_idx, segment))`. The natural id travels inside the sealed plaintext, `{ k: naturalId, r: row }`.
  - Keeping the scope means `clearScope`/`clearChain` (`repository.ts:236-252`) and network purges keep working with no key.
  - The HMAC input is the segment alone, not the root, so an account row and its imported-key row map one address to one value.
  - **The account/imported-key orphan sweep** (`S/account/service.ts:205-218`) deletes a signing-key row whose account key is physically absent, under the rule "no hideable view feeds a destructive operation". A half-converted pair (account hashed, imported key still natural) would read as an orphan, so:
    - the sweep moves from init to `onRowKeysReady(p)` and compares natural ids after opening, both forms counted as present;
    - it deletes each candidate inside `tupleLocks.withLock(rowId)` after re-checking the account in both key forms, as `reconcileImportedAccounts` does (`S/account/service.ts:1235-1246`). Init's placement was what serialized it against `commitImportedAccount`'s key-first write (`:191-197,759-775`);
    - the conversion seals an account and its imported-key row in one `set` and removes both old keys in one `remove`.
  - `K_idx` is per profile, so two profiles never share a keyed-hash value.
- **Natural ids** stay where the id is already random or a sequence number: contacts, journal, dApp sessions, tokens, balances, authwits, networks, fee payers. `getKeys`, `contains` and max+1 allocation (`S/auth-registry/service.ts:252,765`) keep their meaning.
- **Rejected:** one sealed blob per (root, profile).
  - It hides counts, which the sizes reveal anyway.
  - Every write would rewrite the root (journal heartbeats, `S/operation-journal/service.ts:498-519`), and every single-key `set` would become a read-modify-write. Unlocked deletes race it (`S/dapp-session/mac-storage.ts:107-110`).

### Keys and box (D4, D5)

- **Derivation:** `deriveRowKeys(master, profileId, pxeGeneration)` in `packages/wallet-crypto/src/row-seal.ts` (new).
  - HKDF-SHA256 over the 32-byte master.
  - Salt: the canonical JSON of `["nulo:row-seal:v1", profileId, pxeGeneration]`. `pxeGeneration` is minted per profile incarnation (`S/profile/profile-row.ts:37,60`), so rows left by a deleted incarnation never open under a later profile with the same id.
  - Info `nulo:row-seal:aead:v1` gives an AES-256-GCM key, non-extractable.
  - Info `nulo:row-seal:index:v1` gives an HMAC-SHA256 key, non-extractable.
  - Built on `importDualSecretHkdfKey`'s HKDF import pattern; no new primitive.
- **Master only, not `master ‖ dek` (D4).** The reason is recovery mode (`S/profile/spec.ts:176-180`): a session whose DEK failed to unseal. It keeps derived accounts, and its repair path is a full-backup export carrying accounts, contacts, history, tokens and authorizations (ARCHITECTURE §7).
  - A dual-secret key would either hide every sealed row there, accounts included, losing them from the one state built for repair, or force accounts and networks out of the boundary.
  - The normal unlock and the password change do hold the DEK. Their pre-open checks (`S/profile/service.ts:1107,1318`) receive the master only today, which is a local ordering, not a constraint.
  - The cost: a same-phrase sibling profile, or anyone holding the recovery phrase plus a copy of the disk, can derive the row keys. Both can already spend from every derived account and resync its private state from the chain. Known limit KL-3.
  - dApp grants keep their dual-secret MAC inside the sealed row (D17), so a sibling still cannot forge one.
  - A password change touches neither the master nor `pxeGeneration`, so nothing re-seals. Passkey profiles derive the same master, so their path is the same.
- **Box:**
  - AES-256-GCM with a random 96-bit IV per seal.
  - Frame: `version(1)=1 ‖ iv(12) ‖ ct`.
  - AAD: the canonical JSON `["nulo:row:v1", root, storageKey, profileId]`, injective for the same reason the auth-registry dedupe uses JSON (`S/auth-registry/service.ts:742`).
  - One AEAD key per profile, with the storage key in the AAD. Per-row keys would cost one HKDF per row read and add no binding the AAD lacks.
  - Seal counts per key stay many orders of magnitude below the 2^32 random-IV bound.
- **The shared frame.** This is the third copy of the frame, which is closed known limit #523's reopening condition.
  - A1 first lands fixed-IV vectors pinning both existing boxes' bytes (`imported-account-key-box.ts:41-77`, `imported-keys-dek-box.ts:117-150`), using V2b's mocked `getRandomValues` (`wallet/crypto/key-vectors.test.ts:127-145`).
  - Then all three boxes move onto `packages/wallet-crypto/src/aes-gcm-frame.ts` (`sealFrame`/`openFrame`, optional AAD), and the vectors prove the bytes did not move.
  - #523 is reopened and closed as completed by A1.
- **Vectors:**
  - V12 in `wallet/crypto/key-vectors.test.ts`: a fixed-IV seal and a keyed-hash id under fixed inputs, cross-checked by a `node:crypto` generator in `packages/wallet-crypto/reference/row-seal-v1/` (as V3 does it);
  - `nonce-uniqueness.test.ts` covers the row box.
  - `public.ts` (the npm surface) does not change.

### The row keyring (D6)

- **`ProfileService` owns a keyring** (`S/profile/row-keyring.ts`, new). It maps `profileId → { pxeGeneration, aead, index }` and lives as long as the worker.
- **Filled** where the master is in scope and the profile's identity is final:
  - `openSessionVerified`, before `verifyBeforeSessionOpen` (`:1318`), so the pre-open check reads sealed accounts and networks;
  - the password-change path, before its pre-open check (`:1107`);
  - the lenient silent restore, after `sessionManager.getActive()` restores the secret and after the integrity-blocked close (`:512-516`);
  - both restore commits (`:2344-2361` password, `:2513-2528` passkey), before any slice is written.
- **Never filled for a reserved id** (`deletionState`), and an open that fails after filling removes its entry unless the profile already had keys before it. So a delete racing an open, which the open's deletion-epoch check already refuses (`:1295-1299`), cannot leave keys behind for a dead incarnation.
- **Emptied** only by the worker ending and by profile deletion, after the coordinator's typed purges (D11). The reservation (`:1506`) stops new fills. Not emptied by lock or profile switch.
  - Precedent: the offscreen document keeps each profile's PXE store key across lock and switch until deletion, so durable jobs of profile A finish after a switch (`packages/aztec-runtime/src/pxe/service.ts:153-158,166-169`).
  - A 10 s heartbeat keeps the background alive while the browser runs (`wallet/runtime.ts:282-291`, never stopped in production). So keys stay until the browser closes, the extension restarts or updates, or the profile is deleted.
  - Dropping keys at lock would protect only against reading the browser's memory (a running process, or a hibernation or swap file), which the threat model excludes (`packages/wallet-crypto/ATTACK-SURFACE.md` § Threat model). The PXE store keys already live there. Dropping would also cost a capability scheme for every write that lands after a lock (rejected in D7). And the transaction worker commits A's rows while B is active (`S/transaction/service.ts:399-417`).
- **Accessors**, in-process only (no RPC), never handing out the master or the DEK:
  - `rowKeys(profileId): RowKeys | undefined`, synchronous and lock-free. It is called inside facade-locked sections, as `isRecoveryMode` is.
  - `onRowKeysReady: EventHandler<string>`, emitted once per profile per worker, after the facade lock is released. EventHandler callbacks are not awaited (`packages/wallet-core/src/utils/event-handler.ts:17`), so handlers may call the facade.
  - An unlock can complete during `services.start()`, before the post-start subscribers attach (`wallet/runtime.ts:261-271`). So `armPostStartWork` replays the event for every profile already in the keyring, however its keys arrived. Every handler is idempotent.
- **Reads stay session-gated where they are today.** The keyring makes a row readable to worker code; which RPC may read what is still decided by the session checks each service already makes.
- **A reader that does not filter by profile today** would now return a result that depends on which profiles the keyring holds. So every such reader reachable from a session RPC filters by the session's profile, plus ownerless legacy rows. Known: `getTransactions(account)`, which filters by chain only (`S/execution/transfer-executor.ts:194,204-205`). The popup's `txBelongsToScope` and the other callers already filter by profile, so no screen changes.

### The sealed store (D3, D19)

- **`SealedEntityStorage<T>`** (`wallet/storage/sealed-entity-storage.ts`, new) wraps a codec `EntityStorage`. It offers the subset of methods the services call (`get`, `set`, `delete`, `contains`, `getAll`, `getValues`, `getKeys`, `rawEntries`), so call sites keep their natural ids. `SealedValue<T>` covers single-key roots.
- **wallet-core change (D19):** `EntityStorage.decodeRow` (`packages/wallet-core/src/storage/entity_storage.ts:98-145`) is split into the JSON parse and a public `decodeParsed(fullKey, parsed)`. The codec, the key-identity check and the payload-free logging then stay in one place.
- **Per-root options** (each serves at least two roots, or one root with no other way):
  - `ownerOf`: default `row.profileId`; keyed roots read it from the key;
  - `hashedSegments`: which key segments are keyed-hashed;
  - `ownerless: "plaintext"`: txs only, for legacy unscoped rows (D10).
- **Reads**, the dual read:
  - an envelope whose profile has no key in the keyring: absent, logged at `debug`;
  - an envelope that fails to open, or whose inner `k` or AAD profile disagrees: absent and kept, with one fixed-category log (D14);
  - a legacy plaintext row: decoded through `decodeParsed`, as today.
  - Reads never delete.
- **Writes:**
  - `prepare(id, row)` seals and returns `{ items, commit() }`; `commit` dispatches `area.set` synchronously.
  - `set` = prepare + commit.
  - With no key, a write throws `WalletLockedError` (`S/profile/wallet-locked-error.ts:7`). Recovery mode holds row keys (D4), so it never reaches this branch. No new error class.
  - Nothing writes a plaintext row except the `ownerless` legacy txs.
- **The physical-key contract for keyed-hash roots.** During the dual-read window one natural id can have two physical keys: the legacy one and `p`'s keyed-hash one. Every operation by natural id handles both:
  - reads yield each row's physical key, and prefer the sealed copy;
  - `set(id)` writes the sealed key, then removes `p`'s legacy twin in the same synchronous dispatch;
  - `delete(id)` removes `p`'s sealed key, plus the legacy key when the legacy row belongs to `p`. For an ownerless tx it removes the legacy key only under the sole-owner rule (D10);
  - `contains(id)` checks both forms.
  - Without this contract, a rename made before the conversion would be overwritten by it (`S/account/service.ts:559-567`), and a delete inside the window would leave the legacy twin to come back (`imported-keys-repository.ts:35-37`, `S/transaction/service.ts:365-367`).

### Writes while locked (D7, D8)

- **After a lock or a switch in a live worker**, the keys stay, so every late write seals as any write does and keeps today's error kinds and history copy:
  - `abandonDeadSessions` and `markSessionEnded` (`S/execution/execution-lane.ts:253-266,530-532`);
  - `refuseEndedSession` (`S/execution/claim-helper.ts:166-174`);
  - `failQueuedIfUnclaimed` (`S/wallet-sdk/queued-journal.ts:251-268`);
  - `markFailedUnlessCancelled` (`S/execution/mark-failed-unless-cancelled.ts:54`);
  - a broadcast that completes after the session ends (`addTransaction`, `S/transaction/service.ts`);
  - authwit index writes after a send.
- **On a worker that booted locked** (strict mode, the default, `wallet/config/config.ts:26`), no profile has keys until its first unlock. Each boot-time reader then acts on what it can read:
  - **Journal reaper.** The boot sweep (`S/operation-journal/reaper.ts:151`) sees only legacy plaintext rows. A sealed non-terminal row is invisible, never treated as absent or terminal. On `onRowKeysReady(p)` the reaper runs `reap({ unconditional: true, bootCutoff, profileId: p })`.
    - Every journal row of `p` older than `bootCutoff` belongs to a dead worker, because nothing writes `p`'s journal before `p`'s keys exist in this worker (`reaper.ts:225-230`; the cutoff is captured at `wallet/runtime.ts:263-267`).
    - `terminalAt`, which orders the activity list (`RecentActivityView.vue:351`), moves from boot time to unlock time. That changes no order, since nothing wrote in between.
  - **The minute tick, GC** (`S/operation-journal/gc.ts:113-140`) **and `SendCheck`** (`send-check.ts:71-78`) act only on readable rows. `SendCheck` starts watching a profile on `onRowKeysReady`.
  - **`TransactionService`** arms pending and finality watches at init (`S/transaction/service.ts:149-151`) only for ownerless rows and rows whose owner has keys, and arms `p`'s rows on `onRowKeysReady(p)`. Arming runs under the transaction lock that purges hold (`:336-368`), and checks the deletion epoch captured at its start before inserting, so an arming that a deletion overtook inserts nothing. Otherwise a legacy row of a keyless profile would be polled every second (`:399-417`) and its sealed commit would throw, swallowed, for the life of the worker.
  - **Profile deletion's boot resume** needs no key (D11).
  - **A legacy plaintext row a keyless path tries to update** refuses with the typed error. The caller already logs that at `debug` (`reaper.ts:203-208`), and the row is handled at unlock.
- **Incoming scans and the balance outbox** already run only for the active, unlocked profile (`S/incoming-transfer/service.ts:1017`, `balance-outbox.ts:65`).

### Existing data: the conversion (D10)

- **On `onRowKeysReady(p)`**, each sealed root's owner runs `sealLegacy(p)` row by row, or in bounded batches, so no lock is held for the whole pass and the first unlock's other work does not queue behind it.
- **Every row commits only while its key still holds the exact legacy string it read.** The conversion reads the raw value, seals it, re-reads, compares, then commits synchronously. That is the guard `S/purge-rows.ts` already uses.
- **Where every writer of a root holds one lock, the conversion holds it too**, per row or batch, so a racing write is never overwritten by `seal(old JSON)`:
  - the journal: `transitionLock`;
  - the five incoming roots: `withServiceLock` (`S/incoming-transfer/service.ts:322,331-344`; `balance-outbox.ts:33`);
  - accounts and imported keys: `tupleLocks` per row id (`S/account/service.ts:377,537`), with the pair conversion inside it.
- **Balances have no such lock.** The queue's writers re-read and write without one (`S/token-balance/balance-job-queue.ts:208-224,344-373`). The service `Lock` (`S/token-balance/service.ts:66`) covers allocation, reconcile and purges only.
  - Deletion is different: purges hold that service lock (`S/token-balance/service.ts:541`) and fence the id before deleting it (`invalidateAndDelete`, `:85-100`). So the balance conversion holds the service lock per row through its final read and commit, and skips a fenced id. A deleted balance can then never be written back.
  - What remains is the race with the unlocked projection writers: the compare-then-commit guard leaves a one-round-trip window in which a fresh projection can be overwritten by the older sealed value. Accepted: balances are a recomputed projection, and the next refresh rewrites the row.
- Each arc's PR names the lock, or the guard, for every root it seals.
- **A row whose sealed twin already exists is not re-sealed**; only its legacy key is deleted.
- Every plaintext row attributed to `p` is sealed: the row's `profileId`, or the key's profile segment for keyed roots.
  - The exact stored JSON is sealed, malformed rows too, so nothing stays readable and nothing is deleted.
  - Natural-id roots overwrite the same key.
  - Keyed-hash roots write the sealed copy, then delete the old key. A crash between the two leaves both; reads dedupe by natural id and prefer the sealed copy, and the rerun deletes the plaintext twin (the physical-key contract, § The sealed store).
- **No completion marker.** The scan runs on every worker's first unlock of a profile and is a no-op once nothing is left. A marker would add state without protecting anything: the writer who can plant a plaintext row can delete a marker (KL-2).
- **dApp sessions** are sealed byte for byte like every other root, MAC field included, with no MAC check at conversion. Every normal read still verifies the MAC (D17), so a planted row with a bad MAC is sealed and then refused, as today (`mac-storage.ts:85-104`). This also lets a recovery-mode unlock, which has no MAC key (`S/profile/service.ts:1019-1022`), convert sessions.
- **Transactions with no `profileId`** are rows written by older restores (`S/transaction/service.ts:228,598-629`).
  - Adopted only when `p` is the sole owner of the row's account on that chain (`isSoleOwner`, `:316-325`).
  - `isSoleOwner` finds other owners through decoded accounts (`S/account/service.ts:866-875`). Once A4 seals accounts, a profile with no key would read as "no owner". So ownership is **unknown** whenever any account row of that chain is unreadable, and an unknown row stays ownerless. The same rule binds the helper's purge callers.
  - Rows several profiles share stay plaintext under `ownerless`, and the existing `ambiguous` mark (`:354-362`) keeps applying. Known limit KL-6.
  - `rawAddressesForProfile` (`S/account/service.ts:885-901`) parses addresses from storage keys. It skips keyed-hash tails, so it never feeds an HMAC string to the tx purge as an address. A converted profile deleted from a worker that never opened it therefore marks no shared row ambiguous. KL-6 names the case: the survivor may later adopt such a row.
  - From A2 on, `restore()` stamps the destination profile.
- **Cost:** the conversion runs after the session is published. The person sees the unlock complete at today's speed, and the dual read serves the same values meanwhile. A1 and A2 measure it (see the perf gates in "Phases and gates" below).

### Profile deletion (D11)

- The reservation (`:1506`) stops new keyring fills. The coordinator's typed purges (`S/profile-deletion/coordinator.ts:121-139`) then run **with the profile's keys still present**. They decode rows, clear watches and fences, and delete, as today. For example, the transaction purge unwatches what it deletes (`S/transaction/service.ts:343-368`); without keys, a watched transaction would keep its watch past the deletion.
- Then the keys are dropped, and one new keyless step runs: `purgeSealedRowsOf(area, p)` deletes every row of every sealed root whose envelope or legacy row names `p`. It catches rows whose typed predicates need fields the envelope hides: txs by `raw.account`, balances by `raw.token`.
- **The boot resume** (`coordinator.ts` resume) has no keys. Its typed purges see the sealed rows as absent, and the keyless step deletes them. A worker that booted locked has armed no watch for a keyless profile, so there is nothing in memory to clear.
- The deletion snapshot and the tombstone keep today's shape (`S/profile-deletion/types.ts:9-20`). The snapshot reads decoded rows while the keys exist. The tombstone is plaintext only while the deletion runs (boundary table).

### Transaction identity (D20)

- **Today** one row per tx hash exists device-wide, keyed by the hash. Watch maps are keyed by hash (`S/transaction/service.ts:93-100`), and `restore()` refuses a hash that is already stored (`:618-629`).
- **With per-profile keyed-hash ids**, two profiles holding one tx hash hold two rows. So a transaction's identity becomes `(profileId, hash)`:
  - watch and finality maps are keyed `profileId|hash`;
  - `waitForTx` (`:265,287`) takes the originating profile explicitly, and so do its two callers in `S/auth-registry/service.ts:395,444`, which already hold the originating fence;
  - `getTransaction(hash)` (`:160-165`) resolves within the calling session's profile, and so does every internal lookup, which takes the profile from the row it started from;
  - `restore()` checks duplicates within the destination profile, against both key forms;
  - a legacy row and its sealed twin dedupe within one profile, preferring the sealed copy;
  - two profiles' rows with one hash are never collapsed.
- Today's single shared row is the legacy `ambiguous` case (KL-6).

### Future shape changes and #865 (D12)

- **#865's model, as merged** (#890; the deviations A1 met are in `lessons/phase-1.md`):
  - `StoredEncoding` is `"json" | "structured"`;
  - an encoding change is a downgrade, even under an additive stamp (`downgradeOf` in `stored-shapes/baseline.ts`);
  - the golden writer distinguishes only json from structured (`wire`);
  - a removed shape needs a migration (`migrationProblems`);
  - structured, engine and authenticated shapes are `restricted`: no migration may cover or write them.
  - Cited by symbol: the branch moves (line numbers shifted between `92987f9c` and `1ef0245a`).
- **This lane's registration:**
  - A sealed root keeps `encoding: "json"`, since the envelope is a JSON string, and gains a `sealed: true` flag, declared once in `STORES` and copied into the registry. The recorded schema stays the inner codec's: the envelope is the store's wire form, not a shape a writer produces.
  - A1 adapts #865's baseline:
    - the golden writer seals sealed shapes with V12's fixed keys, and the reader opens them through the store;
    - the authenticated path composes the MAC and the seal for `dappSessions`, which keeps `authenticated`;
    - `downgradeOf` refuses dropping `sealed`;
    - `restricted` gains `sealed`. That is the "no pre-unlock migration over a sealed root" rule, in #865's own guard rather than a second one.
  - Each arc then re-stamps with `bun run baseline:storage -- --additive "sealed envelope; plaintext rows still read and are sealed at the profile's next unlock"` once #865's stamps are frozen; while `PINNED_STAMPS` is empty the generator rewrites stamp 0 with no mark. Old plaintext goldens decode to the same values through the dual read, so #865's preservation check (`preservationProblems`) holds.
  - #865 seeds every historical golden through the current shape's `wire`. A `sealed` flag must not reach that path: historical goldens keep their original plaintext wire form, and sealed goldens are a separate set with fixed keys and physical keys. Then breaking the legacy reader fails the frozen plaintext corpus.
  - If #865 merged in a different form, A1 adapts to the merged form and records the deviation here.
- **The `nulo:ui:*` keys stay out of the boundary** (D2): `migrationProblems` forbids removing a shape without a migration, `restricted` forbids any migration over a structured one, and `stored-shapes.writers.test.ts` holds each entry to its live writer. This lane does not loosen any of the three.
- **A future inner change** goes through the codec, which reads every inner shape any release wrote and writes the current one.
  - Only changes that keep every old decoded path pass #865's preservation check: additive fields and widened types, under its `additive` mark.
  - A rename, a row split, a natural-id change, or a crypto rotation (a new label or frame version) needs an unlock-time pass with a registered transform (CLAUDE.md's "re-encrypt-on-next-unlock"), plus a reviewed #865 acceptance path for sealed shapes.
  - Neither is built now, because no such change exists. Both are filed as one issue at close-out (KL-8). The frame's version byte and the `v1` labels leave room for them.

### Backups (D13)

- The format is unchanged.
  - `backup()` returns decrypted DTOs for the unlocked profile (`S/contact/service.ts:245-247`, `S/transaction/service.ts:573-592`).
  - The trust gates and the backup migrator work on those DTOs.
  - `restore()` writes sealed rows with the keys the restore commit put in the keyring.
- A backup made before this release is plaintext DTOs at `backup-schema-version` 1, so it imports as today and lands sealed.
- A worker death before `finalizeRestore` already rolls the import back and deletes the profile (`tests/e2e/network/backup-restore-sw-restart.test.ts:9-16`).
- The journal, dApp sessions and incoming roots stay out of backups, as today.

### Logs and errors (D14)

- The sealing layer logs no decrypted value, natural id, ciphertext or WebCrypto message. Existing diagnostic lines elsewhere are outside this lane, and the logging policy governs them: incoming-scan warnings name contract addresses (`S/incoming-transfer/service.ts:1483,2321,2345`) and a debug line names a tx hash prefix (`S/transaction/service.ts:476`). Those live in `chrome.storage.session` logs, not in the sealed `storage.local` boundary.
  - The store logs `sealed-authentication`, `sealed-format` or `sealed-identity`, with the root and the id length from `describeKey` (`entity_storage.ts:76-79`), at `warn`. That is a tamper or corruption signal with no content (`logging-policy` skill § levels).
  - A row of a profile with no key logs at `debug` only, since a locked profile's rows are expected.
- **An unopenable sealed row is a codec-hidden row**, today's contract for a row that fails its codec: `EntityStorage` returns `undefined`, the row stays stored, and physical-key views still count it as present.
  - The integrity coordinator reads decoded accounts (`getAccountsRaw`, `S/account/service.ts:880-883`), so it treats a sealed account it cannot open as it treats a corrupt row today. No new block variant is needed.
  - Two readers decide on emptiness, and both are covered: `isSoleOwner` (ownership unknown, D10) and the orphan sweep (both key forms present).
  - No new wire error.
- `REDACTED_KEYS` gains no name: rows keep their existing types, which "never log whole rows" already covers. `log-payload-ban.test.ts` stays green.

### dApp sessions (D17)

- The sealed row's plaintext is today's row with its `mac` field. `DappSessionMacStorage` (`S/dapp-session/mac-storage.ts`) now sits over a `SealedEntityStorage` instead of a plain one.
  - The row key is master-only (D4), and a same-phrase sibling holds the master. The dual-secret MAC is what stops it forging a grant.
  - Recovery mode still hides sessions (no DEK, no MAC key), as today.
- Today's locked read of a row without a MAC deletes it (`mac-storage.ts:88-90`). A sealed row read without a key is now absent before the MAC layer sees it, so a locked read never deletes.
- **Maintenance enumeration.** `rowsForProfile` returns raw rows today (`mac-storage.ts:75-80`), and the refusal and chain purge filter them by origin and chain (`S/dapp-session/service.ts:405-427,475-487`). Raw envelopes carry neither field. So:
  - `rowsForProfile` opens with the row keys and skips the MAC check, keeping each row's storage key for the delete. A deletion needs no authorization proof; normal reads still need one.
  - `purgeForProfile` (`S/dapp-session/service.ts:489-507`) matches envelopes by `profileId` with no key, as today's raw predicate does, so deleting a locked profile from a fresh worker completes.
  - Only the origin and chain filters (the refusal and the chain purge) need the row key. With none, the refusal returns `unavailable` and the caller reports it, never a false "nothing to delete". After a lock the keys are still present (D6). The chain purge's one caller, the network reset, runs under a live run fence, so its profile's keys are held and an unopened row there is tampered: never served, it is left alone (A1).

### Test seams (D15)

- **Unit:** `wallet/storage/sealed-entity-storage.testing.ts` gives services fixed row keys. About 35 test files that seed rows raw keep working through the dual read; only the tests that assert sealed bytes use the helper.
- **E2E reads (as built in A1):** no seam. The readers of a sealed root call the owning service's own RPC through `callService` (`tests/e2e/fixtures/session.ts`), which needs no build flag and also runs against release artifacts. The seam below stays the fallback for a root with no read RPC; A2 decides for the journal readers.
- **E2E read seam (fallback, not built):** `nulo:e2e:sealed-dump` (`src/e2e/sealed-dump.ts`), built only into e2e builds, follows the csp-report message pattern (`src/e2e/csp-report.ts:21-23`). It answers a root name with `{ storageKey, naturalId, row }[]` for the open profile, read through the store.
  - The physical key lets a read-modify-write helper remove a sealed original and write a plaintext replacement, which the dual read serves. So no write channel is needed.
  - `.github/workflows/_build-extension.yml:142`'s production marker list gains `nulo:e2e:sealed-dump`.
  - 26 network specs read `nulo:journal@` raw through `tests/e2e/fixtures/journal.ts` (`:45-60` and five more scans), and `fixtures/journal-page.ts:35-41` does too. A2 moves both to the seam. A spec that read the journal after a worker restart unlocks first; the A2 PR lists each one.
  - Seeds stay plaintext (`tests/e2e/send-keyboard.test.ts:26-41`): the dual read serves them, and the next worker's first unlock seals them.
  - **Every arc moves the e2e readers of the roots it seals.** The source of truth is the grep, run at the arc's start: `grep -rlE "nulo:core:(<root>)" apps/extension/tests/e2e/` for each root the arc seals. Its result goes in the PR. Readers found at planning time, as a floor, not the list:

    | Arc | Readers |
    |---|---|
    | A1 | `fixtures/dappSession.ts:30-81` (used by `network/cap-request-partial`, `scope-refusal`, `data-privateEvents`, `connect-unserved-chain`); `network/cap-widening.test.ts`; `helpers/contacts.ts`; `backup-migration.test.ts:83-91`; `network/backup-migration-roundtrip.test.ts:93-101` |
    | A2 | `fixtures/journal.ts`; `fixtures/journal-page.ts`; `fixtures/send-burst.ts:207-211`; `network/legal-acceptance-wall.test.ts:54`; `network/stale-network-chaos.test.ts:149`; `network/same-token-concurrent-sends.test.ts:656`; `network/backup-restore-integrity.test.ts` |
    | A3 | `network/balance-row-reconciliation.test.ts:50-82`; `authwit-lifecycle.test.ts:142-144`; `account-balance-orphans.test.ts:57-209`; `helpers/activity-seeds.ts:190`; `helpers/handshake-import.ts:252`; `snack-placement.test.ts:241`; `token-add-auto-trust.test.ts:113` |
    | A4 | `fixtures/extension.ts:545-556` (raw account read used by eight network specs, `frozen-account-canary` among them); `helpers/activity-seeds.ts:29-37`; `helpers/stale-network.ts:140-160,186-200`; `fixtures/tokens.ts:226-236,359-364` |

  - **Each arc's gate** runs, on both browsers, every spec that uses a moved reader, plus the full smoke suite.

### Concurrency (D9)

Sealing adds an `await` between a caller's last check and the storage dispatch, and a key captured before that `await` still seals after a concurrent delete. So **every write to a sealed root that follows an epoch, liveness, fence or `isCurrent` check** becomes: prepare (seal), then the caller's existing check, then a synchronous commit. No new lock is added.

A1's P2 lands the full inventory in the PR body: every write to a sealed root preceded by such a check, found by reading each sealed root's writers. The sites known at planning time:
- `S/token-balance/balance-job-queue.ts:219,344-373`;
- `S/incoming-transfer/service.ts:744-756` with `repository.ts:157-162` (`commitAcceptance`) and the trust write `repository.ts:134-139`;
- `S/contact/service.ts:117-119,149-150,234-239` (`assertStillLive`);
- `S/token/service.ts:540-548` (`resumeWritten` compares against the exact sealed string the attempt wrote; random IVs make a re-serialization differ);
- `S/account/service.ts:1032-1033` (restore's epoch check before the write);
- `S/profile/service.ts:1054-1061` (`saveFeePick`'s `isCurrent` before the write, from A4);
- the restore-fence sites that promise no `await` before the write (`S/restore-fence.ts:44`): `S/auth-registry/service.ts:792`, `S/account/service.ts:1190`, `S/contact/service.ts:274`, `S/network/service.ts:313,328`, `S/token-balance/service.ts:721`, `S/transaction/service.ts:628`, `S/token/service.ts:1019`;
- the incoming writes after a `fenced()` check: `S/incoming-transfer/service.ts:875,901,951,1689-1690,1702-1708,1761,1940,2504-2520`.

The inventory also lists every raw reader of a sealed root (`rawEntries`, `rawStringEntries`, `rawValue`, `area.get`), each with its disposition: keyless by design (by `profileId` or key scope), or it opens the row. Known:
- `S/auth-registry/service.ts:746-757` seeds the restore dedupe from raw strings (`chainId`, `account`, `hash`), and opens rows from A3;
- `S/account/imported-keys-repository.ts:49-56` parses addresses from storage keys, and opens rows from A4, where the keys carry HMAC tails.

Each arc converts the sites of the roots it seals. A site with an existing interleaving test keeps it green with sealing on. A site without one gets one test: a delete interleaved at the `await`, then no row remains.

The store takes no lock and never calls into the facade. Service locks keep owning read-modify-write.

## Decision ledger

Sources: M = main draft, C = Codex draft, O = Opus draft.

| # | Question | Decision | From | Rejected (why) |
|---|---|---|---|---|
| D1 | Where rows live | `chrome.storage.local`, sealed in place | M C O | OPFS: encrypts nothing itself; loses the atomic multi-key `set`, the facade barrier and the migration/backup machinery |
| D2 | Boundary | the table above: every profile-scoped content root and accounts; the `nulo:ui:*` keys deferred (D26) | M C | the narrow boundary (O: accounts, tokens, networks plaintext): leaves every address readable, and its reason (a dual-secret key that recovery mode cannot derive) disappears under D4. Sealing profiles (OA-1); sealing integrity and reset records (pre-unlock and change-event readers; rare, disclosed) |
| D3 | Layout | per-row envelope `{ profileId, sealed }`; keyed-hash only for address/hash segments; scope segments kept | M (envelope), C (keyed-hash ids), O (field name, scope prefix) | blob per root (write amplification, read-modify-write); a profile prefix in every key (C: re-keys roots for a purge `profileId` already serves); a fully opaque key (M: breaks keyless chain and scope purges) |
| D4 | Key input | master only, bound to `(profileId, pxeGeneration)` | M C | `master ‖ dek` (O: keeps sibling isolation, but recovery mode holds only the master, so it shrinks the boundary or drops rows from the repair backup). Sibling residual: KL-3 |
| D5 | Key granularity | one AEAD key per profile, the storage key in the AAD | M O | a key per row (C: one HKDF per row read, no added binding) |
| D6 | Key lifetime | worker-lifetime keyring, filled at open, password change, silent restore and restore; emptied at deletion | O | dropping keys at lock (M: protects only against in-process memory reads, which the threat model excludes; the offscreen already keeps PXE store keys across lock) |
| D7 | Writes after a lock | seal with the retained keys; a keyless write (cold boot) refuses with the existing typed errors | O | an encrypt-only capability captured at authorization plus a journal in-flight map (M: a second key-holding path for the same result); a row-scoped decrypt capability (C); an in-memory queue to the next unlock (lost on any background death: browser close, crash, extension update) |
| D8 | Boot sweeps | per profile on `onRowKeysReady`, same `bootCutoff` | M C O | — |
| D9 | Check-then-write sites | prepare, the existing check, synchronous commit at every inventoried site | C O | a fixed list of four sites (the consolidated draft; the contradiction check found restore, trust and fee-pick sites outside it) |
| D10 | Conversion | per root under the lock its writers hold, on `onRowKeysReady`, with dual read; no marker | O | inside the open before the session is published (M: runs under `runExclusive`, which stalls every facade RPC for the whole conversion and adds a visible wait to the first unlock; the after-publish form pays with per-root lock discipline instead); an authenticated completion record (C: deletable like any row) |
| D11 | Deletion | typed purges with keys present, then keys dropped, then one keyless sweep by `profileId`; tombstones unchanged | M C O | dropping keys at the reservation (the consolidated draft: typed purges could not clear watches); address-free tombstones (M: a type change for a record that is already transient) |
| D12 | Future migrations | `sealed` joins #865's refuse-every-migration guard; the codec takes path-preserving changes only; the unlock-time pass and its #865 acceptance path are filed for their first need | M O C | building the deferred-migration runner now (C: no caller at ship time); a codec rename (O: #865's preservation check refuses it) |
| D13 | Backups | DTO format unchanged; restore seals with keyring keys | M C O | — |
| D14 | Failures | an unopenable row is a codec-hidden row: hidden, kept, fixed category; readers that decide on emptiness treat it as present or unknown | M C O | a new wire error (no caller tells it apart); a new integrity block variant (the consolidated draft: the blocked record needs addresses it would have to invent, and its copy says "derives a different address") |
| D15 | Test seams | dual read keeps plaintext seeds; one e2e read seam returning physical keys; a fixed-key unit helper; each arc moves its roots' e2e readers | O M | an armed read/write channel (M: under the dual read, a plaintext write with the physical key is enough) |
| D16 | Activation | each arc seals its roots when it merges; the format is frozen from A1 | M O | one dark flag flipped in the last arc (C: untested paths until the end) |
| D17 | dApp-session MAC | kept inside the sealed row; conversion seals without checking it; maintenance reads skip it | M, C (maintenance) | deleting it (O: correct only under a dual-secret row key; under D4 it is the one guard against a sibling's forged grant); checking the MAC before sealing (M: impossible in recovery mode, and redundant with the check at every read) |
| D18 | Privacy text | owner-signed wording and bump in A4 (OA-3) | O | leaving `legal/privacy.md` § 4 untrue after A4 |
| D19 | Decode reuse | `decodeParsed` split in wallet-core | O | a second codec path in the extension |
| D20 | Transaction identity | `(profileId, hash)` for rows, watches and lookups | C | lookups across every keyed profile with dedupe by hash (O: collapses two profiles' rows into one) |
| D21 | Transaction arming | at init only ownerless and keyed rows; the rest on `onRowKeysReady` | M (arm at open), Opus check | arming every readable row at init (O: polls a keyless profile's legacy row forever); hydrating only the active profile (C: drops A's in-flight finality after a switch) |
| D22 | `active-network@p` | plaintext | O | sealing it (M C: a random id, meaningless without the sealed network row; sealing would make the pointer unreadable to the pre-unlock gates for no gain) |
| D23 | Inner schema version | none in the envelope; the frame byte versions the crypto; the codec versions the shape | O | `s` in the envelope and the AAD (M) or a `payloadVersion` inside (C): the codec already reads every path-preserving shape, and a future unlock pass detects old rows by codec |
| D24 | Keyed-hash input | the segment alone, not bound to the root | M | a root-bound HMAC (C O): an account and its imported-key row must map one address to one value for the orphan sweep and the pair conversion |
| D25 | Incarnation binding | `pxeGeneration` in the HKDF salt | C | `profileId` only (M O): rows a deleted incarnation left would open under a re-created profile with the same id |
| D26 | `nulo:ui:*` keys, `activeAccount` included | plaintext, disclosed (KL-12); follow-up issue | O, Opus audit | sealing them behind the worker (M, and this plan before the audit: #865 refuses removing or migrating a structured shape, and its writer test pins live writers, so it needs a gate change that is a plan of its own); an opaque reference (C: the same #865 block, plus a second id scheme) |
| D27 | Log categories | three at `warn`, a keyless read at `debug` | M O | C's five: `locked` is the `debug` line, and schema or version failures are codec failures `EntityStorage` already logs |

## Audit verdicts

### Contradiction check (deep step 3)

- **Codex** (resumed draft session, gpt-6.1-sol high): **INCONSISTENT**, 11 findings, no ledger flips; it conceded its own capability design (D6/D7). All 11 were adopted after checking each against the code:
  1. a half-converted account pair fed the orphan sweep (`S/account/service.ts:211-216`): the sweep moves to unlock, and the pair converts in one `set` and one `remove`;
  2. dropping keys before the typed purges left transaction watches behind (`S/transaction/service.ts:343-368`): keys now drop after the purges (D11);
  3. restore, trust and fee-pick check-then-write sites were missing: D9 becomes an inventory rule;
  4. `isSoleOwner` is blind to sealed accounts: unknown ownership leaves a row ownerless;
  5. duplicate hashes across profiles: D20, `(profileId, hash)`;
  6. dApp maintenance reads and recovery-mode conversion: D17 amended;
  7. #865's real encoding, removal and golden guards (`baseline.ts:110,291-298,320`): the `sealed` flag on json shapes;
  8. a codec rename fails #865's preservation check (`:405-417`): D12 narrowed;
  9. the owner-facing promise ignored conversion timing and the shared-history exception, and OA-2 wrongly said the phrase spends imported accounts: both corrected;
  10. startup replay for every keyed profile;
  11. composition timing is not browser timing; KL-1 and KL-2 relabelled demonstrated, accepted.
  - Disposition of C's owner prerequisite on unattributable history: kept as KL-6, because the rows stay readable to the person and nothing on screen changes; it is disclosed in OWNER-ASKS.
- **Opus** (Plan agent, fresh): **CONSISTENT-WITH-FIXES**, 17 findings, no ledger flips. Adopted:
  1. the verified stamp and the stale-network record keep every address in plaintext (`S/account-integrity/types.ts:15-28`, `coordinator.ts:225-230`): A4 stores a keyed digest, and Outcome 1's scan covers all of storage minus a reviewed allowlist;
  2. the moved orphan sweep races an import (`S/account/service.ts:191-197,759-775`): `tupleLocks` and a re-check;
  3. keyless `purgeForProfile`;
  4. the heartbeat keeps the background alive (`wallet/runtime.ts:282-291`): OA-2, KL-4 and D7 corrected;
  5. D4 rests on recovery mode alone;
  6. e2e raw readers per arc, with the seam returning physical keys;
  7. per-root conversion locks, and D10's real trade-off;
  8. transaction arming (D21);
  9. stale text;
  10. KL-9 (a rollback hides sessions, it does not delete them);
  11. OA-3's listing lines and bump alignment;
  12. an unopenable row is a codec-hidden row (D14). Opus offered two options; the panel took today's codec-failure contract, which needs no new record;
  13. `rawAddressesForProfile` skips keyed tails;
  14. the shared-account selection change became OA-4. The double audit then removed it with the UI keys (D26);
  15. the chain-id disclosure;
  16. more D9 sites;
  17. the silent disputes, now D21-D27.

### Double audit (deep step 4)

- **Codex** (fresh session, gpt-6.1-sol high): **CONDITIONAL APPROVE**, 8 findings.
  - Adopted:
    - 2: arming under the transaction lock, with a deletion-epoch check;
    - 3: historical goldens keep their plaintext wire form, and sealed goldens are a separate set;
    - 4: KL-6 covers every legacy row whose owner cannot be established now;
    - 6: `waitForTx` takes the originating profile;
    - 7: `backup-restore-sw-restart` skips on Firefox, so its gate is Chrome-only;
    - 8: D14 scoped to the sealing layer.
  - Finding 5 (the pinned-tokens cross-context refresh) was adopted, then superseded when the UI keys left the lane (D26).
  - **Rejected, finding 1** ("a hidden account lets the integrity check pass"). A hidden sealed account is today's contract for a corrupt row (`liveRows`, `S/account/service.ts:177-183`). AEAD stops address substitution, so hiding can only make the wallet derive the next account of the person's own master. `pxeGeneration` is minted only for a new row (`S/profile/profile-row.ts:37,60`), so no live profile's keys change and no systematic hiding follows. The stale P8 line that promised a block was corrected.
- **Opus** (Plan agent, fresh): **CONDITIONAL APPROVE**, 11 findings; conditions 1-6, recommendations 7-11. All adopted:
  1. the physical-key contract for keyed-hash roots, and no re-seal of a row with a sealed twin;
  2. balances have no common lock (`balance-job-queue.ts:208-224,344-373`): compare-then-commit, with the one-round-trip window accepted;
  3. a per-root e2e grep table, and the full smoke suite on both browsers per arc;
  4. readers that do not filter by profile filter by the session's profile (`getTransactions(account)`);
  5. an exceptions sentence in the proposed policy text;
  6. #865's writer test pins the `nulo:ui:*` writers, and #865 forbids removing or migrating a structured shape. Rather than loosen that gate, the UI keys leave the lane (D26, KL-12, follow-up issue), which also retires P9 and OA-4. #865 is now cited by symbol;
  7. the conversion takes locks per row or batch, and P10 times unlock → Home against a base-commit build;
  8. the stale P8 clause;
  9. raw readers in the D9 inventory;
  10. KL-11;
  11. the size line, and KL-8 moved out of the known-limit table into the open issues.

### Final fresh pass (deep step 5)

- **Codex** (a new session, gpt-6.1-sol high): **CONDITIONAL APPROVE**, 3 conditions, all adopted:
  1. the balance conversion holds the balance service lock per row and skips a fenced id, so a purge can never be undone; a conversion-against-purge test proves it;
  2. the keyless refusal is a visible change: named under UI impact and asked as OA-4, and A1 waits for it;
  3. the `accountSetDigest` fields are scanned, never allowlisted, and both digest writers are tested.
- On re-read it corrected one test's interleaving (P6) and then gave **APPROVE**: "all three review conditions are satisfied".

## Security & Adversarial Considerations

- **Attackers, by capability:**
  - **T1 reads storage** (stolen laptop, disk image, synced profile, an extension with storage access). It gets ciphertext for every sealed root. Its work factor is the password, as for the master (`ATTACK-SURFACE.md` § Cost). Passkey profiles have no offline path.
  - **T2, the same-phrase sibling, or a phrase holder with the disk.** It derives the row keys (KL-3). It cannot forge a dApp grant (D17) or open imported signing keys (DEK).
  - **T3 writes storage offline.** It can:
    - delete rows;
    - roll a row back to an earlier value at the same key (KL-1);
    - plant plaintext rows, which the dual read accepts and the next unlock seals, as plaintext is trusted today (KL-2; dApp sessions exempt through their MAC).

    It cannot move a sealed row across keys, roots, profiles or incarnations, and cannot forge one (AEAD with the AAD; proven by unit test).
  - **T4, code execution in the extension.** Out of scope (`ATTACK-SURFACE.md`). Newly stated: on a locked, live worker it gets the row keys of profiles opened in that worker's lifetime, never the master (KL-4).
  - **T5, Firefox content scripts sharing `storage.local`** (closed known limit #687). They now see ciphertext for the sealed roots.
- **What stays visible to T1:**
  - root names; natural random or sequence ids; keyed-hash values and their equality within one profile; the `profileId` in each envelope, giving per-profile row counts; the `p|net` scope of incoming keys;
  - ciphertext length (plaintext + 29 bytes, before base64), so sizes (KL-5), and write times;
  - chain ids kept in account, imported-key and `authwit-status` keys, giving per-profile, per-chain account counts;
  - every plaintext root in the boundary table: profile names, types and fingerprints; the blocked record and the reset journal holding addresses while a block or a reset stands;
  - rows of a profile not opened since the update;
  - old plaintext pages the browser's storage engine has not compacted (KL-7, plausible but unverified);
  - lenient-mode bearers and exported backups, both unchanged;
  - the `nulo:ui:*` keys: pinned token contracts, fee-payer picks, the last-selected account address (KL-12).
- **Failure behavior:** a decrypt failure never throws past the store and never deletes on read, following `EntityStorage`'s reasoning about write races (`entity_storage.ts:117-126`).
  - A rollback to a 1.0.x build hides every sealed row (codec failure, kept), dApp sessions included: `mac-storage.ts:36-46` decodes through the inner codec before the MAC check, so an envelope is hidden before `verifyOrDrop` sees it. Demonstrated by code trace; KL-9.
- **Crypto:**
  - WebCrypto HKDF-SHA256, HMAC-SHA256 and AES-256-GCM only; no dependency.
  - Labels are vector-pinned. `ENCRYPTION_GUARD` and every existing vector stay byte-identical.
  - Keys are non-extractable and live in worker memory only; the popup and the offscreen document never hold one.
- **E2E seam:** it exists only in e2e-stamped builds and is grep-guarded out of production.
- **Supply chain:** no new package; `bun.lock` unchanged.

## Assumptions

- **Facts:**
  - every file:line above;
  - `realMigrations` is empty and `BASELINE_VERSION` is 1 (`wallet/storage/migrations/index.ts`);
  - the engine runs before unlock (`wallet/runtime.ts:221-271`);
  - `unlimitedStorage` is granted (`apps/extension/manifest/manifest.config.ts:46`), so base64 growth has no quota effect;
  - only passkey restores stash the master after commit (`S/profile/service.ts:2528`); both commits hold it in scope;
  - the recovery banner names "chain data, dApp sessions and imported accounts" (`RecoveryModeBanner.vue:11-12`).
- **Inferences:**
  - (I1) Opening every readable row on `getValues` is small next to the full-area read each call already makes (`entity_storage.ts:225-227`). Plausible but unverified; measured in A1, A2 and A3.
  - (I2) #865's A1 and A4 are on `dev` before A1 here starts. If not, A1 waits.
  - (I3) No 1.0.x writer creates a tx row without `profileId` except `restore()` of an older backup (both production writers pass a fence: `S/execution/dapp-send-executor.ts:763-776`, `transfer-executor.ts:448`).
  - (I4) tx-record-1's `feeChoice` lands before A2; A2 seals whatever shape is on `dev`.
- **Asks** (working assumption in brackets): OA-1 [A, keep names]; OA-2 [approve the posture]; OA-3 [the wording drafted in OWNER-ASKS, patch bump]; OA-4 [A, accept], answered A (P74-02); OA-5 [A, accept], answered A (P74-03).

## Phases and gates

Every gate runs `bun run lint` and `bun run typecheck:all` (exit 0), `bun run test` (all green), and `bun run check:plans` when plan files change. E2E runs at `--retry=0`, only while `load1 < 150`, polled inside one tool call. Each new e2e scenario names below the failure mode it proves, why a cheaper layer cannot, and its estimated runtime. The PR states the measured runtime and the per-browser suite wall-clock before and after.

### A1: the sealing layer, contacts, dApp sessions

**P1, crypto.**
- **Files:**
  - `packages/wallet-crypto/src/{aes-gcm-frame,row-seal}.ts` (new) with their tests;
  - `imported-account-key-box.ts` and `imported-keys-dek-box.ts` (on the frame);
  - `index.ts` (exports; not `public.ts`);
  - `packages/wallet-crypto/reference/row-seal-v1/` (generator);
  - `wallet/crypto/key-vectors.test.ts` (fixed-IV vectors for both existing boxes, then V12);
  - `nonce-uniqueness.test.ts`.
- **Tests:**
  - both fixed-IV vectors are committed and green **before** the frame refactor, in a separate commit;
  - V12 opens the reference frame, and a mocked-IV seal equals it byte for byte;
  - the keyed-hash vector;
  - changing the profile, the incarnation, the master, the root, the storage key or the AAD profile each fails to open.
- **Gate:** all existing vectors byte-identical (`git diff` of their expected values is empty); new vectors green.

**P2, keyring, store, deletion step, seam.**
- **Files:**
  - `S/profile/row-keyring.ts` (new); `S/profile/service.ts` (fill at the five sites, no fill for a reserved id, drop after the typed purges, accessors, `onRowKeysReady`);
  - `packages/wallet-core/src/storage/entity_storage.ts` (`decodeParsed`);
  - `wallet/storage/{sealed-entity-storage,sealed-roots,sealed-entity-storage.testing}.ts` (new);
  - `S/profile-deletion/coordinator.ts` (keyless step, resume included);
  - `wallet/runtime.ts` (`armPostStartWork` replays `onRowKeysReady` for every profile in the keyring);
  - `src/e2e/sealed-dump.ts`, `.github/workflows/_build-extension.yml` (marker);
  - #865's `wallet/storage/stored-shapes.ts` and `stored-shapes/baseline.ts` (the `sealed` flag, the golden seal/open, the downgrade and migration guards);
  - the check-then-write inventory (D9) in the PR body.
- **Unit tests:**
  - round trip;
  - a raw scan of `MemoryStorageArea` for marker strings finds none;
  - key, profile, root and incarnation swaps are hidden and kept, with the category logged and no payload in captured console output;
  - legacy read;
  - `sealLegacy` is idempotent and resumes after an area that throws mid-loop;
  - keyed-hash dedupe;
  - the physical-key contract: a delete inside the dual-read window does not bring the row back, and a write made before the conversion survives it;
  - the conversion's compare-then-commit leaves a row alone when its raw value changed between the read and the commit;
  - `prepare`/`commit` dispatches synchronously after a passing check;
  - keyless writes throw `WalletLockedError`;
  - #865: a stamp that drops `sealed` and a migration whose footprint names a sealed root both fail.
- **Keyring tests:**
  - keys survive lock and switch, and are dropped at delete;
  - present before `verifyBeforeSessionOpen` and before restore slices;
  - recovery mode has keys;
  - the same keys after a password change;
  - a new incarnation gets different keys;
  - a delete racing an open leaves no entry;
  - startup replay reaches a handler that attached after the unlock.
- **Gate:** the commands above plus `bun run test:all` and `bun run test:ci-gating` (`.github` changed), all green.

**P3, contacts and dApp sessions.**
- **Files:**
  - `S/contact/service.ts` (store, the check-then-write sites, conversion handler);
  - `S/dapp-session/{service,mac-storage}.ts` (MAC layer over the sealed store; conversion without a MAC check; `rowsForProfile` opens with row keys; keyless `purgeForProfile`);
  - #865's `stored-shapes` entries, goldens and re-stamp;
  - `tests/e2e/helpers/contacts.ts` (reads through the seam);
  - docs: SECURITY.md § Storage privacy and § Crypto-bound invariants (labels, frame, AAD), `ATTACK-SURFACE.md` (the row, T2 and T4 lines), `packages/wallet-crypto/README.md`, ARCHITECTURE §5 §7, CLAUDE.md § Persisted-storage (sealed roots are never migrated by the pre-unlock engine), the `logging-policy` skill (the categories).
- **Composition tests** (`*.composition.test.ts`, real services over `FakeBrowserApi`, within the COMPOSITION-TESTS.md limits):
  - two profiles' legacy rows: unlocking P seals only P's, and the values are equal;
  - restore before finalize writes sealed rows that finalize reads;
  - deleting a locked profile removes its rows with no key and keeps the other profile's;
  - recovery mode reads contacts and hides sessions, as today, and its unlock converts both;
  - a dApp refusal after a lock and after a switch deletes the app's rows; with no row key it reports `unavailable`;
  - a tampered legacy session is dropped.
- **Smoke e2e `tests/e2e/sealed-storage.test.ts`** (new; Chrome and Firefox; persistent `userDataDir` with `tests/e2e/migration.test.ts:115-136`'s mechanics):
  - add a contact and scan raw storage: no marker;
  - seed legacy plaintext contact and session rows, relaunch (cold boot, locked), scan: the legacy rows are present;
  - unlock, wait for the conversion, scan: no marker remains;
  - the contact rows render (count by testid).
  - Failure mode: a real MV3 worker or Firefox event page doing WebCrypto over real persistent storage across a strict-mode cold boot. The composition layer runs real WebCrypto under Bun but fakes the other three.
  - Estimate: 60 s Chrome, 90 s Firefox.
- **Perf:**
  - `sealed-storage.test.ts` times the conversion of 2 000 seeded contact rows and one contacts list load on each browser (median of 5 loads). The composition layer's timing is runtime-only evidence, since it runs on `FakeBrowserApi`.
  - A list load slower than today's by over 50 ms stops for a decision.
- **Gate:**
  - `bun run baseline:storage` (sums stable on rerun) and #865's R1-R4 green;
  - `cd apps/extension && bun run test:e2e -- tests/e2e/sealed-storage.test.ts --retry=0`, then `contacts.test.ts`, `send-keyboard.test.ts`, `backup-roundtrip.test.ts`, `migration.test.ts`, `wallet-lock.test.ts`, each also under `NULO_E2E_BROWSER=firefox`;
  - `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/{connect-dapp,connect-verify-mismatch,verify-hold,connect-locked-queue,cap-request-partial,scope-refusal,data-privateEvents,connect-unserved-chain,cap-widening}.test.ts`, then the same under `NULO_E2E_BROWSER=firefox`;
  - all green at retry 0.

### A2: history

**P4, journal.**
- **Files:**
  - `S/operation-journal/{service,reaper,gc,send-check}.ts` (store, conversion under `transitionLock`, `reap` takes `profileId`, `SendCheck` watches on retention);
  - `wallet/runtime.ts` (subscriptions);
  - `tests/e2e/fixtures/{journal,journal-page}.ts` (through the seam);
  - the re-stamp.
- **Composition tests:**
  - a lock while queued and while proving: `session_ended` lands sealed and reads back after re-unlock as "Stopped when the wallet locked";
  - a fresh worker over sealed non-terminal rows: the boot sweep skips them; the unlock fails them with `stale_on_resume`/`sw_restart_post_prove`; terminal and post-boot rows are untouched;
  - GC and the tick skip a profile with no keys;
  - after a switch, A's broadcast completion writes A's sealed row.
- **Gate:**
  - `bun run test:all`, `bun run test:ci-gating`;
  - the full `bun run e2e:agent` on Chrome;
  - Firefox twins of `lock-cancels-dapp-send`, `auto-lock-defers-while-proving`, `inflight-call-background-death`, `failed-send-check`, `firefox-background-restart`;
  - smoke `sw-resilience.test.ts` and `wallet-lock.test.ts` on both browsers;
  - activity-list load over 500 seeded journal rows, timed in the browser before and after; over 50 ms slower stops for a decision.
- `lock-cancels-dapp-send` gains one assertion: the cancelled record's raw value is an envelope. No new scenario.

**P5, transactions.**
- **Files:** `S/transaction/service.ts` (keyed-hash store, `ownerless` legacy, arming split into init plus the retention handler under the transaction lock, sole-owner adoption with unknown ownership, `restore()` stamps the profile, `(profileId, hash)` identity, `waitForTx` with the originating profile); `S/auth-registry/service.ts:395,444` (pass the profile); the re-stamp.
- **Composition tests:**
  - no tx hash in any key after conversion;
  - re-arm on unlock;
  - sole-owner adoption, and unknown ownership when another profile's account row is unreadable;
  - shared rows kept and marked;
  - restore's duplicate check within the destination profile against both key forms;
  - two profiles holding one hash keep two rows and two watches;
  - an arming parked across a deletion leaves no watch and sends no receipt request;
  - `waitForTx` across a profile switch, and with one hash in two profiles, waits on its own profile's entry;
  - deleting a profile with a watched pending tx leaves no watch.
- **Gate:** P4's commands, plus network `delete-after-prove`, `profile-switch-sweeps-transfer` on both browsers, and `backup-restore-sw-restart` on Chrome only.
  - That spec skips on Firefox (`describe.skipIf(isFirefox)`, `backup-restore-sw-restart.test.ts:89`). Firefox restore evidence comes from `firefox-background-restart` and the composition restore and rollback tests.

### A3: projections of private state

**P6, balances and authorizations.**
- **Files:**
  - `S/token-balance/{balance-repository,balance-job-queue,service,balance-identity}.ts` (store; prepare, fence, commit; the legacy sweep skips envelopes, `balance-identity.ts:35`);
  - `S/auth-registry/service.ts` (both roots; the enable flags keyed-hash the account);
  - the re-stamp.
- **Tests:**
  - the fence ladders still win against an interleaved delete (existing tests, sealing on);
  - numeric key identity checked inside the seal;
  - Home's balance load over 2 000 seeded balance rows timed in the browser, same 50 ms rule;
  - conversion against purge: park the conversion at its final read, start the purge and assert it waits, release the conversion, await both, then assert the row is physically absent.

**P7, incoming.**
- **Files:** `S/incoming-transfer/{repository,service,balance-outbox}.ts` (scoped keyed-hash keys, sealed arrivals, trust, cursors and outbox, the sealed-items builder for `commitAcceptance`); the re-stamp.
- **Tests:**
  - `clearChain`/`clearProfile` by prefix keep working;
  - after conversion no note hash, tx hash, account or contract appears in any key or value.
  - Network `incoming-transfers.test.ts` gains a raw-scan assertion for the real note hash; no new scenario.
- **A3 gate:**
  - P6/P7 tests, `bun run test:all`;
  - network `incoming-arrival`, `incoming-public-transfers`, `incoming-transfers`, `balance-row-reconciliation`, `authwit-lifecycle`, `account-balance-orphans` on Chrome and Firefox.

### A4: identity roots, close

**P8, accounts, imported keys, tokens, networks, fee payers.**
- **Files:**
  - `S/account/{service,spec,imported-keys-repository}.ts` (keyed-hash address segment, shared by both roots; the orphan sweep compares natural ids after opening, under `tupleLocks`; `rawAddressesForProfile` skips keyed tails);
  - `S/account-integrity/coordinator.ts` (reads through the keyring; the keyed digest for the stamp and the stale-network record);
  - `S/token/{service,seeder}.ts`; `S/network/service.ts`; `S/fpc/service.ts`;
  - the root census (below); the re-stamps.
- **Tests:**
  - the pre-open check passes on a sealed populated profile; a swapped account row is hidden and kept, exactly as a corrupt row is today (D14);
  - both digest writers, full verification (`coordinator.ts:176,225`) and runtime classification (`classifyRuntimeMismatch`), store digests holding no address marker, and an account-set change still invalidates the comparison;
  - the password-change pre-open check passes;
  - recovery mode lists accounts;
  - an orphan sweep across two profiles with the same imported address keeps both;
  - a crash between sealing an account pair and removing the old keys: the next boot deletes no signing key, and the next unlock finishes the pair;
  - a 1.0.x tombstone still purges.
- **Root census:** a unit test lists every `nulo:` root the build constructs and fails on one that is in neither `SEALED_ROOTS` nor the reviewed plaintext list with its reason. This is the guard for #875 or any later root.

**P10, close.**
- **Files:**
  - `legal/privacy.md`, `apps/extension/store/listing.md` and the `@nulo/legal` manifest, per OA-3;
  - SECURITY.md (the final boundary, the threat-model rows T2 and T4);
  - `ATTACK-SURFACE.md`; `S/backup/README.md` (sealed roots' scratch form is the DTO; no migration covers them); ARCHITECTURE §4 §5 §10;
  - the known-limit issues filed and closed; the unlock-pass issue filed;
  - `Closes #522`.
- **Populated-install proof:**
  - If #865's update harness (`tests/e2e/fixtures/update/`) is on `dev`: update a populated 1.0.x install in place on both browsers, unlock, and assert the raw scan and the row counts.
  - Otherwise `sealed-storage.test.ts` gains the seeded all-roots variant (estimate 90 s Chrome, 120 s Firefox).
  - Either way it times unlock → Home ready on the populated legacy install, against the same seeded spec run on a build of the base commit, which is the baseline. Over 50 ms slower stops for a decision. It also times an incoming-records load, the one root whose size no code bounds.
- **Gate:**
  - everything above;
  - network `backup-restore-integrity`, `backup-migration-roundtrip`, `profile-reimport-matrix`, `frozen-account-canary` (accounts sealed must not change addresses);
  - smoke `backup-migration.test.ts` (a pre-release backup fixture imports and lands sealed) and `security-reset.test.ts`, on Chrome and Firefox;
  - OA-3 signed, quoted in the PR body.

## Delivery

| Arc | PR title (≤ 93 chars) | Issue line |
|---|---|---|
| A1 | `feat(storage): seal contacts and dapp sessions at rest under a per-profile key` | `Refs #522`; OA-4 and OA-5 answered A (P74-02, P74-03) |
| A2 | `feat(storage): seal the journal and transaction history at rest` | `Refs #522` |
| A3 | `feat(storage): seal balances, authorizations and incoming receipts at rest` | `Refs #522` |
| A4 | `feat(storage): seal accounts, tokens, networks and fee payers at rest` | `Closes #522` |

- **Order:** strictly A1 → A2 → A3 → A4. A1's asks are answered (P74-02, P74-03) and A4 waits for OA-3, each quoted in its PR body. Each branches from `dev` after the previous one merges; none is stacked.
- **A1's landing (P74-01 A):** inside 1.0.0, after #938 (the stored-shape freeze), after the owner's own build test and after one green nightly soak; the 1.0.0 promote waits for it. Once #938 is on `dev`, A1 merges `dev` and re-stamps with `bun run baseline:storage -- --additive "<why every stored row still reads>"`, adds the pin it prints, then reruns the update replay on both browsers.
- **Issues:** #522 is closed by A4. #523 is reopened and closed by A1, its reopening condition met.
- **Filed at close-out, open:**
  - the unlock-time migration pass with its #865 acceptance path, triggered by the first non-codec change of a sealed root or a crypto rotation;
  - moving the `nulo:ui:*` keys behind the worker, triggered by #865 gaining a retirement path for a structured shape.
- **Filed at close-out, closed:** the known limits below, labelled `known-limit`.
- **Overlaps** (each arc rebases on whatever has merged):
  - **migration-rule-1 (#865):** a hard prerequisite (registry, factories, freeze). This lane adds a `sealed` flag to `encoding: "json"` shapes, adapts its baseline in A1 and re-stamps in every arc, and edits CLAUDE.md § Persisted-storage after it.
  - **tx-record-1:** its `feeChoice` touches txs/journal rows. It lands first (I4); A2 seals that shape.
  - **mainnet-arrival-1 (#875):** any per-profile root it adds is caught by A4's root census and classified there.
  - **#976 (dApp registration counts):** `nulo:core:dappRegistrations@p` names each origin that registered on a chain, in plaintext; A4's root census classifies it, and SECURITY.md § Storage privacy discloses it until then.
  - **harden-security-fixes-3 arc 3:** it touches dApp tagging sources (`S/execution/service.ts:177`), not a stored root by name. If it adds one before A1, A1 classifies it. SECURITY.md is edited by both: rebase.
  - **ui-picks-1 and a11y-errors-1:** popup surfaces only; this lane changes no popup file now that the UI keys stay out. No shared file found.
  - **connect-split-1:** it touches the connect window and dApp-session flows A1 seals. A1 changes the store under `DappSessionService`, not its RPCs; rebase.
  - **onboarding-3 arc 2:** it touches profile creation, which reaches `openSessionVerified` (`S/profile/service.ts:641`), a keyring fill site. A1 adds the fill inside `openSessionVerified`, not in the creation flow; rebase if both touch it.
  - **firefox-sidebar-1:** Firefox-only surfaces. A1's smoke spec runs on Firefox; no shared file found.
  - **viewer-flake-1, egress-flake-1:** e2e fixtures. A2 edits `fixtures/journal.ts`; rebase on whichever lands first.

## Post-implementation

- The standard is `implementations-plan/README.md` § Post-implementation standard at `2f591ddd`.
- Per arc, after the gate passes and before the PR opens: the Codex fix loop (`run-codex.sh … high read-only gpt-6.1-sol`), adversarial plus implementation review, with a hard stop at 3 rounds. Unresolved findings go to the PR body with their proportion label.
- Beside round 1, one Opus review of the same diff.
- `/code-review` is off.
- Teardown after A4 merges and the plan closes on `dev`: `agent-worktree done encryption-at-rest-1 --merged`.

## Known limits

Each is a closed `known-limit` issue, with its reopening condition. KL-8, the unlock-time migration pass, is open work: #1050.

| | Issue | Limit | Label | Reopen if |
|---|---|---|---|---|
| KL-1 | #1052 | A row rolled back to an earlier value at its own key, or a whole-storage rollback, is accepted | demonstrated, accepted: T3 is in the threat model, and no trusted monotonic store exists to anchor freshness | a trusted monotonic store becomes available |
| KL-2 | #1053 | Plaintext rows planted offline are read and then sealed at the next unlock (dApp sessions exempt through their MAC) | demonstrated, accepted: today every row is plaintext and trusted, so this is no regression | a release can drop the legacy reader |
| KL-3 | #1054 | A same-phrase sibling, or a phrase holder with the disk, derives the row keys | demonstrated by construction (D4) | recovery mode and the pre-open checks stop needing master-only reads |
| KL-4 | #1055 | Row keys of opened profiles stay in a locked, live worker's memory | needs unsupported conditions (T4) | memory readers come into scope, or OA-2 asks to drop at lock |
| KL-5 | #1056 | Counts, owners, sizes and timing are visible; no padding | demonstrated | a size-correlation attack on a sealed root is shown |
| KL-6 | #1057 | Legacy tx rows with no `profileId` stay plaintext while their owner cannot be established: shared by several profiles, or on a chain where another profile's accounts cannot be read yet (A4 on), or after a converted profile was deleted from a worker that never opened it | demonstrated | a user report |
| KL-7 | #1058 | Old plaintext pages remain in browser storage files until compaction | plausible but unverified | a disk scan shows them after compaction |
| KL-9 | #1059 | A rollback to a 1.0.x build hides every sealed row until the newer build returns | demonstrated | a rollback release is planned |
| KL-10 | #1060 | A profile not opened since the update stays plaintext | demonstrated | a way to convert without the password exists |
| KL-11 | #1061 | A "They don't match" refusal made after the background restarted while the check page was open finds no row key, reports `unavailable`, and leaves the app's remembered grants; the next connect still shows the emoji check, so nothing is granted silently (OA-4) | demonstrated, needs a background restart with the check page open | a user report, or the refusal gains a keyless path that needs no origin filter. Accepted (P74-02 A); #944 (merged as `bf6a25f2`) closes the check window at every background restart, which removes the path |
| KL-12 | #1062 | The `nulo:ui:*` keys stay plaintext: pinned token contracts, fee-payer picks, the last-selected account address | demonstrated | #865 gains a reviewed retirement path for a structured shape (the follow-up issue) |

## Seeds

- `/goal`: "Ship encryption-at-rest-1 arc by arc per `implementations-plan/encryption-at-rest-1/plan.md`. Every profile-scoped root in the boundary table is sealed under the per-profile row key, with the dual read for legacy rows and conversion at first unlock. Each arc's gate is green at retry 0 on Chrome and Firefox; the Codex loop converged in at most 3 rounds; OA-3 is signed before A4 merges."
- `/loop`: "Read STATUS.md and the plan's current arc. Run the next unchecked gate command at load1 < 150. Fix the first red with a root cause (no retry, timeout or skip). Commit small and signed, update STATUS.md, and stop at the PR boundary for the orchestrator."
