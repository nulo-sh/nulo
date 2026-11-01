---
plan: ci-dedup-1
tier: light
status: completed; delivered by PR #1492
issues: "#1450 (closes), #1448 (Bun half; part of)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high) audit + final fresh pass; one Opus Plan leg
base: origin/dev at fcc4da21
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at fcc4da21
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-01. **Status:** completed; delivered by PR #1492 to `dev` (`Closes #1450`, `Part of #1448`).
- **Shipped:**
  - #1450 = P94-16 A: both network lanes gate on the licence texts. `behavior-gating.test.ts` requires the five PR lanes to gate on one build surface, against a reviewed exception list that names each entry's holder lanes. pr-quick's set is derived by running its compute step.
  - #1448, Bun half = P94-18 A: every setup-bun step reads `package.json` and passes no token. The composite's cache key comes from the installed version. `bun-version.test.ts` pins every restatement. `release-integrity.test.ts`'s no-token rule covers every step.
  - Deviations: none from the approved design. The fix loop added a one-write probe of the flag, the compute wiring check, and two doc corrections ([lessons/phase-2.md](lessons/phase-2.md)).
- **Left out:**
  - The tsconfig half of #1448 was not decided (`## Remaining` comment on the issue).
  - `_build-extension.yml` stays in the smoke filters (D3); #1493 settles it by rule.
- **Known limits:** none.
- **Open items:** #1448 (tsconfig half), #1493 (D10), GHSA-mcpq-5jpw-c723 (tracked privately).
- **Lessons:** none promoted. `lessons.md` is at its 8,192-byte budget and nothing in it is superseded. This run's gotchas live in [lessons/phase-2.md](lessons/phase-2.md): the runner keeps a step's last `$GITHUB_OUTPUT` write, and a scan over tracked files reads its own test file.
- **Seeds retired:** the `/goal` and `/loop` seeds below are not live instructions.

# ci-dedup-1: one extension build surface across the five PR lanes, one Bun version source in CI

One arc, one PR to `dev`: `Closes #1450`, `Part of #1448`. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). **UI impact: none** (CI workflows, one composite action, tests and docs; no extension, landing or playground source changes).

**Owner's picks, decision page 94 (signed 2026-11-01).** P94-16 = A (#1450): "Every lane that builds the extension runs on a licence-text change: add the path to both network lanes." P94-18 = A (#1448, Bun half): "One source: the composite reads the version from package.json, the inline steps take it from there too and pass no token; the manifests and the Docker pin stay checked by a test." The tsconfig half of #1448 was not decided: left out, said on the issue under `## Remaining`.

## Issue claims that did not hold

- **#1450** holds. Addition: `_build-extension.yml` in the smoke lists starts a lane that never runs it (smoke builds from source, `_extension-smoke-e2e.yml:133`).
- **#1448** holds for the Bun half, with corrections: the composite comment's premise ("an exact version resolves without the GitHub API") still holds through `bun-version-file`; `pr-quick#preview-comment` stays inline because its sparse checkout has no `.github/actions/`, not because the composite "always installs"; unlisted restatements exist in `apps/extension/store/SOURCE-BUILD.md`, `infra/token-list/README.md`, `infra/subscribe/README.md` and `CLAUDE.md:49`; `CLAUDE.md` names two Workers Builds, and `nulo-subscribe` is a third.

## Outcome & Quality Bar

- **For whom**: the maintainer who adds a package, a build input or bumps Bun, and the reviewer of that PR.
- **Excellent**: a lane that builds the extension cannot silently drop a build input another lane gates on, and the failure names the pattern and which workflows hold it; a Bun bump is one edit to `packageManager` plus the restatements the test names, and CI fails on a missed one; no CI step hands a job token to `oven-sh/setup-bun`.
- **Good enough**: lane infrastructure entries keep today's guards only (gate scripts, Firefox twin parity); the `BUN_VERSION` dashboard variables and the ARM64 archive hash stay manual steps, named once.

## Assumptions

**Facts** (evidence in recon.md): F1 the five filters as listed; F2 `texts/**` is read by every extension build, `bin/**` and `expected-minimum.txt` only by `_build-extension.yml` and a unit test; F3 setup-bun v2.2.0 reads `packageManager`, else `engines.bun`, from `$GITHUB_WORKSPACE/package.json` (also with no input); an exact `X.Y.Z` builds the release URL with no API call; no version installs the latest release through an anonymous API call; output `bun-version` is the installed binary's version; F4 nine inline `oven-sh/setup-bun` steps, none passing `token`, every checkout at the workspace root with `package.json` present; F5 the restatement sites (recon); F6 `pr-quick`'s compute step sets `needs-extension-build` from six filter outputs (`pr-quick.yml:161-182`).

**Inferences**: I1 a composite step reads an earlier `uses:` step's outputs (`setup-aztec`'s `steps.cache-aztec.outputs.cache-hit` does). I2 no PR run reaches the store, release, lockfile or pack steps; the structural test proves every step's version and token inputs, and the `source-rebuild.yml` dispatch proves `token: ""` with `bun-version-file` on x86_64 and ARM64 runners, not the privileged environments.

**Asks**: none open; every question is CI-internal and was argued with the panel (Decision ledger).

## Architecture & Implementation

**#1450.** Add `'packages/third-party-notices/texts/**'` to both network filters, after `'packages/token-list/package.json'` as in smoke. In `behavior-gating.test.ts`:
- `extensionBuildFilters()` derives pr-quick's union by running the compute step through `runStep` (`gh-step-harness.ts`). First, every env value must read exactly `${{ steps.override.outputs.full || steps.filter.outputs.<name> }}` with `<name>` a filter of the `changes` job, else a finding. Then `bound` maps each whole expression to `false`, and each key alone to `true`; a key whose run writes `needs-extension-build=true` to `$GITHUB_OUTPUT` contributes its `<name>`; all-false must write `false`. The `:653` graph test uses the same union. Each e2e lane's union is its one filter.
- The build surface of a workflow is its union minus lane infrastructure (`.github/**`, `scripts/ci-cd/**`).
- `SURFACE_EXCEPTIONS`, pattern → the workflows that hold it and why: `packages/third-party-notices/bin/**`, `expected-minimum.txt` → pr-quick (read only by `_build-extension.yml`'s post-build check, which only pr-quick's builds run); `biome.json`, `.commitlintrc.json`, `.githooks/**` → pr-quick (root config no build reads; `root-config` is pr-quick's one net over root files); `apps/playground/**` → both network lanes (the dApp the network suite drives).
- `surfaceFindings(surfaces)`, a pure function split under the cognitive budget: for each pattern any workflow holds, the set holding it must be all five, or exactly its exception's set; an exception whose set differs from the holders is named too. Live test expects `[]`; mutation copies: network without `texts/**`, smoke with `bin/**`, a stale exception; a compute copy without `ROOT` drops `root-config` from the union; a compute copy whose env value is not the override-or-filter form is refused.

**#1448 (Bun).** Composite: setup step `id: bun`, `bun-version-file: package.json`, `token: ""`; cache key `${{ runner.os }}-bun-${{ steps.bun.outputs.bun-version }}-${{ hashFiles('bun.lock') }}`, first restore key the same prefix (today's key value, so no cache churn); description and comment say the version comes from `packageManager`. Nine inline steps: `bun-version-file: package.json`, `token: ""`; `pack` keeps `no-cache: true`; the `pr-quick` comment states the sparse-checkout reason.
- **Token rule, one home**: `release-integrity.test.ts`'s composite-only check widens to every `oven-sh/setup-bun` step in workflows and actions (`loadTree`), with an inline-step mutation case.
- **New `scripts/ci-cd/bun-version.test.ts`**, pure functions over parsed copies: `packageManager` is exactly `bun@X.Y.Z`; every `oven-sh/setup-bun` step has `bun-version-file: package.json` and no `bun-version`; the composite's key and first restore key name the setup step's `bun-version` output and no literal; every restatement in `git ls-files` (minus `implementations-plan/**`, `CHANGELOG.md`, `bun.lock`, `package-lock.json`) equals the version, patterns `bun@V`, `bun-vV`, `bun --version # V`, `BUN_VERSION=V`, `bun-version: V`, `"@types/bun": "V"`, `bun/V/`, each behind a token boundary (whitespace allowed before `#`) so `setup-bun@<sha>` never matches; success control: the scan finds the four manifests, the Docker pair, `SOURCE-BUILD.md` and both READMEs; `SOURCE-BUILD.md`'s x86_64 hash equals the Docker pin's (same release asset). Mutation copies: a literal step, a literal key, a manifest one patch off, `bun@latest`, a doc line one patch off, a stale x86_64 hash. Off-by-one versions are computed, so the file holds no version literal.

**Docs**: `CLAUDE.md` § Dependency policy's Bun-bump paragraph (what CI checks; manual: the three Workers Builds' `BUN_VERSION`, `SOURCE-BUILD.md`'s ARM64 hash) and § Working in this repo (literal dropped, three Workers); `SECURITY.md` "Bun pinned" and "Bun-version sync trap"; `CI.md` § CI gating (texts in the third-party-notices line; rule 2 gains the agreement check); a `## Remaining` comment on #1448.

**File-level change map**: `.github/workflows/{pr-extension-network-e2e,pr-extension-network-e2e-firefox,store-check,release,publish-packages,_release-pr-lockfile,pr-quick,source-rebuild}.yml`, `.github/actions/setup-bun/action.yml`, `scripts/ci-cd/{behavior-gating,release-integrity}.test.ts`, `scripts/ci-cd/bun-version.test.ts` (new), `CLAUDE.md`, `SECURITY.md`, `CI.md`.

**Not taken**: comparing every filter entry (pr-quick's `.github/**` globs never string-match a lane's file entries: about fifteen infrastructure exceptions); comparing `apps/` and `packages/` only (misses a new root build input, such as a later `tsconfig.base.json`); a hand-kept pr-quick filter list (drops a compute clause unseen); routing inline steps through the composite (P94-18 keeps them inline); a fixed list of restatement sites (the hand-kept list is what drifted, #239); a shell step reading `package.json` for the cache key (the output names the binary that runs).

## Decision ledger

- D1 (P94-16 = A): `texts/**` joins both network lanes; no exception exempts it.
- D2: compared surface = every filter entry outside `.github/**` and `scripts/ci-cd/**`, root inputs in (both legs agree).
- D3: `_build-extension.yml` stays on the smoke lists, outside the comparison. Codex: keep (over-triggering is CI.md's chosen direction; removing narrows a required lane's trigger). Opus: remove (it starts six shards that cover nothing). Chosen: keep, because removing it changes a required lane's trigger outside the owner's pick and the brief's two options; the follow-up issue (D10) settles every infrastructure entry by one rule, this one included.
- D4 (P94-18 = A): one source, `packageManager`; cache key from the installed version; `token: ""` on every step.
- D5: the token rule lives in `release-integrity.test.ts` (credential isolation, Opus); the version rules in `bun-version.test.ts`; `docker-ci-like-pins.test.ts` unchanged. Codex accepted overlap; one home per rule is the smaller design.
- D6: no licence-text touch: all 21 files under `texts/` are verbatim upstream licences; the network lanes run on this PR through their own workflow-file entries.
- D7: `SOURCE-BUILD.md`'s x86_64 hash is checked against the Docker pin (both legs); ARM64 stays manual.
- D8: pr-quick's union is derived by running its compute step, after a grammar check of its env values (both legs found the hand list blind to a dropped clause; the final pass, to an altered expression).
- D9: an exception names its holder set, so a finding says which workflows hold a pattern (Opus).
- D10: infrastructure entries are pinned only for gate scripts and twin parity (both legs: removing `setup-bun/**` from both network files passes every test). Out of scope; close-out files an issue: derive each lane's infrastructure entries from the `uses:` graph.

## Security & Adversarial Considerations

- **Threat model**: CI supply chain. A PR author controls `package.json` on PR runs, which hold `contents: read` plus, in `pr-quick#preview-comment`, `pull-requests: write`; caches they save are PR-scoped. Write-scoped and environment-gated jobs run `dev` or `main` commits, and `dev` needs no approving review.
- **Least privilege**: `token: ""` takes the job token from a third-party action that needs none: a read token in eight steps, and `preview-comment`'s `pull-requests: write`. In the `id-token: write` jobs the action could still request an OIDC token; that is SECURITY.md's accepted residual of a compromised `oven-sh/setup-bun`. No permission, secret or environment changes.
- **Fail-open path**: a `packageManager` that is not exact `bun@X.Y.Z` makes setup-bun resolve through an anonymous API call, and none installs the latest release. The test refuses it on every PR (`quality-status`); the test's header notes the other premise, a checkout with root `package.json` (every one today).
- **Version choice by a PR**: setup-bun builds only `github.com/oven-sh/bun/releases/download/bun-v<V>/…` URLs (`encodeURIComponent`), so a PR picks among official releases.
- **Path filters**: the change adds triggers only; no required check, aggregator or label changes.
- One CI observation from planning is out of scope and tracked privately: GHSA-mcpq-5jpw-c723.
- Crypto, trust-boundary input validation, npm publishing: N/A. No dependency added; the action SHA is unchanged.

## Phases

### Phase 1 — #1450: network lanes gain the licence texts; the five surfaces must agree ✓
1. Add the glob to both network filters. 2. Add `extensionBuildFilters`, `SURFACE_EXCEPTIONS`, `surfaceFindings`, the live test and the mutation cases.

**Validation gate**: `bun run lint:actions && bun run lint && bun run typecheck:all && bun run test:ci-gating`. Pass: all exit 0; the live test passes; each mutation case reports its own finding. Layers: lint, typecheck, unit.

### Phase 2 — #1448: one Bun version source ✓
1. Composite and the nine inline steps; the `pr-quick` comment. 2. The `release-integrity` widening; `bun-version.test.ts`. 3. Docs.

**Validation gate**: Phase 1's commands plus `bun run test:release && bun run test && bun run test:all`. Pass: all exit 0; `git grep -nE 'bun-version: *[0-9]' -- .github` prints nothing. Layers: lint, typecheck, unit.

### Phase 3 — proof on runners (after the Codex loop converges) ✓ (dispatch runs 41356013693 and 41356015938 green; the PR's checks are on PR #1492)
1. Push the branch. Run `gh workflow run pr-quick.yml --ref worktree-ci-dedup-1` and `gh workflow run source-rebuild.yml --ref worktree-ci-dedup-1` (empty `tag`: rebuild this commit; read-only, no secret). 2. Open the PR (Delivery).

**Validation gate**: both dispatches green, their setup-bun logs print `Obtained version <V> from package.json` (`<V>` = the `packageManager` version) and the composite's cache step a key with `<V>`; the PR's five required checks green with both network lanes run; the PR run's "Preview build comment" job log prints the same `Obtained version` line. Record run ids in `lessons/phase-3.md` and the PR body. Layers: CI on runners.

## Delivery

Single arc on `worktree-ci-dedup-1`, one PR to `dev`, no stack. Title: `ci: pr lanes agree on the extension build surface; ci reads bun from package.json` (81 characters). Body: the owner's picks quoted, what changed per file and why, the validation runs, D3, D6 and D10, no e2e scenario change, `Closes #1450`, `Part of #1448`. Open without labels: the filters trip all four e2e lanes (their workflow files or `setup-bun/**` change). The phases share no file but run in order.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at `fcc4da21`, single-arc placement: step 1 absent (`code_review: off`); step 2, the Codex loop, once over `git diff fcc4da21...HEAD` after Phase 2 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with each fix diff, hard stop at three rounds; one Opus review (`general-purpose`) beside round 1. Phase 3 after the loop; a fix it forces goes through one resumed round. Step 3 Delivery, then `gh pr checks <n> --watch`. Step 4 close-out as the PR's final commits (merge `origin/dev` first; Outcome; lessons promotion; the D10 issue; the #1448 `## Remaining` comment; `STATUS.md` deleted; `git mv` to `archive/`; index line moved). Step 5 teardown: `agent-worktree done ci-dedup-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-dedup-1/plan.md` succeeds. Merging is the orchestrator's call.

## Seeds (draft; no ELI5 by the orchestrator's rule)

```
/goal Phases 1-3 of implementations-plan/ci-dedup-1/plan.md marked ✓, each gate reported passing with LESSONS_FILE=implementations-plan/ci-dedup-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding quoted); one PR to dev with Closes #1450 and Part of #1448 and green checks; close-out committed (git show --stat of the archive move); bun run lint and bun run test:ci-gating exit 0.
```

```
/loop 15m Drive implementations-plan/ci-dedup-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast gates after each edit; Codex for any decision; never merge; stop and report when the PR is green and the close-out is committed.
```

Recommended: `/goal`.

## Audit verdicts

**Round 1** (2026-11-01). Codex (gpt-6.1-sol, high): `conditional approve` (bind surface parity to the compute wiring; correct the infrastructure-coverage and dispatch-proof claims). Opus Plan: `conditional approve` (C1 prove `preview-comment`; C2 two missed restatements; C3 stop calling infrastructure pinned; C4 remove `_build-extension.yml` from smoke; C5 rewrite least privilege).
- Accepted: D8 (both); D10 and the narrowed quality bar (both, C3); C1 Phase 3 reads the PR's preview job; C2 `CLAUDE.md:49` literal dropped and the `bun --version # V` pattern; C5 and Codex's threat-model corrections (`pull-requests: write`, `dev` unreviewed); F3's `engines.bun` fallback; I1's citation; I2 restated (pack differs by `no-cache`); D7 cross-check (both); D9; D5 token rule moved to `release-integrity` (Opus); scan anchoring, `CHANGELOG.md` excluded, computed versions; `CI.md:235-236`; complexity split; title recounted (84 → new 81-character title).
- Rejected: C4 removal (D3); dropping the `pr-quick` dispatch (the lane brief requires it); trimming `test`/`test:all`/`test:release` from the gate (the program's validation layers require them).
- Side question (Codex, private consult): answered; filed as a draft advisory.

**Final fresh pass** (Codex, new session `01a19908-8196-72c3-b3e2-2df848b34adb`): `conditional approve (with conditions: D8 must reject env expressions outside the supported override-or-filter form)`. Path: an env value edited to a comparison (`... == 'false'`) would be bound `true` by the probe and attributed to the union while the real step skips the build; demonstrated on an in-memory copy. Accepted: the grammar check and its mutation case (D8 bullet). Also folded: token boundaries instead of line anchors; every exception checked on its own; the token walk covers every loaded action. Its security notes (a compromised pinned action or release asset keeps the job's other capabilities) are SECURITY.md's existing residuals, unchanged. Resumed verification: `approve` (no new material finding).
