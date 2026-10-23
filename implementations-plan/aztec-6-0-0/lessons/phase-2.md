# Phase 2: the rotation to `nulo-v6.2`

## The oracle detector (D4)

- One case in `artifact-freeze.test.ts`: the `ORACLE_VERSION_MAJOR` of the vendored artifact's `file_map` entry ending `/aztec/src/oracle/version.nr`, against the installed `@aztec-labs/pxe`'s `dest/oracle_version.js` read through `@nulo/resolve-asset`. Exactly one such entry is required; a missing constant fails `toMatch(/^\d+$/)` or the equality.
- Red against `nulo-v6.1` on the 6.0.0 line: `expected '32' to be '33'`. Green after the vendor: both 33.

## The artifact

- Source: `@aztec-labs/accounts@6.0.0` `artifacts/SchnorrAccount.json`; `@aztec-labs/noir-contracts.js@6.0.0` ships the same bytes (`schnorr_account_contract-SchnorrAccount.json`, `cmp` equal).
- sha256 `f701e393…9ab9f9`; class id `0x2f7d07db…269d15`, computed by `getContractClassFromArtifact` in `packages/aztec-runtime` and again by the independent generator (`reference/nulo-v6.2/vectors.json`'s `artifact.classId`): equal.
- Lockfile integrity `sha512-q3A/4Czw…aZkw==` equals npm's `dist.integrity`. Publisher `charlielye`, maintainers `charlielye` and `nchamo`; no attestation, no repository field (as at rc.3, F10).
- ABI against `nulo-v6.1` (F3, checked): same top-level keys, the same seven functions, and per function the same `is_unconstrained`, `custom_attributes`, parameters and return type. `outputs` (structs, globals) equal. F3 held only modulo `error_types`: `offchain_receive` and `sync_state` declare more compiled error strings ("Option None payload must be zero", "BoundedVec length exceeds max", two fmtstrings). Bytecode differs for every function but `public_dispatch`. Oracle major 32.2 → 33.0. Noir `1.0.0-rc.3+5a7ee9bf…` on both.

## The regime

- `REGIMES["nulo-v6.2"]` appended with literals; `V6_REGIME` bound to it; `nulo-v5`, `nulo-v6` and `nulo-v6.1` byte-identical (diffed against the file before the edit). The ack embeds its digests and states the policy in force: in place off Mainnet, a new extension major once a Mainnet-serving build binds it.
- `address-freeze.test.ts` hardcodes the new entry independently, the binding and the four-id list.

## The generator (`reference/nulo-v6.2/`)

- A copy of `reference/nulo-v6.1/` with the 6.0.0 pins and the new sha256. Resolved with the 42 Aztec names in its own `bunfig.toml` excludes (38 of them are in its lock), then the file restored to the gate alone with a comment that those names resolved inside their seven days; `rm -rf node_modules && bun install --frozen-lockfile`: exit 0. Third-party versions resolved under the gate.
- `bun derive-vectors.ts > vectors.json` twice: identical. Against `nulo-v6.1`'s vectors only `artifact.*`, `source` and the address-level fields (`address`, `completeAddress.{address,partialAddress}`) differ: every key-level value is unchanged, as the KDF is.
- `git diff 95da7744 -- reference/nulo-v6 reference/nulo-v6.1 reference/key-model-v2`: empty.

## The tests

- `derivation-vectors.test.ts` and `account-seed-vectors.test.ts` read `reference/nulo-v6.2/vectors.json`; no vector edited.
- `account-export.test.ts`: the superseded-entry fixture is now a `nulo-v6.1` file (the key-model-v2 row's key at the address `reference/nulo-v6.1` derives, checksum recomputed in Python from the canonical pairs, the method reproducing the existing `nulo-v6` fixture's checksum first); the `nulo-v6` fixture it replaces was the same refused class. The pinned checksum of this build's export moved with the regime digests (`f1d0a416…`, recomputed the same way).
- `coordinator.test.ts` and `runtime-mismatch.test.ts` expect `regimeId` `nulo-v6.2`; `backup-migration-registry.ts`'s epoch comment names both in-place rotations.
- Residue of the `nulo-v6.1` sha256 and class id: its `REGIMES` entry and test entry, `PROVENANCE.md`, `reference/nulo-v6.1/`, and the refused-file fixture in `account-export.test.ts`.

## The gate

- `bun run --cwd packages/aztec-runtime test src/account src/pxe`: 333 pass. The extension slice (`account-integrity`, `account`, `AccountIntegrityBarrier.test.ts`, `profile`): 676 pass. Lint and `typecheck:all`: exit 0.
- M4.6-7 (the update replay and the arrival suite) move after P3, which moves the chain they reset from; recorded in `lessons/phase-3.md`.
