# deps-ci-1 recon

Base: `origin/dev` at `7bde519db`. One Sonnet reuse sweep plus the planner's own reads and scratch experiments (an npm resolve and `npm ci` outside the repo).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A dependency override with a written removal condition | root `package.json:53-60` `overrides` (`vite`, `zod`); the `zod` one is documented with its removal condition in `.claude/skills/aztec-update/SKILL.md:57` | adapt: same pattern, npm `overrides` in `cli/package.json`, removal condition in the same skill |
| Generating the CLI's npm tree | `.github/actions/setup-aztec/lock.sh` writes `cli/package.json` from a heredoc and resolves fresh under the 7-day gate (`npm_config_min_release_age=7`, Aztec scopes exempt, registry named) | adapt: the heredoc carries the override, so the next Aztec bump keeps it |
| Installing it | `install.sh:142-143` copies both files and runs `npm ci --ignore-scripts` | reuse as is |
| Pinning the lockfile's properties | `scripts/ci-cd/setup-aztec-pins.test.ts`: both CLI packages at the extension's pin (compares `dependencies` only, line 46-47), every entry a registry tarball with a sha512 (50-53), refusal copies (55-65) | adapt: one floor assertion plus its refused copy, in the same `describe` |
| Proving the install locally | `apps/extension/scripts/e2e/docker-ci-like.sh:100-112` runs the same `install.sh`, keyed by a stamp over the action directory; a `*.test.ts` argument runs one file (127-131) | reuse, with lane-owned volumes and a copy of the tree (plan § Phase 2) |
| Proving it on CI | `uses: ./.github/actions/setup-aztec` only in `_extension-network-e2e.yml:161`; `.github/actions/setup-aztec/**` trips `pr-extension-network-e2e.yml:105` and `pr-extension-network-e2e-firefox.yml:90`; smoke filters do not list it; the cache key hashes the directory (`action.yml:48`), so the first run is cold | reuse as is |
| A gate for this lockfile's advisories | none: the `bun audit` gate reads `bun.lock` only; #1278 (closed) chose dismissal over a gate, recorded in `aztec-update` SKILL.md:65 | not built (out of scope; the owner's 2026-10-28 call) |

Absence trails: `grep -E '"(overrides|resolutions|patchedDependencies)"'` over every `package.json` and `bunfig.toml` (no hit under `.github/`); `grep -rnIE 'setup-aztec|installer-pins|lock\.sh'` outside `node_modules`, `archive/`, the lockfiles (only `setup-aztec-pins.test.ts` and the workflows); `grep -E 'systeminformation|deepmerge'` over `scripts/ci-cd/audit-acks.json` (five `systeminformation` acks for `bun.lock`, none for `deepmerge`).

## The four alerts (Dependabot, open on `dev`)

| Alert | Advisory | Range → fix | Reach in this tree |
|---|---|---|---|
| 37 | GHSA-3f7j-7jwc-fxfj high, Windows command injection in `services()` | < 5.33.16 → 5.33.16 | `services()` is never called; the runners are Linux |
| 36 | GHSA-4vjg-vx72-qq4g low, symlink path traversal in Linux `networkStats()` | < 5.33.14 → 5.33.14 | called (below) on host interface names |
| 35 | GHSA-7648-jmwf-vw7j medium, prototype pollution in `networkStats()` via the interface name | < 5.33.13 → 5.33.13 | same |
| 34 | GHSA-gcqx-w48m-w2h4 low, prototype poisoning in `deepmerge` `mergeObject()` | 4.2.0–4.3.1 → none | loaded only by `jest-config` (below) |

The brief's "all fixed in 5.33.16" is loose: the fixes are 5.33.13, 5.33.14 and 5.33.16, so 5.33.16 covers all three.

## Chains (from `cli/package-lock.json`, and a scratch `npm ci` of it)

- `systeminformation` 5.23.8: `@aztec-labs/telemetry-client` 6.0.0 → `@opentelemetry/host-metrics` ^0.36.2 (0.36.2) → `systeminformation` **exactly** `5.23.8`. host-metrics uses one function: `require("systeminformation/lib/network").networkStats()` (`build/src/stats/si.js:22`). 5.33.16 keeps `lib/network.js` with that export and has no `exports` map, so the deep require still resolves; `networkStats()` ran on 5.33.16 in the scratch install.
- `deepmerge` 4.3.1: `@aztec-labs/epoch-cache` 6.0.0 → `jest-mock-extended` ^4.0.0 (runtime dependency) → peer `jest` (auto-installed) → `jest-cli`/`@jest/core` → `jest-config` → `deepmerge` ^4.3.1. Only `jest-config/build/index.js` requires it, and only `jest`, `jest-cli` and `@jest/core` require `jest-config`. `jest-mock-extended` itself requires `@jest/globals`, `jest-mock`, `ts-essentials` and `assert`, and is imported only from `@aztec-labs/*/dest/test/`. deepmerge has no release after 4.3.1 (2023-03-16) and no later major.

## Scratch experiments (npm 11.19.0, Node 24.21.0; outside the repo)

1. **In-place resolve** (`cli/package.json` plus `overrides.systeminformation: "^5.33.16"`, the committed lockfile, `npm install --package-lock-only` with lock.sh's environment): the lock moves `systeminformation` 5.23.8 → 5.33.16, and drops one `extraneous` top-level `zod` 3.25.76 entry. The age gate held: 5.33.17–5.33.19 (published 2026-10-28 and later) were skipped.
2. **Fresh resolve** (what `lock.sh 6.0.0` does today): 41 packages move, among them `lmdb` and its native bindings, `body-parser`, the AWS SDK, and three `@babel` packages that go down a patch. Rejected for this lane (plan, D2).
3. **`npm ci --ignore-scripts`** of the base pair and of experiment 1's pair: both add 1048 packages; the installed trees differ only in `systeminformation` (a walk of every installed `package.json`). The extraneous `zod` entry is not installed from either lock.
4. **Drift**: the new lockfile with the old `cli/package.json` (no override) fails `npm ci`: "Missing: systeminformation@5.23.8 from lock file". So the two files cannot drift apart unnoticed; only a regeneration that drops the override from both can.

## The extension's own copy

`bun.lock` holds `systeminformation` 5.23.8 through the same `@opentelemetry/host-metrics` 0.36.2 (`bun.lock:876`, `:2306`), acknowledged in `scripts/ci-cd/audit-acks.json` as not bundled; `deepmerge` is not in `bun.lock`. Out of scope (the Aztec line). The notices check is in plan § Assumptions, F6.

## Policy clause

`SECURITY.md` § Binary dependencies governs this lockfile: "What stays trusted: the npm registry when the lockfile is generated (`lock.sh`, under the 7-day gate with the Aztec scopes exempt; each Aztec bump's lockfile diff is reviewed)". Bun's gate (`bunfig.toml`, § Dependency policy) does not reach it, but `lock.sh` applies npm's own 7-day gate, and the in-place resolve here runs under the same settings.

## Collisions

No open issue or PR touches `.github/actions/setup-aztec/`. Closed #1278 covers the earlier 15 alerts on this lockfile; its disposition (dismiss as `tolerable_risk`) is recorded in the `aztec-update` skill.
