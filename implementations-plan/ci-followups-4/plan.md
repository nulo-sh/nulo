---
plan: ci-followups-4
tier: light
status: completed; arc 1 in #437, awaiting the orchestrator's merge
issues: "#172, #365 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet) and one scratch probe; one Codex audit (gpt-6.1-sol high) with resumes until a verdict, one Opus Plan lens beside it
base: origin/dev at b3c98acb
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-14.
- **Status:** completed. One arc, [#437](https://github.com/nulo-sh/nulo/pull/437) against `dev`, awaiting the orchestrator's merge; the merge closes this plan. A1 was approved, then D3 fired in Phase 2 (a sixth third-party gap), so #172 took the known-limit branch (D-impl-4).
- **Shipped:** in #437.
  - The first-party gaps the narrowed fallback surfaced, declared: `@types/node` in `@nulo/aztec-runtime` and `@nulo/wallet-bridge`; `@storybook/vue3-vite` in `@nulo/design`; Storybook's framework from an absolute root (D-impl-1); `assert` in the extension's and the playground's `nodePolyfills` lists (D-impl-2). Every bundle byte-identical, 15,751 test identities unchanged.
  - CLAUDE.md's linker bullet states the real boundary and the polyfill rule, and absorbs two lessons lines; `bunfig.toml`'s header says the same (comment only).
  - #365: the raw field's network case, green on Chrome and Firefox at retry 0, proven red by a scratch `variant` change.
  - `lessons.md` 8,191 → 7,124 B; `nightly.yml`'s `dup-trend` comment points at the complexity-budgets skill.
- **Dropped, rejected, superseded:**
  - D1 (`hoistPattern`, five entries): tried, superseded by D3: `bun-types@1.4.2` imports `undici-types` undeclared (D-impl-4). Phase 2 step 7 (the SECURITY.md sentence, the aztec-update line) and the host-wide fresh install went with it.
  - #365's PublicChecks note for #165: already carried by #165's existing comment from the type-roles close-out; no duplicate.
  - The playground's `tty`: left out of its list (colorette guards it; review O2).
  - No `lessons.md` promotion: the linker facts live in CLAUDE.md.
- **Known limits:** #172 (the store fallback stays: six upstream gaps), #438 (the extension build only warns when it stubs a Node builtin).
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# ci-followups-4: a named store fallback, the raw field's e2e case, a lessons pass

One arc, one PR against `dev`. Nothing a person sees in the wallet changes. The plan runs over the light target (150 lines) because the audit record and the two branches of #172 carry evidence.

- **#172.** Bun's store fallback (`node_modules/.bun/node_modules`) links all 698 packages, so any store package can import a package it does not declare. Phase 1 declares the three first-party gaps. If the orchestrator approves A1, the fallback narrows to the five upstream gaps that need it (`hoistPattern`); otherwise #172 closes as `known-limit` with the evidence.
- **#365.** One network case sweeps the raw field of a call the wallet cannot decode.
- **Hygiene.** `lessons.md` drops to 7,124 B. `nightly.yml`'s `dup-trend` comment points at the complexity-budgets skill.

Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #172, #365, the two hygiene items. **Out:** #180, #322, #384, #79, #366, #364, #21 (lane brief); #365's PublicChecks note, which becomes a comment on #165; `bunfig.toml`'s `minimumReleaseAgeExcludes` (aztec-rc3's); a test that pins the list (D4).

**UI impact: none.** Every file of both production builds is byte-identical before and after (Phase 2 gate). The rest is tests, docs, dev dependencies, Storybook's config and a workflow comment.

## Outcome & Quality Bar

**For whom.** A maintainer who adds or bumps a dependency, and the reviewer of that PR.

**Excellent.** On a fresh install, a store package that imports an undeclared package outside the five names fails the install, build or tests; the five sit in one reviewed list, each naming its importer and removal condition. The production builds do not change. The new case fails when the raw field leaves its mono role.

**Good enough.** The list is not a sandbox: every store package can reach the five names, and every package can reach the root devDependencies (Bun's boundary). A tree installed before the change keeps all 698 links until it is deleted (F3); CI installs fresh.

## Architecture & Implementation

**#172, the cause.** Only store packages resolve through the fallback; workspace source never does (recon). So the fallback hides third-party packages that import what they do not declare. Fresh installs build the same fallback on CI and locally; a stale tree diverges, because Bun 1.4.2 prunes nothing (F3).

| Gap | Fix |
|---|---|
| aztec-standards → `@aztec-labs/aztec.js` (declares nothing) | entry; removal: upstream declares it |
| `@pinia/testing` → `vue` | entry; removal: upstream declares it |
| `local-pkg` (for vite-plugin-pages) → `@vue/compiler-sfc` | entry; vite-plugin-pages takes no compiler option |
| the polyfill plugin injects `vite-plugin-node-polyfills/shims/*` into store modules | entry `vite-plugin-node-polyfills` |
| presto's lazy `@aztec-labs/simulator/client` (bundled statically) | entry; removal: presto declares it as an optional peer |
| storybook loads `@storybook/vue3-vite` by name | `main.ts`: `framework.name` is `dirname(resolvePackageAsset("@storybook/vue3-vite", "package.json", { from: import.meta.url }))` |
| aztec-runtime's `Buffer` and `node:*` | declare `@types/node` `^24.13.2`; `types: ["chrome-types", "node"]` (as wallet-core) |
| design's stories `import type` from `@storybook/vue3-vite` | declare it in `packages/design` devDependencies, at the extension's range |
| *Found in Phase 2:* the bundles' Node builtin `assert` (from `@aztec-labs/stdlib`, `noir-protocol-circuits-types`) reached npm `assert` only through the fallback | `"assert"` in the extension's and the playground's `nodePolyfills` `include` (D-impl-2) |
| *Found in Phase 2:* wallet-bridge's tests use `Buffer` | declare `@types/node` `^24.13.2`; `types: ["chrome-types", "node"]` (D-impl-3) |
| *Found in Phase 2:* `bun-types@1.4.2` (behind the root's `@types/bun`) imports `undici-types` undeclared | a sixth entry: D3 fired (D-impl-4) |

`bunfig.toml` gains `hoistPattern` with the five exact names, one per line, each with a comment naming the importer and its removal condition.

**Alternatives.**
- `hoist = false` plus `publicHoistPattern` (the issue's first form). Rejected: a public entry links at the root `node_modules`, which every workspace's source reaches, so `packages/*` could import `vue` undeclared and pass everywhere.
- `hoist = false` alone, #172 closed as `known-limit` (the brief's named branch). It leaves all 698 links where `hoistPattern` removes 693. It is the path if A1 is declined.
- A patch that adds manifest dependencies: Bun resolves from the lockfile, so it links nothing (1.4.2 has no `packageExtensions`).
- An absolute-path override of Rolldown's `transform.inject`: couples our config to the plugin's internals and misses the playground's dev server.
- Moving tests, fixtures, the playground and one script off aztec-standards' generated `Token.js` (shipped code uses the JSON alias): removes one entry for about ten files of churn, on a gap upstream should close.

**#365.** One case after the discovered-authwit case, on its skeleton (`type-roles-windows.test.ts:235-270`): the same grants, rig, inputs and token instance. It leaves `delegatedConsumerInstance` unset, and `openExecute` waits on `execute-op-raw-toggle`. It clicks the toggle, waits for `execute-op-arg-field`, and sweeps `windows-execute` with the state "an undecodable call with execute-op-raw-toggle clicked (network)". It asserts `execute-op-arg-field` among the asserted sites (the success control: a mistyped state observes nothing). It rejects and expects `sendTx` to report `error`. The timeout is `600_000`, as the sibling case; the json entry already exists.

**Lessons pass.** 8,191 → 7,124 B, measured on a draft. Nothing is retired for space alone:

| Line | Change | Why |
|---|---|---|
| 5 (incremental install keeps removed deps), 6 (root `bunx` fetches `@latest`) | move into CLAUDE.md's linker bullet, which Phase 2 rewrites | One home for the linker's resolution rules. The bullet keeps both evidence links, the 1.4.2 stamp, the removed-dependency case and the `bunx` condition (no root dependency provides the tool) |
| 18 (merge ref) | drop the conflicted-PR clause and its `accessibility-1` link | Stated at `e2e-testing/SKILL.md:779` and `aztec-update/SKILL.md:217` |
| 20 (aggregators, PR queues, `pr-supersede`) | retire | Stated at `CI.md:48, 100-102` and `.github/WORKFLOWS.md:58` |
| 37 (balances fuzz model) | retire | One test's model, held in its header and hooks (`balances.store.fuzz.test.ts:1-24, 355-361`) |
| 42 (Aztec 5 quiet blocks) | stamp "(still on 6.0.0-rc.1)" | `forceBlock` still sends a tx (`tests/e2e/fixtures/aztec.ts:467`) |
| 45 (HandshakeRegistry) | drop the first clause and its `hd-import-handshake-loss` link | `aztec-update/SKILL.md:89-91` states it; `PxeService`'s scope guard enforces it |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | `hoistPattern` with five named upstream gaps; needs A1 | The narrowest form that builds; #172's last comment names "a reviewed per-package hoist entry". Obligations: an importer bump rereads its entry (aztec-update line); an entry goes when upstream declares the import |
| D2 | First-party gaps fixed in code; an entry only for a third-party gap | "Declare each where it is imported" |
| D3 | In the Phase 2 battery and the PR's CI lanes: a first-party gap is declared; a third-party gap whose code and manifest prove it upstream gets an entry, up to five. A sixth entry, or any other failure, stops the arc for the orchestrator | Bounds design growth; no workaround |
| D4 | No test pins the list | `bunfig.toml` changes trip the audit gate and review |
| D5 | Production-build identity on fresh trees, after a determinism control | Proves no shipped resolution moved |
| D-orch-1 | One arc, one PR against `dev`, no stack | orchestrator |
| D-impl-2 | `"assert"` joins both apps' `nodePolyfills` `include` | Step 4's dist moved because the bundle got npm `assert` only through the fallback; a builtin's importer rightly declares nothing, so the gap is our bundler config's (D2, D3's first clause). Panel: Opus fix-and-continue; Codex first ruled the fix right but the stop an authorisation boundary, then on resume with D3's full text reversed (high): declaring a first-party gap is inside D3 and not a plan change. With it every dist is byte-identical, pattern or not |
| D-impl-3 | `@nulo/wallet-bridge` declares `@types/node` | Its tests use `Buffer`; the same gap as aztec-runtime's, found by the pattern's typecheck |
| D-impl-4 | `hoistPattern` reverted; #172 closes `known-limit` | `bun-types@1.4.2` imports `undici-types` undeclared (`fetch.d.ts:24-30`); only a sixth entry fixes `typecheck:scripts` (probed). D3 and the orchestrator's decision: a sixth entry stops the route and closes the issue with the evidence. The first-party fixes ship |
| D-impl-1 | Storybook's `framework.name` is `resolvePackageRoot("@storybook/vue3-vite", { from: import.meta.url })` | The package already exports the root lookup; same path as `dirname(resolvePackageAsset(…, "package.json", …))` without the `dirname` |

## Assumptions

**Facts** (verified 2026-10-14; citations in recon):
- F1. Bun 1.4.2 documents `hoistPattern` and `hoist`; the probe shows the narrowing with a byte-identical lockfile.
- F2. Workspace source never reaches the fallback; the root `node_modules` holds only the root devDependencies.
- F3. Bun 1.4.2 prunes no fallback link on an existing tree, `--force` included; only a fresh install applies the pattern (probe, [lessons/phase-0.md](lessons/phase-0.md)).
- F4. The extension declares all five names (`apps/extension/package.json:36, 47, 81, 98, 114`).
- F5. CI installs fresh and caches only `~/.bun/install/cache`; `docker-ci-like.sh` reuses the host tree.
- F6. The json entry for `execute-op-arg-field` exists; no e2e drives the raw toggle.
- F7. Smoke refuses a build without its fixtures (`global-setup-smoke.ts:34-73`).

**Inferences:**
- I1. Smoke, network and Storybook's dev path may surface more gaps; the 2026-10-10 probe never reached e2e. D3 bounds it.
- I2. Each fallback link points at the extension's copy; the gate checks it, because two `vue` copies exist.
- I3. With the consumer unregistered the window renders the raw call; the 2026-10-13 boards showed it (#365).
- I4. A lazy Node-side import that no suite reaches stays untested; D5 covers shipped code.

**Asks:**
- A1, for the orchestrator: approve D1 (`hoistPattern`) as #172's fix, or take the brief's branch (the first-party fixes ship; #172 closes as `known-limit`). Phase 2 has both branches. Recommendation: approve. Both panel legs judge `hoistPattern` the better design; Codex's condition was the authorisation itself.

## Security & Adversarial Considerations

- **Supply chain.** Today another package's undeclared import can bind a compromised package anywhere in the 698; after D1, only the five names, which every store package can still reach. The lockfile pins artifacts; it neither enforces declarations nor makes pinned code safe.
- **No version moves.** `bun.lock` gains only the two workspace lines, at locked versions; more stops for a read. The age gate and its excludes stay untouched. After aztec-rc3, a `package.json` edit that reaches a version younger than 7 days re-gates: use the uncommitted local exclude (SECURITY.md § Dependency policy).
- **Silent behaviour change.** A missing `@vue/compiler-sfc` drops every route's `isAuthRequired` while the build succeeds; `legacy-routes.test.ts` (in `test:all`) and D5 catch it.
- **Least privilege, crypto, input validation:** nothing changes. The new case rejects its window.

## Phases (arc 1; each commits its tests and docs)

Warnings: network e2e runs only through `agent.sh`, at retry 0; smoke uses `test:e2e` on its armed build; never two e2e runs at once in this worktree. If aztec-rc3 has landed, merge `origin/dev` first and reread its two gaps on the new versions. If `dev` moves with dependency changes between Phase 1 and Phase 2, retake the baseline.

### Phase 1: declare the first-party gaps (#172) ✓

1. Add `@types/node` `^24.13.2` to `packages/aztec-runtime` devDependencies and set its `types` to `["chrome-types", "node"]`.
2. Add `@storybook/vue3-vite` to `packages/design` devDependencies.
3. Set `framework.name` in `apps/extension/.storybook/main.ts` per the gap table.
4. Run `bun install`. `git diff bun.lock` must show only the two workspace lines.
5. Record the baseline on a fresh tree: delete every `node_modules`; run `bun install --frozen-lockfile`.
   - Test identities (file, full name, state) of `test:all` (each workspace's vitest json, `infra/passkey-rp`'s junit), `test:release` and `test:ci-gating` (`bun test` junit), as `archive/ci-release-supply/lessons/phase-2.md` § 2.4 did.
   - Run `bun run --cwd apps/extension build:full` twice. After each, record a manifest of `apps/extension/dist/{chrome,firefox}` (relative path, SHA-256). The two must match: the determinism control.

Gate: `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run --cwd apps/extension build-storybook`; `bun scripts/phantom-sweep.ts`. Pass: all exit 0; the sweep's design finding is gone and its six known false-positive lines remain (`~pages`, `Awaiting...` and two `@…-artifact/undefined` under the extension; the same two under aztec-runtime). Layers: lint, typecheck, unit, build.

### Phase 2: the fallback (#172) ✓ (D3 fired; branch A1-declined's steps 2-4 ran)

**Branch A1-approved.**
1. Add the five `hoistPattern` entries to `bunfig.toml`; rewrite the header's "Kills phantom dependencies" to the real boundary.
2. Delete every `node_modules`; run `bun install --frozen-lockfile`.
3. Check that the fallback holds exactly the five names, each realpath equal to `apps/extension/node_modules/<name>`'s.
4. Run `bun run --cwd apps/extension build:full` and compare the manifest with the baseline, before any other build.
5. Run the rest of the gate. Apply D3 to each failure; log it.
6. Rewrite CLAUDE.md's linker bullet. It keeps the rule to declare every import (type-only and plugin-injected included) and the alias, `resolve-asset` and `phantom-sweep` sentences, and states: the fallback holds only the `hoistPattern` names; D3's rule for a new entry (never `publicHoistPattern`, never for a first-party gap); root devDependencies stay reachable; old lines 5 and 6 (§ Lessons pass), with "reinstall every tree once after this lands".
7. SECURITY.md § Dependency policy: one sentence on the named fallback. `aztec-update/SKILL.md`'s pin surface: one line, an Aztec bump rereads the aztec-standards and presto entries on a fresh install.

Gate, after step 4: `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run test:release`; `bun run test:ci-gating`; `bun run --cwd apps/landing build`; `bun run --cwd apps/playground build`; `bun run --cwd apps/extension build-storybook`; `bun run --cwd infra/passkey-rp deploy:dry`; `bun run --cwd infra/token-list deploy:dry`; `bun scripts/phantom-sweep.ts`; the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`; `bun install --frozen-lockfile --force && git diff --exit-code bun.lock`. Pass: all exit 0; the sweep prints Phase 1's lines; the identities of the three suites equal the baseline; the step 4 manifest equals the baseline file for file (a mismatch stops the arc, D3). Layers: lint, typecheck, unit, build, smoke e2e.

**Branch A1-declined.**
1. On a fresh tree, set `hoist = false`, run the gate's builds and `test:all` once, and record each remaining gap in `lessons/phase-2.md`.
2. Revert `bunfig.toml`; reinstall fresh.
3. Do step 6 without the fallback-names clause and without D3's entry rule: the bullet says the fallback holds every package, and keeps old lines 5 and 6. Skip step 7's SECURITY.md sentence.
4. At close-out, comment the evidence on #172 and close it as `known-limit`. Reopening condition: every listed importer declares its import, or the orchestrator approves `hoistPattern`.

### Phase 3: the raw field's case (#365) ✓

1. Add the case per § Architecture.
2. Run `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
3. Log the case's own duration per browser (vitest verbose) in `lessons/phase-3.md`; the estimate is 2-3 minutes each, mostly the rig deploy.
4. Prove it red on Chrome: in a scratch change never committed, set the field's `variant="data"` in `CallArguments.vue` to `"body"`; confirm `expectSitesClean` fails; restore the file and rerun green.

Gate: both browsers exit 0 with all four cases green; step 4's red observed; `bun run lint`; `bun run typecheck:all`. On branch A1-approved these runs are also Phase 2's network check. Layers: network e2e, both browsers.

### Phase 4: hygiene ✓

1. Apply § Lessons pass; each commit message names where a moved or retired line now lives.
2. Point `nightly.yml`'s `dup-trend` comment (`:273-276`) at `.claude/skills/complexity-budgets/SKILL.md`.

Gate: `bun run check:plans` (staged); `bun run lint:actions`; `bun run test:ci-gating`; `wc -c < implementations-plan/lessons.md` at most 7,168. Layers: lint, unit.

## Delivery

One PR from `worktree-ci-followups-4` against `dev`; `code_review: off`. Title: `build(deps): narrow the bun store fallback, e2e the raw call field, retire stale lessons` (88 chars); on branch A1-declined, `build(deps): declare first-party deps, e2e the raw call field, retire stale lessons` (83).
- Open it without labels. On branch A1-approved, `bunfig.toml` trips all four e2e lanes; otherwise add a lane's label afterwards only if its filter skipped a suite the change needs.
- The body states what changed and why with the validation outcomes. On branch A1-approved it lists the five entries with their importers and says "delete `node_modules` once after this merges"; on A1-declined it gives the recorded gaps and the `known-limit` disposition.
- For the case: the failure mode it proves (the raw field off its mono role); why jsdom cannot (no fonts, no computed roles); its estimated and measured duration per browser; each browser's network suite wall-clock before and after (`e2e-testing` skill § Runtime budget).
- It ends with `Closes #172` (A1-approved only), `Closes #365` and the Claude Code line. Commits are signed and end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `b3c98acb`, with:
- **Codex loop**, once over `git diff origin/dev...HEAD` after Phase 4: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` on the same codex-dir; each round logged in `lessons/phase-4.md`.
- **Close-out**: comment #365's PublicChecks note on #165; no lessons promotion (the hoist facts live in CLAUDE.md); the final report tells the orchestrator that every worktree on the host, aztec-rc3's included, needs one fresh install.

## Audit record

**Round 1 (2026-10-14).** Codex (session `01a13c15`): **reject** (blocking: D1 departs from the brief; mis-scoped build gates; two lessons retired without a supersession). Opus Plan lens: **conditional approve** (D1 as an explicit Ask; cap D3; stale trees and aztec-rc3; a determinism control; #365 red on the role). Every claim was checked against the tree.

| # | Finding | Disposition |
|---|---|---|
| C1 / O1 | D1 is not the brief's literal branch | Accepted: Ask A1, `known-limit` as the named branch; Phase 2 carries both |
| C2 | "Every other undeclared import fails" overstates the boundary | Accepted: the five stay reachable to every store package; not a sandbox |
| C3 / O3 | Stale trees still split local from CI | Accepted: text qualified; CLAUDE.md, the PR body and the final report ask for one fresh install |
| C4 | `build:full` is not a root script; smoke does not use `agent.sh` | Accepted: `--cwd apps/extension`; both runners named |
| C5 / O4 | The dist check was ill-posed | Accepted: fresh trees, a determinism control, the manifest before any other build, files not zips |
| C6 / O6 | Counts hide identity changes; runtime boundary unstated | Accepted: identity compare; I4 states the boundary |
| C7 / O7 | Lines 35 and 52 retired without a supersession; citations off | Accepted: both kept; lines 5 and 6 move into CLAUDE.md; citations corrected |
| O2 | D3 has no cap | Accepted: a sixth entry stops the arc |
| O5 | The typo test proves the wrong thing | Accepted: a scratch `variant` change proves the case red |
| O8 / O9 | The CLAUDE.md rewrite drops rules; sweep baseline miscounted | Accepted |
| O10 | presto removal; aztec-standards alternative; `resolvePackageAsset` | Accepted: in the gap table and Alternatives |
| O11 | No test pins the list | Rejected (D4): review and the audit gate see every `bunfig.toml` change |
| O12 | Lockfile drift in Phase 1 | Accepted: more than two lines stops for a read |

**Round 2 (2026-10-14, Codex resume).** **Conditional approve** (conditions: arm the smoke build; make the declined branch's docs conditional; scope the identity compare). It confirmed A1 resolves C1, judged `hoistPattern` preferable to public hoisting with high confidence, and found moving lines 5 and 6 faithful if CLAUDE.md keeps both evidence links, the stamp and the `bunx` condition.

| # | Finding | Disposition |
|---|---|---|
| R2-1 | Smoke refuses an unarmed build (`global-setup-smoke.ts:34-73`) | Accepted: the manifest is compared first, then the armed build and its env run smoke |
| R2-2 | Branch A1-declined kept D3's policy and the five-entry claims | Accepted: that branch drops the entry rule and the SECURITY.md sentence; Delivery is per branch |
| R2-3 | The identity baseline's suites were ambiguous | Accepted: `test:all`, `test:release` and `test:ci-gating` named on both sides |

**Round 3 (2026-10-14, Codex resume, verify only).** **Approve.** All three round-2 conditions resolved; the tightened text kept the determinism control, the D3 ceiling, the fresh-install rules, the red proof and the close-out; no regression. A1 stays an explicit decision before branch A1-approved runs.

## Implementation review (arc 1)

**Round 1 (2026-10-14).** Codex (gpt-6.1-sol high, session `01a13c60`): **fixes needed**, three doc and comment findings, no implementation bug. Opus diff review beside it: **fixes needed**, seven.

| # | Finding | Disposition |
|---|---|---|
| C1 / O3 | The polyfill comment and the CLAUDE.md rule describe only the stub, not the silent bind through the fallback | Accepted: both name the two outcomes; the comment names `assert`'s importer |
| C2 / O7 | `index.md` still says awaiting A1 and "narrowed" | Accepted |
| C3 / O7 | `rigDelegatedSend`'s comment narrates its body | Accepted: it states what it leaves out and why |
| O1 | Workspace typecheck does see the fallback, through a dependency's `/// <reference types="node" />` | Accepted: the bullet says so and states the `@types/node` rule |
| O2 | The playground leaves `tty` (colorette) out, against the new rule | Accepted in part: the rule now covers builtins a bundle needs at run time; colorette guards `tty`, and the unshipped playground keeps its bytes |
| O4 | "`--force` included" is unproven for a removed dependency | Accepted: dropped |
| O5 | The fallback links one copy per name, not every package | Accepted |
| O6 | `bunfig.toml`'s header still says the linker kills phantom dependencies | Accepted: it states the boundary (comment only; no setting moves) |

**Round 2 (2026-10-14, Codex resume, verify only).** **Clean**: every accepted fix verified, `bunfig.toml`'s parsed settings identical before and after (comments only), the playground's `tty` exception supported (colorette guards `tty.isatty`); no regression. The loop converged.

## Seeds (drafts; the orchestrator runs the implementer)

`/goal Phases 1-4 of implementations-plan/ci-followups-4/plan.md marked ✓, each backed by its gate's output in the transcript; the Codex loop converged; the PR exists with the close-out as its final commits; bun run lint and bun run test:all exit 0.`

`/loop 15m Drive implementations-plan/ci-followups-4: read plan.md and lessons/, take the next unchecked step, run its gate, commit; follow § Post-implementation when Phase 4 is green; never merge.`
