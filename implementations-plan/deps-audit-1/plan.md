---
plan: deps-audit-1
tier: light
status: arc 1 blocked at Phase 3 (the extension soak pair, host load); OA-2 attempt stopped by its load rule; ask OA-3
issues: "#980 (closed by arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at ef5336bbc
trunk: dev
post_implementation_hardening: not scheduled
---

# deps-audit-1: fix the five new advisories (#980)

One arc, one PR against `dev`, `Closes #980`. No screen changes. The runbook is `SECURITY.md` § Dependency policy; this plan keeps only what is specific to these five.

After the arc, `bun audit` reports the 41 acknowledged advisories and nothing else, and the gate in enforce mode says 41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable. All five are **fixed**, none acknowledged: vite 8.2.1 → 8.2.4 and follow-redirects 1.16.0 → 1.16.1, both older than the 7-day gate. Because 8.2.4 changes the module runner that every unit test runs through, the arc runs the soak matrix (D6).

## Outcome & Quality Bar

- **For whom:** every contributor whose PR changes a dependency file, which `quality-status` blocks today; the people who run the dev servers and the Node-side tooling.
- **Excellent:** (1) nothing moves but the two packages and the four vite ranges, and every other lock entry is byte-identical; (2) the unit suites stay flake-free on the new runner (the soak), and the PR's own `quality-status` runs the gate in enforce mode and is green.
- **Good enough:** the 41 acknowledgements stay as they are; vitest 4.1.11 stays out (D7).

## Assumptions

**Facts** (verified at `ef5336bbc`; detail in `recon.md`)
- F1 The five ids, ranges and severities are as #980 lists. `bun audit` files the three launch-editor advisories under `vite` (`>=8.2.0 <=8.2.3`): vite bundles launch-editor. First patched: vite 8.2.4 (8.3.3 on the 8.3 line), follow-redirects 1.16.1.
- F2 One `vite@8.2.1` in `bun.lock`, declared `^8.0.16` in `apps/extension`, `apps/landing`, `apps/playground`, forced by root `overrides.vite` `^8.0.0`.
- F3 `follow-redirects@1.16.0` comes only through `axios@1.20.0` (`^1.16.0`), from `@aztec-labs/aztec.js` and `@aztec-labs/stdlib` 6.0.0-rc.3. axios's `browser` field maps out the http adapter that imports it; its `bun` export condition keeps that adapter when vitest runs on Bun.
- F4 Publish times: follow-redirects 1.16.1 2026-10-01 (token publish, no attestation); vite 8.2.4 2026-10-06 (SLSA provenance, vitejs/vite `publish.yml`, tag `v8.2.4`); 8.3.4 2026-10-08. No 8.2.3 exists.
- F5 The planned edits (the root override, the three app manifests) make `bun install` re-resolve, and it refuses `@alejoamiras/presto` 6.0.0-rc.3 (inside the gate until about 2026-10-21T16:54Z) and `@alejoamiras/private-fee-juice` 6.0.0-rc.3 (until about 21:01Z). Both are exact pins, already locked.
- F6 The probe in `recon.md` lands 6 changed lines in `bun.lock` (4 vite ranges, the vite entry, the follow-redirects entry) and one `vite` line in each of the 4 manifests; the tracked `bunfig.toml` stays untouched; `bun install --frozen-lockfile --force` passes; the gate in enforce mode reads 41 / 0 / 0 / 0.
- F7 Nothing in the tree pins these versions (no test, notices record or doc number); the ack file and `SECURITY.md`'s table need no edit. `reference/{nulo-v6,key-model-v2,aztec-5.0.0-stable/regime-b}/bun.lock` also lock follow-redirects 1.16.0 (D9).
- F8 vite 8.2.4's `dist` also bundles, with no lock entry to show it: magic-string 1.1.0 → 1.2.0, shell-quote 1.8.4 → 1.12.0, ws 8.21.1 → 8.21.3 (the dev server's HMR socket), postcss-import 16.1.1 → 16.2.0, @vercel/detect-agent 1.2.3 → 1.2.5, @vitejs/devtools 0.4.10 → 0.4.12.
- F9 8.2.4's `module-runner.js` changes `isCircularRequest`: an import whose call stack holds a module that already finished is no longer circular, so `cachedRequest` awaits the requested module instead of returning its partial exports. vitest's runner inherits it through `super.cachedRequest` (Codex reproduced both outcomes on the installed code).

**Inferences**
- I1 Neither follow-redirects nor launch-editor reaches either extension zip (axios's browser mapping; vite's dev middleware is never in a build). Phase 2 checks both artifacts.
- I2 The F9 change is a test-runtime change in the sense of CLAUDE.md's soak rule: it alters when the runner waits, a path that depends on import timing.

**Asks** (none for the owner; each settled by the panel, see the ledger)
- A1 Fix vs acknowledge (D1). A2 How to pass the re-gate (D4). A3 Whether the soak runs (D6).

## Architecture & Implementation

- **Where:** `bun.lock`; the `vite` line in `package.json` (`overrides`), `apps/extension/package.json`, `apps/landing/package.json`, `apps/playground/package.json`. No source, script, test, workflow or doc file. `bunfig.toml` and `scripts/ci-cd/audit-acks.json` end unchanged.
- **follow-redirects:** `bun update follow-redirects` writes the lockfile entry only (axios's `^1.16.0` admits 1.16.1).
- **vite, exactly 8.2.4:** with the override a range, `bun update vite[@8.2.4]` resolves 8.3.4. So pin first, then restore the ranges: override `8.2.4`, install; override and the three floors `^8.2.4`, install. The lock keeps 8.2.4, which satisfies `^8.2.4`.
- **The re-gate (F5):** while either package is inside the gate, both installs run with `--config=<scratch bunfig.toml>`, a fresh copy of the tracked file plus one `minimumReleaseAgeExcludes` line for the two names, outside the repo. After 21:01Z the installs run with the tracked file.

## Security & Adversarial Considerations

- **follow-redirects (2 high):** on a cross-origin redirect, a credential header passed in array form, or named by a `sensitiveHeaders` pattern holding `^` or `|`, reaches the new host. It runs only in Node and Bun (axios's http adapter): tests, the e2e harness, scripts that use the Aztec client. Exploitability here: unknown; the fix removes it.
- **launch-editor in vite (3):** command or flag injection on Windows and WSL, and a Windows existence-check bypass, through the dev server's open-in-editor middleware. Reachable on a Windows or WSL host through vite's `/__open-in-editor` dev-server route (`apps/extension` `dev`, landing, playground). No `vite build`, so no shipped artifact, serves it.
- **Supply chain:** the age gate holds for every new version (F4). The exclude names packages, not versions: it is safe here only because both names stay exact pins whose lock entries do not change, and Phase 1 checks both. A matching `dist.integrity` proves byte consistency with the registry, not publisher innocence; the controls are the age gate, the full `bun pm diff` read (bundled changes included, F8), vite's provenance, and the byte-identical rest of the lockfile. Compromised build tooling could alter shipped code: that is the residual every build carries, not new here.
- **Least privilege, crypto:** N/A; no workflow, token or crypto change.

## UI impact

None. The arc changes dependency files only; no screen, copy or layout.

## Phases (arc 1, branch `deps-audit-1-a1` off `origin/dev`, this plan's commit cherry-picked first)

### Phase 1: the two bumps ✓
- First, on the base: `bun run test:all`; record each workspace's pass count.
- `bun update follow-redirects`.
- If before 21:01Z: regenerate the scratch config from the tracked `bunfig.toml`; `diff` them shows only the exclude line.
- Set root `overrides.vite` to `"8.2.4"`; `bun install` (with `--config=<scratch>` if before 21:01Z).
- Set `overrides.vite` and the three app `vite` entries to `"^8.2.4"`; `bun install` the same way.
- Record `bun pm diff vite@8.2.1 8.2.4` and `bun pm diff follow-redirects@1.16.0 1.16.1` for the PR body. Commit (`fix(deps): …`).
- **Validation gate:**
  - `git diff origin/dev -- bunfig.toml scripts/ci-cd/audit-acks.json` is empty; the manifests change one `vite` line each.
  - `git diff origin/dev -- bun.lock` changes exactly 6 lines (F6). The presto and private-fee-juice entries and every manifest constraint on them are unchanged. Both new integrity strings equal the registry's `dist.integrity`.
  - Remove every `node_modules` (root, `apps/*`, `packages/*`, `infra/*`), then `bun install --frozen-lockfile` with the tracked `bunfig.toml`: exit 0. The store holds only `vite@8.2.4` and `follow-redirects@1.16.1`.
  - `bun audit --audit-level=low --json > <scratch>/a.json; bun scripts/ci-cd/audit-gate.ts <scratch>/a.json --exit-code <its code> --mode enforce` exits 0 and prints `41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`.
  - `bun run lint`, `bun run typecheck:all` exit 0. Layers: typecheck, lint, supply chain.

### Phase 2: builds, artifacts, smoke ✓
- First, merge `origin/dev` if it moved, then repeat Phase 1's fresh install and audit gate. This HEAD is the **candidate**: record its SHA and the `bun.lock` sha256.
- **Commands:** `bun run audit:vue` (its `build` is the Chrome build); `bun run build:firefox`; `bun run --cwd apps/landing build`; `bun run --cwd apps/playground build`; `bun run --cwd apps/extension build-storybook`; `bun run test:ci-gating`.
- **Artifact check**, both production builds, from the repo root: `apps/extension/dist/{chrome,firefox}/THIRD-PARTY-NOTICES.txt` names no `follow-redirects`; `grep -rlF` over `apps/extension/dist/chrome` and `apps/extension/dist/firefox` for follow-redirects' `Maximum number of redirects exceeded` and launch-editor's `UNC paths are not supported on Windows` (and vite's `__open-in-editor` route) exits 1 for each. Exit 0 or 2 fails the check. Record whether `axios` is listed.
- **Smoke e2e, both browsers, one after the other:** build armed (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Repeat with `build:firefox` and `NULO_E2E_BROWSER=firefox`. Poll each log in one bounded `until` loop; record each wall-clock.
- **Pass criteria:** every command exits 0; the artifact check finds nothing; smoke has no failure on either browser. Network e2e runs in CI (all four lanes trip on `bun.lock`).

### Phase 3: the soak matrix at the candidate (blocked: the extension pair, D12)
- **Warning:** change no file in the repo and make no commit while it runs. Each `soak` call snapshots HEAD, the dirty state and the lockfile hash once, and `compare` checks agreement within its pair only. Keep every output and log in `<scratch>`. Start only when `git status --porcelain` is empty.
- For each workspace whose `test` is `bun --bun vitest run …` (13: `apps/extension`, `apps/landing`, `infra/token-list`, and `packages/{aztec-runtime,design,extension-messaging,legal,third-party-notices,token-list,wallet-bridge,wallet-core,wallet-crypto,wallet-sdk-schema-patch}`): `bun scripts/ci-cd/test-soak/cli.ts soak --cwd <ws> --runtime node --runs 30 --out <scratch>/<ws>-node.json`, the same with `--runtime script` into `<ws>-bun.json`, then `cli.ts compare` on the pair. Run them in sequence from one background script; poll its log in bounded `until` loops under two hours each.
- `bun run test:all` five times; each exits 0 with the Phase 1 base counts.
- Push `deps-audit-1-a1` and `gh workflow run pr-quick.yml --ref deps-audit-1-a1`; that run's head SHA is the soak commit, and it is green.
- **Pass criteria:** every `compare` exits 0 (no failed run, an exact inventory but `BUN_ONLY_FILES`); all 26 summaries record the candidate SHA, a clean tree and the candidate lockfile hash; the dispatch ran at the candidate SHA and is green; the five `test:all` runs are green. A red run is read, never retried away (no raised timeout, no skip).
- After Phase 3, `git diff <candidate>` may touch only `implementations-plan/**`, except a close-out merge of `origin/dev`. If that merge touches a dependency file, `bunfig.toml` or a vitest config (`vitest.base.mts`, `**/vitest*.config.*`), the merged HEAD becomes a new candidate and reruns Phases 2-3. Other code a merge brings ran on its own PR's CI and runs again on this PR's.

### Phase 4: final gate
- **Commands:** the Phase 1 audit gate; `bun run lint`; `bun run check:plans` after staging; `git diff origin/dev --stat`.
- **Pass criteria:** each exits 0; the diff touches only the five dependency files and this plan's directory.

## Decision ledger

- **D1 Fix all five; acknowledge none.** Both fixes exist and are past the gate, so the policy's condition (cannot move) is not met.
- **D2 vite 8.2.4, the patch.** The smallest release that clears the three, inside the line the tree runs. 8.3.x changes more (Rolldown's line, the transforms) for no gain here; it would also need both network lanes run locally, for the Aztec CommonJS interop.
- **D3 Raise the floors and the override to `^8.2.4`.** The house raises a direct dependency's floor with its fix (`#62`, `vue`), and one range keeps one vite line. Rejected: `bun update vite` (lands 8.3.4) and a hand-edited lock entry.
- **D4 The re-gate: an uncommitted exclude through `--config=` on a fresh scratch copy.** `SECURITY.md`'s documented answer (CVE runbook step 4); the tracked file never changes; Phase 1 checks the two names stay exact and their entries unchanged. Waiting until 21:01Z is the alternative: it removes the exception, at about 19 hours more of every dependency PR blocked. Codex and Opus both accept D4.
- **D5 follow-redirects lockfile only.** axios's own range admits the fix. Rejected: a root override (a permanent global entry for a range nobody conflicts on) and an importer bump (axios belongs to the Aztec line, and 1.20.0 already allows 1.16.1).
- **D6 Run the soak.** CLAUDE.md sets the soak as the bar for any test-runtime change, and F9 changes the runner's waiting behaviour. Opus held that the change can at most turn a flaky partial-export failure into a pass, so equal `test:all` counts suffice; Codex showed the two outcomes differ on the installed code and that counts cannot prove repeatability. Codex's reading follows the rule as written. The lane brief's "no soak" rested on "a patch is not a runtime change", which F9 disproves. Rejected: acknowledge vite's three until a later soak batched with vitest (the vitest precedent), because the fix exists and the soak costs only machine time.
- **D7 vitest 4.1.11 stays out.** `bun audit fix` proposes it; it is acknowledged until its own soak (`SECURITY.md:501`). This soak binds to this lockfile and does not cover a later vitest bump.
- **D8 No doc change.** No doc names these versions; the acknowledged set (41) does not change.
- **D9 The `reference/*/bun.lock` files stay.** They are frozen address-vector generators, installed by no workflow and audited by no gate, and they derive keys without network calls. Re-pinning one is an address-freeze change, outside this lane.
- **D10 Local Firefox smoke stays.** The lane brief names smoke on both browsers; it costs one more run.
- **D11 #987 is fixed in this arc.** At the first candidate (`57c35cec5`), `infra/token-list`'s Node reference failed one test on all 30 runs, the same on the base: the test spawned `process.execPath`, which is `node` under the reference, on a TypeScript script Node's strip-only mode refuses. That file sat outside the lane, so the arc stopped (OA-1). The orchestrator's call, under the owner's standing rules: "**option A**, 'arc 1 adds `test(token-list): spawn the live-check script with bun, as ci runs it` (`spawn("bun", …)`, closing #987 in the same PR). Then Phases 2-3 rerun in full at the new candidate, and the PR opens when every compare exits 0.'" Landed as `dc82d009d`, after a merge of `origin/dev` (`f5fa9f68c`, which brought #981 and #983). Red under the Node reference on its parent (1 of 1), green after it (3 of 3 on each engine, the same 24-test inventory). `dc82d009d` is the new candidate. Rejected: declaring the bar met with the red disclosed, because CLAUDE.md and this plan require every compare to exit 0.
- **D12 The `apps/extension` soak pair stops after one saturation retry.** At `dc82d009d`, the other 12 compares exit 0, `infra/token-list` included. The extension pair failed twice, with other leads' runs holding load1 between 120 and 300 on this 188-core host. Every recorded failure is a vitest timeout at the default 5000 ms (`STACK_TRACE_ERROR`). They hit whole-repo filesystem scans and, twice, the same fee-read pin, which takes 8 to 24 ms alone. The common brief allows one retry after load falls, and it was used. Codex r6 found no code cause, but did not count saturation as proven either. Rejected: a third attempt without the orchestrator ("retry once" is the limit), a raised timeout or a skip, and declaring the step met. The arc stops before its PR (OA-2). A later attempt runs at a detached `dc82d009d`, so that all 26 summaries bind one candidate.

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high, session 01a15c31): `conditional approve`, confidence high.** Accepted: (1) F5 narrowed to the planned edits and the two expiry times; (2) bundled magic-string and shell-quote added (F8); (3) six lockfile lines, D3 narrowed to the commands tested, A3's reference; (4) the advisory descriptions corrected, extension `dev` added; (5) I2 was false: rewritten (F9, I2) and the soak added (D6, Phase 3); (6) the artifact check records the names directly; (7) D4 bound to unchanged exact constraints and entries.
- **Round 2, Codex resumed: `conditional approve`, confidence high.** The 13 workspaces and the soak commands verified against `cli.ts` and `lib.ts`. Accepted: (1) the artifact check runs from the repo root on `apps/extension/dist/*`, accepts only grep exit 1, and adds launch-editor's own string; (2) the soak's binding stated as it is (per call, per pair) and all 26 summaries checked against one candidate; (3) the audit output moves to scratch (an untracked `a.json` at the root dirties the tree, so `compare` refuses); (4) the candidate is chosen after a `dev` merge, and a close-out merge that touches runtime inputs reruns Phases 2-3; recon's re-gate wording narrowed.
- **Round 3, Codex resumed: `approve`, confidence high.** "No remaining material findings." It verified the launch-editor fingerprint is in 8.2.4, the grep fails closed, the audit output stays outside the tree, and the 26 summaries plus the dispatch bind to one clean candidate.
- **Round 1, Opus Plan leg: `conditional approve`, confidence 0.8.** Accepted: (A) six lines; (B) a fresh install before the builds; (C) vite's provenance recorded, follow-redirects has none; (D) the scratch config regenerated and diffed, dropped after 21:01Z; (E) I2 rewritten; (F) the vacuous notices greps replaced, the duplicate Chrome build dropped, the base `test:all` moved to step 0; trims applied. Rejected: D6 as Opus argued it (see D6); dropping the local Firefox smoke (D10).

- **Arc 1 review, round 1, Codex (gpt-6.1-sol high, session 01a15c4b, on the Phase 1 diff): `approve with fixes`, confidence high.** It found no dependency-file defect: six lockfile lines, every other entry byte-identical, one range per manifest, integrity matching the registry. Accepted: recon said all ten changed files sit under `dist/` (nine do, plus `package.json`) and omitted three bundled moves; both corrected (F8, recon).
- **Arc 1 review, Opus (general-purpose, same diff): `approve with fixes`, confidence high.** Accepted: (2) the full bundled list (F8, adds `@vitejs/devtools`); (3) Phase 1's evidence recorded in `lessons/phase-1.md`; the Security line narrowed to vite's own route. Its (1) is out of this lane's scope and went to the orchestrator.
- **Arc 1 review, round 2, Codex resumed: `approve`, confidence high.** "No remaining findings." The loop converged before the candidate was chosen.

- **Arc 1 review, round 3, Codex resumed (on the Phase 2-3 results): `reject` of the first D11, confidence high.** The evidence proves the red pre-existing and independent of the bump, but the written bar is unmet; prefer the engine-explicit spawn. The issue draft's counts corrected (24 tests in the file, 85 pass and 3 skip per Bun run, stdout empty, stderr the parse error).
- **Arc 1 review, round 4, Codex resumed: `B`, confidence high.** The one-line fix is local in complexity but outside the lane's files, so it waits for the owner. Spawning `bun` is the right fix: on this setup, `bun` on PATH and Bun's `process.execPath` are the same 1.4.2 binary. After approval, run the file under both engines first, then Phases 1-gate, 2 and 3 in full at one new candidate.
- **Arc 1 review, round 5, Codex resumed (on `dc82d009d`): `approve`, confidence high.** "No findings. The authorized fix matches CI's invocation"; the assertions are unchanged, and 24 tests pass 3 of 3 on each engine with matching inventories. Its approval covers the fix only, not Phases 2-3.
- **Arc 1 review, round 6, Codex resumed (on the extension soak): `b`, confidence high.** The allowed saturation retry is used up; "Three failures" is a hard stop, "not permission to exceed 'retry once.'" No code cause is shown, but saturation is still a hypothesis: a timeout proves that the deadline expired, not why. The lost failure names block classifying every red. Hand scheduling to the orchestrator, and keep every failure's name on any later attempt (D12).
- **Arc 1 review, round 7, Codex resumed (on the close-out merge): `A-i`, confidence high.** The close-out's trunk merge (README step 4) brings `apps/extension/vitest.e2e.config.ts` and `vitest.e2e.network.config.ts` (#978's shard sequencer), which match Phase 3's `**/vitest*.config.*` trigger. So the merged HEAD is a new candidate and reruns Phases 2-3. Narrowing that rerun to the e2e smoke would document a change to an approved gate, not authorize it. Skipping the merge breaks step 4. After a pass, the PR may open at the pre-merge head, with the close-out waiting for the rerun (OA-3).

## Delivery

- **Arc 1** = Phases 1-4, one PR against `dev` (the orchestrator's D-orch-1: no stack), ready, not a draft. Title: `fix(deps): vite 8.2.4 and follow-redirects 1.16.1 for five new advisories` (74 characters). Body: the five ids with links; each bump's `bun pm diff` (bundled changes included) and provenance; why none is acknowledged; the local exclude and the frozen-install proof; the soak, smoke and build results; `Closes #980`. No label: `bun.lock` trips every e2e lane.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `ef5336bbc`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, over the arc diff after Phase 1's commit and before Phase 2, so its fixes and records are committed before the candidate is chosen (a later fix to a dependency file reruns the soak): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff from `origin/dev`, both `bun pm diff` outputs, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review beside round 1. Hard stop at three rounds; log each in `lessons/phase-1.md` and under Review verdicts.
- **Delivery:** after Phase 4, `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the `## Outcome` block; lessons only within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/deps-audit-1 implementations-plan/archive/deps-audit-1` in its own commit, the index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/deps-audit-1/plan.md` succeeds, run `agent-worktree done deps-audit-1 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

```
/goal Arc 1 of implementations-plan/deps-audit-1/plan.md done: Phases 1-4 marked ✓, each gate reported passing in the transcript (the audit gate printing 41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable; every soak compare exit 0); the Codex loop (gpt-6.1-sol high) converged, quoted; the PR open against dev (gh pr view output).
```

```
/loop 20m Drive arc 1 of implementations-plan/deps-audit-1 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits, never commit bunfig.toml, no commit while the soak runs. After Phase 4 open the PR, watch checks, report and stop. Never merge.
```
