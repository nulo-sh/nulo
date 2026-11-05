---
plan: update-from-1.2.0
tier: light
status: approved (arc 1 in progress)
issues: "#1680 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) plus one Opus Plan leg; a final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at c4767e8e7 (drafted at 5f95ea108)
trunk: dev
---

# update-from-1.2.0: the update scenarios run from v1.2.0

v1.2.0 shipped on 2026-11-05, so the next promote updates from it (`.claude/skills/release/SKILL.md` § Stable release, step 1). One arc, one PR against `dev`, test files and docs only, closing #1680, after the shape #1314 set for v1.1.0. Two things stand between "pin and record" and a green run (F4, F5). Evidence: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** whoever runs the next promote's step 1, and the PR's reviewer: both must trust the pins and the new trait without redoing the work.
- **Excellent:** every pin traces to a check the PR body shows (F1); each trait to the tag's files; every run at retry 0, at a named commit, candidates built from it, with its window, wall-clock and outcome; a red run reported with its cause, never patched.
- **Good enough:** the older releases' entries and recordings stay as they are; the arrival scenario is not run (F6), nor the profile-chaos `pre-update` start (not on the promote's path; `helpers/profile-chaos/spec.ts:122` reads only `passkey`, which `unlocks` already covers).

## Assumptions

**Facts** (verified 2026-11-05):
- F1. Our download of v1.2.0 (tag commit `7793112bc`): Chrome `559bc220…a2f0`, Firefox `a107680a…4f70`. `sha256sum -c` OK, equal to GitHub's asset digests, `gh attestation verify` (#1314's flags, `--source-digest 7793112bc70849bc3817e468b3862294bc1b3522`) exit 0 for both; the tag commit is on `main`. New since immutable releases: `isImmutable: true`, and `gh release verify` / `verify-asset` exit 0.
- F2. Traits `{ storage: "sealed", connect: "own-window", passkey: "unlocks", testnetHost: "aztec-testnet.drpc.org" }` from the tag's files ([recon.md § The traits](recon.md#the-traits-from-the-tags-files)). The host was read from the zips' seeds bundle with every URL cut to its host, as #1650 read the others. It equals the candidate's own Testnet host, which `DECLARED_REFUSALS` already declares; the release entry is kept anyway, since the trait is required and the guard derives from it. Without reading it, `git ls-tree` shows `network-endpoints.ts` as one blob at v1.2.0 and HEAD (`c3668a2c5`; v1.1.0 `88d49afbb`), so Mainnet too is the candidate's own host and needs no trait, as #1650 found.
- F3. `release.ts:13-26` and `:46-50` pin three tags; `update-recording.test.ts:45` requires the same tags in both maps, and `:78-89` requires a recording for every sealing tag. So the trait commit reds that one case until the recording lands.
- F4. **A candidate from `5f95ea108` cannot rise above v1.2.0.** That `dev` read version `1.1.0` (the bump was in the sync PR #1677), so its candidate is `1.1.0.1`, which `updateBuilds` refuses (`fixtures/update/in-place.ts:43`). #1677 merged at 17:15Z; `dev` at `c4767e8e7` descends from `v1.2.0` and reads `1.2.0`, so its candidate is `1.2.0.1`.
- F5. **The live populate pays with a sponsor v1.2.0 does not offer there** (demonstrated by code trace; Phase 2 step 2 runs it red). `pickPreferences` and `sendFromWallet` pick `"sponsored"` (`update-in-place.test.ts:322`, `:339`) on the custom sandbox network, whose derived chain id is unlisted. v1.2.0 offers the canonical sponsor only on Testnet and chain 0 (`fpc/sponsored-fpc-chains.ts:6`), never discovers it elsewhere (`fpc/service.ts:176`), and refuses to add it by hand (`:361`). So the release has no `send-fee-method-sponsored` row, the populate fails, and without a passing Chrome live run there is no recording to replay.
- F6. v1.2.0 seeds Mainnet: the arrival scenario's precondition fails, as the README says.
- F7. The candidate check excludes `apps/extension/tests` and `implementations-plan` (`fixtures/update/source.ts:7`), so an uncommitted fixture is unseen, and any commit moves HEAD off the built candidate.

**Asks:** none open. A1 (wait for #1677, never merge it or its branch into the arc) closed when #1677 merged.

## Architecture & Implementation (arc 1)

Files: `apps/extension/tests/e2e/fixtures/update/release.ts`, `apps/extension/tests/e2e/network/update-in-place.test.ts`, `apps/extension/tests/e2e/fixtures/update/v1.2.0.storage.json` (new, written by the scenario), `apps/extension/tests/e2e/README.md`, `.claude/skills/release/SKILL.md`. No product file, no collision with the leads the lane brief names.

### Phase 1: pins, the `sponsor` trait, docs
1. `RELEASE_DIGESTS["v1.2.0"]` from F1; `RELEASE_TRAITS["v1.2.0"]` from F2 plus `sponsor: "listed-chains"`.
2. `ReleaseTraits` gains `sponsor: "every-chain" | "listed-chains"`: whether the release offers the canonical Sponsored fee payer on every chain, the run's custom sandbox network included, or only on the chains it lists. v0.31.0, v1.0.0, v1.1.0 `every-chain` (D2). One TSDoc sentence beside the others.
3. In the live scenario, under `listed-chains`: `receiveOnSandbox` also bridges public Fee Juice to the account (`fundPublicFeeJuice`, the existing fixture, before the Send pick so its Fee Juice row is enabled), and `pickPreferences` and `sendFromWallet` pick `"public"` (Fee Juice). One pure mapping from the trait to the method; `every-chain` keeps `"sponsored"` and needs no funding. The header says so; its runtime line gets the bridge's estimate here and the measured ranges in Phase 2 step 4.
4. README § In-place update: the traits bullet names `sponsor`; the live bullet says how a `listed-chains` release pays. The release skill's step 1 parenthetical lists every trait (it misses `testnetHost` since #1650, and now `sponsor`); a pin made from it is refused by `ReleaseTraits`' type. The `e2e-testing` skill names no start release: unchanged.
5. Commit: `test(e2e): pin v1.2.0 and its traits, and pay its sandbox send from fee juice`.
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e`. Pass: exit 0 except exactly one failure, `the committed v1.2.0 recording … no recording of v1.2.0` (F3), the red proof that the check covers the new tag.
6. The review loop (§ Post-implementation), round 1 over `origin/dev...HEAD`, before any build, so its fixes cost no rerun.

### Phase 2: record and run, retry 0, one e2e run at a time
Never set `NULO_E2E_BACKUP_RECORD`; never touch another tag's recording or the pinned backups. Each run goes through `e2e:agent` or `test:e2e`, from the commands #1650's PR body lists with `NULO_E2E_UPDATE_FROM=v1.2.0`, `NULO_E2E_RETRY=0` / `--retry=0`, its log polled in a bounded loop inside one tool call. Before each run: `git status --porcelain -- apps/extension` empty (except the new recording after step 3, and step 2's one edit), load1 < 150.
1. Confirm `apps/extension/package.json` reads `1.2.0` (F4). Build both candidates (`build-update-candidate.sh chrome|firefox`): manifests `1.2.0.1`. Note the browser versions.
2. Red control for D2: v1.2.0's `sponsor` set to `every-chain` in the working tree only (F7); `git diff` must show that one line and nothing else before the run. Live, Chrome. Expected: red with `selectFeeMethod: send-fee-method-sponsored was not selectable within 45000ms (now absent)` (`fixtures/transfers.ts:273`), and no other error first. Restore the file; `git diff --quiet` must hold.
3. Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`; then live, Firefox. Note the UTC windows: the recording's session expires 7 days after the Chrome run.
4. Check the recording as #1314 did (tag, browser, loopback dials, no `nulo:e2e:` key, plaintext URLs counted and all loopback, `recordingProblems` clean), then commit it with the header's measured ranges from step 3: `test(e2e): record v1.2.0's storage for the update replay`. Phase 1's gate now passes in full.
5. Rebuild both candidates at that commit `T`, then, at retry 0: live Chrome, live Firefox, replay Chrome, replay Firefox, and the D3 control, live Chrome from `v1.1.0`.
- **Gate:** step 2 red as expected; steps 3 and 5 pass, all four replay cases on both browsers (a skipped case is not a pass). A red that a pin, a trait or the populate answers returns to Phase 1: fix, commit, rebuild, restart at step 3. A red the candidate causes is reported, not patched: the arc stops with `ARC_FAILED`. A Chrome live run that did not pass leaves no recording: delete it.

### Phase 3: delivery
1. The review loop resumed over the delta since round 1 (the recording, the runtime line), to convergence. A fix outside `implementations-plan/` moves `T`: rebuild and rerun step 5.
2. Merge `origin/dev`; if anything outside the plan moved (`git diff --stat T HEAD -- . ':(exclude)implementations-plan'` non-empty: a merged test change counts, since `source.ts` only says what a build reads), rebuild and rerun step 5 at the merged head, which becomes `T`. `lint`, `typecheck:all`, `test:all`, `check:plans` at the final head.
3. The close-out commits (§ Post-implementation). The PR head then differs from `T` only in `implementations-plan/`, which the body shows with that same `git diff --stat`.
4. Push, open the PR ready, `gh pr checks <n> --watch`.

## Security & Adversarial Considerations

- **A tampered zip** enters the pins: refused by our own download checked four ways (F1). The build attestation and the immutable-release attestation are the two that do not share the release's storage; the pin then refuses other bytes on every run (`release.ts:68-87`).
- **A provider key in a committed artifact:** the trait is a bare hostname (a unit test refuses more), read from the bundle with URLs cut; `network-endpoints.ts` is opened at no revision; a log excerpt has its URLs replaced before it is copied. The recording's sealed rows are opaque to the URL count; only the live run's moved-host check reads them (#1314's residual, unchanged).
- **Egress:** the guard refuses the release's Testnet host (declared, F2); Fee Juice is bridged on the run's own anvil and sandbox; no Testnet, no funded account.
- **Supply chain:** no dependency change. N/A: cryptography, permissions.

## UI impact

None. Test files and docs only; no screen changes. The orchestrator's no-ask budget for this lane is "UI impact: none".

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | v1.2.0's four traits from the tag's files; its Testnet host from the zip, host only (F2) | infer from v1.1.0; open the endpoints file at the tag | the fixture's rule (a reviewed trait per tag); the brief forbids that file |
| D2 | A `sponsor` trait, and under `listed-chains` the populate pays from Fee Juice it bridges to the account | (a) Fee Juice for every release; (b) the release's Local Network (chain 0) moved onto the sandbox; (c) a hand-added sponsor at a non-canonical address; (d) the PrivateFPC on bridged fuel | (a) drops v1.1.0's sponsor pick, the one path that proves the candidate forgets a deleted sponsor's picks (#1665), and re-proves three releases' fee UI; (b) moves every chain-bound row off a custom network, losing that coverage; (c) deploys and funds a second sponsor; (d) adds a claim and a mint. The trait keeps every older path as it was, and the fixture's rule is a reviewed trait, not an inference from the screen |
| D3 | A control from v1.1.0 (live, Chrome) at `T` | none | the populate's code changed for every release; one run shows `every-chain` still passes, and it is the like-for-like runtime baseline |
| D4 | Cut the arc from a `dev` that holds #1677 | merge #1677's branch into the arc | a squash of the arc would then carry main's release commit and break the version anchor the sync's merge commit exists for; moot once #1677 merged at 17:15Z |
| D5 | Commit the trait before building, the recording after step 3, rerun everything at `T` | build first | F7: any commit moves HEAD off the candidate |

## Review verdicts

- **Codex plan audit** (gpt-6.1-sol, high, read-only): conditional approve, high confidence in D2 (the first send's deploy pays from preexisting Fee Juice, `execution/fee/fee-juice-strategy.ts:37`; the Send row enables on a positive public balance, `fee-helpers.ts:287`; the funding adds nothing a check compares). P2: the final rerun rule excluded `apps/extension/tests`, so a merged test change could escape (Phase 3 step 2 fixed). P3: step 2 contradicted the clean-tree preflight (exempted, its diff checked). Both accepted.
- **Opus Plan leg:** conditional approve; F5 and the Fee Juice path verified (`fee-methods.test.ts:330-349` pays an undeployed account's first Send from public Fee Juice). Accepted: the same rerun rule (P2-1); the runtime line measured before `T` (P2-2, Phase 2 steps 3-4); the review loop before the builds (P2-3, Phase 1 step 6); the exact expected red (P3-1); Mainnet's host by blob id (P3-2, F2); the like-for-like runtime and no-CI statement (P3-4); why the chaos start is not run (P3-5); the tag on `main` (F1). Moot: the wait's bound (P3-3), as #1677 merged.
- **Final Codex pass** (fresh session, gpt-6.1-sol, high): **approve**, high confidence, no new findings.

## Delivery

- **Arc 1** = Phases 1-3, branch `update-from-1.2.0-a1` off `origin/dev` carrying the plan commit; one PR against `dev`, no stack (D-orch-1), no label (`apps/extension/**` trips both e2e filters). Title: `test(e2e): the update scenarios run from v1.2.0` (47 characters). `Closes #1680`, `Refs #1314`.
- **Body:** the digests and the four checks with F1's commands; the traits table with each deciding file and line; F4 and F5 with their traces and step 2's red; every run with its commit, browser version, window, outcome and per-file duration; the live scenario's wall-clock per browser from v1.1.0 (D3) and from v1.2.0, both at `T`, which isolates the bridge's cost; these opt-in specs run in no CI lane, so no suite's wall-clock changes; the recording's SHA-256, UTC time and expiry.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `5f95ea108`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop** (Phase 1 step 6, resumed in Phase 3 step 1): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus `general-purpose` review beside round 1; hard stop at three rounds; each round in `lessons/phase-1.md` or `lessons/phase-3.md` and under Review verdicts.
- **Close-out:** the Outcome block (`Known limits:`, `Open items:`, the seeds retired); lessons within 8 KiB; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line to `archive/index.md`; `check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/update-from-1.2.0/plan.md` succeeds, `agent-worktree done update-from-1.2.0 --merged`; relay a refusal.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/update-from-1.2.0/plan.md delivered: Phases 1-3 marked ✓ with their gates in the transcript; the Codex loop (gpt-6.1-sol high) converged, quoted; the PR open against dev, ready, Closes #1680, its head differing from the tested commit only in implementations-plan/.
```

```
/loop 15m Drive arc 1 of implementations-plan/update-from-1.2.0 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits, one e2e run at a time polled in a bounded loop. Open the PR ready after the loop converges, watch checks, report and stop. Never merge.
```
