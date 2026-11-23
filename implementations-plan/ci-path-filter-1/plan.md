---
plan: ci-path-filter-1
tier: light
status: in progress
issues: "#1932"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no explorer (the recon is the reading below); one Codex gpt-6.1-sol high pass over the plan, one over the completed diff with an Opus lens beside it, then targeted verification
base: origin/dev at c0eb5d072
trunk: dev
post_implementation_hardening: not scheduled
---

# ci-path-filter-1: one source for the extension lanes' build-input path filter

The extension's build inputs (the extension package, eleven libraries' `src/**` and `package.json`, the licence texts, six root files) are listed in four e2e lane workflows and again, regrouped, in `pr-quick.yml`; `CI.md` restates them in prose. `scripts/ci-cd/behavior-gating.test.ts` makes the copies agree, so a new consumed workspace costs five YAML edits and a doc edit (#1932, residue of #1450). This plan moves the list into one file that every lane loads, keeps each lane's own entries in its own workflow, and proves that no lane's effective filter moved. UI impact: none. Nothing here changes what a person sees.

## Outcome & Quality Bar

- **For whom**: the maintainer who adds a workspace or a root build input, and the reviewer who must trust that a required lane still runs when it should.
- **Excellent**: (1) a new consumed workspace is one edit in one file, and the guard names that file when it is missing; (2) a test shows each lane's effective pattern set equals the set at `c0eb5d072`, so a mis-port reds instead of skipping a required lane; (3) each lane's workflow still shows, in its own file, which shared source it reads and which entries are its own.
- **Good enough**: the `changes` jobs keep their shape (no reusable workflow); the landing's own root net in `pr-quick` stays as it is.

## Assumptions

- **Facts**:
  - F1: `dorny/paths-filter` at the pinned `ceb8a2b8` (v4.0.3) reads `filters` as a file path, relative to the working directory, when the value has no newline and no colon; otherwise as inline YAML (js-yaml, anchors allowed). Nested lists are flattened (`src/main.ts:34,64-78`, `src/filter.ts:156-157`). One step reads one source: a file and inline entries do not mix.
  - F2: on `pull_request` the action lists the PR's changed files through the API by PR number and ignores `ref` (`src/main.ts:80-121`). Two steps make two calls: they agree while the head stays put. A push between them gives the new head its own run, and the old head's run is superseded, so the required checks never rest on a mixed answer (Codex r1 corrected the draft's "the same files").
  - F3: every lane's `changes` job runs `actions/checkout` with the default ref before the filter steps. On `pull_request` that is the PR's merge commit, the commit the workflow file is read from; on `workflow_dispatch`, the dispatched ref. The source file therefore comes from the commit its workflow comes from.
  - F4: the four e2e lanes carry the same 30 build-input entries (smoke `pr-extension-smoke-e2e.yml:63-94`, network `pr-extension-network-e2e.yml:68-100`, Firefox `:50-79` and `:56-86`); network adds `apps/playground/**`. `pr-quick.yml:76-132` holds the same 30 across `core-foundation`, `aztec-runtime`, `wallet-bridge`, `extension` and `root-config`, plus its reviewed extras (`bin/**`, `expected-minimum.txt`, `biome.json`, `.commitlintrc.json`, `.githooks/**`).
  - F5: `pr-quick`'s per-group job outputs have no reader outside its own compute step (`git grep 'needs.changes.outputs'`); only `needs-extension-build`, `needs-landing-build` and `audit-mode` are read. Lint, typecheck and unit tests run on every PR, unfiltered.
  - F6: `e2e-decide.sh:18-24` refuses a `SURFACE` other than `true`/`false`, so a filter output that never arrived reds the gate (`decide-gate.test.ts:80-83`). In an expression the string `'false'` is truthy, so `a || b` over two filter outputs is wrong, and `a == 'true' || b == 'true'` reads a missing output as `false`: fail open. `pr-quick`'s compute step validated none of its inputs.
  - F7: the issue's claims hold at `c0eb5d072`: 23 package entries plus 6 root entries per lane; the `!` warning is in both Chrome copies and `pr-quick`, absent from both Firefox copies; `CI.md:245-247` restates the groups with no guard.
  - F8: `Bun.YAML.parse` resolves anchors and keeps an aliased list nested, so a reader must flatten as the action does.
  - F9: the extension's transitive `@nulo/*` closure is exactly the 11 libraries the lanes list, so an exact derivation reproduces the base sets. Base effective sets (by `c0eb5d072`'s own readers): quick 37, smoke 37, smoke Firefox 38, network 42, network Firefox 43, landing 18 patterns; Codex counted the same five independently.
- **Inferences**: I1: no consumer outside this repository reads `pr-quick`'s per-package outputs (a top-level workflow cannot be called). I2: GitHub reads workflows only from `.github/workflows/`, so the source beside it is never one.
- **Asks**: none left. A1 (the lasting pin) is D3; A2 (the path) is D4.

## Architecture & Implementation

- **The source**: `.github/path-filters/extension-build.yml`, one filter `extension-build`: `apps/extension/**`, each library's `src/**` and `package.json`, `packages/third-party-notices/texts/**`, the six repo-wide files, and the file itself (D5). Its header holds the derivation rule, the one `!` warning and the guard's name.
- **The e2e lanes** (4 files): a step `id: build` (`filters:` the source) before the existing `id: filter` step, which keeps only the lane's own entries: its CI files, and `apps/playground/**` on the network lanes. The Decide step gains `BUILD` beside `SURFACE`.
- **`e2e-decide.sh`**: validates `BUILD` as it validates `SURFACE` (an unset one fails under `set -u`), and runs when either is `true` (F6).
- **`pr-quick.yml`**: the same `build` step; `core-foundation`, `aztec-runtime` and `wallet-bridge` go with their outputs (F5); `extension` keeps only `bin/**` and `expected-minimum.txt`; the compute step reads `BUILD` for those three and now refuses any input that is not `true`/`false` (Codex r1 #1). `root-config`, `landing`, `playground`, `workflows` and `deps` stay (D6).
- **The guard** (`behavior-gating.test.ts`): readers by step id (`filterSteps`, `stepFilters` loading a file source and flattening, `gateFilter` resolving `steps.<id>.outputs.<filter>`); a lane's effective set is the union behind its Decide step's two inputs (`laneSet`), pr-quick's the union behind the compute inputs that set the flag (`buildFilters`, now per flag). `derivedSurface()` gives the extension's set from the graph plus the licence texts and the repo-wide inputs; the source must equal it plus itself, and `surfaceFindings` now refuses a pattern no derivation or exception names, so every lane's surface is exact. `filterStepFindings` pins each filter step's shape (Codex r1 #2). The infrastructure walk counts a filter step's file source. The landing must build on every repo-wide input (Codex r1 #3). `aggregators.test.ts` and `audit-gate.test.ts` read the new step ids.
- **The migration proof**: `scripts/ci-cd/fixtures/path-filters/c0eb5d072.json` holds the base sets, written by `c0eb5d072`'s own readers from a `git archive` of that commit; a test requires each lane's effective set to equal it plus the source, and the landing's to equal it. It runs on the PR's opening head and retires in the close-out (D3).
- **Docs**: `CI.md` § CI gating, `.github/WORKFLOWS.md`, the PR template and the `e2e-testing` skill point at the source and name both filters.
- **Alternatives not taken**: D1, D2.

## Phase 1: the source and the lanes ✓

1. Write the base fixture from a `git archive` of `c0eb5d072` with that commit's own readers.
2. Write the source; edit the five workflows and `e2e-decide.sh`.
3. Rework the guard and its sibling tests; add the refusal controls: a quantifier, another source or a condition on `build`; a path no graph derives; a consumed library no lane holds; an empty verdict for each compute input; an unset `BUILD`.
4. Update the docs.

Validation gate:
- G1: `bun run test:ci-gating` green at retry 0; a planted drop (`packages/wallet-core/package.json`) and a planted widening (`docs/**`) in the source each red the source, derivation and fixture tests.
- G2: `bun run lint`, `bun run lint:actions`, `bun run typecheck:all`; `bun run test:release` (it covers nothing this plan touches).
- G3: `git diff c0eb5d072 -- .github/workflows` adds no `permissions`, trigger, job or `uses:` target beyond the pinned filter action; `AGGREGATOR_CHECKS` green.
- G4: `bun run check:plans` after staging the plan files.
- Layers: lint, the CI-gating tests. The e2e layer is the PR's own lanes.

## Security & Adversarial Considerations

- **Threat model**: the party that matters can open a PR and edit any file in it. Today it can edit the inline lists; now the source file. Both come from the PR's merge commit (F3), so no trust boundary moves, and an author who edits the source and the guard together is caught only by review, as before. A skipped required lane passes its aggregator, so the risk is a mis-ported, narrowed or widened filter, or a step that matches differently: the exact derivation, the step-shape pin and the migration fixture answer those.
- **Least privilege**: no `permissions` change; the new steps use the already pinned action with the same two inputs; no secret is read; triggers stay `pull_request`.
- **Fail closed**: a missing or unreadable source fails the action's step, so the `changes` job and the aggregator red; a missing or malformed verdict reds `e2e-decide.sh` and pr-quick's compute step.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Filters file, reusable `_pr-e2e-gate.yml`, or generated copies | filters file, two filter steps, combined in the shell | the action reads a file natively (F1). A reusable workflow still needs two filter steps to merge shared and lane entries, serves only the four e2e lanes and adds input and output plumbing; generated copies keep five lists and add a generator. Codex r1 agreed |
| D2 | One file with every lane's filter (anchors) vs the shared group only | the shared group only | each lane's own entries stay in its own workflow, as the brief prefers |
| D3 | The lasting pin: the base fixture, or an exact derivation | the derivation; the fixture proves the move on the PR's opening head, then retires in the close-out | proposed: keep the fixture. Codex r1: a kept snapshot makes every new workspace two edits again, while equality to a derivation from `package.json` plus a reviewed table refuses a drop and a widening alike and moves with the graph. The fixture stays the independent proof that the derivation reproduces `c0eb5d072` (F9) |
| D4 | Path of the source | `.github/path-filters/extension-build.yml` | outside `workflows/` (I2), named for what it lists |
| D5 | The source lists itself | yes | an edit to it then runs every lane that reads it, as each lane's own workflow does; one line, not five. It is the only addition to any effective set |
| D6 | Move the six repo-wide entries out of `pr-quick`'s `root-config` | no | that group is the root net for both builds and the landing reads it; a test now pins the landing's root coverage (Codex r1 #3) |
| D7 | Drop `pr-quick`'s `core-foundation`, `aztec-runtime` and `wallet-bridge` groups and outputs | drop | the source carries their entries and nothing reads the outputs (F5) |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, the plan): `approve with changes`, design (a); D3 to the derivation; D5, D6 and D7 as proposed. Three findings, all accepted: (1) pr-quick's compute step read an empty `BUILD` as false and skipped the builds (demonstrated: run in memory): it now validates every input; (2) pattern equality misses a step that matches differently (`predicate-quantifier: every`, a condition, another diff source) (demonstrated from the pinned source): `filterStepFindings` pins the shape, resolving by step id; (3) with the repo-wide inputs also in the source, a `root-config` that lost one would skip only the landing (demonstrated by the compute logic): a test pins the landing's root coverage. F2 corrected.

## Delivery

One arc, one PR, no stack: `worktree-ci-path-filter-1` → `dev`, ready for review after the Codex pass over the diff and its verification. Title (63 characters): `ci: one source for the extension lanes' build-input path filter`. Body: what changed and why, the migration proof and its counts, each lane's `changes` output on the PR with the reason, each gate's outcome, "No visible change.", `Closes #1932`. No label: the PR edits every lane's workflow, so each lane's own filter runs it. The opening head carries the fixture test, so its `quality-status` run is the base comparison on CI; the close-out head drops it (D3).

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `c0eb5d072`, as bounded work: one Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and the diff from `c0eb5d072`, an Opus lens beside it, then targeted verification of material fixes. After the opening head's checks finish, the close-out ships in the same PR: the fixture and its test retired in their own commit, the Outcome, `STATUS.md` deleted, `git mv` into `archive/`. Never merge; teardown after the orchestrator's merge, slug `ci-path-filter-1`, trunk `dev`.

## Seeds

```
/goal Phase 1 of implementations-plan/ci-path-filter-1/plan.md marked ✓ with G1-G4 reported passing; the Codex pass over the plan and diff recorded with its verdict; the PR to dev open, ready, with each lane's changes output in its body; the opening head's checks finished; the close-out archive commit shown by `git show --stat`.
```
