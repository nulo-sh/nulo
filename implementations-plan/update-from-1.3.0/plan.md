---
plan: update-from-1.3.0
tier: light
status: in progress
issues: "#1901 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no recon agent (the planner read the tag by hand); one Codex pass (gpt-6.1-sol, high) over the plan and the completed diff, then targeted verification of material fixes (bounded work)
post_implementation_hardening: not scheduled
base: origin/dev at 93aeedbc1
trunk: dev
---

# update-from-1.3.0: the update scenarios run from v1.3.0

v1.3.0 shipped on 2026-11-19, so the next promote updates from it (`.claude/skills/release/SKILL.md` § Stable release, step 1). One arc, one PR against `dev`, test files and docs only, closing #1901, in the shape #1686 set for v1.2.0 ([archive](../archive/update-from-1.2.0/plan.md)). Two things stand between "pin and record" and a green run (F4, F5). Evidence: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** whoever runs the next promote's step 1, and the PR's reviewer: both must trust the pins and the new trait without redoing the work.
- **Excellent:** every pin traces to a check the PR body shows (F1); each trait to the tag's files with file and line; every run at retry 0, at a named commit, candidates built from it, with its window, wall-clock and outcome; a red run reported with its cause, never patched.
- **Good enough:** the older releases' entries and recordings stay; the arrival scenario is not run (v1.3.0 seeds Mainnet), nor the profile-chaos `pre-update` start (it reads only `passkey`, which `unlocks` covers).

## Assumptions

**Facts** (verified 2026-11-19):
- F1. Our download of v1.3.0 (tag commit `be2280a88`, on `main`): Chrome `5ba54bb3…36a3`, Firefox `e678479f…ca40`. `sha256sum -c` OK; equal to GitHub's asset digests; `gh attestation verify` with #1314's flags and `--source-digest be2280a881b8b087e21cfc4d2dc7b7d18fd0457b` exit 0 for both; `isImmutable: true`, `gh release verify` and `verify-asset` exit 0. Both manifests read `1.3.0.0`.
- F2. Traits `storage: sealed`, `connect: own-window`, `passkey: unlocks`, `testnetHost: aztec-testnet.drpc.org`, `sponsor: listed-chains`, each from the tag's files ([recon.md § Traits](recon.md#traits-from-the-tags-files)). The release's source equals `dev`'s at `93aeedbc1` except the version files and `CHANGELOG.md` (`git diff --stat v1.3.0 93aeedbc1`), so every candidate-side helper drives it as it drives the candidate.
- F3. v1.3.0 seeds Nulo's relay as a second endpoint on Alpha and Testnet (#1757): hosts `testnet.rpc.nulo.sh` and `rpc.nulo.sh` in the zips' `assets/seeds-CCF6EBFS.js` (one blob in both), read with every URL cut to its host. `seeds.ts` is one blob at v1.3.0 and `dev` (`f0f449801`), so these are the hosts `RELAY_NODE_HOSTS` in `fixtures/egress-guard.ts` already declares and holds; `network-endpoints.ts` is one blob at v1.2.0, v1.3.0 and `dev` (`c3668a2c5`, never opened). The live scenario's `moveEndpointsToLoopback` moves every outside endpoint of a network, the relay's included (`fixtures/update/loopback-endpoints.ts:61-69`).
- F4. **v1.3.0's Send asks who is paid first** (demonstrated by code trace; Phase 2 step 2 runs it red). Home's Send opens `send-person-step`; `send-from-type` renders only in the form a chosen recipient opens (`popup/pages/send.vue:1128` at the tag), and the payer is picked among `send-fee-payers` radios in the Fee sheet, not the `send-fee-method-trigger` menu (#1795). `openReleaseSend` waits for `send-from-type` right after Home's Send (`fixtures/update/release-ui.ts:20-23` at the base), so `pickPreferences` and `populatePending` time out there. v0.31.0 through v1.2.0 hold no `send-person-step` and no `send-fee-payers` outside tests.
- F5. **The candidate must rise above `1.3.0.0`.** `dev` at `93aeedbc1` reads `1.2.0` (the bump is in the sync PR #1900, open), so its candidate is `1.2.0.1`, which `updateBuilds` refuses (`fixtures/update/in-place.ts:42`).
- F6. `update-recording.test.ts:45` requires the same tags in both maps and `:78-89` a recording for every sealing tag, so the trait commit reds that one case until the recording lands. The candidate check excludes `apps/extension/tests` and `implementations-plan` (`fixtures/update/source.ts:7`).
- F7. New key families in v1.3.0 (`discoveryPolicy` sealed, `uiWhatsNewSeen` plaintext) are absent from v1.2.0, so they stay out of `HELD` (`fixtures/update/verify.ts:36`); the replay expects the release's own What's new marker, `1.3` (`update-replay.test.ts:683`).

**Asks:** A1, wait for #1900 to merge before any build; never merge it or its branch into the arc (a squash would carry main's release commit). Working assumption: it merges on green; if it has not merged by the end of this session, the arc stops after Phase 1 with the plan and the code committed, reported as blocked on #1900.

## Architecture & Implementation (arc 1)

Files: `fixtures/update/release.ts`, `fixtures/update/release-ui.ts`, `network/update-in-place.test.ts`, `fixtures/update/v1.3.0.storage.json` (new, written by the scenario), all under `apps/extension/tests/e2e/`; `apps/extension/tests/e2e/README.md`; `.claude/skills/release/SKILL.md`. No product file; none of the colliding leads' files.

### Phase 1: pins, the `send` trait, docs
1. `RELEASE_DIGESTS["v1.3.0"]` from F1; `RELEASE_TRAITS["v1.3.0"]` from F2 plus `send: "person-first"`.
2. `ReleaseTraits` gains `send: "one-form" | "person-first"` (D1), one TSDoc sentence beside the others; v0.31.0 through v1.2.0 `one-form`.
3. `release-ui.ts`: `openReleaseSend` and `selectReleaseSendFee`, always called as a pair, become one `pickReleaseSendFee(page, release, recipient, method)`. `one-form` keeps today's steps exactly; `person-first` runs the candidate's own Send helpers (`openSend`, `chooseRecipient`, `selectSendFeeMethod` in `fixtures/send-page.ts`), which drive v1.3.0's source as is (F2). The recipient is `cfg.minterAddress`, the send's recipient in both scenarios. Choosing it writes nothing; the pick saves on the radio (`useFeeSelection.ts`, `pickForSend`).
4. README § In-place update: the traits bullet names `send`; the live bullet says whom a `person-first` release's Send pick is for. The release skill's step 1 parenthetical lists the new trait. The `e2e-testing` skill names no start release: unchanged.
5. Commit: `test(e2e): pin v1.3.0 and its traits, and drive its person-first send`.
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e`. Pass: exit 0 except exactly one failure, `the committed v1.3.0 recording …` (F6). Met before the commit: lint 0, typecheck 0, 770 passed and that one failure.
6. The Codex pass (§ Post-implementation) over the plan and this diff, before any build, so its fixes cost no rerun.

### Phase 2: record and run, retry 0, one e2e run at a time
Never set `NULO_E2E_BACKUP_RECORD`; never touch another tag's recording or the pinned backups. Each run through `e2e:agent` (live) or `test:e2e` (replay) with `NULO_E2E_UPDATE_FROM`, `NULO_E2E_UPDATE_TO`, `NULO_E2E_RETRY=0` / `--retry=0`, its log polled in a bounded loop inside one tool call. Before each: `git status --porcelain -- apps/extension` empty (except step 2's one edit and the untracked recording before its commit).
1. After #1900 merges: merge `origin/dev`; `apps/extension/package.json` reads `1.3.0`. Build both candidates (`build-update-candidate.sh chrome|firefox`): manifests `1.3.0.1`. Note the browser versions.
2. Red control for D1: v1.3.0's `send` set to `one-form` in the working tree only (`git diff` shows that one line). Live, Chrome. Expected: red at `waitForSelector('[data-testid="send-from-type"]')` (10 s) inside `pickReleaseSendFee`, no other error first. Restore; `git diff --quiet`.
3. Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`; then live, Firefox. Note the UTC windows: the recording's dApp session expires 7 days after the Chrome run.
4. Check the recording as #1876 did (tag, browser, loopback dials, no `nulo:e2e:` key, every plaintext URL loopback, no `0x` plaintext, `recordingProblems` clean), then commit it with the measured runtime line: `test(e2e): record v1.3.0's storage for the update replay`. Phase 1's gate now passes in full.
5. Rebuild both candidates at that commit `T`, then at retry 0: live Chrome, live Firefox, replay Chrome, replay Firefox, and the D3 control, live Chrome from v1.2.0.
- **Gate:** step 2 red as expected; steps 3 and 5 pass, all four replay cases on both browsers (a skipped case is not a pass). A red a pin, a trait or the driver answers returns to Phase 1 (fix, commit, rebuild, restart at step 3). A red the candidate causes is reported, not patched: `ARC_FAILED`. A Chrome live run that did not pass leaves no recording.

### Phase 3: delivery
1. Targeted verification of any material fix since the Codex pass; a fix outside `implementations-plan/` moves `T`: rebuild, rerun step 5.
2. Merge `origin/dev`; if anything outside the plan moved (`git diff --stat T HEAD -- . ':(exclude)implementations-plan'`), rebuild and rerun step 5 at the merged head. `lint`, `typecheck:all`, `test:all`, `check:plans` at the final head.
3. Close-out commits; push; open the PR ready, no label (`apps/extension/**` trips both e2e filters); `gh pr checks <n> --watch`.

## Security & Adversarial Considerations

- **A tampered zip** enters the pins: refused by our download checked four ways (F1); the build and immutable-release attestations do not share the release's storage; the pin then refuses other bytes on every run (`release.ts` `releaseProblem`).
- **A provider key in a committed artifact:** traits are bare hostnames (a unit test refuses more), read with URLs cut; `network-endpoints.ts` opened at no revision; log excerpts have URLs replaced before copying; the recording is audited (Phase 2 step 4).
- **Egress:** the guard refuses the release's Testnet and relay hosts (declared, F3); Fee Juice is bridged on the run's own anvil and sandbox; no Testnet, no Mainnet, no funded account.
- **Supply chain:** no dependency change. N/A: cryptography, permissions, product code.

## UI impact

None. Test files and docs only; no screen changes.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | A `send` trait; `person-first` drives the candidate's own Send helpers | (a) detect the person step on the page; (b) only v1.3.0 and up, dropping older starts | the fixture's rule is a reviewed trait per tag, not an inference from the screen (as `connect`); (b) drops coverage the promote of an older line may need |
| D2 | No relay trait: the release's relay hosts are the candidate's, by blob (F3), and `RELAY_NODE_HOSTS` declares them | a `relayHosts` trait like `testnetHost` | #1650 added a trait for the Testnet host because the releases' differed from the candidate's, and gave Mainnet's none because it did not; a later candidate that moves the relay hosts fails the guard's close loudly on the release's request, and that change adds the trait |
| D3 | A control from v1.2.0 (live, Chrome) at `T` | none | the populate's Send step changed for every release; one run shows `one-form` still passes, and it is the like-for-like runtime baseline |
| D4 | Commit the trait before building, the recording after step 3, rerun everything at `T` | build first | F6: any commit moves HEAD off the candidate |

## Review verdicts

(filled as the pass runs)

## Delivery

- **Arc 1** = Phases 1-3 on `worktree-update-from-1.3.0`; one PR against `dev`, no stack. Title: `test(e2e): the update scenarios run from v1.3.0` (47 characters). `Closes #1901`, `Refs #1686`.
- **Body:** the digests and the four checks; the traits table with each deciding file and line; F4 and F5 with their traces and step 2's red; every run with its commit, browser version, window, outcome and duration; the live wall-clock from v1.2.0 (D3) and v1.3.0 at `T`; these opt-in specs run in no CI lane, so no suite's wall-clock changes; the recording's SHA-256, time and expiry.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `93aeedbc1`, its bounded-work rule. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Codex pass** (Phase 1 step 6): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over this plan and `origin/dev...HEAD`; material fixes verified by a resumed session (`resume-codex.sh`); logged in `lessons/phase-1.md` and under Review verdicts.
- **Close-out:** the Outcome block (`Known limits:`, `Open items:`, the seeds retired); lessons within 8 KiB; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line to `archive/index.md`; `check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/update-from-1.3.0/plan.md` succeeds, `agent-worktree done update-from-1.3.0 --merged`; relay a refusal.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/update-from-1.3.0/plan.md delivered: Phases 1-3 marked ✓ with their gates in the transcript; the Codex pass (gpt-6.1-sol high) quoted and its material fixes verified; the PR open against dev, ready, Closes #1901, its head differing from the tested commit only in implementations-plan/.
```

```
/loop 15m Drive arc 1 of implementations-plan/update-from-1.3.0 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits, one e2e run at a time polled in a bounded loop. Open the PR ready once the pass is verified, watch checks, report and stop. Never merge.
```
