---
plan: release-pipeline-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at 8663cdd15
trunk: dev
issues: "#21 (Refs only: its A pick waits for a green stable release); tracked privately"
post_implementation_hardening: not scheduled
---

# release-pipeline-2: the release App's key behind the `release-app` environment

One arc. Every job that mints the release App token declares `environment: release-app`, and no other job does; the reusable lockfile workflow's job declares it and its callers pass `secrets: inherit`; a test keeps it so; the documents say where the key lives. Owner's sign-off, **P77-08 A** (page 77): "One environment (main, plus dev for publish and sync), rotate the key, delete the repository secrets." Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Tracked privately; this plan, the PR and the tests describe the change, never the finding.

## The claims and what did not hold

- **The premise.** Holds in part (2026-10-21, names only): `release-app` exists with deployment branches `main` and `dev` and no reviewer, and holds `RELEASE_PLEASE_APP_ID`. **Not yet:** the private key is not in it; the owner adds it from their Mac before the next promote. The owner's remaining steps are tracked privately. The arc is safe in that state: an environment's secret takes precedence over a repository secret of the same name.
- **The reader list** (lane brief item 1) holds: the seven jobs it names are six minting jobs and two callers, less `_release-pr-lockfile.yml`'s `lock-version`, the real reader behind the callers, so eight jobs in all ([recon.md](recon.md#who-reads-the-two-secrets-today)).
- **"Mirror the token-list environment test at the same file."** That test pins `publish-token-list.yml`'s environments as `["sign"]`, so it changes with `publish-pr`. The cross-workflow pin goes into `release-integrity.test.ts` instead (D2).
- **SECURITY.md's wording "a writer's branch workflow cannot read it"** (lane brief item 3) holds under GitHub's documented behaviour (F8); the documents say it as "only workflow code that has reached `main` or `dev`".

## Outcome & Quality Bar

- **For whom:** the owner, whose tag rule rests on the App key; a later maintainer adding a job that needs the App.
- **Excellent:** (1) only workflow code that has reached `main` or `dev` can mint the App token, and a new minting job without the environment fails `quality-status`; (2) a caller that forgets `secrets: inherit`, which GitHub would let run with empty secrets, fails the same test.
- **Good enough:** no change to any job's steps, permissions, triggers or `if`.

## UI impact

None. Workflow YAML, one test file and documents; no screen changes.

## Architecture & Implementation

- **Workflows.** `release.yml`: `environment: release-app` on `release-please`, `auto-unstick`, `sync-main-to-dev`; `release-pr-lockfile` passes `secrets: inherit`; the workflow's `permissions` comment says the App token is minted only in `release-app`. `release-prerelease.yml`: the environment on `release-please`; `release-pr-lockfile` passes `secrets: inherit`. `publish-token-list.yml`: the environment on `publish-pr`; its header line for `publish-pr` names it. `_release-pr-lockfile.yml`: delete `on.workflow_call.secrets`; `environment: release-app` on `lock-version`, with one comment: a caller that does not pass `secrets: inherit` leaves the secrets empty here, with no error. The key goes after `timeout-minutes`, as `attach-assets` places `environment: production`.
- **Test** (`scripts/ci-cd/release-integrity.test.ts`, `describe("App tokens")`). `Job` gains `environment?: unknown; secrets?: unknown`; `loadTree` reads `.yaml` workflows too. `releaseAppFindings(tree)` walks every job of every workflow, callers included (`jobs()` skips them); each job's `${{ }}` spans (`expressions()`, its JSON and the workflow's `env`) are read with the mint step's own `app-id` and `private-key` inputs left out. Per job:
  - a `MINTS` job: `mints the App token outside release-app` when its environment name (string, or object `name`) is not `release-app`; `reads a secret beside its mint` when a span still mentions `secrets` once `secrets.GITHUB_TOKEN` is removed (`toJSON(secrets)` included);
  - any other job: `names its environment by an expression` (a name holding `${{`); `enters release-app but mints no pinned App token` (the name, lower-cased, is `release-app`: GitHub matches names case-blind); `reads the release App's secrets` (a span matches `/RELEASE_PLEASE_APP_/i`, callers' `secrets:` included);
  - a caller: `inherits secrets into a workflow outside this commit` (a non-`./` `uses:` with `secrets: inherit`); `calls a release-app workflow without secrets: inherit` (a `./.github/workflows/<f>` callee with a job in `release-app`).
  A new non-minting job that reads another secret is already refused by `credentialedFindings`. Tests: findings on the tree are `[]`; a success control, the jobs in `release-app` are exactly `Object.keys(MINTS)`; `test.each` mutations, each with its exact sorted finding list: `auto-unstick` without the environment; `release-notes` in `Release-App`; `release-notes` in an environment named `${{ 'release-app' }}`; `release-notes` reading `secrets.release_please_app_private_key`; `auto-unstick` handing the key to a script; `lock-version` reading `toJSON(secrets)`; `release.yml#release-pr-lockfile` passing the id by name; `release-prerelease.yml#release-pr-lockfile` with no `secrets`; a caller inheriting into `nulo-sh/nulo/.github/workflows/_release-pr-lockfile.yml@main`; and two legitimate edits that find nothing: `{ name: release-app, deployment: false }` on a minting job, and a mint reading its key by bracket.
- **Test** (`behavior-gating.test.ts`, token-list describe): the environment list becomes `["sign", "publish-pr"]`, and `[sign, publish-pr]` environments equal `["token-list", "release-app"]`; the title says so.
- **Documents.** `SECURITY.md` Tags paragraph: the App's id and key are secrets of `release-app` (branches `main` and `dev`, no reviewer, so `auto-unstick` and the sync PR never wait); GitHub opens the environment only to runs from those branches, so only workflow code that has reached `main` or `dev` can mint the App token, and `release-integrity.test.ts` keeps the environment on exactly the jobs that mint it (a repository check, not a GitHub rule); a workflow change merged into `dev`, which needs no approving review, or into `main` runs with the key on its next run there. `SECURITY.md` "Every App token …": adds "and is minted only in a job that declares `release-app`"; the residuals gain the merged-workflow case. `release` skill: Prerequisites line 44 says where the secrets live, and how to rotate the key (a new key in the App's settings, pasted into the environment, then the old key deleted); Troubleshooting gains three rows: a job refused `release-app` (the run is not on `main` or `dev`, such as an rc cut dispatched from a tag or another branch: dispatch from `dev`); a mint failing on an empty key (the key is missing from the environment, or a caller dropped `secrets: inherit`); a rerun failing at its mint though `release-app` holds the key (the run's revision predates `release-app`, and a rerun keeps it: dispatch afresh or use the manual unstick). `CI.md:116` and `CI.md:150` name the environment.
- **Alternatives not taken.** D1-D4 in the ledger below.

## Security & Adversarial Considerations

- **Threat model.** The App token can create stable and rc tags (the tag rule's one bypass actor) and write to `dev`. Tracked privately. The boundary: GitHub opens `release-app` only to runs from `main` or `dev` (F8), so the App token can be minted only by workflow code that has reached one of those branches; which jobs on those branches may mint it is the repository's test, not a GitHub rule.
- **Residuals.** A workflow change that reaches `dev` (green checks, no approving review) or `main` runs with the key on its next run there; a compromised step inside a minting job; an admin. A reviewer on the tag path (P77-08 B, the owner's later option) would narrow the first.
- **Transition.** The owner's remaining steps are ordered and tracked privately. A run whose workflow revision predates `release-app` can fail at its mint, a rerun included (it keeps its revision); the runbook names the failure.
- **Least privilege.** `secrets: inherit` hands the callee every secret the caller can see; today that is the two App secrets only, and the test refuses a callee expression that reads any other secret. No token, permission, `if` or trigger changes; no `continue-on-error`. The environment holds no variable, so `vars.AUTO_UNSTICK_ENABLED` still resolves to the repository's.
- **Supply chain, crypto, input validation:** N/A (no dependency, no new action, no parsing).

## Assumptions

- **Facts.** F1 `release-app` is as found in [recon.md](recon.md#the-environment-as-found-2026-10-21-names-only), with no environment variable. F2 the eight jobs and their refs are as in the recon table. By design the `release.yml` readers run on `main` only and `publish-pr` on `dev` only; nothing in `release-prerelease.yml` limits its ref, so the environment now refuses an rc cut dispatched from a tag or a feature branch, and still admits one from `main`. F3 GitHub: a `uses:` job cannot declare `environment`; the caller must pass the secret (`secrets: inherit` or by name); a secret not passed resolves empty with no error; the branch rule is matched against `GITHUB_REF`, the caller's for `workflow_call`. F4 `MINTS` holds exactly the six minting jobs (`release-integrity.test.ts:104-115`). F5 actionlint 1.7.12 accepts the inherit shape. F6 actionlint 1.7.12 also accepts `environment: { name, deployment: false }`. F7 `token-list`'s `sign` already runs in an environment with `permissions: contents: read`, so an environment needs no `deployments` permission. F8 Since 2025-12-08 (GitHub changelog, 2025-11-07, "Actions pull_request_target and environment branch protections changes"), environment rules for `pull_request` runs evaluate `refs/pull/<n>/merge`, and a `pull_request_target` run takes its workflow and ref from the default branch.
- **Inferences.** I1 Under `secrets: inherit`, an environment-only secret resolves in the callee's environment job: the docs name inherit as a way to pass one, but no run here can show it before the owner's remaining steps. If it is wrong, only the advisory `lock-version` job goes red, and the runbook row names the cause. I2 A deployment record per run of each job is acceptable noise, as for `production` and `token-list`.
- **Asks (working assumption in force).** A1 The documents describe the end state, which the owner's remaining steps complete: yes. A2 The cross-workflow test lives in `release-integrity.test.ts`, a file the lane brief does not list (D2): yes.

## Phase 1: bind the App secrets to `release-app`

1. Edit the four workflows as the change map says. Change no step, permission, trigger or `if`.
2. Add `releaseAppFindings` and its tests. Update the token-list test in `behavior-gating.test.ts`.
3. Edit `SECURITY.md`, the `release` skill and `CI.md`.

**Validation gate.** Commands: `bun run lint:actions`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run check:plans` after staging. Pass: each exits 0; the new tests run and pass; each mutation's finding list matches exactly. Red proofs, each with `git show 8663cdd15:<path>` into the working tree and the edited files restored after: (a) all four workflow files at base: the `[]` test reports exactly the six "outside release-app" findings and the two callers' "reads … outside its mint" (the control and the mutation tests go red too); (b) only the two callers at base: exactly the two "reads" and the two "without secrets: inherit". Layers: lint, typecheck, unit. No e2e: no path an e2e lane filters.

## Delivery

- **Arc 1** = Phase 1, branch `release-pipeline-2-a1` off `origin/dev`, one PR against `dev`, ready (D-orch-1: no stack). Title: `ci(release): mint the release app token only in the release-app environment` (77 characters). Body: what changed and the invariant it keeps (never the advisory's finding); the dry read, per workflow, of each job, the ref it runs on, its environment and whether it reads the App secrets; the validation runs; `Refs #21`; P77-08 quoted by id and text as the sign-off; the owner's remaining steps are tracked privately (the orchestrator's report), never in the PR. No label, no `Closes`. After the PR opens, one comment on #21 links it: the first stable release on this shape is logged there.
- **Parallelism:** none (one phase).

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `8663cdd15`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, once over the arc diff after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` with `CODEX_ACCOUNT` unset, resumed with `resume-codex.sh`; the prompt carries the diff from `origin/dev`, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review of the same diff beside round 1. Hard stop at three rounds; log each in `lessons/phase-1.md` and under Audit verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge. Never dispatch `release.yml`, `release-prerelease.yml` or `publish-token-list.yml`.
- **Close-out** (deviation from the standard, the program's practice): a docs-only PR after arc 1 merges, on the orchestrator's word. Merge `origin/dev` and read `index.md` and `lessons.md`; the `## Outcome` block (`Open items: #21`); lessons only within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/release-pipeline-2 implementations-plan/archive/release-pipeline-2` in its own commit, index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/release-pipeline-2/plan.md` succeeds, run `agent-worktree done release-pipeline-2 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Decision ledger

- **D1 · the reusable workflow's secrets: `secrets: inherit`, the callee's `on.workflow_call.secrets` deleted.** By-name passing also works for an environment-only secret, keeps `required: true` and hands the callee two names, not all; but the caller's own expression then names the secrets, which the lane brief forbids, and after the deletion `required: true` checks only that a name was passed, not its value. Inlining `lock-version` into both callers copies a job. Inherit's extra reach is nil today (no other repository or organization secret).
- **D2 · the pin lives in `release-integrity.test.ts`.** That file already walks every workflow, scans `${{ }}` for secret reads and pins the six minting jobs by name (`MINTS`); a second walker and list in `behavior-gating.test.ts` would copy them. `behavior-gating.test.ts` keeps its per-workflow token-list pin, updated.
- **D3 · plain `environment: release-app`, not `{ name, deployment: false }`.** Codex corrected the premise: GitHub's control-deployments page lists restricting secrets by branch policy without deployment tracking as a use of `deployment: false`, and actionlint accepts it. Plain stays: it is the form the repository's five other environments use and the one whose branch-policy refusal the token-list flow already relies on; the cost is one deployment record per run, as `production` and `token-list` make. The object form is a one-line change later if the records become noise.
- **D4 · no reviewer, no tag-only App.** A reviewer would hold `auto-unstick` and the sync PR; the split is P77-08 B, the owner's later call.
- **D5 · the App-secret scan covers the minting jobs too** (Opus r1 #2, accepted): only the mint step's `app-id` and `private-key` inputs are exempt, so a script step handed the key fails the test.
- **D6 · whole or computed `secrets` reads are refused in the minting jobs only** (Codex r1 #1, Opus arc #2): outside `release-app` such a read cannot reach the key, and the expression and case rules keep every non-minting job out of `release-app`; inside it, any read beside the mint can carry the key.
- **D7 · pull-request runs need no change** (Opus r1 #1): GitHub's documented behaviour since 2025-12-08 (F8), found by Codex r2 and read in the changelog, keeps them out of the environment; no live probe, the repository being public.
- **D8 · the `MINTS` success control stays** (Opus r1 #8): it is the lane brief's pin by name and the success control beside the never-happens test.

## Audit verdicts

- **Round 1, Codex** (session `01a15f11`): approve with changes. #1 test bypasses (expression-named environment, case, whole-context read): accepted in part (D6). #2 F2 conflated design with enforcement; eight jobs, not seven: accepted. #3 D3's premise wrong (`deployment: false` is documented for branch-policy scoping): accepted, decision kept on other grounds. #4 a pre-move run or rerun fails after the deletion: accepted (runbook row, ordered deletion). #5 `inherit`'s reach is only nil today: accepted as a test rule, not a known limit.
- **Round 1, Opus Plan leg:** approve with changes. #1 unsupported under F8 (D7). #2 minting jobs exempt from the read scan: accepted (D5). #3 red proof imprecise: accepted (two proofs). #4 SECURITY.md wording and custody: accepted (wording; rotation in the runbook). #5 runs that predate the move: accepted (ordered deletion). #6 environment variables could shadow the kill switch: checked, none. #7 bypasses: expression and full-path callee accepted, whole-context read per D6. #8 the control repeats rules: rejected (D8).
- **Round 2, Codex** (resumed): approve with changes. #1 the staged plan still held the first threat model, and the advisory's id adds disclosure: restaged after revision, the id dropped (as `backup-restore-2` did). #2 `OWNER-ASKS.md` lacked the deletion's precondition: copied. #3 `recon.md` kept two superseded sentences: corrected. Opus #1: unsupported under F8.
- **Round 3, Codex** (resumed, verification): **approve**, no remaining finding.
- **Arc 1, review round 1.** Codex (session `01a15f24`): approve with changes. #1 committed plan text said more than the change: rewritten, and the unpushed history rebuilt so no commit carries it. #2 the callee was resolved by file name across repositories: resolution is local-only, and inheriting into a workflow from another commit is refused. #3 a bracket read in a callee's mint was a false finding: the callee-reach rule is dropped (`credentialedFindings` and the minting-job rule cover it), and a success case pins the bracket form. Opus (`general-purpose`): approve with fixes. #1 the same disclosure, plus the PR body's owner steps: moved to the private report. #2 whole or computed reads inside a minting job: refused (D6). #3 the object form of the environment was a false finding: fixed, success case added. #4 `.yaml` workflows were not loaded: loaded. #5 the remote callee: as Codex #2. #6 runbook rows named one job's step and the window: reworded; the token-list header reflowed.

## Seeds (draft until approval)

```
/goal Arc 1 of implementations-plan/release-pipeline-2/plan.md done: Phase 1 marked ✓ with its gate reported passing in the transcript; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the PR open against dev (gh pr view output); no reader workflow dispatched.
```

```
/loop Work implementations-plan/release-pipeline-2/plan.md: run the next unticked step and its gate; on green tick it and update STATUS.md; on red fix the cause (never loosen a test), stop after five failures on one step. Stop when the PR is open and its checks are reported, or when the plan is archived on dev.
```
