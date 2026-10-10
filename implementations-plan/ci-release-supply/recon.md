# Recon: ci-release-supply

Read against `origin/dev` at ac259a7 (#238 merged as 8099368, #240 and #245 after it). Three read-only Explore agents (sonnet): one batched reuse sweep, one workflow mapper, one release and scripts mapper. The parent verified every issue claim below against the tree and against the registry where a claim depends on a published package.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Parse a workflow in a test | `Bun.YAML.parse(readFileSync(...))`, re-declared per file (`aggregators.test.ts:29`, `behavior-gating.test.ts:47`, `release-integrity.test.ts:24`); no shared helper, no `yaml` dependency | reuse the pattern; add no YAML library |
| Run an aggregator script in a test | `aggregators.test.ts`: `aggregator(file)` (:43, one step, env bindings only), `exitCode(agg, world)` (:70, substitutes `${{ }}` from a world map and runs `bash -e`), `labels(label)` (:342, the `LABEL_HIT` world key) | adapt: the world key for labels moves to the `changes` output; a `gh` shim on `PATH` if an aggregator calls the API |
| Lift the decide gate as text | `decide-gate.test.ts:44` (`gateScript` lifts from `if [ "$EVENT" = "workflow_dispatch" ]` to `fi`) | reuse as-is; keep the opener |
| Read a PR's live head and labels | `scripts/ci-cd/preview-comment.ts:96` (`liveHeadSha`, `gh api repos/{repo}/pulls/{n} --jq .head.sha`); no label reader | adapt the `gh api pulls/{n}` call inline in the `changes` job |
| Cancel a run by API | none (`grep -rn "/cancel"` over `scripts`, `.github`: only `cancel-in-progress`) | build new, inline `gh api -X POST` |
| List a run's jobs and conclusions | `scripts/ci-cd/verify-cert-run.sh:86,110` (`actions/runs?head_sha=`, `runs/$ID/jobs --paginate --slurp`, reads `run_attempt`, `conclusion`) | adapt, after the probe settles `filter=latest` against `filter=all` |
| Download a release asset, check SHASUMS and attestation | `scripts/release/attach-assets.ts:89` (`parseShasums`), `attach-assets-run.ts` (`fetchVerified` :137, `checkShasums` :150, `verifyAttestation` via `gh attestation verify --signer-workflow ... --source-digest ... --deny-self-hosted-runners`, `runVerifyPublished` :152) | reuse as-is for the attested side of the store comparison |
| Read zip entries | `publish-chrome-store-run.ts:49-53,256-265` (`ZipReader`, `unzip -p`), `publish-firefox-amo-run.ts:298-311` (`unzip -Z1`, `unzip -p`); Bun.Archive reads tar only | adapt: one shared reader, since the store comparison would be its third copy |
| Escape workflow commands | `scripts/release/workflow-command.ts` (`command`, `plain`) | reuse as-is |
| Stable or prerelease from a tag | `scripts/release/resolve-tag.ts` (`isPrerelease = version.includes("-")`) | reuse the rule |
| Detect the legal placeholder | `packages/legal/src/document.ts:2,26` (`PLACEHOLDER = "«FILL"`, `hasPlaceholders`) | reuse as-is from a test inside `packages/legal` |
| Assert the plans ignore lines | `scripts/ci-cd/plans/lib.ts:66` (`CANONICAL_PATTERNS`), `structure.ts:74` (`gitignoreFindings`), `fixture-repo.ts:69` (`CANONICAL_GITIGNORE`) | reuse; extend the list |
| Release-script layout | pure `X.ts` + IO-injected `X-run.ts` with `realIO`, `import.meta.main`, recording fake IO in tests; `test:release` = `bun test scripts/release/ scripts/publish/` | reuse the convention for the store comparison and the nightly prune |
| Planted-sample guard tests | `no-local-paths.test.ts` (real-tree control, temp repo, planted parts, clean rewrite), `workflow-refs.test.ts` | reuse the shape |
| Storybook build in CI | `apps/extension/package.json:29` `build-storybook`; no workflow, script or cache runs it (`grep -rn -i storybook .github scripts`) | build new job in `pr-quick.yml` |
| Hoist control | none in `bunfig.toml`; Bun 1.4.2 documents `install.hoist` (`bun-types` `docs/runtime/bunfig.mdx:702-706`: `hoist = false` skips `node_modules/.bun/node_modules`; isolated linker only) | build new (one key) |
| Code that reads `.bun/node_modules` | none outside `node_modules` (`grep -rn "\.bun/node_modules"` over `*.ts`, `*.sh`, `*.yml`, `*.json`) | nothing to adapt |

## Issue claims against the tree

| Issue | Claim | Verdict |
|---|---|---|
| #166 | No workflow runs `build-storybook` | holds. 34 story files; `.storybook/main.ts` sets no `disableTelemetry` |
| #167 | Lanes decide from the event's labels; an older push's first attempt can cancel the current head's run | holds. `LABEL_HIT` reads `github.event.pull_request.labels` (smoke :107, network :113, both Firefox twins); the group key is per PR (`...-${{ github.event.pull_request.number \|\| github.ref }}`) with no head SHA, and `cancel-in-progress` is true on any `synchronize` at attempt 1. `pull-requests: read` is granted (Chrome lanes at workflow level, Firefox lanes on `changes`) |
| #168 | One `needs.<job>.result` folds all shards; a single-shard re-run may fold to success (unverified) | holds as described; a GitHub community thread (discussion 26822, 2025-02-26) reports the same fold after a single matrix-job re-run, with no GitHub reply. Not reproduced here. The same fold gates `release.yml` `attach-assets` (`needs.network-e2e.result`, :465) and `nightly.yml` `publish-nightly` (:511). "Repoint CI.md:45 off follow-ups.md": already done, CI.md:45 cites #168 |
| #82 | 1.2.0 is past the age gate; no coupling holds the pin | the age part holds (1.2.0 published 2026-09-25T21:39Z, 14 days). It is **not** a silent bump: 1.2.0 changes `STRINGS["permission-blocked"].title` from "Your browser blocked local access" to "Your browser blocked this site from reaching Presto", and `presto-ui-state.ts:92` shows that title on the onboarding Presto step. Every other `STRINGS` entry Nulo reads is unchanged, the card's `offline` markup is unchanged, and the extension CSP already allows inline styles (`manifest.config.ts:59`), so no hash moves. Licence stays MIT; no dependencies |
| #172 | `bunfig.toml` has no hoist setting | holds |
| #176 | `docker-ci-like.sh` downloads Bun and Node unchecked | **does not hold**: closed by #238. Both archives are SHA-256 pinned (`docker-ci-like.pins.sha256`), and `docker-ci-like-pins.test.ts` ties the Bun pin to `packageManager` |
| #179 | Nothing compares a store copy with the attested zip | holds. The store scripts call only the upload and status APIs |
| #183 | No release step refuses a stable publish while «FILL» survives | holds, with two traps: `legal/terms.md` carries «FILL» twice today (:3, :578) while every 0.x stable release ships, and `legal/README.md` carries it in prose (:16, :22), so BEFORE-LAUNCH §3's `git grep -n "«FILL" -- legal/` can never print nothing |
| #185 | Retired gotchas lack an owning doc | mostly done by #238 (issue comment, 2026-10-09). Left: CLAUDE.md's release-runbook lines on wrangler `routes` and on domain changes. `apps/landing/wrangler.jsonc:11-15` already states the `routes` rule as a comment |
| #193 | No guard refuses reviewer, audit-round or plan-phase names in comments | **does not hold**: closed by #238 (`scripts/ci-cd/workflow-refs.test.ts`, deny patterns with planted samples and a clean control; a bare `phase N` passes, so live runtime vocabulary needs no exemption list) |
| #182 | The ignore file catches four transcript shapes | holds. Triage settled the decision: add `draft-*.md`, `outline-*.md`, `leg-*.md`, `eli5-*.html` and assert them in `check:plans`. No tracked file matches any of the four |
| #178 | Nightly tags and releases accumulate | holds. The newest nightly (2026-10-09) is listed as a draft (`untagged-…`), so a prune must handle drafts |

## Conventions to match

- Workflow edits ship with their pins in the same commit: `behavior-gating.test.ts` (concurrency :158-179, Firefox `on`/`decide`/permissions equality :294-358, shard matrices :444-470), `aggregators.test.ts` (one-step aggregators, `needs` equals every other job :244-257), `decide-gate.test.ts`, `release-integrity.test.ts` (mutation tests on `release.yml`).
- Aggregators check out nothing and run one step (ci-gates D1, D5; `aggregators.test.ts:43-56`).
- `quality-status` binds every result through `env:` and an `expect` line (`pr-quick.yml:54-92,345-392`).
- New scripts: `bun:test`, `parseArgs`, `realIO` + fake IO, `command()` for workflow commands.

## Collisions

- **e2e-harness-gaps.** Arc 1a (#169, gate G1) edits no workflow and nothing under `scripts/ci-cd` (its file map and branch diff touch `apps/extension/scripts/e2e`, `tests/e2e`, the e2e skill). Its arc 3 may move a network file into the heavy-concurrent job, which edits both PR network lanes, `nightly.yml`, `release.yml` and `behavior-gating.test.ts`; its arc 4 runs `build-storybook` locally. Either lane's later PR rebases on the other; no semantic overlap.
- **send-queue-activity arc 4** waits on this lane's `nightly.yml` edits (lane map).
- **Open PR #246** (backup-import-export) touches no file here.
- **Out of repo.** The blueprint skill (aa-skills) lists the plans ignore patterns too (`SKILL.md` Phase 0.75 step 3b); widening the repo list leaves the skill one step behind. Flagged to the orchestrator, not edited.
