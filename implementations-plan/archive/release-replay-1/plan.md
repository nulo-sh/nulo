---
plan: release-replay-1
tier: light
status: completed in part
issues: "none closed; refs #1314; #1636 filed in Phase 1"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet); one Codex audit (gpt-6.1-sol, high), resumed until approve; no Claude leg
post_implementation_hardening: not scheduled
base: origin/dev at 3b845ef02
trunk: dev
---

## Outcome

- Date: 2026-11-03.
- Status: completed in part. The recording is refreshed, delivered as the PR `test(e2e): the v1.1.0 recording refreshed for the 1.2.0 candidate` against `dev`, awaiting the merge. The promote stays held: both live runs are red at the egress guard (#1636).
- Shipped: `fixtures/update/v1.1.0.storage.json`, recorded again from Chrome at a candidate built from `55b2ad17b` (SHA-256 `217c3d50…38fd`). Both replays pass all four cases with it at `55b2ad17b`; the runs at the PR's head are in its body.
- Did not hold: I1. Both live runs fail at the guard's close on v1.1.0's own Testnet host, which #1622 left undeclared, and the close's error hides whether the update itself passed ([lessons/phase-1.md](lessons/phase-1.md)).
- Lessons: none promoted. The cause is an open issue, and `lessons.md` is at its budget.
- Known limits: none.
- Open items: #1636.
- Deadline: the recording's dApp session expires 7 days after 2026-11-03 18:06-18:09 UTC. The replay refuses it from 2026-11-10 17:56 UTC at the earliest; record it again before a promote after that.
- Seeds retired: the `/goal` and `/loop` seeds below. Do not run them.

# release-replay-1: the v1.1.0 recording refreshed, and the update scenarios run against the 1.2.0 candidate

The release runbook's step 1 (`.claude/skills/release/SKILL.md` § Stable release) updates the last release, v1.1.0, in place to a candidate of `dev` on both browsers before the promote: the live scenario and the replay, since `dev` is still on v1.1.0's Aztec line. The replay reads `apps/extension/tests/e2e/fixtures/update/v1.1.0.storage.json`, recorded on 2026-10-28 (#1314), and refuses it once its dApp session is within 10 minutes of expiry, about 2026-11-04 07:21 UTC. This lane records it again from the live Chrome run and runs all four scenarios at retry 0. Test fixture only; no scenario, trait, digest or product file changes. Evidence: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** the person who runs the 1.2.0 promote's step 1, and the reviewer of this PR.
- **Excellent:** (1) every run is at retry 0, at a named commit with a clean tree, with its UTC window, wall-clock and outcome; a red run is reported with its cause, never patched or retried to green. (2) The new recording passes the committed-recording unit check and the hand check, replays at the PR's head on both browsers, and the PR names its expiry.
- **Good enough:** the arrival scenario and the v0.31.0 and v1.0.0 replays are not run (F6).

## Assumptions

**Facts** (verified 2026-11-03 at `3b845ef02`):
- F1. v1.1.0 (tag commit `241097f6c`) is the latest stable release; its digests and traits are pinned (`fixtures/update/release.ts:22-25`, `:46`, `{ sealed, own-window, unlocks }`).
- F2. `@aztec-labs/accounts` is `6.0.0` at `v1.1.0` and at HEAD (`apps/extension/package.json:38`), so the live scenario applies (README § In-place update).
- F3. A candidate names its build commit, and the scenarios refuse it unless that commit is HEAD and no file a build reads differs (`fixtures/update/in-place.ts:18-30`, `fixtures/update/source.ts:7,20-25`). `apps/extension/tests` and `implementations-plan` are not build inputs. So the plan commit may precede the builds, the recording may stay uncommitted during the runs, and any commit moves HEAD off the candidate.
- F4. The live Chrome run with `NULO_E2E_UPDATE_RECORD=1` writes the recording at the end of populate, before the update (`network/update-in-place.test.ts:407-414`), after populate's checks, the moved-host check (`:290-297`) and `recordingProblems` (`:411-412`) pass. A run that goes red later still leaves a written file.
- F5. A v1.1.0 dApp session expires 7 days after it is made (`dapp-session/service.ts:246` at the tag). The replay reads it through the release's services and refuses it from 600 000 ms before expiry (`fixtures/update/release-reads.ts:63,86-88`).
- F6. v1.1.0 seeds Mainnet, so the arrival scenario's precondition fails from it (README § In-place update; archived plan F5).
- F7. No commit since #1314 (`210d02f1f`) touched the two scenario files, `fixtures/update/`, the candidate script or the recording unit test (`git log 210d02f1f..HEAD -- <paths>` is empty).
- F8. The unit check runs over every sealing tag: the recording must replay as a sealing release's, and every plaintext URL in it must be loopback (`scripts/e2e/update-recording.test.ts:62-74`). Sealed rows are opaque to it; only the live run's `namedHostCount` (`update-in-place.test.ts:290-297`) checks decoded rows for the hosts its endpoints moved off.
- F9. Firefox moved from 153.0.4, the last green runs' browser, to `stable_158.0` (`fixtures/browser/firefox-revision.ts:6`, #1338). Chrome stays 155.0.8059.79 (Puppeteer 25.14.0).

**Inferences:**
- I1. All four runs pass at HEAD. Basis: F7; #1622's endpoint move matches no loopback row; the replay's seed check compares chain ids, which did not move; every testid still occurs ([recon.md](recon.md)). Untested against an update: F9, the reworked backup export (#1559) the replay ends with, and the Terms sheet wait (#1322). A hypothesis that Phase 1 tests.

**Asks:** none. The lane brief fixes the scope, the runs, the PR title and what stays out.

## Architecture & Implementation (arc 1, branch `worktree-release-replay-1`)

- **Touched files:** `apps/extension/tests/e2e/fixtures/update/v1.1.0.storage.json` (rewritten by the live Chrome run), and this plan's directory. No other file.
- **Flow:** plan commit `P` → both candidates built at `P` → live Chrome (records) → live Firefox → replay Chrome → replay Firefox, one at a time → the recording checked and committed → review loop → close-out commits, after merging `origin/dev` → both candidates rebuilt at the final head `H` → both replays again with the committed recording, and both live runs too when a build input moved (D2) → push, PR.
- **Two outcomes.** *Recording delivered*: the Chrome live run wrote the file and Phase 2's checks pass; the PR ships. *Promote ready*: every run at `P` and at `H` passed. A red run blocks only the second; it goes to `OWNER-ASKS.md` and holds the promote (D3).
- **Alternative not taken:** commit the recording first and build after. Refused: the recording comes from a run whose candidate must already equal HEAD (F3), so the order is fixed.

### Phase 1: build and run, retry 0, no commit ✗ (both live runs red at the egress guard, #1636; both replays green: [lessons/phase-1.md](lessons/phase-1.md))
Warning: never set `NULO_E2E_BACKUP_RECORD`. Never touch another tag's recording or the pinned backups. Never print a URL from a run log.
1. Confirm `git status --porcelain` is empty and HEAD is `P`. Write `P` and `git diff --stat origin/dev P -- . ':(exclude)implementations-plan'` (empty) to `lessons/phase-1.md`.
2. From the repo root, run `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, then `... firefox`. From `apps/extension`, run `bun scripts/e2e/install-firefox.ts`. Note both browser versions.
3. Live, Chrome, recording: `NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/chrome NULO_E2E_UPDATE_RECORD=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts`. Note its UTC start and end.
4. Live, Firefox: the same command with `NULO_E2E_BROWSER=firefox`, the firefox candidate, and no `NULO_E2E_UPDATE_RECORD`.
5. Replay, Chrome: `cd apps/extension && NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/chrome bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0`. Then the same with `NULO_E2E_BROWSER=firefox` and the firefox candidate.
6. Before each run, `git status --porcelain` must be empty, except ` M …/v1.1.0.storage.json` after step 3 and this plan's untracked files.
7. Run each command in the foreground, its log polled in a bounded loop inside one tool call. Record each run's UTC window, per-test and vitest wall-clock and outcome in `lessons/phase-1.md`.
- **On red:** report it, never patch it. One rerun is allowed only to show a flake (a timeout, the same step green on the rerun); keep both logs. Otherwise write the cause to `OWNER-ASKS.md` and continue with the remaining runs.
- **The recording run (step 3, at `P` only) red before the file changed** (`git diff --quiet` on the recording exits 0): there is no recording. Stop after the remaining runs and report `LEAD_BLOCKED`; open no PR. **Red after it changed**: keep the file (F4); Phase 2 checks it on its own.
- **Gate, recording delivered:** the recording changed and Phase 2 passes. **Gate, promote ready:** both live runs pass; on both browsers the replay's four cases report passed (a skipped case is not a pass). Layers: e2e-live-network, e2e.

### Phase 2: check and commit the recording ✓ (checks and gate green: [lessons/phase-1.md](lessons/phase-1.md))
1. Hand check, counts only: `tag` `v1.1.0`, `browser` `chrome`, every `dials` entry loopback, no `nulo:e2e:` key, every plaintext URL loopback. Compare its key families and per-family counts with the old recording's (`git show HEAD:<file>`). Record its SHA-256.
2. Derive the new expiry from step 3's populate window plus 7 days (F5); the replay refuses it 10 minutes earlier.
3. **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e/update-recording.test.ts`. Pass: exit 0. Layers: lint, typecheck, unit.
4. Commit: `test(e2e): record v1.1.0's storage again for the 1.2.0 candidate`.

### Phase 3: review, close-out, final replays, delivery ✓ (review loop clean at round 1: [lessons/phase-3.md](lessons/phase-3.md); the final-head runs: the PR body)
1. Run the review loop (§ Post-implementation) over `git diff origin/dev...HEAD`.
2. Merge `origin/dev`, then read what changed in `index.md` and `lessons.md`. Write the close-out commits (§ Post-implementation).
3. At that head `H`, confirm the recording's SHA-256 is unchanged. Write `git diff --stat P H -- . ':(exclude)implementations-plan' ':(exclude)apps/extension/tests/e2e/fixtures/update/v1.1.0.storage.json'` to the PR body (D5).
4. Rebuild both candidates at `H`. Run Phase 1 step 5 on both browsers. When step 3's diff is not empty, also run Phase 1 steps 3 and 4 without `NULO_E2E_UPDATE_RECORD`. A red at `H` replaces the green at `P` for that run: report it and write it to `OWNER-ASKS.md`; the committed recording still ships.
5. **Gate:** `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run check:plans` after staging. Pass: exit 0. Step 4's runs count toward Phase 1's two gates. Layers: lint, typecheck, unit, e2e.
6. Push `H`. Open the PR ready (§ Delivery). `gh pr view <n> --json headRefOid` must equal `H`. Run `gh pr checks <n> --watch` once.

## Security & Adversarial Considerations

- **Provider key:** v1.1.0's Testnet default carried a provider key. The live scenario moves every outside endpoint onto loopback before it records and refuses while a moved host is held (F8). The unit check counts plaintext URLs, never lists them. Nobody opens `apps/extension/src/wallet/constants/network-endpoints.ts` or prints a URL from a log; a log excerpt copied anywhere has its URLs replaced first (Firefox's exception summaries are raw, `fixtures/browser/firefox-page-errors.ts`). Residual: a sealed row naming another outside URL is opaque to every check but `namedHostCount` (plausible but unverified; the same exposure as the committed recording it replaces).
- **Release zips:** the digest pin refuses any other bytes, and the release's `SHASUMS256.txt` must agree (`release.ts:65-84`). The pins do not change.
- **Egress:** `e2e:agent` owns anvil, aztec and the playground per worktree; the egress guard blocks the Testnet and Mainnet hosts, so no run reaches Testnet or a funded account.
- **Secrets:** the recording holds a throwaway profile under the public test password. N/A: cryptography, least privilege, supply chain (no dependency change).

## UI impact

None. The lane changes one test fixture and touches no screen.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | Commit the plan before the builds; no commit during Phase 1 | plan uncommitted until the PR | F3: the plan is not a build input, and the planner commits it |
| D2 | At the PR head `H`: both replays always; both live runs too when a build input moved since `P`; a red at `H` replaces the green at `P` | replays at `H` only (draft); runs at `P` only, with a tree-equality proof | the committed recording at `H`, with `dev` merged in, is what the pre-promote replay reads; an offline replay cannot stand for the live sandbox run on a changed candidate (Codex P2) |
| D3 | Two outcomes: a valid recording ships even when a later run is red, and that red holds the promote through `OWNER-ASKS.md` | no PR on any red | the recording is valid on its own, and the promote needs it either way; the draft's gates contradicted this (Codex P2) |
| D4 | After the live red, no diagnostic run with the host declared in an uncommitted edit; file #1636 and ship the recording | the diagnostic (lead's lean) | Codex: the edit changes the guard's acceptance, which "reported, not patched" forbids whatever its label; the fix lane reruns both live runs anyway |
| D5 | The runs at `H` and the `P..H` diff go to the PR body, not to `lessons/` | a commit after the runs | any commit after the builds moves HEAD off the candidate (F3); the plan's draft asked for `lessons/phase-3.md` |

## Review verdicts

- **Codex plan audit, round 1** (gpt-6.1-sol, high, read-only): conditional approve, three P2s, all accepted. (1) D2 left candidate drift open: replays alone at `H` cannot stand for the live run on a changed candidate; now both live runs rerun at `H` when a build input moved, and a red at `H` replaces the green at `P`. (2) The draft's gates contradicted D3; now two outcomes, recording delivered and promote ready, and a Chrome live red keeps a written file. (3) The handoff command for the frozen candidate was missing; now in Delivery. Also accepted: copied log excerpts have their URLs replaced. Confirmed sound: D1, the close-out before the PR, and no new path for the provider key.
- **Round 2** (resumed): conditional approve, one P2, accepted: the "no recording" rule read a red live rerun at `H` as no recording; it now applies only to the recording run at `P`, and a red at `H` ships the committed recording with the blocker.
- **Round 3** (resumed): **approve**, no remaining finding.
- **After Phase 1** (resumed): option A over the lead's diagnostic run (D4); two findings to #1636.
- **Arc review loop, round 1** (fresh session, over the arc diff): `clean`; converged ([lessons/phase-3.md](lessons/phase-3.md)).

## Delivery

- **Arc 1** = Phases 1-3, one PR against `dev`, opened ready at the tested head `H`. Title: `test(e2e): the v1.1.0 recording refreshed for the 1.2.0 candidate` (65 characters). `Refs #1314`; closes nothing. No label at creation.
- **Body:** `P` and `H`, and what build inputs differ between them; the browser versions; every run with its commit, UTC window, outcome and wall-clock; the recording's SHA-256, its UTC write time and expiry; the arrival sentence (F6); F8's residual.
- **Handoff, in the arc report:** one command block for the frozen candidate, from the repo root of a clean checkout at it: both `build-update-candidate.sh` builds, then Phase 1 step 5 on both browsers. State that the replay refuses the recording from 10 minutes before its expiry, and that any red holds the promote.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `3b845ef02`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop** (Phase 3 step 1): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds; each round in `lessons/phase-3.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev` (ready). One rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits, before it opens: the `## Outcome` block (`Shipped:` names the PR by title, `Known limits:`, `Open items:`, `Seeds retired:`); lessons within 8 KiB; `STATUS.md` deleted; `git mv implementations-plan/release-replay-1 implementations-plan/archive/release-replay-1` in its own commit, the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/release-replay-1/plan.md` succeeds, run `agent-worktree done release-replay-1 --merged`; relay a refusal, never force.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/release-replay-1/plan.md delivered: Phases 1-3 marked ✓ with their gates reported; the Codex loop (gpt-6.1-sol high) converged; the PR open and ready against dev with its head equal to the tested SHA.
```

```
/loop 15m Drive arc 1 of implementations-plan/release-replay-1 per its plan.md. Next unchecked step; one e2e run at a time, polled in a bounded loop; signed commits. Report a red run, never patch it. Open the PR ready at the tested head, watch checks, report and stop. Never merge.
```
