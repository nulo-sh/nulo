# Phase 8 — `@nulo-sh/*` 0.2.0

## Facts re-checked at `479ba56d` (2026-10-15)

- npm holds `0.1.0` of all three (published 2026-10-07), so the publish job's "0.1.0 first" guard passes for `0.2.0`. `npm pack @nulo-sh/<p>@0.1.0` gives exactly the three `0.1.0` digests in `approved-digests.json`, so the rehearsal reproduces what the workflow published.
- `publish-packages.yml`'s pack job uses Node 24.12.0, Bun 1.4.2, `stage.ts --all --version "$VERSION"` and `npm pack ./<dir> --ignore-scripts`. Node 24.12.0 was installed with `nvm install 24.12.0` (checksum matched) and bundles npm 11.6.2.
- Staged `0.2.0` against the published `0.1.0` tarballs, file by file:
  - `wallet-crypto`: only `version` and the peers (`@aztec-labs/{accounts,foundation}` `6.0.0-rc.1` → `6.0.0-rc.3`).
  - `resolve-asset`: only `version`.
  - `wallet-sdk-schema-patch`: `version`, the peers (`@aztec-labs/{aztec.js,stdlib}` → `6.0.0-rc.3`), and **#335's change to `grantPublicAuthwit`**. Since #335, `caller` and `contract` parse as `schemas.AztecAddress` (they were `z.string()`), the drift guard checks that shape, and the README already carries its 0.2.0 entry.
  - **Deviation (tree over plan):** P8 says the patch is unchanged. That holds only against rc.3's `WalletSchema`, not against `0.1.0`, so `0.2.0` carries one behaviour change beside the peers.
- F16 holds at rc.3 too: the vendored `SchnorrAccount.json` and the installed `@aztec-labs/accounts@6.0.0-rc.3` artifact both hash to `9aebda2a…cdc8`.

## READMEs

- Each Requirements section now names the Aztec line: `@aztec-labs/*` `6.0.0-rc.3` for wallet-crypto and the schema patch. resolve-asset has no Aztec dependency and moves only in lockstep.
- wallet-crypto's false class-id sentence is deleted. The two sentences before it already say what the plan asked for.
- The schema patch's 0.2.0 Changes entry now names the peer move.
- The next bump's workspace-wide `rg` of the old version (aztec-update skill, Gotchas) catches the two version literals.

## Rehearsal (Bun 1.4.2, Node 24.12.0, npm 11.6.2)

| Tarball | sha256 |
|---|---|
| `nulo-sh-resolve-asset-0.2.0.tgz` | `d6e5c503db044be5792803aba4ddcac19d87cd6f1a15c22f3aea49ad36792c32` |
| `nulo-sh-wallet-crypto-0.2.0.tgz` | `dfe257f5022f10c3c3b898c1a874f046b6f7d0d042d5cc681aa0943b4a703c3a` |
| `nulo-sh-wallet-sdk-schema-patch-0.2.0.tgz` | `089d8d9e46f7f33289cdfe3d9108294a101d58dd44c48dd75483006ca6a23cd2` |

- First pass: stage exit 0, the three packs exit 0. The digests above are recorded under `"0.2.0"`.
- Second pass, from a clean tree after the digest commit: `dist-publish/` deleted, stage exit 0, packs exit 0, and the same three digests (`cmp` identical).
- Failure control: tarballs staged before the README commit fail `check-digests.ts 0.2.0` with exit 1, all three named.

## Gate

- `bun run test:release`: exit 0 (309 pass, 10 skip, 0 fail). The skips are the three opt-in probes (`NULO_STORE_COPY_LIVE`, `NULO_PROVENANCE_PROBE`, `NULO_RELEASE_PROBE`).
- `bun scripts/publish/check-digests.ts 0.2.0 <second-pack dir>`: exit 0.
- `bun run lint`: exit 0.
- Staged peers: every `@aztec-*` entry in the three staged manifests, and in each packed `package/package.json`, is exactly `6.0.0-rc.3` (exit 0). resolve-asset declares none.
