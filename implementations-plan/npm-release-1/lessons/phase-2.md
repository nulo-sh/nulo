# Phase 2: rehearsal and digests

Toolchain: Bun 1.4.2, Node 24.12.0, npm 11.6.2. `M` = `dda72e321`: `origin/dev` had not moved, so the merge was a no-op.

| Tarball | sha256 |
|---|---|
| `nulo-sh-resolve-asset-0.3.0.tgz` | `ea222dec00145f91249d3fab9b7ff476f14a3fbcf6ea24a9a933813518c9522d` |
| `nulo-sh-wallet-crypto-0.3.0.tgz` | `f2693c948d3c715bcb999471c0cbadd659afc2fdc6f0c6105faf8bc3aa19a6e1` |
| `nulo-sh-wallet-sdk-schema-patch-0.3.0.tgz` | `e7add1a4ba9de81151661404020bdf255677542297549210de582981a026bf86` |

- Pass 1 at `536e692db` (the README commit): stage exit 0, three packs exit 0; the digests above, committed in `8014e5708`.
- Pass 2 from a clean tree (`git status --porcelain` empty, `dist-publish/` deleted): `check-digests.ts 0.3.0` exit 0; `cmp` identical for all three.
- Control: the READMEs restored from `M`, staged and packed, then restored from `HEAD` (porcelain empty after). The head's `check-digests.ts 0.3.0` exits 1 with exactly three `sha256 …, approved …` failures. Those pre-README digests equal the planning-time scratch staging into `--out`, so the output directory does not move the bytes.
- Consumer diff against `npm pack @nulo-sh/<p>@0.2.0` (whose digests still match their approved ones): only `package.json` and `README.md` differ in each. `package.json` changes `version`, and `wallet-crypto`'s and the schema patch's two `@aztec-labs/*` peers move to exactly `6.0.0`. `resolve-asset` has no peer and no dependency; the schema patch keeps `zod ^4.4.3`.
- Gate: `bun run lint` 0; `bun run test:release` 0 (341 pass, 11 skip: the env-gated probes, 0 fail).
