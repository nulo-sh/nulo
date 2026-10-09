# Nulo V6

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet runs on the Aztec 6.0.0-rc.1 line as "Nulo V6", derives accounts under the `nulo-v6` regime, seeds the V6 testnet as its one public network, and was submitted to both extension stores (`packages/aztec-runtime/src/account/address-freeze.ts`, `apps/extension/src/utils/chain-ids.ts`, `apps/extension/store/listing.md`).
- **Open items**: the get-gas link's mainnet follow-through, a fetched default token list, a V6 mainnet seed and its fee policy, an automated live-transaction smoke, a held `presto-banners` bump, the incoming-transfer poll cost on the shared RPC key, tracked in #77, #79, #80, #81, #82 and #143. The store launch's owner steps are in `BEFORE-LAUNCH.md` § 2.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the whole dependency line and the chain identity in one change, then release in waves.

- Every `@aztec/*` import and pin moves to `@aztec-labs/*`, except `bb.js`, the two noir packages and `l1-artifacts`, which move to `@aztec-foundation/*`. `@aztec/viem` keeps its name. Presto, Aztec Standards and private-fee-juice move to the same line, so nothing stays held.
- The account regime is append-only: `nulo-v5` is frozen to literals first, then `nulo-v6` is appended with the V6 SchnorrAccount artifact vendored byte-exact, and the extension major binds to it. There is no V5 migration or recovery inside V6, and the backup compat epoch moves so a V5 backup is refused.
- The V6 testnet becomes the one public seeded network beside Local Network. Alpha V5, with its chain id, tokens, prices, explorer entry and fee policy, is deleted rather than re-keyed. The product name is "Nulo V6".
- The V6 extension reuses the previous extension's store items, renamed. This is a recorded one-time exception to the rule that a protocol break ships as a new extension, because V5 never had users.
- Waves: the line change merges first, then the npm packages and the release in either order, then the unleashed-side token and gas link work, then the store upload.

## Why

- The PrivateFPC is initializerless and private-only, so nothing deploys it. The runbook's precondition of a deployed contract plus a live canary does not apply to it, and its address is pinned from the reviewed artifact and handed to unleashed.
- Address-level test vectors come from an independent generator with its own lockfile. Key-level assertions stay on the earlier key-model vectors as a standing cross-version check, so the key level is never compared against itself.
- Supply-chain checks are per scope: provenance where upstream publishes it, registry signatures plus publisher continuity where it does not. Builds that produce release bytes restore no Bun cache.
- Waiting for the bridge generation before releasing would have blocked a usable V6 build on another repository's timeline.

## What shipped

- The line, regime, chain cutover, harness and CI move, with both execution canaries passing prover-on on Chrome and Firefox. The three npm packages were republished peering exactly on the new line, with provenance verified. A release followed, and the landing was rebuilt to link it.
- Token seeding for the V6 testnet, priced through proxies where a token has a listing. A later release carried the store launch: listing text, art, remote-code notes and the store links in the Terms.

### Name-keyed sites

These break silently or fail open when a package or scope rename misses them, and the compiler cannot see them.

- Four version readers keyed by package name: the toolchain setup action, the local CI-like script, the e2e global setup and `apps/extension/vite.shared.ts`, which feeds `__AZTEC_VERSION__` to Presto's exact-string handshake, the About page and the backup envelope. A missed key makes the version `unknown` and silently disables native proving, so the config now throws.
- The bb.js fetch-code shim's importer match (`apps/extension/scripts/bb-fetch-code-shim.ts`), and `HEAVY_PREFIXES` and `NEVER_GROUPED` in `apps/extension/scripts/vendor-chunks.ts`, where a miss regroups the web-accessible wallet-sdk chunk.
- Literal scope prefixes in `store-listing.test.ts`, `presto-core-deps.test.ts`, `scripts/lockfile-exception-diff.ts` and `scripts/publish/stage.ts`, which pass vacuously after a rename.
- String-named runtime resolution through `@nulo/resolve-asset` and `require.resolve`, noir patch file names whose unmatched keys Bun drops silently, and the third-party notices overrides, which refuse the build until re-reviewed.
- Historical `@aztec/<pkg>@5.x` citations must not be rewritten, since the new scope never carried those versions. Format only touched files, because a blanket Biome write rewrites mocks and breaks tests.

### Store upload

The store launch ran after the V6 release. Chrome took the upload as a staged publish and Firefox took the same zip by hand after the automated job's reviewer notes exceeded the add-on site's 3,000-character cap, which nothing had checked. The publish now refuses over-cap notes before uploading, and an AMO 400 reports that no version was created. Two gotchas went to the release runbook in `CLAUDE.md`. The remaining owner steps are in `BEFORE-LAUNCH.md` § 2.
