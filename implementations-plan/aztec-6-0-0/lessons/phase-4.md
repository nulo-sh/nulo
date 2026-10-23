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
