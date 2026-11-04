# deps-ci-2 recon

Base: `origin/dev` at `44d5a7064`. Probes ran on 2026-11-03 from 22:28Z, in scratch copies outside the repository (a copy of `cli/` for npm, a `git archive HEAD` export for Bun). One Sonnet explorer re-tested the absence claims (§ Reuse map).

## The alerts

`gh api repos/nulo-sh/nulo/dependabot/alerts?state=open` lists 15 open alerts, every one on `.github/actions/setup-aztec/cli/package-lock.json`:

| Alerts | Package | Vulnerable | First fixed | Disposition |
|---|---|---|---|---|
| 38 | `follow-redirects` | `>= 1.16.0, <= 1.16.1` | 1.16.2 (GHSA-mrwp-f3q8-3g9p, high) | this lane |
| 39 to 49 | `node-forge` | `<= 1.4.0` | 1.4.1 (eleven GHSAs, 5 high) | this lane |
| 34 | `deepmerge` | `>= 4.2.0, <= 4.3.1` | none | known limit #1420, the owner's dismissal |
| 50, 51 | `glob`, `minimatch` | majors below 14.0.2 and 11.0.1 | majors outside every range | known limit #1456, the owner's dismissal |

## Experiments

1. **npm, in place.** In a copy of `cli/`, under `lock.sh`'s environment (`npm_config_registry=https://registry.npmjs.org/`, `npm_config_min_release_age=7`, the two Aztec scope excludes), `npm update follow-redirects node-forge --package-lock-only --ignore-scripts --no-audit --no-fund` (npm 11.19.1, Node 24.22.1) exits 0. It prints `up to date`, but it rewrites the lockfile. A keyed compare (`jq '.packages | to_entries[]'`, sorted) differs in exactly two keys: `node_modules/follow-redirects` 1.16.1 → 1.16.2 and `node_modules/node-forge` 1.4.0 → 1.4.2. The text diff is six lines (version, resolved, integrity per entry). Both files hold 1119 entries, `lockfileVersion` 3. Each new integrity equals `npm view <pkg>@<version> dist.integrity`.
2. **Why node-forge 1.4.2.** The registry times: 1.4.1 at 2026-10-27 04:44Z, 1.4.2 at 2026-10-27 14:09Z, so both are past the 7-day gate at 2026-11-03 14:09Z. `@libp2p/crypto` 2.0.8 (under `@libp2p/peer-id-factory`, the only dependent) declares `^1.1.0`, so npm takes the newest allowed release. `follow-redirects` 1.16.2 (2026-10-25 21:32Z) is the latest release; its only dependent is `axios` 1.20.0 (`^1.16.0`). The tree holds one copy of each.
3. **Bun.** In the export, `bun update follow-redirects --lockfile-only --ignore-scripts` (Bun 1.4.2) prints `^ follow-redirects 1.16.1 -> 1.16.2`. It changes one `bun.lock` line, with the same integrity as npm's. It changes no `package.json`. `bun.lock` locks no `node-forge`.
4. **Audit gate.** In the export, after experiment 3 and with the `follow-redirects` entry deleted from `scripts/ci-cd/audit-acks.json`, `bun audit --audit-level=low --json` plus `audit-gate.ts <report> --exit-code 1 --mode enforce` prints `34 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable` and exits 0. Control: the same report against the base ack file prints `1 stale` (`follow-redirects advisory 1244003 is acknowledged but no longer reported: delete its entry`). `audit-gate.ts mode` over the two commits prints `audit mode: enforce (bun.lock: …)`, so the PR's `quality-status` runs this gate in enforce mode.
5. **Code deltas** (`bun pm diff <pkg>@<old> <new>`, the versions whose integrities experiment 1 records).
   - `follow-redirects` 1.16.1 → 1.16.2: `index.js` replaces its own `isArray` (`instanceof Array`) with `Array.isArray` for `sensitiveHeaders`; the README adds a funding notice that says maintenance is paused; `package.json` changes its version only.
   - `node-forge` 1.4.0 → 1.4.2: 16 files, none added or removed (+419 −64); `package.json` changes its version only, so no install script is new. The `lib/` changes (774 diff lines, read whole) are input checks: one level of nested BIT STRING decoding in `asn1`, X.660 range checks on OID arcs, PKCS#7 padding bytes checked in `cipherModes`, a GCM tag-length check, a `__proto__` cookie key refused in `http`, a loop guard in `jsbn`, PKCS#12 iteration counts of at least 1, a linear PEM parser in place of quadratic regexes, a canonical DER DigestInfo check on RSA PKCS#1 v1.5 verification, and bounds in `tls` and `x509`. No added line requires a module, evaluates code, reads `process` or opens a connection. The minified `dist/` bundles were not read: Node loads `lib/` (`"main": "lib/index.js"`).
6. **Build determinism.** `bun run --cwd apps/extension build:full` ran twice at `44d5a7064`. The SHA-256 list of every file under `dist/chrome` and `dist/firefox` (643 files each) is identical between the runs. Neither `THIRD-PARTY-NOTICES.txt` names `follow-redirects`, `node-forge` or `axios`.

## Reuse map

- **Generator.** `.github/actions/setup-aztec/lock.sh` holds the resolve's environment (`:38-45`); a full run re-resolves the whole tree, so this lane reuses its environment for an in-place update, as #1421 did for its resolve.
- **Floor test.** `scripts/ci-cd/setup-aztec-pins.test.ts` floors one package, `systeminformation`, the one an `overrides` entry forces. `lock.sh:21-23` ties the override's removal to that floor. It reads no `follow-redirects`, `node-forge` or `axios` version.
- **Audit gate.** `scripts/ci-cd/audit-gate.ts:198` decides the mode from `bun.lock`, `bunfig.toml`, the ack file and every `package.json`; `cli/package-lock.json` is not in that set.
- **Restatements.** `SECURITY.md:609` ("35 advisories") and `:617` (the `follow-redirects` row) restate the ack; no test pins either. `CHANGELOG.md` is history. Skills, `CI.md`, `.github/WORKFLOWS.md`, `UPDATE.md` and `BEFORE-LAUNCH.md` name no version of either package (explorer sweep).
- **Other readers of the npm lockfile.** `install.sh` (`npm ci --ignore-scripts`), the floor test, and `action.yml:48`'s cache key (`hashFiles('.github/actions/setup-aztec/**')`), so CI installs the new tree cold. The Docker CI-like runner calls `install.sh`.
- **Path filters.** `bun.lock` is in all four e2e lanes' filters (smoke and network, Chrome and Firefox); `.github/actions/setup-aztec/**` is in both network lanes'. No label is needed.
- **Out of reach.** `reference/*/bun.lock` (the regime generators' own lockfiles) are outside the workspaces and carry no open alert.
