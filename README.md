# Nulo Wallet

> ## Nulo 1.0
>
> **A self-custody wallet for the Aztec network, for Chrome and Firefox. You use it at your own risk.**
>
> - **No independent security audit.** The code has been reviewed internally and with automated tools, not by an external security firm.
> - **Aztec Mainnet is the default network.** Its assets may carry real value. The Aztec Testnet is built in for testing. A network you add yourself may carry real value too.
> - **Keep your way back.** From 1.0, a change to how the wallet stores data ships with a migration, but a Testnet reset still clears that network's history. Your recovery phrase or a full backup is the only way to restore a lost profile.
> - **Used a preview build?** If you used 0.31.x or any earlier preview build, start fresh in 1.0: create a new profile with a new recovery phrase or a new passkey, then move any funds to it.
> - **Install only from the official listings**, linked from [nulo.sh](https://nulo.sh).
> - **No warranty.** Read the [Terms of Use](https://nulo.sh/terms) and the [Privacy Policy](https://nulo.sh/privacy).

A self-custody wallet for the [Aztec network](https://aztec.network), packaged as a Chrome and Firefox extension. Nulo runs the Aztec [Private Execution Environment](https://docs.aztec.network/aztec/protocol/circuits/pxe) locally so transactions are simulated and signed on the user's machine; no node operator sees the contents.

The extension exposes the canonical `@aztec-labs/wallet-sdk` surface to dApps and uses the upstream `@aztec-labs/accounts/schnorr` account contract — there is no custom Noir source in this repo.

## Status

- Manifest V3, Chrome + Firefox.
- Password and passkey profiles (WebAuthn PRF).
- Account abstraction: multicall, fee-payer, authwit, payload chunking.
- dApp surface: discover, connect, capability bundles, sendTx, simulateTx, registerContract, getPrivateEvents.
- Local testing: a playground dApp and parallel-safe e2e suite per worktree.

Open work is tracked in [GitHub issues](https://github.com/nulo-sh/nulo/issues), and plans in progress in [`implementations-plan/index.md`](./implementations-plan/index.md).

## Quick start

```bash
bun install
bun run build                 # Chrome build → apps/extension/dist/chrome/
```

Then load `apps/extension/dist/chrome/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked).

For Firefox, `bun run build:firefox` → `apps/extension/dist/firefox/`.

Every profile has a 24-word recovery phrase. You unlock Nulo with a password or a passkey; the recovery phrase brings your wallet back on any device.

## Monorepo

| Package | Purpose |
|---|---|
| [`@nulo/extension`](./apps/extension/) | The Chrome/Firefox MV3 extension — service worker, popup UI, content script, offscreen PXE host. |
| [`@nulo/wallet-bridge`](./packages/wallet-bridge/) | dApp-facing dispatcher: `@aztec-labs/wallet-sdk` capability map, scope enforcement. |
| [`@nulo/aztec-runtime`](./packages/aztec-runtime/) | PXE lifecycle, `NuloAccount` adapter, class-id verification, payload chunking. |
| [`@nulo/extension-messaging`](./packages/extension-messaging/) | Typed RPC plumbing across service worker, popup, and offscreen. |
| [`@nulo/wallet-crypto`](./packages/wallet-crypto/) | Password + passkey KDF, `PasswordSecretBox`, derivation chain (vector-locked). |
| [`@nulo/wallet-core`](./packages/wallet-core/) | Pure ports + utilities. No `chrome.*`; no I/O. Foundation of the layer hierarchy. |
| [`@nulo/playground`](./apps/playground/) | Test dApp the network e2e suite drives end-to-end. |
| [`@nulo/landing`](./apps/landing/) | Marketing landing page. |

The package layer hierarchy (`wallet-core` → … → `extension`) is enforced via biome `noRestrictedImports`. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full picture.

## Where to read next

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — process boundaries, message flow, storage versioning, offscreen lifecycle, session model, concurrency, account contract, test taxonomy.
- Each `packages/<name>/README.md` — purpose, file map, scripts, testing, key invariants.
- [`apps/extension/tests/e2e/README.md`](./apps/extension/tests/e2e/README.md) — e2e suite layout, parallel-safe agent runner.
- [`implementations-plan/README.md`](./implementations-plan/README.md) — the planning standard: what a plan commits and what stays local, how a plan closes, the portable rules.
- [`CLAUDE.md`](./CLAUDE.md) — operating rules for AI assistants working in this repo (layer model, SFC ordering, cleanup order, comment style).

## Build & dev

```bash
bun run dev                   # Chrome extension dev server, port 8088
bun run build                 # Production Chrome build
bun run test                  # Unit + component tests (vitest)
bun run test:e2e              # Extension smoke e2e (no Aztec sandbox)
bun run e2e:agent             # Extension network e2e — owns anvil + aztec + playground per worktree
bun run audit:vue             # One-shot pre-PR gate: typecheck → test → lint → build
bun run lint                  # biome check
bun run format                # biome format --write
bun run typecheck:all         # every workspace's typecheck
```

## Quality gates

- **Bun** is the package manager. No yarn/npm/pnpm.
- **Biome** handles lint + format. Config in [`biome.json`](./biome.json); layer-import rules are enforced there.
- **Commitlint** enforces Conventional Commits. Config in [`.commitlintrc.json`](./.commitlintrc.json).
- **Git hooks** (pre-commit, commit-msg) are auto-installed via the `prepare` script on `bun install` (`.githooks/`).
- `bun run audit:vue` is the one-shot pre-PR gate.
- CI runs the same gates server-side plus smoke / network e2e. Full contributor guide at [`CI.md`](./CI.md).

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

Nulo is derived from [Azguard Wallet](https://github.com/AzguardWallet/azguard-wallet), also licensed under the Apache License 2.0; see [NOTICE](./NOTICE) and [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md).
