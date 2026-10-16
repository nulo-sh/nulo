# Recon: token-list-live-check

Base: `origin/dev` at `8459699c`. One Sonnet reuse sweep (11 capabilities) plus direct reads and two probes of a public node (2026-10-16).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Parse and validate the source | `packages/token-list/src/parse.ts` `checkSource` (strict; lowercase `0x` + 64 hex for `address` and `classId`, `parse.ts:23,80-81,105,112`); `infra/token-list/scripts/check.ts` `HOST_ROOT`, `SOURCE` | reuse as-is |
| Escape text for the step summary | `infra/token-list/scripts/summary.ts:107-109` `cell` (every ASCII punctuation mark), not exported; pinned by `publish.test.ts:212-217` | adapt: export it |
| Silent node client | `apps/extension/scripts/seed-preflight-node.ts:14-20` (SDK `createSafeJsonRpcClient`, single attempt, silent log) | not reusable: the publish closure pin refuses its imports (below) |
| Instance read and class compare | `apps/extension/scripts/seed-preflight.ts:70-81` (`BigInt` compare); the seeder: `apps/extension/src/wallet/services/token/service.ts:711-717` (exact string on `currentContractClassId`, plus the instance's address) | adapt: the seeder's semantics, over raw JSON-RPC |
| Symbol and decimals without a PXE | `apps/extension/scripts/seed-preflight-metadata.ts:118-153` (aztec-standards `storageLayout`, private `decodeCompressedString`, `getPublicStorageAt` at one block); the wallet's decoding, `apps/extension/src/wallet/services/token/functions/descriptors.ts:50` (UTF-8, NULs removed) | adapt: the storage read; decode as the wallet does, since the preflight's decoder is stricter |
| Storage slots of the bundled class | none outside the artifact; `BUNDLED_TOKEN_CLASS_IDS` (`packages/token-list/src/class-ids.ts`) holds one class | build new: slots keyed by class id, pinned to the artifact |
| Pin a token-list copy of an Aztec value | `apps/extension/src/wallet/services/token-list/token-list-pins.test.ts` (class id, field modulus) | reuse the pattern |
| Wallet chain id from node info | `packages/wallet-core/src/utils/chain-id.ts:5-7` `walletChainId` | not importable (closure); one-line copy with a known-pair test |
| Advisory step | `_lint-and-typecheck.yml:87-89` (step `continue-on-error`); `nightly.yml:322-327` (job level) | reuse the step form |
| Live test pattern | `infra/token-list/test/live.test.ts` (`TOKEN_LIST_HOST_LIVE`, 10 s per request) | reuse the timeout shape |
| Workflow-command emitter | `scripts/release/workflow-command.ts` | not needed: no annotations |

Search trail for absences: `decodeCompressedString|CompressedString|storageLayout|getPublicStorageAt` over `*.ts` (one decoder, the preflight's); `https://` URLs in `*.ts,*.json,*.yml,*.md,*.jsonc,*.vue,*.toml` repo-wide for a keyless Aztec node (none: only the keyed `lb.drpc.live` URL, explorers and test hosts); `skipIf|runIf|_LIVE` for Aztec-node live tests (none under `src` or `scripts`).

## Constraints the design must meet

- **The publish closure pin** (`infra/token-list/test/publish.test.ts:222-257`): every `infra/` or `packages/` `.ts` path the workflow names, and every file those import, sits under `SIGNING_PATHS`; a non-relative import must be `@nulo/token-list` or one of its subpaths; a run-time `import(` or `require(` fails. A script under `apps/` escapes the scan only because the regex skips `apps/`, so the invariant would be false while the test stays green.
- **The workflow pins** (`scripts/ci-cd/behavior-gating.test.ts:1077-1118`): the job list is exactly `prepare`, `sign`, `publish-pr`; `prepare` holds no `secrets.`; its output comes from the step with id `summary`. A new step in `prepare` keeps all of them.
- **`prepare` runs on `dev` only** (`publish-token-list.yml:36`), so a dispatch on a feature branch skips it.

## Public node (probed 2026-10-16)

- `https://aztec-testnet.drpc.org` answers with no key: `nodeVersion` `6.0.0-rc.3`, `l1ChainId` 11155111, `rollupVersion` 3409706519, so wallet chain id 3415328944, the list's chain.
- Wire format: `aztec_getContract(address, block?)` returns the instance JSON (`address`, `currentContractClassId`, `originalContractClassId`, …) or `null`; `aztec_getBlockNumber()` returns a number; `aztec_getPublicStorageAt(block, address, slot)` returns `0x` + 64 hex. The SDK client sends the `aztec_` prefix (`@aztec-labs/stdlib` `dest/interfaces/aztec-node.js:399`); this node also answers `node_*`.
- The Standards getters return storage verbatim (`fn symbol() -> FieldCompressedString { self.storage.symbol.read() }`, `fn decimals() -> u8 { self.storage.decimals.read() }`, in the artifact's embedded source).
- Both preflights pass against it for USDC and GBPC: class `0x163b2b24…1d8a`; slots `name` 1, `symbol` 3, `decimals` 5; symbol raw `0x0055534443…` decodes to `USDC`.
- `rpc.testnet.aztec-labs.com` refused TLS and `aztec-testnet-fullnode.zkv.xyz` timed out.

## Open work in the area

- #382, this lane. #480 (nightly `token-list-host-live` red while the list is empty) and #384 (a published verifier package) touch the same host; neither collides.
- Closed known limits on the token list (#385, #386, #387, #511, #512): none concerns the publish check.
