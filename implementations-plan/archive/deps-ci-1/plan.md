---
plan: deps-ci-1
tier: light
status: completed
issues: "none; Dependabot alerts 34-37 on .github/actions/setup-aztec/cli/package-lock.json"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 7bde519db
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-31. Planned and delivered as one arc.
- **Status:** completed. The arc and this close-out ship as PR #1421 into `dev`; its merge archives this plan. No issue closes: the PR fixes Dependabot alerts 37, 36 and 35 once on `dev`.
- **Shipped:** `lock.sh`'s template and `cli/package.json` carry `overrides.systeminformation: ^5.33.16`; the lockfile moved by an in-place resolve (`systeminformation` 5.23.8 → 5.33.16, one extraneous `zod` entry pruned); `setup-aztec-pins.test.ts` refuses a locked `systeminformation` below 5.33.16 at any path; one sentence in the `aztec-update` skill.
- **Review loop:** plan: Codex r1 conditional approve, Opus reject (both blocking findings verified, resolved as A1, A2 and D5), Codex r2 conditional approve, r3 approve. Diff: Codex r1 one finding, the Opus review three accepted and one rejected, Codex r2 clean.
- **Gates:** every Phase 1 gate green at `fecee7580` and again after the `dev` merge; the Docker runner proved the install and the CLI (local node ready, twice) but ran no test (#1419); on PR #1421, all five required checks green, both network lanes included.
- **Dropped:** a fresh `lock.sh 6.0.0` re-resolve (D2); narrowing the audit gate's pathspec (D5, a gate change, not this lane's); flagging npm alias entries in the floor test (needs an alias the tree lacks).
- **Known limits:** #1420.
- **Open items:** #1419.
- **Lessons:** none promoted. The gate's enforce trigger is CLAUDE.md § Dependency policy, the runner gap is #1419, and `lessons.md` is at its budget.
- **Seeds retired:** the `/goal` and `/loop` below are a record, not an instruction.

# deps-ci-1: systeminformation past its advisories in setup-aztec's npm lockfile

The `setup-aztec` composite action installs the Aztec CLI on CI runners from `.github/actions/setup-aztec/cli/package-lock.json`. Dependabot reports four alerts there: three on `systeminformation` 5.23.8 (37 high, 36 low, 35 medium) and one on `deepmerge` 4.3.1 (34 low, no fixed release). This plan forces `systeminformation` to ≥ 5.33.16 with one npm override and records `deepmerge` as a known limit. Recon: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom**: the owner reading the Security tab, and the maintainer who runs `lock.sh` at the next Aztec bump.
- **Excellent**: (1) the CLI's installed tree differs from today's in `systeminformation` alone, and every network e2e lane still boots its sandbox; (2) the next `lock.sh` run keeps the fix without anyone remembering it, and a test fails if a vulnerable `systeminformation` is ever locked again.
- **Good enough**: `deepmerge` stays at 4.3.1 as a recorded known limit; the extension's own `systeminformation` (Aztec's transitive in `bun.lock`) is untouched.

## Findings (paths verified at `7bde519db`)

| Alert | Path | Label |
|---|---|---|
| 35, 36 | `@aztec-labs/telemetry-client` → `@opentelemetry/host-metrics` 0.36.2 → `systeminformation` exactly `5.23.8`. host-metrics calls `networkStats()` with no argument (`build/src/stats/si.js:22-26`), so no caller-chosen interface name reaches it. The traversal (36) needs an attacker-chosen `iface` argument plus a planted file tree. The pollution (35) needs an untrusted `ifaces` argument on FreeBSD, OpenBSD or NetBSD (the advisory's own statement). | needs conditions CI does not have |
| 37 | Windows-only `services()`; never called, runners are Linux x86_64 (`install.sh:22`). | needs conditions CI does not have |
| 34 | `deepmerge` is required only by `jest-config`, which only `jest`/`jest-cli`/`@jest/core` load; nothing in the CLI or the sandbox runs jest (recon § Chains). No fixed release, no later major. | needs conditions CI does not have |

All four are known limits by reach, and no exploit path is shown. Fixing 35-37 is scoped dependency maintenance the orchestrator authorized, not a security fix: one override, one installed package changed (recon, experiment 3). Dismissal under the 2026-10-28 rule is the consistent alternative (D1).

## Assumptions

- **Facts**:
  - F1: the chains, the single `networkStats()` use and the deepmerge loaders are in recon § Chains.
  - F2: an in-place `npm install --package-lock-only` with the override and lock.sh's environment locks `systeminformation` 5.33.16. It also drops one `extraneous` top-level `zod` entry that `npm ci` never installs. The age gate skipped 5.33.17–5.33.19 (recon, experiments 1 and 3).
  - F3: `npm ci` refuses the new lockfile beside a `cli/package.json` without the override (recon, experiment 4).
  - F4: `lock.sh` writes `cli/package.json` from a heredoc (`:21-30`) and copies it over the committed one (`:43`), so an override that lives only in `cli/package.json` dies at the next bump.
  - F5: `setup-aztec-pins.test.ts:46-47` compares `dependencies` only, so an `overrides` key leaves it green.
  - F6: the extension builds at `7bde519db` (`bun run --cwd apps/extension build:full`) list neither `systeminformation`, `deepmerge`, `@opentelemetry/host-metrics` nor `@aztec-labs/telemetry-client` in `dist/{chrome,firefox}/THIRD-PARTY-NOTICES.txt`.
  - F7: `SECURITY.md` § Binary dependencies is the clause that governs this lockfile (recon § Policy clause). Bun's age gate does not reach it; `lock.sh` applies npm's 7-day gate in its place.
  - F8: a PR touching `.github/actions/setup-aztec/**` runs both network e2e lanes (Chrome, Firefox), cold; the smoke lanes skip (recon § Reuse map).
  - F9: `cli/package.json` matches the audit gate's `:(glob)**/package.json` (`scripts/ci-cd/audit-gate.ts:198`, `pr-quick.yml` `deps`), and `"overrides"` lines are not version lines. So the PR's `quality-status` runs `bun audit` over `bun.lock` in enforce mode. At `7bde519db` that run reports 12 unacknowledged advisories (follow-redirects, glob, minimatch, qs, systeminformation ×3, undici ×5). Open PR #1414 (lane dapp-1) acknowledges 11 and moves `qs` 6.16.0 → 6.16.1, which clears all 12.
- **Inferences**:
  - I1: Dependabot closes alerts 35-37 by itself once `dev`'s lockfile no longer locks a vulnerable version. If it does not, the owner closes them; the PR body lists them.
  - I2: the sandbox does not start host metrics during e2e (no OTEL collector is set). So e2e proves the install and the CLI, not `networkStats()` under the node; the scratch smoke covered that call on 5.33.16.
- **Asks** (to the orchestrator; none concerns a surface a person sees):
  - A1: the arc's PR merges after #1414. Until `dev` carries #1414's acknowledgements, the PR's audit step stays red (F9, D5). Working assumption: #1414 lands first.
  - A2: on 2026-10-28 the owner dismissed alerts 2, 5, 10, 20 and 26 as `tolerable_risk`. They are the same package (`systeminformation`) at the same 5.23.8 in the same lockfile. The lane brief asks for the override anyway. Working assumption: the brief authorizes this one maintenance action (D1). The standing rule stays as written (`aztec-update` SKILL.md:65): an alert a bump does not fix is dismissed as `tolerable_risk`. Alert 34 follows it; the owner dismisses it by hand, and the lane changes no repository setting.

## Architecture & Implementation

- **Shape**: the override lives where `lock.sh` generates `cli/package.json` (its heredoc). The committed `cli/package.json` is that heredoc's output for 6.0.0, byte for byte. The lockfile moves by an in-place resolve under lock.sh's own settings, not a fresh one (D2).
- **Override**: `"overrides": { "systeminformation": "^5.33.16" }`. A range: a later fresh resolve may take any newer 5.x release, minor or patch, that the gate allows. One comment above the heredoc says why and when to drop it; it is the condition's one home, and the skill points there.
- **Test** (`LockEntry` gains `version?`): one floor assertion in `setup-aztec-pins.test.ts`'s "the CLI's npm tree": every lock path ending in `node_modules/systeminformation` (nested copies too) satisfies `>=5.33.16` (`Bun.semver.satisfies`), plus a refused copy that locks 5.23.8 at a nested path. The floor holds the invariant whatever carries it, so dropping the override later needs no test edit.
- **Alternatives not taken**: an override kept only in `cli/package.json` (F4, lost at the next bump); `lock.sh` reading overrides back from the committed `cli/package.json` (D3); a full `lock.sh 6.0.0` re-resolve (D2); extending `audit-gate.ts` to this lockfile (#1278 chose dismissal).

## Phases

### Phase 1 — the override, the lockfile, the floor test ✓

Assumptions: F2–F5, F7. Change map:
- `.github/actions/setup-aztec/lock.sh`: add the `overrides` block to the heredoc, with a one-sentence comment above it. The comment says host-metrics pins `systeminformation` 5.23.8 exactly, below the `networkStats()` fixes. It also says to drop the key once a fresh resolve without it locks ≥ 5.33.16, or locks no `systeminformation` at all.
- `.github/actions/setup-aztec/cli/package.json`: the heredoc's output for `VERSION=6.0.0`.
- `.github/actions/setup-aztec/cli/package-lock.json`: from `.github/actions/setup-aztec/cli`, run `npm_config_registry=https://registry.npmjs.org/ npm_config_min_release_age=7 npm_config_min_release_age_exclude=$'@aztec-labs/*\n\n@aztec-foundation/*' npm install --package-lock-only --ignore-scripts --no-audit --no-fund` (npm ≥ 11.17.0). Then delete any `node_modules/` it leaves there.
- `scripts/ci-cd/setup-aztec-pins.test.ts`: the floor test and its refused copy.
- `.claude/skills/aztec-update/SKILL.md` § the CLI's npm lockfile (line 65): one sentence saying `lock.sh` carries an override, and that the bump re-checks its removal condition in lock.sh's comment.

Validation gate:
- `sed -n '/<<JSON$/,/^JSON$/p' .github/actions/setup-aztec/lock.sh | sed '1d;$d' | sed 's/\$VERSION/6.0.0/g' | diff - .github/actions/setup-aztec/cli/package.json` prints nothing.
- A keyed compare of `jq -r '.packages | to_entries[] | "\(.key) \(.value.version) \(.value.integrity)"'` between `7bde519db` and the new lock differs in exactly two keys: `node_modules/systeminformation` (5.33.16) and the removed extraneous `node_modules/zod`. Read the lockfile diff whole.
- A scratch `npm ci --ignore-scripts` of the new pair under `~/.cache/nulo-backlog/deps-ci-1/` exits 0. A walk of every installed `package.json` (recon, experiment 3) differs from the base pair's install in `systeminformation` alone.
- `bun scripts/ci-cd/audit-gate.ts mode --base $(git rev-parse 7bde519db) --head $(git rev-parse HEAD)` prints `audit mode: enforce (…)` (F9); read the mode, since the command exits 0 for either mode.
- `bun run lint`, `bun run lint:actions`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating` and `bun run test:release` exit 0 (bun test runs at retry 0). The new floor test is green and its refused copy fails the floor.
- Layers: lint, typecheck, unit.

### Phase 2 — the install proof in the Docker CI-like runner ✓ (install half; e2e half falls back to the PR's lanes)

Assumptions: F8. Warning: the runner mounts its tree read-write as root and runs `bun install` there. So never mount the worktree; use an export. Steps:
1. Export the Phase 1 commit: `mkdir -p <export>`, then `git archive HEAD | tar -x -C <export>`, where `<export>` is `~/.cache/nulo-backlog/deps-ci-1/docker-src`.
2. Start it detached, as `docker-ci-like.sh`'s usage header (`:6-13`) runs it, with three changes: `-d --name deps-ci-1-e2e` in place of `--rm -it`; `-v <export>:/work`; and lane-owned volumes `nulo-bun-cache-deps-ci-1` and `nulo-aztec-deps-ci-1` in place of the shared two. The container command is `./apps/extension/scripts/e2e/docker-ci-like.sh tests/e2e/network/connect-dapp.test.ts && jq -r .version "$HOME/.aztec/current/node_modules/systeminformation/package.json" && PATH=/opt/docker-ci-like/node/bin:$PATH "$HOME/.aztec/current/node_modules/.bin/aztec" --version`, in single quotes so the container's shell expands it. The runner's `PATH` exports die with its process, so the probe names its own. The lane-owned volumes keep any other run's stamp check from deleting this install.
3. Poll `docker wait deps-ci-1-e2e` in bounded calls; its printed number is the container's exit code. Save `docker logs` to the scratch directory.
4. Clean up only this run's resources, also after a failure. Run `docker rm -f deps-ci-1-e2e` and `docker volume rm` for both lane volumes. Hand the export back with a root `chown` container, then delete it.

Validation gate: the container exits 0; its log shows the reinstall line, the test file passing, `5.33.16` and the CLI's version. If the runner cannot host the run for a cause outside this change (registry, apt, host), record it in `lessons/phase-2.md`, and the PR's two network lanes are the proof. Layers: e2e-live-network (local).

## Security & Adversarial Considerations

- **Threat model**: the tree runs only on CI runners and the local runner, on runner-local input. An attacker who can publish to npm is the real surface. A later resolve may admit any `^5.33.16` release older than 7 days; the lockfile's sha512 then authenticates those bytes, and `--ignore-scripts` does not stop code the CLI imports. The existing rule holds: each regeneration's lockfile diff is reviewed (SECURITY.md § Binary dependencies). No new machinery.
- **Least privilege**: no workflow, permission or token changes.
- **Supply chain**: the resolve runs under lock.sh's settings (gate 7 days, Aztec scopes exempt, registry named). `npm ci --ignore-scripts` and the sha512 test stay. The floor test turns a dropped override into a red PR instead of a new alert.
- **Cryptography / input validation / domain risks**: N/A. Nothing ships in the extension (F6), and no trust boundary moves.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Fix 35-37 although none is reachable on CI | fix, as scoped maintenance | the orchestrator scoped it; one installed package changes. Codex: strict Proportion favours dismissal, the bounded override is defensible as maintenance with no exploit claimed |
| D2 | In-place resolve or a fresh `lock.sh 6.0.0` | in-place | fresh moves 41 packages, among them `lmdb`'s native bindings and three `@babel` downgrades; the brief asks for the smallest equivalent |
| D3 | The override's home | the heredoc in `lock.sh` | the one generator stays the one source; reading overrides back adds a JSON transform for one key |
| D4 | `deepmerge` | known limit, closed `known-limit` issue filed before the PR opens | no fixed release or major; overriding to another package swaps its API (a monkey-patch); `--omit=peer` would also drop OpenTelemetry's peer `@opentelemetry/api` (Opus) |
| D5 | The PR's audit step enforces over `bun.lock` (F9) | wait for #1414; add no acknowledgement here | duplicating #1414's entries makes a twin and a merge conflict. Narrowing the gate's pathspec to the Bun workspaces would be the precise scope (this manifest cannot change `bun.lock`), but it is a gate change: not this lane's |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): `conditional approve`. Accepted all five: the Docker probe ran `aztec` outside the runner's `PATH`; `git diff --stat` cannot prove a one-package change (keyed compare instead); the reachability rows misstated the advisories' preconditions; `^5.33.16` admits minors; D1 is maintenance, not a security fix. Agreed with D2–D4 and the floor test (check nested paths).
- **Opus Plan leg**: `reject`, two blocking. (1) The audit gate enforces on this PR, and `dev` carries 12 unacknowledged `bun.lock` advisories: verified (F9); resolved by A1/D5, with #1414 clearing them. (2) The owner's 2026-10-28 dismissals of the same package: verified; recorded as A2. Also accepted: F4's lines, one home for the removal condition, `LockEntry.version`, the quoted lockfile hunk, `audit-gate.ts mode` in the gate, the bump in deepmerge's reopening condition. Agreed with D2–D4 and the floor test.
- **Codex r2** (resumed): `conditional approve`. D5 right (leave the gate; a narrower pathspec is a separate policy change). Open the PR blocked on #1414; a dev merge and push is needed after it lands, since `pr-quick.yml` checks out the head. Keep the standing dismissal rule verbatim in A2. `audit-gate.ts mode` prints `audit mode: …`. All applied.
- **Codex r3** (resumed, verify only): `approve`. The conditions are met; no regression.

## Implementation record

- Phase 1 (`fecee7580`): every gate passed. The keyed compare showed exactly the two keys. The `npm ci` walk differed in `systeminformation` alone; its sha512 matches `npm view`. The floor test reds on the base lockfile.
- Phase 2 (deviation, `lessons/phase-2.md`): the runner installed the new tree and the CLI booted the local node, twice. The e2e file never ran. Run 1 lacked `ipv4first`; run 2's container had no Chrome. Filed as #1419; the PR's two network lanes are the e2e proof, per the fallback.
- Fix loop: Codex r1 `findings` (1): the presence assertion contradicted the removal condition; deleted. Opus diff review (beside r1): the refused copy covered only a nested path, so dropping the top-level match passed every test (demonstrated by mutation). Now a `test.each` over both paths at 5.33.15. The lock.sh comment names the floor, not a dated list of fixes. Rejected: flagging npm alias entries (no alias in the tree; needs conditions that do not exist). Codex r2: `clean`.
- Known limit: #1420 (`deepmerge`), filed and closed as not planned.

## Delivery

One arc, one PR, no stack: branch `worktree-deps-ci-1` → `dev`, `gh pr create`, opened ready after the Codex loop converges. Title (90 characters): `chore(ci): bump systeminformation in the setup-aztec action's lockfile past its advisories`. The body says what changed and why. It lists alerts 37, 36 and 35 as fixed, and alert 34 as a known limit (#N) for the owner to dismiss as `tolerable_risk`. It gives the validation runs with outcomes, the Docker run's wall-clock, and the extension notices check (F6). It quotes the lockfile's `systeminformation` hunk, since GitHub collapses the generated lockfile. It names #1414 as the PR that must land first (A1). It has no `Closes` line, because the lane has no issue. Add no label: the path filter runs both network lanes.

The #1414 dependency (A1, D5): open the PR once the Codex loop converges, even if #1414 is still open. Its network lanes are the install proof. Its `quality-status` audit step stays red until then; the body names #1414 as the cause, and nobody reruns it. `pr-quick.yml` checks out the PR's head, so #1414's merge alone does not turn it green. After #1414 merges: `git merge origin/dev`, rerun Phase 1's gate, push, and watch the checks again. Until every required check is green, the report is blocked on #1414, never done.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `7bde519db`. Specific to this plan:

1. Step 1 (diff review) is absent: `code_review: off`.
2. The review loop runs once over the whole diff from `7bde519db`, after Phase 2. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` on the same session. Stop when no material finding is new; hard stop after three rounds, then report. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
3. File the `deepmerge` known limit (`gh issue list --state all --search deepmerge` first): label `known-limit`, closed as not planned. The body has the five sections and the reopening condition: a `deepmerge` release that fixes GHSA-gcqx-w48m-w2h4, or code in this tree that loads `deepmerge` outside jest, or merges input an attacker controls; re-checked at the next Aztec bump.
4. Delivery as above; then `gh pr checks <n> --watch` once. A known flake gets one rerun; real breakage gets a fix and the loop again.
5. Close-out, as the PR's final commits, per the standard's step 4. Run it only once every required check is green. The Outcome's `Known limits:` line names the `deepmerge` issue; `Open items:` reads `none`. Delete `STATUS.md`, then `git mv` the plan to `archive/` in its own commit.
6. Teardown after the merge, per the standard's step 5: slug `deps-ci-1`, trunk `dev`.

## Seeds

```
/goal Phases 1 and 2 of implementations-plan/deps-ci-1/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged (a resumed gpt-6.1-sol pass with no new material finding, quoted); the deepmerge known-limit issue filed and closed; the PR to dev open with its body as the Delivery section says; the close-out archive commit shown by `git show --stat`; `bun run test:ci-gating` and `bun run lint:actions` exit 0.
```

```
/loop 15m Drive implementations-plan/deps-ci-1 forward per its plan.md: read the plan (the authority), run the next unticked phase and its gate, then the Post-implementation steps in order. Never merge; stop once the PR's checks are green and the close-out is committed.
```
