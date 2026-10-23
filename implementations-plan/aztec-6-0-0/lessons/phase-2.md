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
- M4.6-7 (the update replay and the arrival suite) move after P3, which moves the chain they reset from.

## The update scenarios (M4.6-7)

- The replay at `6948a295` on the old expectations: case 1 timed out on "Your accounts kept their addresses." (`update-replay.test.ts:414`), the predicted red; case 2 skips once the seed has moved; case 3 passed.
- Both files now read the ready toast's line as it shows (`readyToastSaysMoved`, `helpers/stale-network.ts`) and compare it to the truth: each derived account keeps its name, index, type and visibility at the address this build derives from the revealed phrase (`rederive`, through `deriveNuloAccountAddress`), and the toast says the addresses moved exactly when one did. The replay's imported key comes back at an address none of the recorded ones equal, and its re-export preview re-derives that address from the decrypted key. The arrival suite's first case meets the reset whenever the release's Testnet chain is not this build's, so its trace gains `takeover` and its Testnet row the new chainId.
- The recording's custom network (chain 2267676295, L1 31337) classifies `addressesMoved` and stays quarantined, not active, so it shows no takeover; `otherNetworks` and `expectIdentity` read it unchanged across the Testnet reset.
- Arrival case 1 stalled at its first `reopen` in 1 of 5 runs: `app.vue` renders no `RouterView` while the arrival is up, so `index.vue`'s push to `#/popup/general` runs only if the route rendered before the arrival (the stall sat at `#/popup` behind it). `reopen` no longer waits for the hash; each caller waits for the arrival or Home.
- Arrival case 2 failed its close at the egress guard ("sent lb.drpc.live:443 to the guard 1 time(s) while the launch's stand-in held its origin") in 5 of 25 Chrome runs, never alone. Timestamps put the request inside `updateInPlace`'s swap, about 1 s after the release's offscreen document attached and as the swap ended it; no page target dialed the node. The swap is an extension restart, so it now runs under `withInterceptionsReleased`, as `waitForExtensionRestart` does: 15 of 15 after. Recorded in the `e2e-testing` skill and the README's stand-in paragraph.
- Hazard: `NULO_E2E_INTERCEPT_LOG=1` prints each redirected path, and the Testnet endpoint's path carries its provider key. One debugging read printed it into the session; the scratch logs were redacted. Grep that log for counts, never print its lines (follow-up issue).
- Chrome: the replay 2 passed, 1 skipped, case 1 33 s; the arrival suite both cases, 38 to 45 s.
