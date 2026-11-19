# update-from-1.2.0: recon (2026-11-05)

One Explore agent (sonnet) diffed `v1.1.0..v1.2.0` over what the update scenarios drive on a release and check after the update; the planner checked the harness, the zips and the claims below by hand. Every `git show` was at the tag named; `apps/extension/src/wallet/constants/network-endpoints.ts` was opened at no revision.

## The release

- Tag `v1.2.0` is an annotated tag on `7793112bc70849bc3817e468b3862294bc1b3522`. Downloaded with `gh release download v1.2.0 --repo nulo-sh/nulo` into an empty folder:
  - `nulo-chrome-1.2.0.zip` `559bc2200fe9da8e33fca93e617c4d18069ea4c55fa6f4cda6ffc009dff4a2f0`
  - `nulo-firefox-1.2.0.zip` `a107680a13421d2d7d30641bca3aa71e3633e0f13583f07ef188c9e8fc2b4f70`
- `sha256sum -c SHASUMS256.txt`: both OK. GitHub's asset digests: equal. `gh attestation verify <zip> --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/release.yml --source-digest 7793112bc70849bc3817e468b3862294bc1b3522 --deny-self-hosted-runners`: exit 0 for both.
- v1.2.0 is the first stable release published with immutable releases on: `isImmutable: true`, three assets; `gh release verify v1.2.0 --repo nulo-sh/nulo` and `gh release verify-asset v1.2.0 <zip>` exit 0 for both zips.
- Both manifests read `1.2.0.0`.

## The traits, from the tag's files

| Trait | v1.2.0 | Decided by |
|---|---|---|
| `storage` | `sealed` | `stores.ts` blob `22c33455d` at v1.1.0, v1.2.0 and HEAD; `ui-preference/service.ts:75-78` seals pins, both pick maps and the selection |
| `connect` | `own-window` | `wallet-sdk/session-established.ts:262` opens the emoji check with `createPlaced` |
| `passkey` | `unlocks` | `profile/profile-row.ts` blob `65cd7efea` at v1.1.0, v1.2.0 and HEAD (`newPasskeyRow` at `:113`) |
| `testnetHost` | `aztec-testnet.drpc.org` | the zips' `assets/seeds-DCho9F74.js` (one blob in both): the `Testnet` seed's `rpcUrl` is a literal on that host. Read with every URL cut to its host; the file names one other provider host, Mainnet's |
| `sponsor` (new) | `listed-chains` | `fpc/sponsored-fpc-chains.ts:6` (Testnet and the Local Network, chain 0); `fpc/service.ts:176`, `:189`, `:361`; `FeeSettingsCard.vue:159`. Absent at v0.31.0, v1.0.0, v1.1.0, whose `fpc/service.ts` (`:156`, `:159`, `:161`) discovers the sponsor on every chain |

## What else moved between the tags (none needs a branch)

- No migration (`realMigrations` empty); stamps 1-3 are additive. A new plaintext key family, `tokenIdHighWater`, which v1.1.0 lacks, so it stays out of `HELD` (`fixtures/update/verify.ts`).
- Seeds: Testnet, Local Network, Mainnet ("Alpha V6" renamed "Alpha"); no kind added, so the arrival scenario's precondition fails from v1.2.0, as from v1.1.0.
- `@aztec-labs/*` 6.0.0 and `REGIMES` identical at v1.1.0, v1.2.0 and HEAD: the live scenario's precondition holds.
- A dApp session lasts 7 days (`dapp-session/service.ts:249`).
- Every test id and route the release-side drivers use exists at v1.2.0 (218 checked). The phrase check is the onboarding tab's only; the drivers create profiles in the popup.
- Legal: terms 1.2.1 and privacy 1.2.7-1.2.9, none material; `launchExtension` seeds the current acceptance.

## The candidate

- `dev` (HEAD `5f95ea108`) does not descend from `v1.2.0`: the sync PR #1677 (`chore: sync main → dev`, open, checks running) carries the 1.2.0 version bump. `apps/extension/package.json` on `dev` reads `1.1.0`, so `build-update-candidate.sh` makes `1.1.0.1`, and `updateBuilds` (`fixtures/update/in-place.ts:41-43`) refuses a candidate that does not rise above `1.2.0.0`.
- Apart from the version files and `CHANGELOG.md`, `v1.2.0..HEAD` is #1674 (popup refactors, `helpers/profile-chaos/model.ts`).
