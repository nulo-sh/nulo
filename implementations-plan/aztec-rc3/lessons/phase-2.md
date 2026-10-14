# Phase 2: the re-pin

## Artifact review (2026-10-14, from `npm pack` tarballs)

- `@aztec-labs/accounts@6.0.0-rc.3` `artifacts/SchnorrAccount.json`: sha256 `9aebda2a0b8cf96e833dba4379bef6a2ed0f93e975e9689afaa26ac71203cdc8`, byte-identical to `@aztec-labs/noir-contracts.js@6.0.0-rc.3` `artifacts/schnorr_account_contract-SchnorrAccount.json`.
- Against rc.1 (`4b4933a1…7f94`, the vendored copy): same top-level keys, `noir_version` (`1.0.0-rc.3+5a7ee9bf…`), name, `transpiled`; `aztec_version` 6.0.0-rc.1 → 6.0.0-rc.3. Same seven functions (`constructor`, `entrypoint`, `lookup_validity`, `offchain_receive`, `public_dispatch`, `sync_state`, `verify_private_authwit`) with identical parameters, return types and `custom_attributes` (`constructor`: `abi_private`, `abi_initializer`; `verify_private_authwit`: `abi_private`, `abi_view`); `outputs` (structs, globals) identical. Only bytecode differs. The constructor `buildFrozenConstructorCall` reads keeps `signing_pub_key_x`, `signing_pub_key_y`.
