# Phase 0: planning consults

## 2026-10-25 · Codex, the key hierarchy (gpt-6.1-sol, high, read-only)

Asked as its own consult before the plan's review: what each stored blob is sealed under, what protects a backup and an export, and the smallest correct design.

**Verdict:** the proposal holds with refinements; no blocking defect under the stated attacker model.

Accepted:
- One per-profile random 32-byte `prfSalt`, used as the passkey's PRF input and as the HKDF salt of the unlock key. No second stored secret: it adds nothing once storage is read. `prfSalt` is kept out of every artifact that leaves the wallet (backups, exports, logs, the passkey's own metadata).
- Unlock key = HKDF-SHA256(PRF output, salt `prfSalt`, info `nulo:passkey-unlock:v1`), derived straight into a non-extractable AES-256-GCM key. No profile or credential id in the HKDF: the random input separates profiles and envelope MAC v3 binds the row's id. Fresh IV per slot.
- The ceremony carries `prfSalt` through create, the second prompt some authenticators need after create, retries and the targeted unlock; the service re-checks the row (incarnation, credential, `prfSalt`) after the ceremony. Use `allowCredentials` with `eval`, not `evalByCredential` (it wants base64url ids). A missing or short PRF result fails closed.
- Row: keep `type`, the passkey variant = the password variant's fields + `credentialId` + `prfSalt`; keep envelope MAC v3 (a swapped `prfSalt` or credential only fails the GCM open). The legacy passkey row stays a recognized, strict, disjoint variant (a plain union, not a second `passkey` entry in the discriminated union, so a damaged new row never parses as legacy).
- Backups: one secret body for both unlock methods (master, entropy, per-backup transfer key) inside the existing password-encrypted file, under a file password typed at export. Restore separates that material from the chosen unlock method. Encrypting a backup under the recovery phrase is rejected: a same-phrase sibling profile could open it and reach the imported keys the DEK isolates.
- Compat epoch stays 5. A legacy passkey body is refused by its shape, after the integrity and version gates and before any passkey prompt or write.
- Legacy rows: listable and deletable, refused by every open path (unlock, silent restore, finalize, export, signing, row-key fill). No path carries their accounts forward: no recovery phrase produces their master, and the switch removes the code that rebuilds it.
- Delete the production PRF-master, DEK-wrap and backup-check derivations; keep `reference/key-model-v2-hardening/` labelled retired; `NULO_KDF_SPEC` stays byte-identical (the freeze test hashes the string, not reachability).
- Session bearer for passkey profiles is a behaviour choice (owner ask), no key-hierarchy preference.

Recorded property: storage plus an approved passkey prompt opens the profile, as storage plus the password opens a password profile. The docs state it as a property, never as protection the wallet claims.

## 2026-10-25 · Codex, plan review round 1 (gpt-6.1-sol, high, read-only)

**Verdict:** reject. Blocking, all accepted and applied:
- Wording in the plan files went past the property; trimmed to the property sentence.
- The passkey backup page accepts a one-character file password (`composables/useFullBackupExport.ts:371`): every file password now meets `isNewPasswordValid` (F14, D8).
- The create flow had no contract for the salt across retries (F15): the ceremony reports the evaluated `prfSalt` and the service allocates at persist (D6).
- The profile root has no runtime codec (F6): one classifier in `profile-row.ts` and a typed `RetiredProfileError` through `extension-messaging` (D4, D5).
- A session bearer lives in `storage.session` (F13): OA-10 B covers background restarts only (D14).
- The re-cut missed the R5 opener, the recorder's hardcoded `.json` and the replay's plain passkey download: re-cut steps 4 and 7.
- A2's phase gates could not pass as ordered: targeted inner gates, the full gate at the end; the Account row stays hidden until A3; the OA-3 header named the wrong arc.
Mediums and lows, all accepted: the unlock-method change as snapshot → prompts outside the lock → locked revalidation → one atomic reseal, in its own window on Firefox; copy that loses data (the risk point, OA-6 A, the retired delete footer); options that could not be rendered marked "not buildable without a revised plan"; per-scenario e2e budgets; I4 replaced (a version-1 frame is refused by `EncryptionKey.decrypt`, F1); fixed-category error logs; jargon removed from the legal drafts; cheap tests (retry keeps its salt, one credential with two salts, no salt in an exported file, the typed error over the port).

## 2026-10-25 · Opus Plan agent, plan review round 1

**Verdict:** conditional approve. Conditions, all accepted: the evaluated salt travels with the ceremony result and the service allocates id and entropy inside the persist lock (D6); one slot opener that refuses a retired row first, covering the account-export paths (D5); the re-cut also updates `tests/e2e/helpers/backup-seal.ts`, `scripts/e2e/backup-seal.test.ts`, builds the candidate first, and repeats after the last `dev` merge; the change map gains the vector, entropy and DEK-box tests, the PATH B derivation site and the import callers; pinned replacement text for `SECURITY.md` and `ATTACK-SURFACE.md`, keeping the RP-ID sentence word for word; privacy § 5.4 and the listing's declaration note in OA-11; OA-5 C as a PATH A/B discovery request in A3. Lows accepted: the legacy backup recognized by shape inside `validateAndMigrateBackup` (so Restore again refuses it too), budgets, the armed build, `jq` proof commands, the retired variant forbidding new-only keys, `prfSalt` in `REDACTED_KEYS`, the shared-credential row swap caught by the v3 MAC.
Rejected: one extra sentence proposed for `SECURITY.md` (beyond what the docs need to stay true); splitting A2 into a switch and a words arc, since the second half would leave untrue copy on `dev` for little gain (D13).

## 2026-10-25 · Codex, final fresh pass (gpt-6.1-sol, high, read-only, new session)

**Verdict:** conditional approve. No new path opens a retired profile; the leak check is clean. Conditions, all accepted: the snapshot emits `oneOf` for today's discriminated union, so A1 keeps it and the plain union waits for the re-cut (reproduced with the installed zod); A2.2's full gate could not pass before the re-cut, so it is targeted and the base is captured before A2.1; the `jq` proofs did not match the files (`goldens.json` wraps an array, the base has three stamps), the candidate build needs a committed tree, and repeating step 1 after the merge would compare the candidate with itself; a composition test may not derive addresses (`apps/extension/tests/COMPOSITION-TESTS.md`), so masters are compared; the pick and decrypt handlers publish a selection before validation, so the shape check moves there; the password change refuses to re-MAC a row whose MAC does not cover its DEK, and the method change must too; account export reads data before authenticating, so the matrix distinguishes typed refusals from denials; owner-page gaps (OA-4 B/C, OA-7 password B, Restore again's back arrow, a jargon word).

**Resumed round:** conditional approve with four wording corrections (A3's address wording, the validator's test file, excellent 3's error promise, OA-4 C's button route), all applied; no further round, since they change wording only.
