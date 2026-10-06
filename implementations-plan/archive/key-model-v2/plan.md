# Key model v2

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The recovery-phrase key derivation in `packages/wallet-crypto/src/mnemonic-master.ts`, `account-derivation.ts`, `derive-account-seed.ts` and `nulo-separators.ts`, per-account export and import (`packages/aztec-runtime/src/account/account-export.ts`, `packages/wallet-crypto/src/imported-account-key-box.ts`), and independent reference vectors under `reference/key-model-v2/`. The hardening that followed is [key-model-v2-hardening](../key-model-v2-hardening/plan.md).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One coordinated break before the first shipped build, in two halves.

**Product model.** The 24-word recovery phrase becomes the only wallet-level secret export, next to the full backup. The plain and encrypted "Secret Key" exports and imports are deleted. Account level gains Export Account and Import Account, a Nulo-format file in an encrypted and a plaintext variant, for the per-account ownership key.

**Key derivation.** The phrase goes through the standard BIP-39 PBKDF2 step with an empty passphrase. The master reduces a 64-byte seed into the field. The account seed is a poseidon2 hash of the master, the L1 chain id, the account type and the index, under a Nulo domain tag. The seed-to-signing-key step uses a Nulo constant, not a borrowed upstream separator. Both Nulo constants come from a hash of a fixed label, and a test checks they collide with neither upstream separator space.

## Why

The export taxonomy should match the key hierarchy, and the per-account key is what people used to other wallets expect "private key" to mean. Deriving from the L1 chain id rather than the composite chain id means two rollups on one L1 share addresses, which matches the EVM mental model. The rollup version is excluded because it changes on state-preserving upgrades and would silently re-derive accounts. Every address changed once, which is why the break was licensed only before the first shipped build.

The profile stores both entropy and master, because a bearer-restore path cannot re-run the KDF. Both ciphertexts bind a purpose tag as associated data, so a swap between the two slots fails authentication. The pairing is re-verified wherever entropy is decrypted, and the silent restore path checks a master-keyed MAC over the entropy ciphertext.

The honest entropy claim is bounded by the field: about 253.6 bits at every step. A phrase reused from another wallet yields the seed that wallet computes, which is the standard BIP-39 model and is accepted. The import screen discourages reuse.

A plaintext account file's checksum detects corruption and does not authenticate. A file recomputed to be self-consistent can only be caught by the import screen showing the recomputed address for the person to confirm.

## What shipped

- The derivation and key-vector tests, and the shared `deriveAccountSeed` used by account creation and the integrity coordinator alike.
- An L1 chain id on network and account rows, hardcoded for the seeded networks and read from the node for custom ones. A missing or non-canonical value is an integrity error.
- Imported accounts as their own account type, with keys stored in their own backup slice under a per-row key, quarantined singly on a failure, not by blocking the profile.
- The address-freeze record in `packages/aztec-runtime/src/account/address-freeze.ts`, which names this baseline redefinition, and the account import and export smoke specs `apps/extension/tests/e2e/account-import-export.test.ts` and `imported-account-lifecycle.test.ts`.
