# deps-audit-1: recon

Base `origin/dev` at `ef5336bbc`, Bun 1.4.2. One Sonnet explorer (reuse sweep) plus the planner's own reads and probes, 2026-10-21.

## The five advisories (`bun audit --audit-level=low --json`, gate in report mode: 41 acknowledged, 5 unacknowledged, 0 stale)

| id | package (as bun reports it) | severity | range reported | first patched (GitHub advisory) |
|---|---|---|---|---|
| 1242604 GHSA-q3jh-wrc6-jgq8 | follow-redirects | high | `>=1.16.0 <1.16.1` | 1.16.1 |
| 1242605 GHSA-8r9p-f939-6h3c | follow-redirects | high | `>=1.16.0 <1.16.1` | 1.16.1 |
| 1242625 GHSA-698v-4r3x-3vcv | vite (bundled launch-editor) | moderate | `>=8.2.0 <=8.2.3` | 8.2.4 (8.3 line: 8.3.3) |
| 1242654 GHSA-r825-w8mm-5pxw | vite (bundled launch-editor) | moderate | `>=8.2.0 <=8.2.3` | 8.2.4 (8.3 line: 8.3.3) |
| 1242661 GHSA-587h-7wmj-h5pm | vite (bundled launch-editor) | high | `>=8.2.0 <=8.2.3` | 8.2.4 (8.3 line: 8.3.3) |

The issue lists the three launch-editor advisories by title; `bun audit` files them under `vite`, because vite bundles `launch-editor-middleware` into `dist/node`. No `launch-editor` package is in `bun.lock`. None of the five has an entry in `scripts/ci-cd/audit-acks.json`.

## Where they come in

- `vite@8.2.1`, one copy. Declared `^8.0.16` in `apps/extension`, `apps/landing`, `apps/playground` (devDependencies) and forced to one line by the root `overrides.vite` `^8.0.0` (`package.json:54`; why: `implementations-plan/archive/vitest-vite8-dedupe/plan.md`).
- `follow-redirects@1.16.0` ← `axios@1.20.0` (`^1.16.0`) ← `@aztec-labs/aztec.js` and `@aztec-labs/stdlib` 6.0.0-rc.3 (`axios ^1.15.1`). Not a direct dependency anywhere. Installed axios's `browser` field maps `lib/adapters/http.js` (the only importer of follow-redirects) to `lib/helpers/null.js`.

## Registry (2026-10-21T01:52Z; gate is 7 days)

- follow-redirects 1.16.1: 2026-10-01 (20 days). vite 8.2.4: 2026-10-06 (15 days); 8.3.3: 2026-10-06; 8.3.4 (latest): 2026-10-08 (13 days). No 8.2.3 was published. Every fix is past the gate: the CVE bypass for the fixed versions is not needed.
- `@alejoamiras/presto` 6.0.0-rc.3: 2026-10-14T16:54Z; `@alejoamiras/private-fee-juice` 6.0.0-rc.3: 2026-10-14T21:00Z. Both exact-pinned, both locked; both still inside the gate until 2026-10-21T21:01Z.

## Probes (in this worktree, reverted after; patch kept in the scratch dir)

- `bun audit fix --dry-run`: fixes follow-redirects 1.16.0→1.16.1, vite 8.2.1→8.2.4, **and vitest 4.1.10→4.1.11** (held out: acknowledged until a soak, `SECURITY.md:501`). Everything else is blocked by a dependent's range, as acknowledged.
- `bun update follow-redirects`: lockfile only, one line (version + integrity), integrity equal to the registry's `dist.integrity`.
- `bun update vite` (with or without `@8.2.4`) resolves 8.3.4: the override's range wins.
- The planned manifest edits (the root override; the app manifests) re-resolve the tree and fail: `Version "@alejoamiras/presto@6.0.0-rc.3" was published within minimum release age` (and private-fee-juice). The documented answer (`SECURITY.md` CVE runbook step 4) is an uncommitted local exclude. `bun install --config=<scratch copy of bunfig.toml + minimumReleaseAgeExcludes for those two names>` works and leaves the tracked `bunfig.toml` untouched (`-c <path>` is misparsed as a package by `bun install`).
- Override `"8.2.4"` → install → override and the three floors `^8.2.4` → install: the lock keeps 8.2.4. Final `bun.lock` diff: four range lines, the vite entry, the follow-redirects entry. `bun install --frozen-lockfile --force` with the tracked `bunfig.toml` passes. Audit gate in enforce mode: 41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable.

## `bun pm diff`

- follow-redirects 1.16.0 → 1.16.1: `index.js` +11 −2 (array-form headers converted to an object before the sensitive-header strip; `escapeRegex` escapes `[`, `^`, `|`). No new import.
- vite 8.2.1 → 8.2.4: 10 files, +1162 −812, all in `dist/`: rebuilt with rolldown 1.2.4 / oxc runtime 0.144.0, launch-editor 2.14.1 → 2.14.2 bundled (`escapeCmdArgs`, `parse-file`), `module-runner.js` (reformatting plus one logic change: an importer already in the call stack counts as circular only while that module is still in flight), dependency ranges `postcss ^8.5.26`, `rolldown ~1.2.4` (both already locked at those versions). Bundled code that no lock entry shows also moves: magic-string 1.1.0 → 1.2.0, shell-quote 1.8.4 → 1.12.0. bun pm diff flags no install script and no new process, fs, net or vm import, which is weak evidence for vite: `dist/node` already imports all of them.
- Provenance: vite 8.2.4 carries SLSA provenance (vitejs/vite `publish.yml`, tag `v8.2.4`); follow-redirects 1.16.1 was published with a token and has no attestation.

## Reuse sweep (what reads or pins these)

- Nothing pins a vite, rolldown, launch-editor, axios or follow-redirects version: no test, no notices policy record (`packages/third-party-notices/src/policy.ts`), no doc version number (`apps/extension/store/SOURCE-BUILD.md` names Vite and Rolldown without one).
- `scripts/ci-cd/audit-gate.test.ts` parses the committed ack file and pins no count; `SECURITY.md:492` "41 advisories" and its table stay true (nothing is acknowledged or removed).
- CI on a PR into `dev` that changes `bun.lock` and `package.json`: `pr-quick.yml` (commitlint, lint-and-typecheck with the audit in enforce mode, unit tests, build chrome, build firefox, build landing, build storybook) and all four e2e lanes (smoke and network, Chrome and Firefox; network builds the playground).
- Prior art: `#62` (`8b88e0c8c`) moved ten transitives lockfile-only through `bun audit fix` holding vitest out, and raised the `vue` floor with its bump.
- `reference/{nulo-v6,key-model-v2,aztec-5.0.0-stable/regime-b}/bun.lock` (frozen address-vector generators, outside the workspaces) lock follow-redirects 1.16.0; no workflow installs them and no gate audits them.
- #980's line that shard-balance "had to route around" the gate is context; nothing in this lane depends on it, and it was not checked.
