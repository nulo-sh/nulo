---
plan: deps-ci-2
tier: light
status: approved (Codex r3)
issues: "#1434"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed until approve
base: origin/dev at 44d5a7064
trunk: dev
post_implementation_hardening: not scheduled
---

# deps-ci-2: node-forge and follow-redirects past their advisories

Dependabot lists alerts 38 to 49 on `.github/actions/setup-aztec/cli/package-lock.json`, the npm tree the `setup-aztec` action installs the Aztec CLI from on CI runners. All twelve are patch moves inside their dependents' ranges. The owner's decision on #1434 (page 94, P94-21 = **B**, 2026-11-01): "One PR lands the twelve in-range lock updates once they clear the age gate on 2026-11-03 at 22:26Z." The same PR moves `bun.lock`'s `follow-redirects` and deletes its acknowledgement. Alerts 34 (#1420), 50 and 51 (#1456) stay the owner's dismissals. Recon: [recon.md](recon.md). UI impact: none.

## Outcome & Quality Bar

- **For whom**: the owner reading the Security tab, and the maintainer who reviews the next dependency change.
- **Excellent**: (1) each lockfile moves only the named packages, and both extension builds are byte-identical to the base; (2) the audit gate stays green in enforce mode with no acknowledgement left that no advisory matches, and the docs say 34 where they said 35.
- **Good enough**: no new test; the CI network lanes, not the local Docker runner, prove the CLI still installs and boots.

## Why this is maintenance

The npm tree runs only in CI jobs and the local Docker runner (`install.sh`, `npm ci --ignore-scripts`). `node-forge` comes in through `@libp2p/peer-id-factory` → `@libp2p/crypto` 2.0.8 (`^1.1.0`); `follow-redirects` through `axios` 1.20.0 (`^1.16.0`). This plan traces no exploit path from either to a CI job: exploitability unknown. The owner scoped the update as maintenance, so the plan claims no security fix.

## Assumptions

- **Facts** (recon experiment numbers in brackets):
  - F1: the open alerts and their first fixed versions are recon § The alerts (`gh api`, 2026-11-03).
  - F2: an in-place `npm update follow-redirects node-forge --package-lock-only` under `lock.sh`'s environment changes exactly two lock entries, to 1.16.2 and 1.4.2, with registry-matching integrities [1]. npm prints `up to date` anyway, so read the diff, not the message.
  - F3: `node-forge` 1.4.2 is in `@libp2p/crypto`'s `^1.1.0` and past the 7-day gate since 2026-11-03 14:09Z [2].
  - F4: `bun update follow-redirects --lockfile-only --ignore-scripts` (Bun 1.4.2) changes one `bun.lock` line and no `package.json` [3].
  - F5: with that line moved and the ack entry deleted, the gate reads `34 acknowledged, 0 unacknowledged, 0 stale` in enforce mode. Keeping the entry reads `1 stale`, which fails. The PR's mode is enforce [4].
  - F6: the base builds are deterministic, and no notices file names either package or `axios` [6].
  - F7: `SECURITY.md:609` and `:617` restate the ack, and no test pins them (recon § Reuse map).
  - F8: the change trips all four e2e lanes (`bun.lock`; `.github/actions/setup-aztec/**`), and the action's cache key makes CI install the new tree cold (recon § Reuse map).
- **Inferences**:
  - I1: Dependabot closes 38 to 49 on its rescan once `dev` carries the new lockfile, as it closed the `systeminformation` alerts after #1421.
  - I2: a later `lock.sh` run is expected to keep both fixes, since it takes the newest release each range and the gate allow. That is not guaranteed: a new dependent with a narrower range can lock an older copy. Dependabot is then the report, as the owner's rule of 2026-10-28 (#1278) sets for this lockfile (D3).
- **Asks**: none. No part of the lane reaches a surface a person sees (`OWNER-ASKS.md`).

## Architecture & Implementation

- **Shape**: two tool-native in-place updates (npm for the CLI tree, Bun for the workspace tree). Then two edits keep the record true: the ack entry and the `SECURITY.md` table.
- **Files**: `.github/actions/setup-aztec/cli/package-lock.json` (2 entries), `bun.lock` (1 line), `scripts/ci-cd/audit-acks.json` (the `1244003` entry), `SECURITY.md` (the count and one row). No `package.json`, `lock.sh`, test or workflow changes.
- **Alternative not taken**: a fresh `lock.sh 6.0.0` re-resolve, which moves dozens of unrelated packages (D1).

## Phase 1 — the lockfiles and the record

Assumptions: F2–F7. Change map, in this order:
1. From `.github/actions/setup-aztec/cli`, run `npm_config_registry=https://registry.npmjs.org/ npm_config_min_release_age=7 npm_config_min_release_age_exclude=$'@aztec-labs/*\n\n@aztec-foundation/*' npm update follow-redirects node-forge --package-lock-only --ignore-scripts --no-audit --no-fund` (npm ≥ 11.17.0). Confirm that no `node_modules/` appeared there.
2. From the repository root, run `bun update follow-redirects --lockfile-only --ignore-scripts`. Read `git diff` before anything installs, then run `bun install --frozen-lockfile`.
3. In `scripts/ci-cd/audit-acks.json`, delete the whole group that holds advisory `1244003`: its `bundled`, `reason`, `revisit` and one-entry `advisories`. The parser refuses a group with an empty `advisories` list (`audit-gate.ts:95`).
4. In `SECURITY.md`, change "35 advisories" to "34 advisories" and delete the `follow-redirects` 1.16.1 row.
5. Commit (`chore(deps): bump node-forge and follow-redirects past their advisories`).

**Bun fallback** (the brief's own rule). It applies when step 2's update changes a `package.json` or any `bun.lock` line beyond `follow-redirects`, or leaves `follow-redirects` below 1.16.2 (an unchanged `bun.lock` included). Then restore every file the update changed to its content before the update, run `bun install --frozen-lockfile`, and skip steps 3 and 4. G1 then lists only the npm lockfile, and G2 skips its `bun.lock` clause. G5's local audit still runs `--mode enforce` and expects `35 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`. Its mode command prints `audit mode: report (no dependency file changed)`, since the npm lockfile is outside the gate's set. Say so in the PR body and the report.

Validation gate (scratch files under `~/.cache/nulo-backlog/deps-ci-2/`):
- G1: `git diff --name-only 44d5a7064 HEAD -- ':!implementations-plan'` lists exactly the four files above.
- G2: the keyed compare of recon experiment 1, base against head, differs in exactly `node_modules/follow-redirects` (1.16.2) and `node_modules/node-forge` (1.4.2). Each integrity equals `npm view <pkg>@<version> dist.integrity`. `git diff 44d5a7064 HEAD -- bun.lock` is one removed and one added line, `follow-redirects@1.16.2`.
- G3: a scratch `npm ci --ignore-scripts` of the new `cli/package.json` and lockfile exits 0. A list of every installed `node_modules/**/package.json` name and version differs from a base-pair install's list in exactly those two packages.
- G4: in a `git archive HEAD` export with no `node_modules`, `bun install --frozen-lockfile` exits 0.
- G5: `bun audit --audit-level=low --json > <scratch>/audit.json`, then `bun scripts/ci-cd/audit-gate.ts <scratch>/audit.json --exit-code <its exit code> --mode enforce`. It prints `34 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable` and exits 0. `bun scripts/ci-cd/audit-gate.ts mode --base $(git rev-parse 44d5a7064) --head $(git rev-parse HEAD)` prints `audit mode: enforce (…)`.
- G6 (the release freeze): after step 2's frozen install, run `bun run --cwd apps/extension build:full` at the head. Write `find . -type f -print0 | sort -z | xargs -0 sha256sum` from `dist/chrome` and from `dist/firefox`. Each list equals its base list from recon experiment 6 (rebuild at `44d5a7064` if those are gone). Rerun G6 on the final head whenever a commit after the last G6 changes a lockfile, a `package.json` or anything under `apps/` or `packages/`. After a merge of `origin/dev`, the base is that merged `dev` commit, built the same way. A commit that changes only `implementations-plan/` needs no rebuild. **If either list differs, stop: report it and open no PR.**
- G7: `bun run lint`, `bun run lint:actions`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating` and `bun run test:release` exit 0, at retry 0.
- Layers: lint, typecheck, unit, build. The e2e layers are the PR's CI lanes (D4).

## Security & Adversarial Considerations

- **Threat model**: the attacker who matters controls a target package's publication or the registry. Such an attacker can serve bytes that outlive the 7-day gate and match the registry's own integrity. Both releases are 7 to 9 days old. Each lockfile's sha512 pins the bytes reviewed in recon experiment 5, and `--ignore-scripts` stays on in both installs. Neither `package.json` delta adds an install script. Code the CLI imports still runs on the runner, so the review of the code delta (recon experiment 5) is the control, as `SECURITY.md` § Binary dependencies already states for this tree.
- **Exposure**: neither extension zip contains either package (F6). G6 proves the builds do not move.
- **Residual**: the `follow-redirects` 1.16.2 README says maintenance is paused, with security reports handled best effort. A future advisory there may stay unfixed. The audit gate and Dependabot report it if so; no action in this lane.
- **Least privilege / input validation**: N/A. No workflow, token or permission changes, and no trust boundary moves.
- **Cryptography**: no design of ours changes. The `node-forge` delta is cryptographic hardening (recon experiment 5), reviewed as code the CI runner imports.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | In-place update or a fresh `lock.sh 6.0.0` | in place | the brief asks for it; a fresh resolve moves dozens of unrelated packages (#1421 measured 41) |
| D2 | `node-forge` 1.4.2 (npm's pick) or exactly 1.4.1 | 1.4.2 | in range, past the gate, past all eleven advisories; holding 1.4.1 needs an override or a manifest entry, both out of scope |
| D3 | Extend the floor test for the two packages | no (Codex r1: extend; see Audit verdicts) | the floor guards the one fix this repository holds itself, the `systeminformation` override (`lock.sh:21-23`). For an alert a resolve does not fix, the owner's rule (#1278, `aztec-update` skill) is Dependabot as the report and a `tolerable_risk` dismissal. A floor here would red the next Aztec bump on such an alert and force an override that rule does not ask for |
| D4 | Run the local Docker CI-like runner | no | the brief makes it optional for patch moves, and #1419 records that it runs no test; the PR's two network lanes install the new tree cold (F8) |
| D5 | `SECURITY.md`'s count and row | edit them in the same PR | they restate the ack file; leaving them would make the doc wrong |
| D6 | The Bun move | `bun update follow-redirects` | the tool's own transitive update, no manifest edit (F4); deleting the lock entry by hand is lockfile surgery |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): `conditional approve`, five conditions. Accepted four:
  - the Bun command now matches recon experiment 3, followed by a frozen install (step 2);
  - step 3 deletes the whole ack group, since the parser refuses an empty `advisories` list (verified, `audit-gate.ts:95`);
  - G6 is bound to the final head and to a merged `dev` base;
  - the package review is recorded against the landed integrities (recon experiment 5, read whole). Also accepted: the Bun fallback as an explicit branch, I2 weakened, the threat model's attacker restated.

  Rejected: extending the floor test (D3). Codex reads the pattern as "a floor on resolved versions at any path". The floor exists because the override is a fix the repository must remember, and the owner's #1278 rule disposes of an alert a resolve does not fix by dismissal, not by a red bump. Agreed: D1, D2, D4, D5, D6.
- **Codex r2** (resumed): `conditional approve`. D3's argument holds; the round-1 floor condition is withdrawn. Two fallback details, both accepted: read the update's diff before the frozen install, and restore every file it changed, including when it leaves `follow-redirects` unmoved; on the fallback, the mode command prints `report` while the local audit stays `--mode enforce`.
- **Codex r3** (resumed, verify only): `approve`. Both conditions met; no regression, no new finding.

## Delivery

One arc, one PR, no stack: branch `worktree-deps-ci-2` → `dev`, `gh pr create`, opened ready after the Codex loop converges. Title (71 characters): `chore(deps): bump node-forge and follow-redirects past their advisories`. Body:
- what changed and why;
- alerts 38 to 49 fixed by the update, which Dependabot closes on its rescan;
- alerts 34, 50 and 51 as the owner's dismissals under #1420 and #1456;
- each gate with its outcome, the two lockfile hunks quoted (GitHub collapses generated lockfiles), and the freeze proof;
- `Closes #1434`.

Add no label: the path filters run all four e2e lanes (F8).

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `44d5a7064`. Specific to this plan:

1. Step 1 (diff review) is absent: `code_review: off`.
2. The review loop runs once over the whole diff from `44d5a7064`, after Phase 1. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` on the same session. Stop when no round has a new material finding; hard stop after three rounds, then report. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
3. Rerun G7 and G5 on the final head, and G6 when its rule asks; then delivery as above. Run `gh pr checks <n> --watch` once. A known flake gets one rerun; real breakage gets a fix and the loop again.
4. Close-out, as the PR's final commits, once every required check is green, per the standard's step 4. First merge `origin/dev` and read what changed in `index.md` and `lessons.md`. The Outcome's `Known limits:` line reads `none` (#1420 and #1456 belong to earlier plans), and `Open items:` reads `none`. Delete `STATUS.md`, then `git mv` the plan into `archive/` in its own commit.
5. Teardown after the merge, per the standard's step 5: slug `deps-ci-2`, trunk `dev`.

## Seeds

```
/goal Phase 1 of implementations-plan/deps-ci-2/plan.md marked ✓ with gates G1-G7 reported passing in the transcript; the Codex loop converged (a resumed gpt-6.1-sol pass with no new material finding, quoted); the PR to dev open with the Delivery section's body; the close-out archive commit shown by `git show --stat`; `bun run test:ci-gating` and `bun run lint:actions` exit 0.
```

```
/loop 15m Drive implementations-plan/deps-ci-2 forward per its plan.md: read the plan (the authority), run Phase 1 and its gate, then the Post-implementation steps in order. Never merge; stop once the PR's checks are green and the close-out is committed.
```
