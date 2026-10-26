# Phase A1: core and seams

## 2026-10-25 · A1.2: the classifier cannot be the stored-shape schema

Attempt 1: the repository classified every row with `ProfileRowSchema` (the stored-shape entry, which requires `envelopeMac`, `dekSealed`, `walletFingerprint`) and hid a row that failed, as `EntityStorage` hides a row that fails its codec. Six tests in `P/service.integration.test.ts` went red: a password row whose `envelopeMac` is deleted or non-string must unlock derived-only (`:4329-4357`), and a restored passkey row whose `type` is edited must keep its finalize refusal (`:4446-4500`). Hiding turned both into "Invalid profile id".

Cause: the stored-shape schema says what writers write; the runtime has to decide which unlock reads a row, and the degradation rule tolerates damage to exactly the fields the writer schema requires (MAC, DEK slot, fingerprint).

Codex consult (gpt-6.1-sol, high, read-only): the split is right, high confidence. Accepted: return only the validated unlock fields, derived with `.pick()` from the writer variants so one definition stays the source; record that a type-edited row is now refused before any decrypt, and pin it; in A2, `unreadable` must not mean hidden, and the passkey export and silent restore must go through the classifier. Rejected: none. Decision: plan.md D19, D20.

## Smaller deviations

- `RestoreMaterial` and its decoder live in `P/restore-material.ts`, unit-tested on their own; A2 moves the type to `P/spec.ts` if the RPC takes it.
- `openSlots`'s DEK opener takes the sealed blob, because unlock opens the re-read row's DEK, as before.
- A password slot that is not a string now opens to `null` in `PasswordSecretBox` instead of throwing from `Buffer.from`; the classifier keeps such a row from reaching it.

## 2026-10-25 · Mutation pass

Each check A1 adds or touches was broken by a one-site scratch edit. The relevant suite then ran (all of `WC/`; the narrowest `P/` files first, then `P/service.integration.test.ts`), the red tests were recorded, and the file was restored from memory. The runner and its 59 edits live in the scratch directory, outside the tree. Round 1: 51 caught, 7 survived, 1 equivalent. A test was added for each survivor, and the survivors were re-run: all caught. After the fixes, 58 of 58 non-equivalent mutations were caught. The pass was re-run in full on the final head; see the final section below.

| id | mutation | caught by (one named red test) |
|---|---|---|
| K1 | `derivePasskeyUnlockKey` drops the PRF length refusal | `WC/passkey-unlock-key.test.ts` › refuses a short PRF output |
| K2 | drops the `prfSalt` length refusal | › refuses a short salt |
| K3 | the PRF refusal accepts a longer PRF (`<`) | › refuses a long PRF output |
| K4 | the salt refusal accepts a longer salt | › refuses a long salt |
| S1 | `sealProfileSlots` drops the entropy length refusal | `WC/password-secret-box.test.ts` › rejects entropy that is not exactly 32 bytes |
| B1 | HKDF ignores `prfSalt` (a zero salt) | `WC/passkey-unlock-key.test.ts` › matches the pinned HKDF-SHA256 vector |
| B2 | HKDF reads only 16 salt bytes | › matches the pinned HKDF-SHA256 vector |
| B3 | HKDF info label dropped | › matches the pinned HKDF-SHA256 vector |
| B4 | PRF and salt swapped | › matches node:crypto over fresh random PRF outputs and salts |
| B5 | the unlock key is extractable | › the key is AES-256-GCM, encrypt and decrypt only, and cannot be exported |
| B6 | the unlock key is AES-128 | › the key is AES-256-GCM, … |
| A1 | entropy AAD label equals the master's | `WC/password-secret-box.test.ts` › the master ciphertext moved into the entropy slot fails |
| A2 | guard AAD label equals the master's | **survived round 1**; now `WC/profile-slots.test.ts` › the purpose AADs are byte-frozen, and › a slot moved into any other slot of its own row opens to null |
| A3–A5 | seal: guard / secret / entropy under another slot's AAD | `WC/password-secret-box.test.ts` › seal/unseal round-trip; `WC/passkey-secret-box.test.ts` › open to the sealed master and entropy |
| A6–A8 | open: guard / secret / entropy under another slot's AAD | same round trips |
| A9 | passkey frames drop the AAD on seal and open | `WC/profile-slots.test.ts` › a slot moved into any other slot of its own row opens to null |
| A10 | password frames drop the AAD on seal and open | `WC/password-secret-box.test.ts` › the master ciphertext moved into the entropy slot fails |
| G1 | the opened guard is not compared with the constant | **survived round 1**; now `WC/profile-slots.test.ts` › a guard that authenticates but does not hold the guard constant opens to null |
| G2 | a guard that fails to open is not refused | `WC/password-secret-box.test.ts` › unseal with a corrupted guard returns null |
| G3 | a master slot that fails to open is not refused | › unseal with a corrupted secret returns null |
| G4 | an entropy slot that fails to open is not refused | › unseal with a corrupted entropy returns null |
| G5 | a failed open throws instead of returning null | › unseal with a wrong password returns null |
| C1 | password variant ignores `type` | `P/profile-row.test.ts` › a password row typed as anything else is unreadable |
| C2–C4 | password variant ignores `guard` / `secret` / `entropy` | › a password row with no guard / no master slot / no entropy slot is unreadable |
| C5 | passkey variant ignores `type` | › a password-typed passkey row is unreadable |
| C6 | passkey variant ignores `credentialId` | › a passkey row with no credential id is unreadable |
| C7 | the password class carries the whole raw row | › sorts each row a build writes into its own kind, carrying only the fields it checked |
| C8 | the fallback class is passkey, not unreadable | › a password row with no guard is unreadable |
| C9 | the classifier throws on a non-object | › null is unreadable; › never throws on any value a decoded row can hold |
| C10 | the password variant accepts any slot value | › a password row with a non-string slot is unreadable; › over generated rows, every row lands in the one kind its unlock fields decide |
| O1 | `openSlots` classifies the row ignoring its `type` | `P/service.open-slots.test.ts` › a row typed as neither unlock, its slots intact, reaches no decryptor on any password path |
| O3 | `openSlots` drops the classification refusal | › same |
| O4 | `openSlots` does not refuse slots that fail to open | `P/service.integration.test.ts` › exportPlain with wrong password throws with InvalidPasswordError's legacy message |
| O5–O10 | `unlockProfile`, `changeProfilePassword`, `exportPlain`, `openBackupTransfer`, `exportImportedKeysDek`, `exportMnemonic` each ignore a refused open | `P/service.open-slots.test.ts` › … reaches no decryptor on any password path |
| O11 | the password restore's finalize ignores a refused open | `P/service.integration.test.ts` › finalizeRestore() with wrong password throws InvalidPasswordError |
| O12 | `openDek` opens the snapshot's DEK, not the blob passed | **equivalent**: no write changes a password row's DEK slot while its slots stay the same (create, import, restore and password change all reseal the slots), so the re-read row that unlock checks carries the snapshot's slot, and a planted one fails the envelope MAC either way |
| P1 | `unlockProfile` skips the pairing check | `P/service.integration.test.ts` › transplanting another profile's entropy is caught at unlock |
| P2–P4 | `exportPlain`, `openBackupTransfer`, `exportMnemonic` skip the pairing check | **survived round 1**; now `P/service.open-slots.test.ts` › every path that opens both slots refuses a row holding another profile's entropy |
| P5 | the password restore's finalize skips it | **survived round 1**; now › a password restore's finalize refuses a restored row holding another profile's entropy |
| P6 | the password change skips it on the resealed slots | **survived round 1** (the envelope MAC refused first, with another message); now › every path that opens both slots refuses … |
| P7 | the pairing check never refuses | › every path that opens both slots refuses …; › a password restore's finalize refuses … |
| R1 | restore accepts a master of any length | `P/restore-material.test.ts` › refuses a short master |
| R2 | restore accepts entropy of any length | caught only by `P/service.integration.test.ts` in round 1, because the phrase encoder refuses 31 bytes with the same message; now `P/restore-material.test.ts` › refuses a 12-word phrase's entropy |
| R3 | restore skips the entropy-derives-master check | › refuses entropy from another phrase |
| R4 | restore accepts a transfer key of any length | › refuses a short transfer key |
| R5 | a missing transfer key defaults to a zero key | › refuses no transfer key |

What the survivors had in common: the existing suites proved each refusal at one site, the first that hit it, and then reached every other site only through a check that ran earlier (the guard comparison behind authenticated decryption; the envelope MAC behind the pairing check). One test per property, driven through every site, closed all five pairing sites at once.

## 2026-10-25 · Review round 1

- Codex (gpt-6.1-sol, high, read-only, session kept for the resumed rounds): approve, high confidence, no material defect. Two nits, both verified and accepted: the slot opener's comment named a refusal message no caller gives; the success-control comments claimed a path they did not run (`4db4f077b`).
- Opus (a fresh read beside it): approve, no bugs. Every point verified against the tree and accepted:
  - the opener's test watched only the slot decryptor, so a DEK opened before the slots would pass; it now spies on `EncryptionKey.prototype.decrypt` and adds the restore finalize;
  - no test covered the buffer wipes A1 gathered into one place, and the mutation table had no wipe edits;
  - the wallet-crypto README's file map lacked the three new files and named the wrong home for `ENCRYPTION_GUARD`;
  - the password class carried `type` beside its slots;
  - two delegate comments and a stale tag in a comment A1 re-indented.
  Committed as `43205d984` and `389b5cb5b`. Rejected: none.
- Mutations added for these, run against the new tests: C11 (the class keeps `type`), O13 (`exportImportedKeysDek` opens the DEK before the slots), Z1–Z10 (each wipe in `openSlots`, `OpenedSlots.wipe`, `decodeRestoreMaterial` and `openProfileSlots`). Z5 and Z8 survived the first run: the refused inputs were zero bytes already, so a missed wipe looked the same as a wipe. With non-zero inputs, all 13 are caught.

## 2026-10-25 · Review rounds 2 and 3, and the final mutation pass

- Codex round 2 (resumed): approve, both points verified and accepted (`1476a4d84`). The wipe test pinned exact buffer counts (1, 3, or 5 for the password change, which also reopens what it resealed): that is the implementation's allocations, not the wipe contract, so it now checks a lower bound and that every captured buffer is zero. The README said V8 pins `ENCRYPTION_GUARD`; V8 pins `PASSKEY_PRF_LABEL`, and the guard's pin is the canary in `password-secret-box.test.ts`.
- Codex round 3 (resumed): approve, no new finding. Converged in three rounds.
- Final mutation pass on `1476a4d84`, all 71 mutations: 70 caught, 1 equivalent (O12). The 59 of round 1 plus C11, O13 and Z1–Z10:

| id | mutation | caught by |
|---|---|---|
| C11 | the password class keeps `type` | `P/profile-row.test.ts` › sorts each row a build writes into its own kind, carrying only the fields it checked |
| O13 | `exportImportedKeysDek` opens the DEK before the slots | `P/service.open-slots.test.ts` › … reaches no decryptor on any password path |
| Z1 | `openSlots` keeps the passhash when the slots refuse | › the passhash, master and entropy it opens are zero once each path returns, refused or not |
| Z2–Z4 | `OpenedSlots.wipe` keeps the master / entropy / passhash | › same |
| Z5–Z8 | each `decodeRestoreMaterial` refusal keeps a buffer it decoded | `P/restore-material.test.ts` › refuses …, wiping what it decoded |
| Z9 | `openProfileSlots` keeps a master it does not hand back | `WC/profile-slots.test.ts` › what it opened is wiped when a later slot fails, and the guard always |
| Z10 | `openProfileSlots` keeps the opened guard | › same |

