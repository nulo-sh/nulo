# Phase 4: the final gates

## The merge

`origin/dev` at `477b2c31` merged (`8fd87f19`): P0's #1103 (the empty Testnet list, the live check's `--source=` case) and the owner's publish #1104. `live-check.test.ts` merged clean beside P3's lines; `@nulo/token-list-host`: 85 pass, 3 skipped (the env-gated live cases, as on `dev`). `index.md` and `lessons.md` did not change.

## The excludes (D3)

The 44-name block left `bunfig.toml`, which now equals `dev`'s. `bun install --frozen-lockfile --force`: exit 0, `bun.lock` byte-identical (sha256 before and after), the installed `@aztec-labs/pxe` still carries the patched line, and the residue check passes. `reference/nulo-v6.2/bunfig.toml` holds the gate alone since P2.

## The audit

`bun audit --audit-level=low --json`, then `audit-gate.ts --mode enforce`:

- 18 acknowledgements went stale and left `audit-acks.json`: the line fixed undici 5 (now 6.29.1) with its busboy, and `ws` 8.18.3 (now 8.21.0), and `braces` 1240992 is no longer reported though `braces` 3.0.3 is locked on `dev` too (registry-side; the gate fails any enforcing PR on it).
- Re-judged for 6.0.0: the rc.3 entry keeps `uuid` 1119441 alone (gaxios under `@google-cloud/storage`, which only stdlib's `dest/file-store/gcs.js` imports; absent from the armed build's `THIRD-PARTY-NOTICES.txt`); the OpenTelemetry entry names 6.0.0 (`@aztec-labs/telemetry-client@6.0.0` still pulls the 1.x SDK and `systeminformation` 5.23.8; nothing here imports it). `SECURITY.md`'s table follows: 23 acknowledged.
- 11 unacknowledged, all on `dev` at the same locked versions, none from this bump: `vite` 8.2.1 (6), `storybook` 10.5.8 (2), `@vitest/mocker` 4.1.10 (1), `follow-redirects` 1.16.0 (2). #980 and #1032 track them and the deps-audit-1 lane owns the fix (a vitest bump needs the soak matrix). Not fixed or acknowledged here: this PR's `quality-status` stays red on them until that lane lands on `dev`.

## Provenance of the 44 excluded names

Each at `6.0.0`, read 2026-10-23:

- `bun.lock`'s integrity equals npm's `dist.integrity` for all 44.
- A scratch `npm install --ignore-scripts --force` of the 44 (431 packages): `npm audit signatures` verifies every registry signature, 102 attestations, 0 invalid, 0 missing.
- SLSA v1 provenance, verified, for 21: the 19 `@aztec-foundation/*` toolchain names from `AztecProtocol/aztec-packages` `ci3.yml@refs/tags/v6.0.0`; `aztec-standards` from `AztecProtocol/aztec-standards` `release.yml@refs/tags/v6.0.0`; `@alejoamiras/presto` from `alejoamiras/presto` `release-sdk.yml@refs/heads/main`; `@alejoamiras/private-fee-juice` from `alejoamiras/ecosystem-tooling` `release.yml@refs/heads/main`.
- The 23 `@aztec-labs/*` names carry no attestation (as at rc.3): trusted on the registry signature and the publisher, `charlielye`, published 2026-10-22 between 10:22 and 10:30Z.

## The gate

All at retry 0. The unit gates and Chrome smoke ran at `c57b3b4c`; Firefox smoke and every run after it at `0ef8a3dd`, whose changes are e2e-only (the replay's L1 check, the Chrome interception's log text, the README) and pass lint and the e2e typecheck:

- `bun run audit:vue`: exit 0 in 181 s (15148 tests); `test:all`: exit 0 in 158 s; `test:ci-gating`: 687 pass; `test:release`: 341 pass; `check:plans`: exit 0 once the skill's citation named the live plan path (the gate reads HEAD, so the archive path fails until the move).
- Smoke from the armed build: Chrome 61 files passed, 9 skipped, 272 tests, 1967 s; Firefox 65 passed, 5 skipped, 276 tests, 2721 s.
- The in-place pair (README § In-place update's two blocks, candidates rebuilt at HEAD): the replay 2 passed, 1 skipped (the seed has moved), Chrome 47 s, Firefox 55 s; the arrival suite both cases, Chrome 37 s, Firefox 46 s.
- Network, proverless, Chrome (`e2e:agent`, unsharded): 127 files passed, 6 skipped, 240 tests, 6009 s.
- Network, proverless, Firefox, in two sequential shards (one unsharded run outlasts a two-hour slot at smoke's 1.4× Firefox ratio): `--shard=1/2` 62 files passed, 7 skipped, 123 tests, 4028 s; `--shard=2/2` 64 passed, 113 tests, 3657 s.
- presto-server 1.1.3 from its release asset (tarball and binary equal to `_extension-network-e2e.yml`'s pins), private `PRESTO_HOME`, port 59833 free first. Warm-up: one `/prove` with `x-aztec-version: 6.0.0` and a one-byte body downloaded and verified bb 6.0.0 (10562528 bytes), then bb aborted on the body, as expected.
- Both execution canaries, prover-ON (`VITE_NULO_PRESTO_REQUIRED=1`, `frozen-account-canary` and `passkey-execution-canary`): Chrome 2 files, 4 tests, 281 s, 6 `Proving succeeded` lines in presto's log inside the run; Firefox 2 files, 4 tests, 301 s, 6. presto-server stopped by its process group after.
- Per-browser e2e wall-clock: Chrome 1967 s smoke + 84 s in-place + 6009 s network + 281 s canaries; Firefox 2721 s + 101 s + 7685 s + 301 s. No scenario added; the two update files changed expectations only.
