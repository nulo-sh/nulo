---
plan: deps-ci-3
tier: light
status: active
issues: "#1896"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no explorer (the recon is the probes below); one Codex gpt-6.1-sol high pass over the plan and the completed diff, then targeted verification
base: origin/dev at 033dfcd9c
trunk: dev
post_implementation_hardening: not scheduled
---

# deps-ci-3: setup-aztec's CLI lockfile past Dependabot alerts 53 to 57

Dependabot lists alerts 53 to 58 on `.github/actions/setup-aztec/cli/package-lock.json`, the npm tree the `setup-aztec` action installs the Aztec CLI 6.0.0 from for the network e2e lanes (#1896). The owner, 2026-11-20: "go on the #1896 dependency lane". Five alerts move by an in-place update; alert 58 (`@libp2p/crypto`) has no fix any dependent's range accepts and becomes a known limit (F4, D3). UI impact: none.

## Outcome & Quality Bar

- **For whom**: the owner reading the Security tab, and the maintainer who reviews the next Aztec bump's lockfile.
- **Excellent**: (1) the lockfile moves only the two named packages plus the floors their fixed releases declare, each to a registry tarball whose integrity is the registry's; (2) `install.sh` installs and loads the new tree; (3) alert 58 leaves no lost line: a closed `known-limit` issue holds its trace and reopening condition.
- **Good enough**: no new test; the PR's two network lanes install the new tree cold on CI.

## Why this is maintenance

The tree runs only on CI runners and the local Docker runner (`install.sh`, `npm ci --ignore-scripts`); nothing in it is bundled into either extension zip. `node-forge` arrives through `@libp2p/peer-id-factory` 3.0.11 → `@libp2p/crypto` 2.0.8 (`^1.1.0`); `fast-xml-parser` through `@google-cloud/storage` 7.22.0 (`^5.3.4`). This plan traces no path from either to a CI job, so whether the alerts can be reached is unknown; the owner scoped the work as maintenance.

## Assumptions

Probes ran on 2026-11-20 from 14:05Z in scratch copies outside the repository.

- **Facts**:
  - F1: alerts 53 (`fast-xml-parser` ≤ 5.11.2, fixed 5.12.0), 54 to 57 (`node-forge` ≤ 1.4.2, fixed 1.4.3) and 58 (`@libp2p/crypto` ≤ 5.1.21, fixed 5.1.22), all open (`gh api …/dependabot/alerts/<n>`).
  - F2: from `cli/`, `npm update node-forge fast-xml-parser @libp2p/crypto --package-lock-only --ignore-scripts --no-audit --no-fund` under `lock.sh`'s three `npm_config_*` settings changes exactly four `.packages` keys (keyed compare): `node-forge` 1.4.2 → 1.4.3, `fast-xml-parser` 5.11.2 → 5.12.1, `is-unsafe` 2.0.2 → 2.0.3, `fast-xml-builder` 1.3.1 → 1.3.2. The last two are forced: 5.12.1 declares `is-unsafe ^2.0.3` and `fast-xml-builder ^1.3.2`. No key is added or removed, `package.json` and the lockfile's top level are unchanged, every new `resolved` is `registry.npmjs.org`, and each `integrity` equals `npm view <pkg>@<v> dist.integrity`. npm prints `up to date` anyway.
  - F3: the age setting governs the pick. The same update with `npm_config_min_release_age=12` stops at `fast-xml-parser` 5.12.0 and leaves `fast-xml-builder` at 1.3.1, since 5.12.1 and 1.3.2 were published on 2026-11-13 (09:55Z, 09:21Z), seven days before the resolve.
  - F4: the tree locks `@libp2p/crypto` 2.0.8 (under `@libp2p/peer-id-factory` 3.0.11, `^2.0.8`), 4.0.3 (top level, the exact pin of `@aztec-labs/p2p` 6.0.0) and 4.1.9 five times (under `libp2p` 1.5.0, `@libp2p/peer-record`, `pubsub`, `utils` and the nested `peer-id-factory` 4.x, `^4.1.1` to `^4.1.9`). Neither line has a release past 2.0.8 or 4.1.9; the first fixed release is 5.1.22, a major away from every range. The decoder the alert names, `src/keys/rsa/der.ts`, is in the 5.1.21 tarball and in none of 2.0.8, 4.0.3 or 4.1.9: 2.0.8 parses DER with `node-forge`'s `asn1`, the 4.x line with `asn1js` (`src/keys/rsa-utils.ts`).
  - F5: the four code deltas, read from the registry tarballs: `node-forge` adds input checks (Ed25519 small-order keys, HTTP header trimming, TLS compression and sessionless records) and X.509 name-constraint enforcement; `fast-xml-parser` replaces an attribute regex and a validator backtrack; `is-unsafe` adds an entity-decoded match for markup contexts; `fast-xml-builder` adds a nesting cap and name sanitising. No new install script, no new dependency beyond the floors in F2, and no process, network, `eval` or environment access added.
  - F6: `npm ci --ignore-scripts` of the base and head pairs installs 1048 packages each; the installed trees differ in exactly the four packages of F2. `install.sh` (`AZTEC_VERSION=6.0.0`, a scratch `AZTEC_HOME` and `TMPDIR`) exits 0 on the head pair, through its pinned downloads, the `bcrypto` rebuild and its `@aztec-labs/aztec-node` load check.
  - F7: `bun.lock` already carries `fast-xml-parser` 5.12.0 (#1885) and stays untouched. `.github/actions/setup-aztec/**` is in both network lanes' filters (`pr-extension-network-e2e.yml`, `pr-extension-network-e2e-firefox.yml`), and the action's cache key hashes that directory, so CI installs the new tree cold.
- **Inferences**: I1: Dependabot closes 53 to 57 on its rescan once `dev` carries the lockfile, as it closed 38 to 49 after #1654. I2: alert 58 stays open until it is dismissed or an Aztec bump moves the libp2p line.
- **Asks**: none. Dismissing alert 58 under the owner's rule of 2026-10-28 (#1278) is the owner's action, as it was for alerts 50 and 51; this plan records the evidence and leaves the alert alone.

## Architecture & Implementation

- **Shape**: one tool-native in-place update (F2) and nothing else: no `overrides`, no change to `cli/package.json`, `lock.sh`, `install.sh`, the pins test, `bun.lock` or any doc.
- **Alternatives not taken**: a fresh `lock.sh 6.0.0` re-resolve (moves dozens of unrelated packages, #1421 measured 41); an `@libp2p/crypto` override (D3).

## Phase 1: the lockfile ✓

1. From `.github/actions/setup-aztec/cli`, run `npm_config_registry=https://registry.npmjs.org/ npm_config_min_release_age=7 npm_config_min_release_age_exclude=$'@aztec-labs/*\n\n@aztec-foundation/*' npm update node-forge fast-xml-parser @libp2p/crypto --package-lock-only --ignore-scripts --no-audit --no-fund` (npm 11.19.1). Confirm no `node_modules/` appeared.
2. Commit (`chore(deps): bump node-forge, @libp2p/crypto and fast-xml-parser for setup-aztec` is the PR title; the commit subject names what moved: `chore(deps): bump node-forge and fast-xml-parser in setup-aztec's cli lockfile`).

Validation gate (scratch under `~/.cache/nulo-backlog/deps-ci-3/`):
- G1: `git diff --name-only 033dfcd9c HEAD -- ':!implementations-plan'` lists only the lockfile.
- G2: the keyed compare of F2, base against head, lists exactly those four keys; each integrity matches the registry's.
- G3: F6's two `npm ci` installs and `install.sh` on the head pair.
- G4: `bun install --frozen-lockfile`, `bun run lint`, `bun run lint:actions`, `bun run test:ci-gating`, at retry 0; `git diff 033dfcd9c HEAD -- bun.lock` is empty; `bun run check:plans` after staging the plan files.
- Layers: lint, the CI-gating tests (the pins test among them), the install itself. The e2e layer is the PR's two network lanes (F7).

## Security & Adversarial Considerations

- **Threat model**: the party that matters controls a target package's publication or the registry. Bytes that outlive the 7-day gate and match the registry's own integrity still install; the lockfile's sha512 pins the bytes read in F5, and `--ignore-scripts` stays on. Code the CLI imports still runs on the runner, so F5's read is the control, as `SECURITY.md` § Binary dependencies states for this tree.
- **Gate during generation**: on, with `lock.sh`'s exact settings (F3 proves it governs the pick). Two moved packages cleared it by hours; the gate is the policy, and a later `lock.sh` would take them too.
- **Registry**: every `resolved` names `registry.npmjs.org`; the pins test refuses any other source.
- **Alert 58**: the ranges hold `@libp2p/crypto` below its fix (F4). An override to `^5.1.22` would hand seven callers written for the 2.x and 4.x APIs a 5.x module, untested, and a later CLI bump that moves libp2p would inherit it silently. The decoder the alert names is absent from every locked line; whether the older lines' own DER parsers (`node-forge`, `asn1js`) have a like flaw is unknown, and no alert names them.
- **Least privilege / input validation / cryptography**: no workflow, token, permission or design of ours changes.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | In place or a fresh `lock.sh 6.0.0` | in place | the brief asks for it; a fresh resolve moves dozens of unrelated packages |
| D2 | `fast-xml-parser` 5.12.1 (npm's pick, + `fast-xml-builder` 1.3.2) or hold 5.12.0 | 5.12.1 | `lock.sh`'s exact settings and the `aztec-update` skill's recipe give it; holding 5.12.0 needs a `before` date in place of the age setting, or a manifest entry; both releases are fixes past the gate (F3, F5) |
| D3 | `@libp2p/crypto` override `^5.1.22` or a known limit | known limit | the fix is a major away from every range and `@aztec-labs/p2p` pins 4.0.3 exactly; the flagged decoder is absent from the locked lines (F4). Reopen at the Aztec bump that moves libp2p |
| D4 | Extend the floor test | no | the floor guards the one fix this repository holds itself, the `systeminformation` override; for an alert a resolve does not fix, Dependabot is the report (#1278), as #1654 decided |
| D5 | Local proof | `install.sh` in a scratch `AZTEC_HOME` | given `NARGO`, the `install_foundry` override and Node ≥ 24.15.0, the pinned installer writes only under `AZTEC_HOME` and `TMPDIR`; the Docker runner adds no test (#1419) |
| D6 | #1896 | `Closes #1896`; alert 58 in a closed `known-limit` issue | the issue's other five alerts are fixed and its sixth gets its own record, as #1456 did for 50 and 51; the dismissal stays the owner's |

## Audit verdicts

_Filled by the Codex pass over this plan and the diff._

## Implementation record

- Phase 1: steps 1 and 2 as written; G1 to G3 green on the probes above. G4 below.

## Delivery

One arc, one PR, no stack: `worktree-deps-ci-3` → `dev`, `gh pr create`, ready for review, after the Codex pass and its verification. Title (79 characters): `chore(deps): bump node-forge, @libp2p/crypto and fast-xml-parser for setup-aztec`. Body: what changed and why; alerts 53 to 57 fixed by the update; alert 58 not, with the known-limit issue; each package's old → new version and the two forced floors; each gate with its outcome; the lockfile hunks quoted (GitHub collapses generated lockfiles); `Closes #1896`. No label: the path filters run both network lanes (F7).

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `033dfcd9c`, as bounded work: one Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and the diff from `033dfcd9c`, then targeted verification of material fixes. Close-out ships in the same PR: Outcome, the known-limit issue named, `STATUS.md` deleted, `git mv` into `archive/`. Never merge; teardown after the orchestrator's merge, slug `deps-ci-3`, trunk `dev`.

## Seeds

```
/goal Phase 1 of implementations-plan/deps-ci-3/plan.md marked ✓ with G1-G4 reported passing; the Codex pass over the plan and diff recorded with its verdict; the PR to dev open, ready, with the Delivery body; the close-out archive commit shown by `git show --stat`.
```

```
/loop 15m Drive implementations-plan/deps-ci-3 forward per its plan.md: run Phase 1 and its gate, then Post-implementation. Never merge; stop once the PR's checks are green and the close-out is committed.
```
