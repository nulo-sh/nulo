---
plan: ci-e2e-hygiene-1
tier: light
status: planned, awaiting approval (Codex approve, round 3)
issues: "#749 #630 #612 #643 (arc 1 Closes); #620 #555 (arc 2 Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); planner measurement runs at retry 0; one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at 18d29f23
trunk: dev
post_implementation_hardening: not scheduled
---

# ci-e2e-hygiene-1: four e2e reds and two CI bindings

Two independent arcs, each one PR against `dev` (no stack). Arc 1 fixes four e2e reds in test code. Arc 2 guards the network suite's egress and binds CI's artifact handoffs by id. No product file changes. Recon and the measurements: [recon.md](recon.md); consults and runs: [lessons/phase-0.md](lessons/phase-0.md); owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Over the 150-line target: seven phases for six issues, each with its own gate.

**UI impact:** none. Every change is a test, a workflow, a CI script or a doc.

## Outcome & Quality Bar

For the next contributor reading a red e2e or CI job, and for the owner reviewing the `.github` diff. Excellent: (1) each wait observes the event it claims, and its timeout says what was missing; (2) every smoke and publisher input is the producer job's own upload, named by an id that is checked before use, with no new permission or secret. Good enough: the other `sealPlainBackup` callers and the handoffs outside smoke and publishing stay as they are.

## Assumptions

**Facts** (verified at 18d29f23; recon has the line evidence):
- F1 In every measured `viewers-csp` run (both browsers), the logs window opened at 38-39 lines and gained about 65 per test. All rendered `.cm-line` boxes were equal. `LogsViewer.vue:56` trims above 1,100.
- F2 In the refused-node `security-reset` test, the purge waits 9,057 ms (Firefox) and 9,232 ms (Chrome) of 10.2-10.6 s for the FPC lock. Home's discovery holds it while `registerContract` retries for 12 s. With both protocol rows seeded first, the purge took 0.5-1.5 s with 6-13 refused hits at submit (5 runs). `page.reload()` strands the page on Firefox; `reloadExtensionPage` does not.
- F3 `seedProtocolFpcs` stores both protocol rows, after which `getFpcs` never discovers (`send-keyboard.test.ts:52` does this after Home opens).
- F4 #701 refuses `profileTx` at `view-executor.ts:388-391`. `callExpectingNoPopup` waits through `waitForPgResult` with no timeout dump (`playground.ts:144,301`). `runApprovedPgCall` uses `waitForPgResult` as a watcher whose timeout is expected and swallowed (`fixtures/send.ts:60`).
- F5 `sealPlainBackup` hashes `backup-mac` and the import strips it; the MAC signs the original checksum. #598 missed this helper. Both matrix rows skip on `CI`; the header's reason (the CI authenticator cannot export) has been stale since `passkey-backup.test.ts` exported in CI. The wallet seals with `assembleFullBackup` and `passkeyBackupAuthenticator` (`ext/src/utils/full-backup-helpers.ts:196-243`). No PR lane restores a wallet-made passkey backup: smoke imports a synthetic one (`passkey-backup.test.ts:267`), and the real round trip skips PR CI (`passkey-toolbar-panel.test.ts:573`).
- F6 Only `global-setup-smoke.ts:61` provides `egressGuard`; the network and `all` configs use `global-setup.ts`. A guarded launch drops the Testnet stand-in whenever it is given direct hosts (`fixtures/extension.ts:176`). The control spec skips when unarmed (`egress-guard.test.ts:137`). The required-Presto lane never loads the CRS (`delete-after-prove.test.ts:5-8`); nightly's `network-e2e-canary-wasm` proves in WASM. A local prover-ON run starts no presto-server: the wallet uses a Presto desktop app on `127.0.0.1:59834` if one answers, else WASM (`CI.md` § Local equivalents).
- F7 `download-artifact` v8.0.1 takes `artifact-ids` and fails on an archive whose digest differs from the service's record. An empty `artifact-ids` with no `name` downloads every artifact of the run. `upload-artifact` v7.0.1 outputs `artifact-id`.
- F8 `dup-trend` restores and saves the gate jobs' install cache and runs `bunx jscpd@5.0.16` outside `bun.lock`. jscpd 5.0.16 is MIT, two months old, a launcher plus exact-pinned platform binaries. `bun pm diff` does not exist in Bun 1.4.2.

**Inferences** (audits, attack these):
- I1 #749's cause is unproven: the 300 ms stillness never held while lines kept arriving, or delivery took over 10 s under load. The new wait removes the first and names the second in its timeout.
- I2 With both protocol rows present, the refused-node test still exercises the PXE retry stop. Phase 2's gate checks this.
- I3 A WASM-backend launch fetches the CRS from bb.js's hosts (`crs.aztec-cdn.foundation`, `crs.aztec-labs.com`). Unmeasured.
- I4 #612's timeout was the PXE profile outrunning 30 s on a cold shard. Unverifiable: no wallet log, path removed.

**Asks:** OA-1 (#630 and #553) and OA-2 (#643's CI rows), each with a "what ships now" line. Neither arc waits for an answer.

## Architecture & Implementation

Test, CI and doc changes only; reuse per recon's map, plus the wallet's own backup assembler (F5). Interfaces that change: `_extension-smoke-e2e.yml` gains an `artifact_id` input; `_build-extension.yml`, `select-assets`, `release-notes`, `attach-assets` and `nightly-notes` gain artifact-id outputs; `helpers/backup-export.ts` gains `sealPasskeyBackup`; `helpers/import-drivers.ts` exports `readPasskeyPrf`. The decision ledger records each alternative not taken.

## Security & Adversarial Considerations

- **Threat model (arc 2):** a job in the same run holds the artifact runtime token (the smoke runs Puppeteer, browsers and npm code) and can upload over an artifact's name. A download by name takes the newest upload. A download by the producer's id takes that upload or fails, and the service checks the archive's digest (F7, the model of `publish-packages.yml:18-19`). We trust the service's recorded digest; an artifact with none is not checked. An empty id would download everything (F7), so each by-id download first checks its id.
- **Least privilege:** no permission block changes, no secret is added, no required check or aggregator name changes.
- **Supply chain:** jscpd moves under `bun.lock` (integrity hash, 7-day age gate, `bun audit`), ending a root `bunx` that CLAUDE.md forbids.
- **Egress:** network launches refuse every host but loopback and the declared ones, as smoke's do, which ends CI's requests to dRPC and CoinGecko. A host sent direct is named with its reason and fails the close if it reaches the guard.
- **Backups (arc 1):** the helper first verifies the wallet's own MAC, then re-seals an edited backup with the test's virtual passkey through the wallet's assembler. The wallet's import check is unchanged, and the plain seal refuses a MAC-bound envelope.

## Arc 1: four e2e reds (closes #749 #630 #612 #643)

### Phase 1. #749: the logs probe waits for its own last line
Assumes F1, I1. `ext/tests/e2e/viewers-csp.test.ts`, `logLines`:
- Stamp a per-call nonce on the lines (`viewer probe <nonce> <i>`); match the last index as a whole token.
- Wait with `pollUntil` (10 s, 50 ms) until the shadow root renders that line's `.cm-line`, then await `scroller()`'s two frames before returning, so the follow latch and the geometry are read after layout. Each caller appends at the end, or one line past a view that rests there, and CodeMirror renders past the viewport.
- Drop the height arithmetic, the stillness latch and their window globals. The timeout's last value names the highest probe index rendered.

**Gate:** `bun run lint`, `bun run typecheck:all`; the file 5 times per browser at `--retry=0` (smoke commands below), all 4 tests green.

### Phase 2. #630: the refused-node reset starts with both protocol FPC rows present
Assumes F2, F3, I2. `ext/tests/e2e/security-reset.test.ts`, second test:
1. Open the popup behind the launch's stand-in, then read the scope (`readActivityScope`).
2. Seed both protocol rows (`seedProtocolFpcs`) and check them with `fpcRowIds`.
3. Arm the refusal, then reload with `reloadExtensionPage`. Home's reads then start against the refusing node, and `getFpcs` finds both rows.

The 15 s budget, `node.hits() > 0` and the route wait stay. The header states the invariant: a discovery still retrying holds the FPC lock the purge takes before it stops PXE retries, and this test does not measure that wait. `Closes #630` as a test-scoping repair; the product wait stays with #553 (OA-1).

**Gate:** lint, typecheck; the file 5 times per browser at `--retry=0`. A temporary Debug Mode trail (removed before the commit) must show three things in each run: a PXE read retrying against the refusal at submit, `clearChainState` returning within 3 s, and the purge under 5 s. Each run's values go in `lessons/phase-2.md`.

### Phase 3. #612: the dApp call that expects no popup reports why it timed out
Assumes F4, I4. In `ext/tests/e2e/fixtures/playground.ts`, `callExpectingNoPopup` catches its `waitForPgResult` timeout, logs one `console.error` line, runs `dumpDeepDiagnostics` and rethrows. `waitForPgResult` itself stays silent, because `runApprovedPgCall` expects its timeouts. `Closes #612` cites #701.

**Gate:** lint, typecheck; `network/sim-methods.test.ts` with `NULO_E2E_PROVERLESS=1`, both browsers, green.

### Phase 4. #643: the passkey row verifies the wallet's MAC, then re-seals with its own passkey
Assumes F5.
- **`helpers/backup-export.ts`:**
  - Import what it calls from the owning modules (`fixtures/dom`, `fixtures/wallet-pages`, `fixtures/navigation`), with `import type` for `ExtensionContext`. Then `import-drivers` may import it without a cycle (README § Fixture layout).
  - `sealPlainBackup` throws on an envelope carrying `backup-mac`.
  - New `sealPasskeyBackup(backup, credential)` runs the wallet's `assembleFullBackup` over the backup's envelope and slices, with `passkeyBackupAuthenticator(credential)`.
- **`helpers/import-drivers.ts`:**
  - Export `readPasskeyPrf`.
  - `buildSyntheticPasskeyBackup` seals through `sealPasskeyBackup`, dropping its own checksum and MAC code.
  - `submitPasskeyFullBackup` waits, with `pollUntil`, for `#/popup/general` or `import-full-backup-error`, and throws the error box's text at once.
- **`helpers/handshake-import.ts`:**
  - `exportBackup`'s passkey branch reads the PRF on its own page. It asserts that the wallet's checksum and `backup-mac` verify (`verifyBackupMac`), then edits and seals with `sealPasskeyBackup`.
  - `importPasskeyFullBackup` becomes the option click plus `submitPasskeyFullBackup(page, file, 300_000)`.
- **`passkey-backup.test.ts`:** after its real `downloadPlainPasskeyBackup`, assert that the file's MAC verifies under its passkey. This is the cheap CI proof that the wallet's export is sound.
- **`network/import-handshake-note-matrix.test.ts`:** the passkey row runs in CI; the settings row keeps its CI skip, and the header gives each row's real reason (OA-2). Runtime budget: the passkey row's distinct failure is a wallet-made passkey backup that verifies yet does not restore usable account state through the real ceremony and PXE; smoke cannot reach the PXE, and the synthetic builder supplies every field itself. About 4 min per network lane, estimated; measured in the PR.
- **Unit test** `ext/scripts/e2e/backup-export.test.ts`, three cases:
  - an envelope with `backup-mac` is refused;
  - the passkey seal verifies, its checksum recomputed the import's way and its MAC checked with `verifyBackupMac` under the same PRF;
  - control: the original MAC fails on the edited body.

**Gate:**
- lint (its `noImportCycles` step included), typecheck, `bun run test`.
- Smoke, both browsers: `passkey-backup`, `passkey-retry`, `passkey-toolbar-panel`.
- With `NULO_E2E_PROVERLESS=1`, both browsers, both rows: `network/import-handshake-note-matrix` and `network/import-handshake-note`.
- After the PR opens: both browsers' network lanes run the passkey row green at retry 0; the PR body gives its measured runtime.

**Arc 1 gate:** `bun run test:all`, `bun run check:plans`; the e2e files above at retry 0.

## Arc 2: two CI bindings (closes #620 #555)

### Phase 5. #620: the network suite launches behind the egress guard
Assumes F6, I3.
- `ext/tests/e2e/global-setup.ts` provides `egressGuard: true` and declares it. `global-setup-smoke.ts`'s comment and `tests/e2e/README.md:79` stop calling network runs unguarded.
- `vitest.e2e.network.config.ts` includes `tests/e2e/egress-guard.test.ts`, whose skip becomes a failing assertion that the guard is armed. The network lane then proves, with a refused background request, that its own launches are guarded. Budget: about 5 s per lane; a unit test cannot launch a browser.
- Inventory on each browser, at retry 0 through `agent.sh`, in calls under 2 h:
  - the full selection with `NULO_E2E_PROVERLESS=1`;
  - the canary files prover-ON in WASM. A run counts only if nothing answers on `127.0.0.1:59834` throughout and its awaiting card reads the browser backend (`waitForAwaitingCardBackend`).
  - The native path is inventoried by the PR's own required canary lanes (presto-server, required mode, which refuses a fallback). This host runs no presto-server: it needs a fixed port and `PRESTO_ALLOW_ALL`, which `CI.md` keeps off shared hosts.
- An undeclared host fails its launch's close and names the host:
  - a price host: the spec seeds or refuses it, as `hero-prices-unavailable` does;
  - bb.js's CRS hosts, on WASM runs (I3): `launchExtension` sends them direct on every guarded launch (one constant beside `DECLARED_REFUSALS`, with its reason). The stand-in drops only when the Testnet node itself goes direct, not whenever a host does (F6);
  - anything else: stop, it is a plan change.

**Gate:** lint, typecheck, `bun run test`; every inventory run green, with each run's recorded hosts in `lessons/phase-5.md`; the smoke `egress-guard.test.ts` green on both browsers.

### Phase 6. #555: smoke and publishers take each artifact by the producer's id
Assumes F7.
- **`_build-extension.yml`:** outputs `chrome_artifact_id` and `firefox_artifact_id` from the existing upload step ids.
- **`_extension-smoke-e2e.yml`:**
  - keeps `artifact_name` as its artifact-mode flag and gains `artifact_id`;
  - the download takes `artifact-ids`.
- **`release.yml`:**
  - `select-assets`' three uploads, `release-notes` and `attach-assets` (`release-${VERSION}`) export their ids;
  - the smokes pass the id their source picks;
  - `attach-assets` takes the trees or `published-assets`, and `release-notes`, by id;
  - both store jobs take `release-${VERSION}` by `needs.attach-assets.outputs`.
- **`nightly.yml`:** `nightly-notes` exports its id; `publish-nightly` and both nightly smokes download by id.
- **Every by-id download** is preceded by a step that fails unless its id, read through `env:`, is a positive integer. No download sets `digest-mismatch`; no digest output is added (D7).
- **New `scripts/ci-cd/artifact-handoffs.test.ts`,** in `publish-packages.test.ts`'s shape, pins for the smoke workflow and the four publisher jobs:
  - each `download-artifact` step names exactly one id, from `inputs.artifact_id` or a `needs.<producer>.outputs` value that maps to the producer's `steps.<upload>.outputs.artifact-id`;
  - each such step is preceded by its id check, and none names `name`, `pattern` or `digest-mismatch`;
  - a mutation turns each clause red.
- **Also:** `release-integrity.test.ts`' finders follow the new shape; `CI.md` and `.github/WORKFLOWS.md` say the handoffs go by id.

**Gate:** `bun run lint:actions`, `bun run test:ci-gating`, `bun run test:release`, lint, typecheck. `behavior-gating` and `aggregators` stay green with no name change.

### Phase 7. #555: `dup-trend` runs jscpd from the lockfile
Assumes F8.
- `jscpd` `5.0.16` becomes an exact root devDependency, and `bun.lock` is regenerated.
- `scripts/dup-trend/report.ts` runs the installed binary, with no `bunx`, and loses `JSCPD_VERSION`; `dup-trend-report.test.ts` pins the exact version in `package.json` instead. The `complexity-budgets` skill's line follows.
- `dup-trend`'s cache save then comes from a locked install. That is #555's first form; its literal "no longer writes the shared key" line describes the second, and the PR body says so.

**Gate:**
- `bun install --frozen-lockfile --force` passes.
- `git diff origin/dev -- package.json bun.lock` adds only jscpd and its platform packages.
- `bun run audit:dup` prints the report.
- `bun run test:ci-gating`, lint, typecheck; the PR's audit gate green.

**Arc 2 gate:** `bun run test:all`, `bun run check:plans`; the PR body gives each browser's network wall-clock before (the latest successful run on another PR) and after.

**Commands.** Smoke, after the armed build `global-setup-smoke.ts:20` names (once per browser): `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/<file> --retry=0`. Network: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 [NULO_E2E_PROVERLESS=1] [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/<file>.test.ts`. Run any e2e only while load1 is under 150.

## Decision ledger

| # | Chosen | Rejected | Why |
|---|---|---|---|
| D1 | #749: wait for the probe's own last line, then two frames | clear the logs first; keep the height wait | the trim is refuted (F1); geometry and stillness infer what the DOM shows directly |
| D2 | #630: seed the protocol rows, keep 15 s | fix #553 here; raise or drop the budget | the budget is the property; #553 is a product fix with its own design (OA-1) |
| D3 | #612: dump in `callExpectingNoPopup`; `Closes` with #701 | dump in `waitForPgResult`; a known-limit close | a watcher expects that wait's timeouts (F4); nothing is left to limit |
| D4 | #643: verify the wallet's MAC, re-seal through the wallet's assembler | change the import; export unedited; a hand-rolled seal | the wallet is right to refuse; an unedited export dials Testnet; one seal, the wallet's |
| D5 | #643: the passkey row runs in CI; the settings row stays local | both rows; neither, with an export-MAC check only | only the passkey row has a failure no PR lane proves (F5); the settings row repeats the pooled row's purge and import (OA-2) |
| D6 | #620: provide the existing key; the control spec fails unarmed | arm every launch and drop the key; a loopback CRS mirror; only a unit pin | the smallest change; a mirror is a new server; the brief asks for a refused request |
| D7 | #555: checked ids plus the action's digest check | export `artifact-digest` and re-check it; tree manifests | the service's record is the upload's digest; a second check duplicates it |
| D8 | #555: jscpd in `bun.lock` | `cache: "false"` on `dup-trend` | CLAUDE.md bans root `bunx`; the binary is pinned and small |
| D9 | two independent arcs, one PR each | one PR; a stack | the lane groups them so; D-orch-1 |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a14ed4`): conditional approve, 8 findings. Opus Plan leg: conditional approve, 10 findings. Every factual claim was checked against the tree; the accepted ones are folded into the phases and the ledger, and `lessons/phase-0.md` lists them. Rejected, with reasons:
- Opus: drop the network include of the control spec. The brief asks for a refused request in the network run; the spec now fails when the guard is off, for about 5 s per lane.
- Opus: an owner ask for the CRS constant. A direct host in the test harness is not an owner-reserved kind; it is pre-described in Phase 5 and applies only if the WASM inventory records a CRS host.
- Opus: follow-up issues for the stale guard wording in the e2e-testing skill and `FIREFOX.md`. onboarding-3 holds both files, so the close-out files one issue.

**Round 2** (Codex resume): conditional approve, 4 findings, all accepted. D5 becomes B: the passkey row is the only PR-lane restore of a wallet-made passkey backup (F5), so it runs in CI with a runtime line; the settings row has no distinct failure. Each prover-ON inventory run counts only with its backend observed. Delivery's title now matches D5. The claims list and the accepted-fix inventory were cut. D1-D4 and D6-D9 hold.

**Round 3** (Codex resume): approve, no new material finding.

## Delivery

- **Arc 1**, branch `worktree-ci-e2e-hygiene-1`, phases 1-4. Title: `test(e2e): fix four e2e reds at their cause; run the passkey import row in ci`. Body: `Closes #749`, `Closes #630`, `Closes #612`, `Closes #643`.
- **Arc 2**, branch `worktree-ci-e2e-hygiene-1-arc2` off `origin/dev`, phases 5-7. If arc 1 is still open, cherry-pick the plan commit. Title: `ci: guard network e2e egress; take artifacts by id; jscpd from the lockfile`. Body: `Closes #620`, `Closes #555`. Its close-out commits come after arc 1 merges.
- **Labels:** `code_review: off` for both arcs. Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke` only if a path filter skips a suite the PR needs.
- **Collisions:** #743 also changes `bun.lock`, `fixtures/egress-guard.ts`, `fixtures/extension.ts` and `helpers/import-drivers.ts`, in other hunks. Whichever lands second merges `dev` and reruns `bun install --frozen-lockfile --force`.
- **Parallelism:** the arcs share no file. The critical path is arc 2's inventory.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at 18d29f23. What is specific to this plan:
- **Reviewer:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`.
- **Placement:** one loop per arc, over that arc's diff, before its PR opens.
- **Deviation:** no separate cross-arc session. The arcs share no file; arc 2's first prompt names arc 1's diff and their one seam, the guard over the matrix test.
- **Hard stop:** three rounds.
- **Close-out, in arc 2's PR after merging `dev`:**
  - Comment on #553 with F2's numbers and OA-1's answer.
  - File one issue for the stale guard wording in the e2e-testing skill and `FIREFOX.md`.
- **Teardown:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-e2e-hygiene-1/plan.md` succeeds, run `agent-worktree done ci-e2e-hygiene-1 --merged`.

## Seeds

`/goal` (recommended): `All phases of implementations-plan/ci-e2e-hygiene-1/plan.md are ✓ in that file, each backed by its gate's commands passing in the transcript and a printed LESSONS_FILE=implementations-plan/ci-e2e-hygiene-1/lessons/phase-N.md; each arc's Codex loop converged (a resumed pass reporting no new material finding, quoted); both PRs exist, opened after their loops, arc 2 carrying the close-out (git show --stat of the archive move); bun run test and bun run lint exit 0.`

`/loop 15m` (fallback): `Drive implementations-plan/ci-e2e-hygiene-1 forward: read plan.md and lessons/; take the next unchecked phase, run its gate with plan.md's smoke or network commands, mark ✓, log the lessons file; at an arc's last phase run its Codex loop, then open its PR; never raise a timeout, add a retry or a skip; network e2e only through agent.sh, every e2e at retry 0 with load1 under 150; stop and report on a stop rule.`
