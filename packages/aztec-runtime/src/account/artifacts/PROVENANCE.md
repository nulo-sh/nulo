# SchnorrAccount.json — provenance

Vendored raw compilation artifact for the Schnorr account contract: the frozen, address-bearing
input to Nulo account addresses (loaded by `../frozen-artifact.ts`). These are the `nulo-v6.2`
regime's bytes.

- **Source package**: `@aztec-labs/accounts@6.0.0` (npm), file `artifacts/SchnorrAccount.json`.
  `@aztec-labs/noir-contracts.js@6.0.0` ships the same bytes as
  `artifacts/schnorr_account_contract-SchnorrAccount.json`.
- **Lockfile tarball integrity** (`bun.lock` entry for `@aztec-labs/accounts@6.0.0` at vendor
  time): `sha512-q3A/4CzwJdagmaZoa1onm0HEJl53utBugX4z6q/OK232+3m6yGvb8Gu+VeHYbWnLQp+4kQxiMQ/G+4wLQOaZkw==`
- **Trust basis**: the package has no provenance attestation and no repository field. It is trusted
  on its npm registry signature (`npm audit signatures`) and its publisher: `charlielye`, with
  maintainers `charlielye` and `nchamo`, the same set as every `@aztec-labs/*` name at `6.0.0`.
- **Extraction**: byte-for-byte copy of the installed package's file:
  `cp packages/aztec-runtime/node_modules/@aztec-labs/accounts/artifacts/SchnorrAccount.json packages/aztec-runtime/src/account/artifacts/SchnorrAccount.json`
- **Vendored file sha256**: `f701e393d933a3229ada1e121113a540c9906d0cc9b1cd4450252888b29ab9f9`
- **Contract class id of the loaded artifact**:
  `0x2f7d07db78643da21eefb63ee07d28d1cc23dd86ec9b3a9fa29323bf17269d15`
- **Against the previous entry**: the same functions, parameters, return types, attributes and
  structs as the `nulo-v6.1` bytes; `offchain_receive` and `sync_state` declare more compiled error
  strings (`error_types`). What differs besides: every function's bytecode but `public_dispatch`'s
  (recompiled for the 6.0.0 PXE's oracle interface, major 33, where `nulo-v6.1` called major 32),
  the debug metadata (`debug_symbols`, `file_map`) and `aztec_version`. The noir version is the
  same, `1.0.0-rc.3+5a7ee9bf…`.
- **Previous entries**: the `nulo-v6.1` bytes (`@aztec-labs/accounts@6.0.0-rc.3`, sha256
  `9aebda2a0b8cf96e833dba4379bef6a2ed0f93e975e9689afaa26ac71203cdc8`), the `nulo-v6` bytes
  (`@aztec-labs/accounts@6.0.0-rc.1`, sha256
  `4b4933a146a80872b184f47af22cd8ba3faa00f810d7a26217490c9d13507f94`) and the `nulo-v5` bytes
  (`@aztec/accounts@5.0.1`) are not vendored here; their `REGIMES` entries in `../address-freeze.ts`
  hold their sha256 and class id.

This file is **not** bumped with the `@aztec-labs/*` line. Changing these bytes changes every
derived account address — that is an address-regime rotation (see the regime record in
`../address-freeze.ts` and CLAUDE.md "Account-address freeze").

Pinned by `packages/aztec-runtime/src/account/artifact-freeze.test.ts` (file digest, loaded class
id, and the oracle major the installed PXE accepts) and by the full-chain KAT
(`../derivation-vectors.test.ts`). The file is excluded from Biome formatting so the bytes stay
digest-exact.
