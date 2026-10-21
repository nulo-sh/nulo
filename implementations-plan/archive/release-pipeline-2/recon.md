# release-pipeline-2: recon

Base: `origin/dev` at `8663cdd15`. One Sonnet explorer (reuse sweep) plus the planner's own reads; GitHub's documentation read 2026-10-21.

## The environment as found (2026-10-21, names only)

- `release-app` exists: protection rule `branch_policy` only, custom policies `main` and `dev` (type branch), no reviewer, no wait timer.
- Its secrets: `RELEASE_PLEASE_APP_ID`. The private key is not there yet: the owner adds it from their Mac before the next promote.
- No organization secret reaches the repository, and the environment holds no variable. The owner's steps are logged on #21.

## Who reads the two secrets today

| Workflow | Job | Trigger and ref it runs on | Reads |
|---|---|---|---|
| `release.yml` | `release-please` | push to `main` (`if: github.event_name == 'push'`) | mint, line 82 |
| `release.yml` | `release-pr-lockfile` | caller of `_release-pr-lockfile.yml`, after `release-please` | passes both by name, lines 110-111 |
| `release.yml` | `auto-unstick` | push to `main` only | mint, line 142 |
| `release.yml` | `sync-main-to-dev` | push to `main` only, after `attach-assets` | mint, line 707 |
| `release-prerelease.yml` | `release-please` | `workflow_dispatch`, run from `dev` by the runbook | mint, line 43 |
| `release-prerelease.yml` | `release-pr-lockfile` | caller, after `release-please` | passes both by name, lines 72-73 |
| `publish-token-list.yml` | `publish-pr` | after `sign`; `prepare` runs only on `refs/heads/dev` | mint, line 122 |
| `_release-pr-lockfile.yml` | `lock-version` | `workflow_call`; its ref is the caller's | mint, line 35; `on.workflow_call.secrets` declares both `required: true` |

No other file under `.github/` names them. `release.yml`'s four readers run on a push to `main` only: its dispatch with `--ref <tag>` skips them. `publish-pr` runs only after `prepare`, which needs `refs/heads/dev`. Nothing limits `release-prerelease.yml`'s ref: the runbook dispatches it from `dev`, and the environment now refuses it from a tag or another branch.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Walk every workflow's jobs | `scripts/ci-cd/release-integrity.test.ts` `loadTree`, `jobs()` (skips `uses:` callers) | adapt: iterate `wf.jobs` directly so callers are seen; add `environment`, `secrets` to `Job` |
| Find a secret read inside `${{ }}` | same file, `expressions()` (quote-aware) | reuse as-is, with a narrow `RELEASE_PLEASE_APP_` match |
| The set of jobs that mint the App token, by name | same file, `MINTS` (six entries = the six readers above) and `mintFindings` | reuse: the environment set is derived from `MINTS`, no second list |
| Mutation-test pattern | same file, `mutated`, `unset`, `step`, `test.each` "finds %s" | reuse as-is |
| Environment pins | `behavior-gating.test.ts` token-list describe (`["sign"]`), `publish-packages.test.ts:35` (`npm-publish`) | adapt the token-list assertion: it fails once `publish-pr` enters `release-app` |
| Pin of the callers' `secrets:` or the callee's `on.workflow_call.secrets` | none (searched `secrets:`, `inherit`, `workflow_call` under `scripts/`) | build new, in the finding function |
| Scripts that read `environment` or `secrets` from YAML | none (searched `environment`, `secrets` under `scripts/**`) | none affected |

## Documents that say where the secrets live or who reads them

- `.claude/skills/release/SKILL.md:44`: "… `RELEASE_PLEASE_APP_ID` + `RELEASE_PLEASE_APP_PRIVATE_KEY` repo secrets wired." (wrong after the move)
- `CI.md:116`: "… using the `RELEASE_PLEASE_APP_ID` + `RELEASE_PLEASE_APP_PRIVATE_KEY` secrets." (silent on where)
- `CI.md:150`: "`publish-pr` mints the release App token (contents and pull-requests write) …"
- `SECURITY.md:578` (Tags) and `SECURITY.md:582` ("Every App token names its permission set …").
- Searched with no hit: `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `BEFORE-LAUNCH.md`, `.github/WORKFLOWS.md`, every other `SKILL.md`.

## GitHub behaviour the design rests on (docs, read 2026-10-21)

- Reuse workflows: "To use an environment secret in a reusable workflow, set `environment` on the job in the reusable workflow." "The job that calls the reusable workflow can't use the `environment` keyword." "The caller workflow must still pass the secret. Use `secrets: inherit` or pass the secret by name." "If the caller workflow doesn't pass an environment secret, the secret resolves to an empty string in the reusable workflow. The workflow run doesn't show an error." With `secrets: inherit`, the called workflow may reference secrets its `on` key does not declare.
- Deployments and environments: "The deployment branch or tag rule is matched against the `GITHUB_REF` of the workflow run." Branch and tag rules are separate. A `workflow_call` run's `GITHUB_REF` is the caller's.
- Workflow syntax and control-deployments: `environment: { name, deployment: false }` uses an environment's secrets without a deployment object; restricting secrets by branch policy without deployment tracking is a listed use. Environment names are case-blind.
- GitHub changelog 2025-11-07, effective 2025-12-08: environment rules for `pull_request` runs evaluate `refs/pull/<n>/merge`; `pull_request_target` takes its workflow and ref from the default branch.
- `actionlint` 1.7.12 (the local `lint:actions`) accepts `secrets: inherit` with no `on.workflow_call.secrets`, and still refuses a by-name secret the callee does not declare (probed on a scratch copy).

## Open work

- #21 (open): tag rule and immutable releases; its tag rule rests on this key. This lane refers to it and does not close it.
- Closed known limits searched (`release App secret`, `release App key environment`): none. #385 names the release App's key as one way onto `dev`.
