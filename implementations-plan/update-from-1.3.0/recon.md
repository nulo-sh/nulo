# update-from-1.3.0: recon (2026-11-19)

No Explore agent: the release's product sources equal `dev`'s at `93aeedbc1` (the rest of the diff is the version files, `CHANGELOG.md` and `BEFORE-LAUNCH.md`), so the planner read the tag by hand. Every `git show` was at the tag named; `apps/extension/src/wallet/constants/network-endpoints.ts` was opened at no revision.

## The release

- Tag `v1.3.0`, annotated, on `be2280a881b8b087e21cfc4d2dc7b7d18fd0457b` (on `main`). Downloaded with `gh release download v1.3.0 --repo nulo-sh/nulo` into an empty scratch folder; published 2026-11-19 22:02 UTC, `isImmutable: true`, three assets:
  - `nulo-chrome-1.3.0.zip` `5ba54bb3895ca6882fa5b05a71dccbcf2ce20f3175b070edb06b8af57ab336a3`
  - `nulo-firefox-1.3.0.zip` `e678479fc2542188f7c67bfb7f0b61cf721d70bca281cf74056b57986fe2ca40`
- `sha256sum -c SHASUMS256.txt`: both OK. GitHub's asset digests: equal. `gh attestation verify <zip> --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/release.yml --source-digest be2280a881b8b087e21cfc4d2dc7b7d18fd0457b --deny-self-hosted-runners`: exit 0 for both. `gh release verify v1.3.0` and `gh release verify-asset v1.3.0 <zip>`: exit 0.
- Both manifests read `1.3.0.0`.

## Traits, from the tag's files

| Trait | v1.3.0 | Decided by |
|---|---|---|
| `storage` | `sealed` | `wallet/services/ui-preference/service.ts:75-78` (blob `7e08967e0`, as at v1.2.0) seals the pins, both pick maps and the selection; `wallet/storage/stores.ts` (`1566f4090`) adds one sealed root, `discoveryPolicy` |
| `connect` | `own-window` | `wallet/services/wallet-sdk/session-established.ts:262` opens the emoji check with `createPlaced` (blob `28e46dae2`, as at v1.2.0) |
| `passkey` | `unlocks` | `wallet/services/profile/profile-row.ts` blob `65cd7efea` at v1.1.0 through `dev` (`newPasskeyRow` at `:113`) |
| `testnetHost` | `aztec-testnet.drpc.org` | the zips' `assets/seeds-CCF6EBFS.js` (one blob in both): the `Testnet` seed's `rpcUrl` is a literal on that host. Read with every URL cut to its host; the file names `aztec-mainnet.drpc.org`, the two relay hosts and `localhost` besides |
| `sponsor` | `listed-chains` | `wallet/services/fpc/sponsored-fpc-chains.ts:6` (blob `fd0a60de6`, as at v1.2.0): Testnet and the Local Network |
| `send` (new) | `person-first` | `popup/pages/send.vue` opens on `send-person-step`; `send-from-type` at `:1128` sits in the form a chosen recipient opens; the payer is a `send-fee-payers` radio in the Fee sheet (`FeeMethodRadios.vue`). `git grep` at v0.31.0, v1.0.0, v1.1.0, v1.2.0: no `send-person-step`, no `send-fee-payers` outside tests: `one-form` |

## What else moved between v1.2.0 and v1.3.0 (none needs a branch)

- Relay seeds (#1757): the `Testnet` and `Alpha` seeds carry `relay: { rpcUrl, label: "Nulo" }`; a profile v1.3.0 makes holds two endpoints on each. `seeds.ts` is one blob at v1.3.0 and `dev`, so the relay hosts are those `RELAY_NODE_HOSTS` declares.
- New key families: `discoveryPolicy` (sealed), `uiWhatsNewSeen` (plaintext); not in `HELD`, since v1.2.0 lacks them.
- A dApp session lasts 7 days (`DAPP_SESSION_DAYS`, `wallet/services/dapp-session/spec.ts:14`).
- `@aztec-labs/*` 6.0.0 at v1.3.0 and `dev`: the live scenario's precondition holds.

## The candidate

- `dev` at `93aeedbc1` does not descend from `v1.3.0`; the sync PR #1900 carries the 1.3.0 bump. `dev` reads `1.2.0`, so `build-update-candidate.sh` makes `1.2.0.1`, which `updateBuilds` refuses.
