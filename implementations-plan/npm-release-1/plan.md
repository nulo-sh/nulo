---
plan: npm-release-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at dda72e321
trunk: dev
issues: "Closes #1109 (arc 1)"
post_implementation_hardening: not scheduled
---

# npm-release-1: prepare `@nulo-sh/*` 0.3.0 on the Aztec 6.0.0 peers

One arc, one PR against `dev` (no stack: the orchestrator's D-orch-1). It moves the three npm READMEs to the `6.0.0` line with a `0.3.0` entry each, rehearses `0.3.0` with the workflow's toolchain and records the three digests. The orchestrator dispatches `publish-packages.yml` after the merge; this lane never does. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## The claims and what did not hold

- **#1109, "the published 0.2.0 [of all three] peer the 6.0.0-rc.3 line exactly".** Holds for `wallet-crypto` and the schema patch. **Not** `resolve-asset`: it declares no peer and no dependency (F1); it moves only in lockstep.
- **#1109 and the lane brief, "wallet-crypto's derivation unchanged: same descriptor and KDF, only the vendored artifact moved".** Holds (F4), and more strongly: the staged bundle and declarations are byte-identical to 0.2.0's (F3). Neither the artifact nor the descriptor ships in this package; the rotation moves addresses, not keys.
- **Lane brief, "the 'Aztec line' lines name 6.0.0" per README.** Two READMEs carry one; `resolve-asset`'s has none.
- **#1109 and `.claude/skills/aztec-update/SKILL.md:58`, "no agent dispatches the workflow".** Superseded for this release by the owner's request, recorded in the lane brief, that the orchestrator run the publish once the preparation is on `dev`. This lane still dispatches nothing.

## Outcome & Quality Bar
**For whom.** unleashed's maintainer, bumping to Aztec `6.0.0` from npm; the orchestrator, dispatching the publish.

- Each README names the Aztec line a consumer needs and exactly what `0.3.0` changed; no README sentence is false for the bytes it ships with.
- The dispatch's dry run reproduces the three approved digests on the first try, or fails closed for a reason the PR body already names.

## Assumptions

### Facts (verified at `dda72e321`, on npm, 2026-10-24)

- F1. npm holds `0.1.0` and `0.2.0` of all three (`latest` 0.2.0). 0.2.0 peers: `wallet-crypto` `@aztec-labs/{accounts,foundation}` `6.0.0-rc.3`; schema patch `@aztec-labs/{aztec.js,stdlib}` `6.0.0-rc.3`, dependency `zod ^4.4.3`; `resolve-asset` none.
- F2. `npm pack @nulo-sh/<p>@0.2.0` gives exactly the `"0.2.0"` digests in `scripts/publish/approved-digests.json`.
- F3. `stage.ts --all --version 0.3.0` at `dda72e321` (Bun 1.4.2, Node 24.12.0, npm 11.6.2), before any README edit, differs from the published 0.2.0 tarballs only in `package.json`: `version`, and the peers `6.0.0-rc.3` → `6.0.0` (`diff -r` of the unpacked tarballs; reproduced by the Opus leg).
- F4. Regime `nulo-v6.2` keeps `nulo-v6.1`'s `descriptorDigest` (`3883065f…`) and `kdfDigest` (`29eca1a0…`); only `artifactSha256` and `classId` move (`packages/aztec-runtime/src/account/address-freeze.ts`). The vendored artifact equals `@aztec-labs/accounts@6.0.0`'s (`f701e393…`).
- F5. `stage.test.ts`'s consumer reproduces `reference/key-model-v2/vectors.json` on the installed `6.0.0` peers; that file is unchanged since the 0.2.0 prep (`git diff c1919e22c HEAD` empty). `@aztec-labs/aztec.js@6.0.0`'s `WalletSchema` defines none of the four patch methods.
- F6. Only `stage.test.ts:382-385` reads a README (one `` | `method` | `` row per patch method); `check-digests.test.ts` checks only the digest file's format. No PR-time check compares staged bytes with the digests.
- F7. `check-digests.ts` binds a listed version exactly (set and sha256); `pack` runs it and `publish` re-checks with `sha256sum -c --strict` behind the `npm-publish` environment, whose one required reviewer is `alejoamiras` with `prevent_self_review: false`. The agents' `gh` is logged in as that account, with `repo` scope.
- F8. `packages.ts` matches `CLAUDE.md` § The wallet repo: entries `public.ts`, `index.ts`, `apply.ts` + `register.ts`, with the exports recon lists. No edit.
- F9. This arc edits no `package.json`, so no install re-resolves the `6.0.0` line; its `@aztec-labs/*` packages clear the 7-day age gate on 2026-10-29 around 10:30Z.

### Inferences

- I1. Node 24.12.0's npm 11.6.2 here packs the same bytes as the workflow's `pack` job. It held at 0.1.0 and 0.2.0, whose dispatches matched.
- I2. The squash merge keeps the PR head's staged inputs unless another PR that moves one merges first; the dry run then fails closed, and the PR body names the remedy.

**Asks:** none. README wording is developer documentation the lane brief scopes, not a wallet surface.

## Architecture & Implementation

**Reuse.** Every step is `scripts/publish/README.md` § A later version (recon's reuse map). No code, test, workflow or `packages.ts` edit. **Staged inputs** (what moves the bytes): the entry sources and the `packages/*/src` files they inline; each package's `tsconfig.publish.json`, the `tsconfig.json` it extends, and its TypeScript; the workspace `package.json` pins and zod range; `bun.lock`; `stage.ts`, `packages.ts`, `readme/<dir>.md`; root `LICENSE` and `NOTICE`; Bun and npm.

| File | Change |
|---|---|
| `scripts/publish/readme/wallet-crypto.md` | line 21 `6.0.0-rc.3` → `6.0.0`; a `## Changes` section before `## Provenance` |
| `scripts/publish/readme/wallet-sdk-schema-patch.md` | line 27 `6.0.0-rc.3` → `6.0.0`; the zod line (D4); a `0.3.0` entry above `0.2.0` |
| `scripts/publish/readme/resolve-asset.md` | a `## Changes` section before `## Provenance` |
| `scripts/publish/approved-digests.json` | a `"0.3.0"` block after `"0.2.0"`, same key order and tab indent |
| `implementations-plan/npm-release-1/**`, `implementations-plan/index.md` | the plan; archived at close-out |

**README text (exact; the digests bind these bytes).**

- `wallet-crypto.md`, `## Changes`: `- **0.3.0**: the peers move to the Aztec \`6.0.0\` line. The code is unchanged and derives the same keys from the same seed. The Nulo wallet's \`6.0.0\` account artifact changes account addresses, not these keys.` then `- **0.2.0**: the peers move to the Aztec \`6.0.0-rc.3\` line.`
- `wallet-sdk-schema-patch.md`, Requirements, replacing `- \`zod\` is a dependency.`: `- \`zod\` is a dependency. The Aztec peers declare \`zod ~4.4.3\`, below the fix for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (zod before 4.6.6). The Nulo wallet overrides zod to \`4.6.7\` and tests this package on it; your install does not inherit that override.`
- `wallet-sdk-schema-patch.md`, Changes: `- **0.3.0**: the peers move to the Aztec \`6.0.0\` line. The patch is unchanged and adds the same four methods to \`6.0.0\`'s \`WalletSchema\`.`
- `resolve-asset.md`, `## Changes`: `- **0.3.0**, **0.2.0**: no code change; the version moves in lockstep.`

**Flow.** README commit → merge `origin/dev` → pass 1 → digest commit → pass 2 and `check-digests.ts` → control → review loop → digest gate → PR → close-out (digest gate again) → orchestrator: dry run, `dry_run=false`, approval, `verify`.

## Phases

### P1. READMEs ✓

1. Apply the README edits above, byte for byte. Commit `docs(publish): name the aztec 6.0.0 line and the 0.3.0 changes in the npm readmes`.

**Validation gate.** `bun run lint`; `bun run test:release`; `rg -n '6\.0\.0-rc\.3' scripts/publish/readme`. Pass: both exit 0 (`stage.test.ts` green: its method rows and key-derivation vectors); `rg` prints exactly the two `0.2.0` entries. Layers: lint, unit.

### P2. Rehearsal and digests

Warning: run every step from the worktree root with `PATH=~/.nvm/versions/node/v24.12.0/bin:$PATH`; first check `node --version` is `v24.12.0`, `npm --version` is `11.6.2` and `bun --version` is `1.4.2`. `C` is `~/.cache/nulo-backlog/npm-release-1`.

1. `git fetch origin && git merge --no-edit origin/dev`. If `bun.lock` moved, run `bun install --frozen-lockfile`. Record `M = git rev-parse --short origin/dev`, the merge base the PR states.
2. Pass 1: `rm -rf dist-publish && bun scripts/publish/stage.ts --all --version 0.3.0`; `mkdir -p $C/pack-1`; for each `dist-publish/*/`, `npm pack "./$dir" --pack-destination $C/pack-1 --ignore-scripts`; `sha256sum $C/pack-1/*.tgz`.
3. Add the three sha256 under `"0.3.0"`. Commit `chore(publish): approve the @nulo-sh 0.3.0 tarball digests`.
4. Pass 2: check `git status --porcelain` is empty; `rm -rf dist-publish`; stage again and pack into `$C/pack-2`; run `bun scripts/publish/check-digests.ts 0.3.0 $C/pack-2` and `cmp` each pair across `pack-1` and `pack-2`.
5. Control (pre-README bytes, the head's checker and approvals): `git restore --source=M -- scripts/publish/readme`; `rm -rf dist-publish`; stage and pack into `$C/pack-0`; `git restore --source=HEAD --staged --worktree -- scripts/publish/readme`; check `git status --porcelain` is empty; run `check-digests.ts 0.3.0 $C/pack-0`.
6. Consumer diff: unpack `pack-2` and `npm pack @nulo-sh/<p>@0.2.0`; `diff -r` each pair.

**Validation gate.** Pass: step 4 exits 0 and every `cmp` is identical; step 5 exits 1 with exactly three `sha256 …, approved …` failures, one per tarball, and no `not packed` or `not approved` line; step 6 shows only `package.json` (`version`; each `@aztec-labs/*` peer exactly `6.0.0`) and `README.md` differing; `bun run test:release` and `bun run lint` exit 0. Layers: lint, unit, byte reproduction.

**Digest gate** (after every later `origin/dev` merge, and last before `gh pr create`): if `bun.lock` moved, `bun install --frozen-lockfile`; `rm -rf dist-publish`, stage and pack into a fresh `$C/pack-N`; `check-digests.ts 0.3.0 $C/pack-N` exits 0. A failure, or any accepted review fix to a staged input, reruns P2 from step 2 and replaces the `"0.3.0"` block in a new commit.

## Security & Adversarial Considerations

- **Threat model.** The attacker targets the bytes npm consumers install. The digest binds the bytes the reviewed `dev` commit stages, so it proves reproduction, not authorship: whoever can change `dev`'s sources can change the digest file. Authenticity rests on trusted publishing with OIDC (no npm token) and `verify`'s SLSA check (signed by this workflow on `dev` or `main`, naming these bytes). Local build contamination that changes tarball bytes is caught by the clean dispatch; compromised GitHub credentials can bypass the owner-approval policy (next point).
- **The approval is a policy boundary, not a credential one (F7).** The agents' `gh` holds the reviewer's identity and could approve a pending deployment through the API, so consent rests on agents never doing so. Real separation needs a bot identity, a permission change only the owner makes, outside this lane. The checklist says who approves.
- **Drift between rehearsal and dispatch.** `pack` refuses any byte change, fail-closed; the digest gate catches it before the PR and at close-out. No new CI check (D5).
- **Least privilege.** No workflow, permission or secret moves. The rehearsal reads the public registry only; no npm login.
- **Crypto.** Byte-identical (F3): PBKDF2-SHA256 and AES-256-GCM through WebCrypto; keys through the exact `@aztec-labs/foundation` `6.0.0` peer. F5's vectors prove the same keys on `6.0.0`.
- **Peers.** Exact peers stay exact; the READMEs keep the single-copy requirement (`Fr` and `WalletSchema` are only shared within one copy). A `^0.2.0` consumer does not take 0.3.0 by itself, as intended for a breaking 0.x change.
- **zod.** The published range `^4.4.3` admits zod below 4.6.6 (GHSA-mrhx-c7xc-m3w5, high: memory exhaustion while validating oversized constrained collections), and `@aztec-labs/{aztec.js,stdlib,foundation}@6.0.0` declare `~4.4.3` (#1110). The wallet's root override never reaches a consumer, and `stage.test.ts` links the repository's installed zod 4.6.7, so it proves nothing about a consumer's tree. Reach through this package: exploitability unknown. The README states the fact (D4) and the PR body repeats it; narrowing the range edits a `package.json` (F9) and is outside the lane.
- **Supply chain.** No dependency moves; no age-gate exclude; the frozen lockfile stays.

**UI impact: none.** No wallet surface changes; the npm READMEs are developer documentation the lane brief scopes.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | `0.3.0` for all three, one lockstep version: exact `6.0.0` peers break a 0.x consumer, so a minor | #1109, lane brief | accepted |
| D2 | `wallet-crypto` and `resolve-asset` get a `## Changes` section that also records `0.2.0`, so the list does not suggest 0.2.0 changed nothing | planner; both legs | accepted |
| D3 | The README text is fixed in this plan, so the digests are recorded after it and re-recorded only on the rerun rule | planner; both legs | accepted |
| D4 | No zod range change (it edits a `package.json`; outside the lane), but a factual zod note in the schema patch's Requirements, before the rehearsal | Codex r1 #1 (reverses the draft's "no note"); Opus held the draft | accepted |
| D5 | No PR-time digest-drift CI check: `pack` refuses drift fail-closed, and the local digest gate measures it before the PR and at close-out | planner; Opus #1 | accepted |
| D6 | Pass 2 follows the README procedure (clean tree, `dist-publish/` deleted), not a fresh clone: the dry run is the CI-equivalent proof, and it held at 0.1.0 and 0.2.0 | planner; both legs | accepted |
| D7 | Keep `Closes #1109`, as the lane brief and the program rule require; the checklist reopens it if the dispatch fails | Opus #4 (asked `Refs`) | accepted in part |

## Audit verdicts

**Round 1, 2026-10-24.** Codex (`gpt-6.1-sol`, high, session `01a16d2f`): **conditional approve**. Accepted: #1 the zod note (D4), #2 the control runs the head's checker on pre-README bytes (P2.5), #3 no peer check on `resolve-asset`. Opus 5.5 (Plan): **conditional approve**. Accepted: #1 the digest gate after every `dev` merge, with the fuller list of staged inputs; #2 the approval stated as a policy boundary and the dispatch authority cited; #3 the review range `origin/dev...HEAD`; #5 (same as Codex #2); #6 the age-gate date, the checklist, the size. In part: #4 (D7). **Round 2**, Codex resumed: **conditional approve**, one condition: the threat model's "a compromised workstation can only make the dispatch refuse" contradicted the shared identity; replaced. **Round 3**, Codex resumed: **approve**. Detail: [lessons/phase-0.md](lessons/phase-0.md).

## Delivery

| Arc | Phases | Branch | Base | PR title | `code_review` |
|---|---|---|---|---|---|
| 1 | P1, P2, close-out | `npm-release-1-a1` | this plan's commit on `worktree-npm-release-1` | `chore(publish): prepare the @nulo-sh packages 0.3.0 on aztec 6.0.0` | off |

- `gh pr create --base dev`, no label: no runtime code moves, so no e2e lane. The close-out is the PR's final commits.
- PR body: what changed and why; F3's consumer diff as a table; `M`; the three digests; the validation runs with outcomes; the zod note; `Closes #1109`; "If `dev` changes a staged input before the dispatch (see the list in the plan), `pack` refuses the digests: rehearse again (`scripts/publish/README.md` § A later version)"; the three READMEs as npm will render them, each in a `<details>` block.
- **Dispatch checklist (orchestrator, after the merge).** (1) `gh workflow run publish-packages.yml --ref dev -f version=0.3.0` (dry run): `pack` prints the three digests and `check-digests.ts` passes. (2) The same with `-f dry_run=false`. (3) The `npm-publish` approval: recommended, the owner in the UI; an agent never calls the `pending_deployments` or `environments` API. (4) `verify` green: each tarball's provenance and `npm audit signatures`. (5) `npm view` shows `@nulo-sh/wallet-crypto@0.3.0` and `@nulo-sh/wallet-sdk-schema-patch@0.3.0` peering their two `@aztec-labs/*` packages at exactly `6.0.0`, and `@nulo-sh/resolve-asset@0.3.0` with no peer and no dependency. (6) Comment the `verify` run on #1109; if any step fails, reopen #1109 with the run link.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `dda72e321`. Plan-specific parts:

- Step 1: absent (`code_review: off`).
- Step 2, once after P2 is green, over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus 5.5 review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1 and reproduces the digests independently. An accepted fix to a staged input reruns P2 before the resumed round. Hard stop at three rounds.
- Final gates on the PR head, all exit 0: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:release`, `bun run test:ci-gating`, `bun run check:plans` (after staging), then the digest gate. Then step 3 per Delivery; `gh pr checks <n> --watch` once.
- Step 4 (close-out): merge `origin/dev` and run the digest gate; read `index.md` and `lessons.md`; the Outcome (Known limits: none expected; Open items: none, since the dispatch is the orchestrator's checklist); promote a lesson only if the rehearsal finds one; delete `STATUS.md`; `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- Step 5 (after the merge): `agent-worktree done npm-release-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/npm-release-1/plan.md` succeeds. The session was spawned inside the worktree, so it has nothing to exit.

## Seeds

- `/goal` (recommended): `P1 and P2 marked ✓ in implementations-plan/npm-release-1/plan.md, each gate reported passing in the transcript; the review loop converged (a resumed Codex round quoting no new material finding); the digest gate green on the final head; PR "chore(publish): prepare the @nulo-sh packages 0.3.0 on aztec 6.0.0" open against dev with Closes #1109 and the dispatch checklist, never merged; the archive-move commit shown with git show --stat.`
- `/loop 15m` (fallback): `Drive implementations-plan/npm-release-1 per its plan.md: never dispatch publish-packages.yml, never merge; run the digest gate after every dev merge; stop once the PR is green and report.`
