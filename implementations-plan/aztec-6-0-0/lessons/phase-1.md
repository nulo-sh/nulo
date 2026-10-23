# Phase 1: the line

Base: `origin/dev` at `0e4bec13` merged into the plan commit (`5762a763`); `bun.lock` at the base equals the plan's base (`95da7744`).

## Install and patches (M1, M2)

1. Pins to `6.0.0` in the six workspaces, the noir patches and keys renamed, the pxe patch and its key dropped, 44 excludes, `bun install`: exit 0.
2. The installed `@aztec-labs/pxe@6.0.0` already carried the patched line: Bun reused the store directory the Phase 0 trial had patched (same `+9654951505f092be` suffix), so the tree was not pristine. Deleted that store entry, reinstalled, and the file then equalled the `npm pack` tarball. A tree that ran a trial is not a clean base for `bun patch`.
3. `bun patch @aztec-labs/pxe@6.0.0`, line 499 `return accountCompleteAddress;` → the existing `// Modified by Nulo:` line, `bun patch --commit`, root `node_modules/@aztec-labs` deleted, `bun install --frozen-lockfile --force`. The new patch is byte-identical to the trial's (same blob ids). Then every `node_modules` was deleted and `bun install --frozen-lockfile` ran fresh, so no unpruned rc.3 or `@aztec/viem` store entry could resolve (CI installs fresh).
4. Proofs: installed `dest/pxe.js` against the tarball differs at line 499 only; each noir package's `package.json` differs only in `module` → `exports`; the three tarballs' sha512 equal their `bun.lock` integrity.

## Lockfile (`scripts/lockfile-exception-diff.ts` against the base lock)

- `aztecScope`: 45 entries to `6.0.0` (the 42 `@aztec-labs/*` and `@aztec-foundation/*` names, presto, fee-juice, standards); `@aztec/viem` 2.38.3 gone (M5).
- Third-party, each dispositioned (every version older than 7 days, so none needed an exclude):
  - `viem` 2.38.3 → 2.57.1 (2026-09-29): upstream's own exact pin (`@aztec-labs/{aztec.js,ethereum,pxe,stdlib,telemetry-client}`) and the extension's devDependency (M5). Its `ox` 0.9.6 → 0.14.45 (2026-09-17), `abitype` 1.1.0 → 1.2.3 (2025-12-15), `ws` 8.18.3 → 8.21.0 (2026-05-22) follow it.
  - `undici` 5.29.0 → 6.29.1 (2026-10-15): `@aztec-labs/foundation@6.0.0`'s dependency; `@fastify/busboy` 2.1.1 removed with undici 5.
  - `@iarna/toml` 2.2.5 added (2020-04-22): `@aztec-labs/ethereum@6.0.0`.
  - Removed `@aztec/viem/{@noble/curves,@scure/bip39,ws}`: the fork's nested copies.
- The residue check passes; its three controls (each constant set to `6.0.0-rc.3` in turn) exit 1 with 200, 84 and 7 failures.
- Deviation: `lockfile-exception-diff.ts` keeps its `viem` carve-out in `toCurrentScope`. It maps a pre-6.x lock's `@aztec/*` keys onto the new scopes, and this bump's own base lock still holds `@aztec/viem`: without the carve-out it would report a `@aztec-labs/viem` that never existed. The residue check's `RETIRED_SCOPE` does drop it, so no `@aztec/*` package may be locked again.

## Notices (M1)

At `v6.0.0` of both upstreams: `aztec-node` and `aztec-packages` root LICENSE and `barretenberg/LICENSE` are byte-identical to `texts/`; the noir submodule is still `5a7ee9bf…`; `@aztec-labs/sqlite3mc-wasm@6.0.0` ships the same `sqlite3.wasm` (`e7600bc6…`) and proxy as rc.3, README pin 2.3.5 / `3d0d5ebe…`; `l1-contracts/scripts/network-defaults.json` equals the tagged file and the tree's manifest is still `@aztec/l1-contracts` 0.1.0 Apache-2.0; every overridden package still ships no licence file and the same licence field. `reviewedVersion` and the tag URLs moved; `texts/` unchanged. Both extension builds accept the policy.

## Toolchain

- `6.0.0/install` against `6.0.0-rc.3/install`: `VERSION`, and `install_aztec_packages`, which now fetches a `packages.tar.gz` release lock from `INSTALL_URI` (with an `AZTEC_UP_SKIP_PACKAGE_LOCK=1` npm fallback). Our override replaces that function whole, and its pinned literal (`npm install @aztec-labs/aztec@$VERSION … --prefix`) is still in the fallback branch. `install_foundry` is unchanged and copies `forge cast anvil chisel` only. One `main "$@"`, one `exit`; nothing else fetches anew.
- `versions`: noir `1.0.0-rc.3` (tarball pin unchanged, digest equal), Foundry `1.8.5`, Node `24.15.0` (local 24.21.0; Docker 24.16.0; CI setup-node floats on 24).
- Foundry 1.8.5's tarball (`6c66ffcc…`, equal to the release digest) holds five regular files: the four tools and `solar`. `install.sh` refused anything but the four, so it now requires exactly the five and extracts the four (D12). All five verify with `gh attestation verify --repo foundry-rs/foundry`: `release.yml@refs/tags/v1.8.5`, commit `51a52c59…`.
- `lock.sh 6.0.0`: 1119 packages. Third-party: 38 changed (the AWS SDK and Smithy patch line, `viem` 2.57.1 with `ox`/`abitype`, `undici` 6.29.1, `ws` 8.21.0, and small patch moves), 2 added (`zod` 4.4.3 under `@aztec-labs/aztec`, `fast-deep-equal` 3.1.3), 1 removed (`@fastify/busboy`). All resolved under npm's 7-day gate.
- `CI=1 HOME=$C/home AZTEC_HOME=$AH AZTEC_VERSION=6.0.0 bash .github/actions/setup-aztec/install.sh`: exit 0, all four pins verified, `@aztec-labs/aztec-node` loads.

## The literal sweep

`rg -l '6\.0\.0-rc\.[36]' --glob '!bun.lock' --glob '!implementations-plan/archive/**'`, every hit classified:

- Moved in P1: `layout-identity.test.ts`, `resolve-asset/src/index.test.ts` (and its regex), `resolve-asset/README.md`, `bb-fetch-code-shim.test.ts`, `vendor-chunks.test.ts`, `stage.test.ts` (the staged peers follow the pins), `wallet-sdk-schema-patch/{src/apply.ts,README.md}`, `wallet-bridge/README.md`, `aztec-runtime/README.md`, `legal/README.md`, `store/listing.md`, `store/SOURCE-BUILD.md` (patches), `UPDATE.md`'s current line.
- P2 (the rotation): `SchnorrAccount.json`, `PROVENANCE.md`, the KAT and seed-vector headers, `SOURCE-BUILD.md`'s artifact line.
- P3 (the chain and drift pins): `chain-ids.ts`, `class-ids.ts`, `protocol-fpcs.test.ts`, `OperationCard.wire.test.ts`, `infra/token-list/test/live-check.test.ts`.
- P4: `audit-acks.json` reasons (re-judged).
- History, never edited: `CHANGELOG.md`; `reference/nulo-v6.1/**`; `stored-shapes/{pins.ts,backups/passkey.json}`; the backup fixtures' `aztec-version` in `import.test.ts` and `useFullBackupImport.test.ts` (an older backup's envelope); `UPDATE.md` § 6.0.0-rc.3 couplings; `lessons.md`'s rc.3 line (pruned at close-out); `vite.shared.ts:38` (a fact about rc.3); `scripts/publish/readme/*.md` (the published 0.2.0's peers, moved by the `@nulo-sh/*` follow-up); `BEFORE-LAUNCH.md`'s rc.3 store item (the owner's checklist).

## The gate

- `bun run lint`, `typecheck:all`, `lint:actions`, `shellcheck install.sh`: exit 0. `test:ci-gating`: 687 pass.
- `build:chrome`, `build:firefox`, playground and landing builds: exit 0.
- `test:all`: exit 1, `@nulo/extension` only, 9 reds in 5 files, each an allowed cause (a pin P3 moves, recon finding 6):
  - `fpc/protocol-fpcs.test.ts`: the PrivateFPC artifact digest, its derived address, the package's canonical deployment, and the SponsoredFPC derivation (four cases).
  - `token/default-tokens.test.ts` and `token-list/token-list-pins.test.ts` (two cases): the bundled Token class and its storage slots moved.
  - `dapp-interaction/known-contracts.test.ts` and `dapp-interaction/service.test.ts`: the AuthRegistry address moved.
