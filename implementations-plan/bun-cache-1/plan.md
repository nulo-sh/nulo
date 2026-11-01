---
plan: bun-cache-1
tier: light
status: plan approved (final fresh Codex pass: approve); arc 1 next
issues: none (closes nothing)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 4c6e0aea3
trunk: dev
post_implementation_hardening: not scheduled
---

# bun-cache-1: credentialed jobs and release builds set up Bun without the shared cache

`oven-sh/setup-bun` keeps the Bun binary in the shared Actions cache unless a step passes `no-cache: true`. The `setup-bun` composite's `cache: "false"` skips only the install cache. This plan makes `cache: "false"` skip both, gives every inline setup step of a credentialed job `no-cache: true`, and adds a test over the workflow files that refuses a credentialed job whose Bun setup can take the shared cache. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom**: the maintainer who cuts a release, runs a store check or lets release-please write the lockfile; the contributor who later adds a job that holds a credential.
- **Excellent**: (1) a test over the workflow files proves that every job holding a credential, and every build of release bytes, sets up Bun with the shared cache off, and one observed run per form (the composite with `cache: "false"`, an inline step) logs `Downloading a new version of Bun`; (2) a new credentialed job whose Bun setup can take the shared cache fails `test:ci-gating` with a message that names the job.
- **Good enough**: jobs with no credential (the PR lanes, the e2e suites) keep both caches. Each changed job pays one Bun download, a few seconds.

## Assumptions

**Facts**
- F1. setup-bun v2.2.0 (`0c5077e5`, the repo's pin) takes `no-cache`; upstream `src/action.ts` `isCacheEnabled` returns false when it is set, so the step neither restores the binary nor, in its post step (`src/cache-save.ts`), saves it. It reads the input with `getBooleanInput`, which takes `"true"` and `"false"`.
- F2. The composite's `cache` input gates only `actions/cache` (`.github/actions/setup-bun/action.yml:38-39`, `if: inputs.cache == 'true'`); its setup step (`:32-36`) passes no `no-cache`.
- F3. Six inline steps in credentialed jobs pass no `no-cache`: `store-check.yml#chrome` (`:49`), `#firefox` (`:85`), `release.yml#publish-chrome-store` (`:762`), `#publish-firefox-amo` (`:833`), `_release-pr-lockfile.yml#lock-version` (`:41`), `pr-quick.yml#preview-comment` (`:307`). `publish-packages.yml#pack` passes it (`:95-99`), pinned by `scripts/ci-cd/publish-packages.test.ts:65`.
- F4. Release bytes come from `_build-extension.yml:68-70` (`cache: ${{ github.event_name == 'pull_request' }}`), pinned by `scripts/ci-cd/behavior-gating.test.ts:1674-1678`. That file's audit (`:1680-1695`) requires `cache: "false"` from the composite steps of any job with a write scope or an App mint, and reads no stored secret.
- F5. `scripts/ci-cd/release-integrity.test.ts` holds `privileged()` (`:97-103`), `writes()` (`:419`), `jobs()` (`:55`), the sibling `setupBunTokenFindings` (`:268`) and the mutation helpers (`:669-683`).
- F6. P94-18 = A (owner, 2026-11-01): "the inline steps take it from there too and pass no token"; ci-dedup-1 read it as keeping them inline (`archive/ci-dedup-1/plan.md:38,75`). `preview-comment` must stay inline anyway: its sparse checkout holds no `.github/actions/` (`pr-quick.yml:296-306`).
- F7. A change under `.github/actions/setup-bun/**` trips all four e2e lanes' filters, and `pr-quick.yml`'s `workflows` filter takes `.github/workflows/**` and `.github/actions/**` (`:119-121`), so the PR runs all five required checks.

**Inferences**
- I1. A hosted runner starts with no `~/.bun/bin/bun`, and no credentialed job installs Bun before its setup step, so with `no-cache` setup-bun downloads: its branch that reuses a matching binary already on the runner does not fire. The `Downloading a new version of Bun` line proves it per run (D7).
- I2. No exact pin on a setup step's `with:` block breaks when `no-cache` is added (recon §2 searched `scripts/ci-cd/` only).

**Asks**: none for the owner: nothing a person sees changes. Lane-brief claims that did not hold: the brief's job list omits `pr-quick.yml#preview-comment`, which holds `pull-requests: write`, so its own rule ("a job holding a write permission") takes it in (D3); `release-integrity.test.ts` audits these jobs only through `THIRD_PARTY`, whose lists do not change.

## Architecture & Implementation

- **Composite**: the setup step gains `no-cache: ${{ inputs.cache != 'true' }}`, the exact complement of the install-cache step's `if`, so one input decides both caches. The `cache` input's description says it covers the binary too.
- **Six inline steps** gain `no-cache: true` (F3). No other workflow line changes; the pinned SHA stays.
- **One rule, one finding function**: `sharedCacheFindings(tree)` in `release-integrity.test.ts`, beside `setupBunTokenFindings` in the "Bun's setup" describe.
  - A generator `runs(tree, file)` yields every job that runs steps with the permissions it runs with, `job.permissions ?? wf.permissions ?? <its caller's>`, recursing through local reusable workflows (`_extension-network-e2e-lane.yml` nests two deep), each named `<caller file>#<job> → <file>#<job>`.
  - A job is credentialed when `privileged(job, wf) || writes(permissions)`: a write scope (its own or a caller's), an App mint, or a stored secret read.
  - Its steps are `expanded(tree, job)`, so a setup step inside another local composite is seen. A finding is an `oven-sh/setup-bun@` step without `no-cache: true` other than the composite's own step, or a setup-bun composite step without `cache: "false"`: `<where>: may restore Bun from the shared cache`. The composite's own step is the boundary its caller's `cache` input crosses, pinned below.
  - The prototype over the real tree returns exactly the six F3 jobs (and the lockfile job again under each caller), and catches a write scope granted to `nightly.yml#unit-tests` or two levels up in `pr-extension-network-e2e.yml`.
- **Composite pin**: `behavior-gating.test.ts`'s "the composite restores it only when asked" also pins the setup step's `no-cache` to `${{ inputs.cache != 'true' }}`. That pin and F4's build pin prove the release bytes; `sharedCacheFindings` proves the credentialed jobs. behavior-gating's write audit (`:1680-1695`) stays unchanged: it is the install cache's rule, and both rules read the one `cache` input (D2).
- **Docs**: `.github/WORKFLOWS.md:52` and `CI.md:263` (the composite rows: `cache: "false"` skips both caches); `SECURITY.md:739` gains one sentence over every job that holds a credential, inline ones included, naming the test.
- **File map**: `.github/actions/setup-bun/action.yml`; `.github/workflows/{store-check,release,_release-pr-lockfile,pr-quick}.yml`; `scripts/ci-cd/{release-integrity,behavior-gating}.test.ts`; `.github/WORKFLOWS.md`, `CI.md`, `SECURITY.md`. Nothing added or deleted.
- **Not taken**: see the decision ledger.

## UI impact

None: CI workflows, one composite action, two tests and docs. No extension, landing or playground source changes.

## Security & Adversarial Considerations

- **Invariant**: the release bytes and every credentialed job on `main` run a Bun binary fetched for that run, not one restored from the shared cache.
- **Threat model**: a job that holds a write scope, an OIDC token, an App token or a stored secret runs whatever binary its setup step installs. After the change such a job takes the binary from the Bun release URL through the pinned action, as the Firefox reviewer's build does (`apps/extension/store/SOURCE-BUILD.md`), and saves nothing back.
- **Least privilege**: no permission, environment or secret changes. The setup steps keep `token: ""`.
- **Supply chain**: the download trusts the pinned `oven-sh/setup-bun` and the GitHub release asset, as before; a compromised setup action stays an accepted residual (`SECURITY.md:739`). No dependency, lockfile or age-gate change.
- **Precondition, stated**: "fetched for that run" holds on a fresh hosted runner where nothing installs Bun before setup (I1); setup-bun would otherwise reuse a matching `~/.bun/bin/bun`, which comes from the runner image, never from the shared cache (D7).
- **Residuals, stated**: jobs with no credential keep the binary cache (no credential, no shipped bytes), and `source-rebuild.yml`'s two rebuilds do too (D4).

## Phase 1: one rule over both caches (arc 1)

**Assumptions**: F1-F7, I1, I2.

1. Write the test first. Add `sharedCacheFindings` with its cases (step 2) and the composite pin. Run `bun test scripts/ci-cd/release-integrity.test.ts scripts/ci-cd/behavior-gating.test.ts`. Expect red: the success control lists exactly the six F3 jobs, and the composite pin fails. Log the output in `lessons/phase-1.md`.
2. Cases in "Bun's setup": the real tree yields `[]` (with step 1's red listing exactly the six jobs, the success control). On mutated copies, the exact finding for (a) `store-check.yml#firefox` without `no-cache` (a stored secret, inline); (b) `publish-token-list.yml#sign` with its `cache` line removed (a stored secret only, composite default); (c) `pr-quick.yml#preview-comment` without `no-cache` (a write scope `privileged` does not count); (d) `contents: write` on `nightly.yml#unit-tests` (a caller's grant reaching `_unit-tests.yml`, which declares none); (e) store-check Chrome's setup moved into a new local composite without `no-cache` (a nested step).
3. Change the composite and the six inline steps. Rerun step 1: green.
4. Update the three docs.

**Validation gate**
- Commands: `bun run lint:actions`, `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test`, `bun run test:all`, `bun run check:plans` after staging: each exits 0. `bun test` retries nothing, so each run is retry 0.
- `bun run test:release` locally: at the base this host fails 7 tests, every one in `zip-read` or `zip-reproducible`, because the host has no `zip` binary. The local run passes when it fails exactly those 7; any other red is fixed. CI's `quality-status`, which runs `test:release` on a runner with `zip`, must be green.
- Runner proof: push the branch. Run `gh workflow run pr-quick.yml --ref worktree-bun-cache-1` and `gh workflow run source-rebuild.yml --ref worktree-bun-cache-1` (empty `tag`). Both runs end green. In `pr-quick`, the setup step of `build-chrome` and `build-firefox` (`cache: "false"` off a pull request) logs `Downloading a new version of Bun` and no `Using a cached version of Bun`; `changes` and `preview-comment` skip their setup on a dispatch. In `source-rebuild`, `reference-build` logs the download line. A `cache: "true"` job (`lint-and-typecheck`) may log either a cache hit or a download. Record the run ids in `lessons/phase-1.md` and the PR body.
- The PR's own run: `preview-comment`'s inline setup logs the download line (the inline form). The PR's five required checks end green.
- Layers: lint, typecheck, unit (`scripts/ci-cd`), CI on runners.

## Decision ledger

- D1. `!= 'true'` over the brief's `== 'false'`: both agree on the two values in use; `!= 'true'` is the complement of the install cache's `if`, so a mistyped value drops both caches instead of one.
- D2. The rule lives in `release-integrity.test.ts`: its `privileged()` reads stored secrets per `${{ }}` span; behavior-gating's `holdsWrite` reads none, and a whole-text `secrets` regex there matched a run script's text in `_extension-network-e2e.yml` (recon). behavior-gating gains only the composite pin, beside the `if` it complements; its write audit stays as the install cache's rule, out of this lane's scope. The two overlap on composite steps by design: one input carries both caches.
- D3. `preview-comment` is in: it holds `pull-requests: write`, which `writes()` counts. One input line; leaving it out would need a written exception.
- D4. `source-rebuild.yml`'s rebuilds stay out: no credential, no shipped bytes, and the lane's scope is credentialed jobs. A universal "every inline step passes `no-cache`" rule was considered; it would change two jobs outside that scope for no credential.
- D5. No shared workflow-scan module: one rule in one file needs none.
- D6. Not routing the inline steps through the composite: P94-18 = A keeps them inline (F6).
- D7. No absence check before each setup step (Codex R1 #2): it would add a step to six jobs for a binary that can only come from the runner image, which every step of the job already trusts; the download line per run is the proof. Accepted instead: the precondition is stated (I1, Security).
- D8. Both dispatches stay (Opus R1 #3 would drop `source-rebuild.yml`'s): the lane brief requires both in the PR body.

## Panel verdicts

- **R1 Codex** (gpt-6.1-sol, high): conditional approve. Accepted: (1) caller permissions and nested composites, demonstrated by mutation (the `runs` generator, `expanded`, cases d and e); (3) the gate's impossible `changes` log, now the builds and the PR's `preview-comment`; (4) the overlap disposition (D2); (5) `test:release` wording. Partly accepted: (2) the existing-binary branch, stated as a precondition (I1); its absence check rejected (D7).
- **R1 Opus** (Plan): conditional approve. Accepted: the same gate and nested-composite findings; the inline-form proof from the PR run and Excellent (1) reworded; case (b) removes the `cache` line, the source-rebuild control folded into the real-tree check; SECURITY.md over every credentialed job; F5, F6, F7 corrected. Rejected: dropping the `source-rebuild` dispatch (D8); "no code" for caller inheritance, since the fix is local and test-only, and Codex demonstrated the miss.
- **Final fresh Codex pass** (gpt-6.1-sol, high, new session): approve. One stale citation (F7's filter lines), fixed. Its in-memory prototype found the six jobs before the change, `[]` after, each of cases (a)-(e), and no false finding on the network lanes, nightly, publish-token-list or release-prerelease; it kept `runs` and D7 (with the precondition stated), D3, D4 and D8.
- Noted, no change: `verify-store-copies.yml#compare` already passes `cache: "false"`, so it now downloads Bun too (no credential).

## Delivery

One arc, one PR, plain `gh pr create` from `worktree-bun-cache-1` to `dev`, opened only after the Codex loop converges; `code_review: off`. Title (Conventional Commit, at most 92 characters): `ci: credentialed jobs and release builds set up bun without the shared cache`. The body says what changed and why, the validation runs with outcomes, the two dispatch run links, and one line: cold installs now download Bun in those jobs; the install cache is unchanged. It closes no issue and names no `Part of`. No label: the filters run every lane (F7). The close-out lands as the PR's final commits.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `4c6e0aea3`. Plan-specific values:

- **Loop**: single arc, once over the net diff from `4c6e0aea3`, after Phase 1 is green. Reviewer: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` per round; hard stop at three rounds. One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- **Delivery**: as above; then `gh pr checks <n> --watch`. Merging is the orchestrator's call.
- **Close-out**: merge `origin/dev` first and read `index.md` and `lessons.md`; then the standard's step 4. `STATUS.md` is deleted.
- **Teardown** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/bun-cache-1/plan.md` succeeds: `agent-worktree done bun-cache-1 --merged`. The session that sees the merge runs it.

## Seeds (not run; orchestrator-owned)

- `/goal` Phase 1 is marked ✓ in implementations-plan/bun-cache-1/plan.md with its gate passing in the transcript; the Codex loop converged (a resumed gpt-6.1-sol pass with no new material finding, quoted); the PR to `dev` exists with both dispatch runs green and the close-out archive commit on it; `bun run test:ci-gating` and `bun run lint:actions` exit 0.
- `/loop 15m` Drive implementations-plan/bun-cache-1 forward per its plan.md: reality-check the plan and lessons, run the next step, its gate, the Codex loop, then delivery and close-out; never merge; stop after three failures on one step.
