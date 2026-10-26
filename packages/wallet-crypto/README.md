# @nulo/wallet-crypto

Password and passkey-based KDF, `PasswordSecretBox` encryption, and the vector-locked derivation chain. Buffer ownership is explicit; secret material is zeroed on drop. Vectors must not change without ratcheting the storage version.

## Position in the stack

```
wallet-core  →  wallet-crypto  →  extension-messaging  →  …  →  extension
```

Depends only on `wallet-core` for the `ILogger` interface and `Web Crypto` (available in both browsers and jsdom). No `chrome.*`, no Node-specific I/O.

## File map

| Path | Purpose |
|---|---|
| `src/encryption-key.ts` | `EncryptionKey` — PBKDF2 (SHA-256, 600k iterations) + AES-GCM framed ciphertext. The 1-byte version frame lets future formats coexist. |
| `src/profile-slots.ts` | The slot format for a profile's `guard` / `secret` / `entropy`, whatever key seals them: `ENCRYPTION_GUARD`, the purpose AADs `PROFILE_AAD`, the guard check. A null on open means a wrong key or a corrupted or moved slot. |
| `src/password-secret-box.ts` | `PasswordSecretBox` — the profile slots as `EncryptionKey` frames under a password, with no storage or session state. Its `passhash` is an unsalted SHA-256 of the password: password-equivalent, held in memory only, never persisted. |
| `src/session-secret-box.ts` | `SessionSecretBox` — the lenient-mode silent-restore bearer: the master secret and the imported-keys key in one AES-256-GCM frame under a key HKDF-derived from a fresh random token, bound to the profile id. The session record holds nothing derived from the password. |
| `src/passkey-unlock-key.ts` | `derivePasskeyUnlockKey` — HKDF-SHA256 over a passkey's 32-byte PRF output with the profile's own 32-byte `prfSalt`, into a non-extractable AES-256-GCM key; `newPrfSalt`. |
| `src/passkey-secret-box.ts` | `sealPasskeySlots` / `openPasskeySlots` — the profile slots as `aes-gcm-frame` frames under a passkey unlock key. |
| `src/passkey-credential.ts` | `PasskeyCredential` — a passkey's answer to one prompt, its PRF output turned into the unlock key for the input it was evaluated at (`unlockKeyFor(prfSalt)` returns it only for that input). |
| `src/aes-gcm-frame.ts` | `sealFrame` / `openFrame` — the `version ‖ IV ‖ ciphertext` AES-GCM frame every DEK-rooted box and the row seal share, random 96-bit IV per seal. |
| `src/row-seal.ts` | `deriveRowKeys` / `sealRow` / `openRow` / `keyedSegment` — the per-profile row-seal keys (HKDF over the master, bound to the profile's incarnation) and the AAD binding a sealed row to its root, storage key and profile. |
| `src/zeroize.ts` | `zeroize()` helper for explicit secret-buffer wipes. |
| `src/index.ts` | Public exports. |
| `src/public.ts` | The npm surface (`@nulo-sh/wallet-crypto`): `deriveNuloAccountKeys`, `deriveSigningKeyFromSeed`, `EncryptionKey`, `type Passhash`. Staged by [`scripts/publish/`](../../scripts/publish/README.md); widening it widens a published API. |
| `tsconfig.publish.json` | Declaration-only emit for the published entry (comments stripped). |
| [`ATTACK-SURFACE.md`](./ATTACK-SURFACE.md) | What an attacker who reads the disk actually gets, and the work factor to invert each artifact. Read this before changing a KDF cost, adding a persisted field, or arguing about whether something needs encrypting. |
| `vectors/` | Vendored **official** BIP-39 test vectors + provenance — the external oracle for the mnemonic step. |

## Scripts

| Command | Effect |
|---|---|
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run test` | Unit tests via vitest. |

## Testing

Colocated `*.test.ts`. The cryptographic derivation chain is **additionally locked** by an extension-side integration test:

- `apps/extension/src/wallet/crypto/key-vectors.test.ts` exercises the full chain end-to-end and must pass byte-identically after any change here.

Four assurance suites exist to prove *behaviour*, not just consistency — each answers a question that
reading the code cannot:

| Suite | Question it settles |
|---|---|
| `src/bip39-official-kat.test.ts` | Does the mnemonic step match the **published spec**? All 24 official BIP-39 English vectors, vendored with provenance. The expected seeds come from outside this repo, so a misreading of the spec cannot make the code and its test wrong in the same direction. |
| `src/reduction-entropy.test.ts` | How much entropy does reducing into the BN254 field actually cost? Computed from the modulus (verified empirically, not trusted from a constant) rather than asserted in prose. Narrowing any reduce input reds this with the exact bit loss. |
| `src/nonce-uniqueness.test.ts` | Can any AES-GCM box ever repeat a nonce? A repeat destroys confidentiality **and** integrity at once, and the dangerous version of that bug is deterministic, so it collides on the first repeat. |
| `src/zeroize.test.ts` | Do secret buffers actually get wiped, including the copies library calls make internally? |

Treat that file as a contract. **A vector/KDF change is NOT an ordinary storage migration.** The boot migrator (`@nulo/wallet-core/migration`) runs BEFORE unlock, so it has no password and cannot decrypt + re-encrypt the stored secret. An intentional change (rotating a label, bumping a KDF cost) therefore requires either a **re-encrypt-on-next-unlock** step (once the password is available) or a **documented reset** — never a plain numbered migration. The data-preserving migration framework at `apps/extension/src/wallet/storage/migrations/` handles persisted-JSON shape changes only, not crypto.

## Key invariants

- **`ENCRYPTION_GUARD`** and **`PROFILE_AAD`** (`src/profile-slots.ts`) are the guard plaintext and the slots' AES-GCM associated data, pinned by `password-secret-box.test.ts` and `profile-slots.test.ts`. Changing either bricks every existing wallet.
- **`ROW_SEAL_LABELS`** and the row AAD (`src/row-seal.ts`) are frozen by V12, the shared frame by V13. Changing one hides every sealed row of every profile.
- **Buffer ownership.** Secret material is allocated as `Uint8Array<ArrayBuffer>`, never `Buffer`. Callers own the lifecycle and call `zeroize()` on drop. The package never mutates a buffer it didn't allocate, and never returns a buffer it expects to keep alive.
- **`PasswordSecretBox.seal()` and `unseal()` are not symmetric across the passhash boundary.** `seal()` produces both an `EncryptedProfileSecret` (the on-disk record) and a `passhash`, which callers use in memory and wipe; it is never persisted (the silent-restore bearer is `SessionSecretBox`). `unsealWithPasshash()` and `unseal(password, …)` produce the same plaintext via different routes; both must remain in lock-step with the V2 vector.
- **WebAuthn PRF non-portability.** The suite's virtual passkeys are tied to the registering browser context (per Chromium's FrameTreeNode scope), so no e2e carries one across extension instances. See `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`.
- **No Chrome APIs, no Node I/O.** Only Web Crypto, `@aztec-labs/foundation` math helpers, and pure bytes.
