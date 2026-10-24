# @nulo-sh/wallet-sdk-schema-patch

Adds the [Nulo wallet](https://github.com/nulo-sh/nulo)'s custom RPC methods to the `WalletSchema` of `@aztec-labs/aztec.js`, so a dApp's wallet-sdk client can call them:

| Method | Signature |
|---|---|
| `registerToken` | `(AztecAddress, AztecAddress) => void` |
| `isTokenRegistered` | `(AztecAddress) => boolean` |
| `grantPublicAuthwit` | `(AztecAddress, { caller: AztecAddress, contract: AztecAddress, method, args }) => string` |
| `getWalletFeatures` | `() => string[]` |

Wallets that do not implement them reject the call, so treat every one as optional and fall back when it fails.

## Usage

Import the side-effect entry **first**, in the module that creates the wallet-sdk client, so the schema is patched before any client reads it:

```ts
import "@nulo-sh/wallet-sdk-schema-patch/register"
```

`./apply` exports `applyNuloSchemaPatch(schema)`, the same patch as a function. Applying it twice is a no-op. It throws if `@aztec-labs/aztec.js` already defines one of these methods with a different signature, instead of silently shadowing it.

## Requirements

- ESM only.
- Aztec line: `@aztec-labs/*` `6.0.0`.
- `@aztec-labs/aztec.js` and `@aztec-labs/stdlib` are exact **peer dependencies**. The patch must mutate the same `WalletSchema` and compare against the same `schemas.AztecAddress` your app loads, so a duplicate copy of either package silently defeats it.
- `zod` is a dependency. The Aztec peers declare `zod ~4.4.3`, below the fix for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (zod before 4.6.6). The Nulo wallet overrides zod to `4.6.7` and tests this package on it; your install does not inherit that override.

## Changes

- **0.3.0**: the peers move to the Aztec `6.0.0` line. The patch is unchanged and adds the same four methods to `6.0.0`'s `WalletSchema`.
- **0.2.0**: the peers move to the Aztec `6.0.0-rc.3` line. `grantPublicAuthwit` parses `caller` and `contract` with the `AztecAddress` schema. A wallet that parses incoming calls with the patched schema refuses a non-address there (Nulo answers INVALID_PARAMS) and receives both as `AztecAddress` values, not strings. An existing `grantPublicAuthwit` entry that takes either one with another schema now throws the signature-drift error.

## Provenance

Built from `packages/wallet-sdk-schema-patch` in [nulo-sh/nulo](https://github.com/nulo-sh/nulo) by `.github/workflows/publish-packages.yml` and published with npm provenance. `npm audit signatures` verifies the attestation.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
