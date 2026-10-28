---
plan: release-prep-1.2.0
tier: light
status: approved by the final Codex pass; arc 1 running
issues: "none (the lane brief names no issue; one is filed in Phase 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) plus one Opus Plan leg
post_implementation_hardening: not scheduled
base: origin/dev at ce16a57a9
trunk: dev
---

# release-prep-1.2.0: the update scenarios run from v1.1.0

v1.1.0 shipped on 2026-10-27, and nobody did the release runbook's post-release step (`.claude/skills/release/SKILL.md` § Stable release, step 1): pin its zips' digests and its traits, and record its storage from Chrome. The 1.2.0 promote updates from v1.1.0, so it needs that step. One arc, one PR against `dev`, test fixtures only. One replay case refuses v1.1.0 for a reason no fixture can answer (F7), so arc 1 stops before delivery and asks (A1). Evidence: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** the person who runs the 1.2.0 promote's step 1, and the reviewer of the PR. Both must trust the pins without redoing the work.
- **Excellent:** (1) every pin traces to a check the PR body shows: the two digests from our own download, equal to `SHASUMS256.txt`, to the GitHub asset digests and to an attestation at the tag commit; each trait with the tag files that decide it. (2) Every run is at retry 0, at a named commit with a clean tree, with its outcome and duration. Nothing red is hidden, and the refusal is reported with its cause, not patched.
- **Good enough:** no scenario or unit-test edit; the arrival scenario and the v0.31.0 and v1.0.0 replays are not run (no scenario code changes).

## Assumptions

**Facts** (verified 2026-10-28):
- F1. `release.ts:13-37` pins `v0.31.0` and `v1.0.0` only; `update-recording.test.ts:36` requires `RELEASE_TRAITS` and `RELEASE_DIGESTS` to hold the same tags.
- F2. Our download of v1.1.0 (tag commit `241097f6c`): Chrome `bcc66cb0…1117`, Firefox `388fadfb…e762`. `sha256sum -c SHASUMS256.txt` OK; equal to the GitHub asset digests. `gh attestation verify <zip> --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/release.yml --source-digest 241097f6c060b2c62adc7aaea3776b61f4282e93 --deny-self-hosted-runners`: exit 0 for both. Manifests `1.1.0.0`. The release is not immutable (`isImmutable: false`), so the pin is what stays trusted.
- F3. Traits `{ storage: "sealed", connect: "own-window" }`, decided by `stores.ts`, `ui-preference/service.ts:74-77`, `sealed-entity-storage.ts` and `wallet-sdk/session-established.ts:266` at the tag ([recon.md § The traits](recon.md#the-traits-from-the-tags-source)). Each has the same blob at `v1.0.0`; that is evidence, not the reason.
- F4. `@aztec-labs/*` is `6.0.0` at `v1.1.0` and at HEAD. This meets the live scenario's precondition (README § In-place update); it does not prove the run passes.
- F5. v1.1.0 seeds Mainnet ("Alpha V6"). The README says the arrival scenario's precondition fails from such a release: "from a release that seeds Mainnet, its precondition fails, as no seedable kind is left to arrive."
- F6. The candidate check ignores `apps/extension/tests` and `implementations-plan` (`source.ts:7`), and the scenarios refuse a candidate built at another commit than HEAD (`in-place.ts:23-29`). So a run can read an uncommitted fixture unseen, and any commit moves HEAD off the candidate. The recording is written during populate, before the update (`update-in-place.test.ts:410-414`).
- F7. Replay case 3 (`update-replay.test.ts:669-695`) needs no recording. It requires Set up again for a passkey profile the release made (`:689`). On HEAD only a pre-1.1 passkey row is `retired` (`profile-row.ts:45-66`, unchanged since v1.1.0), and #1139 shipped in v1.1.0. So, once its registration and update complete, case 3 fails at `:689`.
- F8. The plaintext of a sealing recording names only its dials: every network, transaction and session row is a sealed envelope (`v1.0.0.storage.json`). The rows open under the public test password. Only the live run's `namedHostCount` (`update-in-place.test.ts:297`) checks their decoded content, and only for the hosts of moved endpoints.

**Inferences:**
- I1. The live scenario and replay cases 1, 2 and 4 pass from v1.1.0 unmodified: no testid, service method or window behaviour on the release path changed between the tags (recon 2). A hypothesis that the Phase 2 runs test.
- I2. A sealed row other than an endpoint that names an outside URL with a provider's key would reach the public repo unseen (F8). No such row is traced; plausible but unverified, the same exposure as the committed v1.0.0 recording.

**Asks** (to the orchestrator, through the report; not a product question):
- A1. Case 3 refuses v1.1.0 (F7). Choose (a) ship the fixtures as they are and give case 3 to a test lane (the Phase 3 issue), or (b) extend this lane to teach case 3 a reviewed per-release passkey trait and the unlock path for a 1.1 row. Working assumption: neither until answered. Arc 1 stops after Phase 3, with its branch pushed and no PR.

## Architecture & Implementation (arc 1, branch `worktree-release-prep-1.2.0`)

Files: `apps/extension/tests/e2e/fixtures/update/release.ts` (two entries) and `apps/extension/tests/e2e/fixtures/update/v1.1.0.storage.json` (new, written by the scenario). Nothing else outside this plan folder. Scratch files stay outside the repository.

### Phase 1: the pins ✓ (956fc686e; lint, typecheck:all, the two unit files green)
1. Add `"v1.1.0"` to `RELEASE_DIGESTS` with the F2 digests, and to `RELEASE_TRAITS` as `{ storage: "sealed", connect: "own-window" }`.
2. Commit: `test(e2e): pin v1.1.0's zips and traits for the update scenarios`. Make no other commit until Phase 3; plan and status edits stay uncommitted until then.
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e/release-build.test.ts scripts/e2e/update-recording.test.ts`. Pass: all exit 0.

### Phase 2: record and run, retry 0, one run at a time, no commit ✓ (both live runs passed; cases 1, 2, 4 passed and case 3 failed at `:689` on both browsers: [lessons/phase-2.md](lessons/phase-2.md))
Warning: never set `NULO_E2E_BACKUP_RECORD`. Never touch another tag's recording or the pinned backups.
1. From the repo root, run `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, then `... firefox`. Run `bun scripts/e2e/install-firefox.ts` from `apps/extension`. Note the browser versions.
2. Before each run, `git status --porcelain -- apps/extension` must be empty, except `?? …/v1.1.0.storage.json` after step 3.
3. Live, Chrome, recording: `NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/chrome NULO_E2E_UPDATE_RECORD=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts`. Note its UTC start and end: the recording's dApp session expires 7 days after it.
4. Live, Firefox: the same command with `NULO_E2E_BROWSER=firefox`, the firefox candidate, and no `NULO_E2E_UPDATE_RECORD`.
5. Replay, Chrome: `cd apps/extension && NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/chrome bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0`. Then Firefox.
6. Poll each run's log in a bounded loop inside one tool call. A rerun is allowed once, only for a flake with a filed issue or a host-load stall; the PR body lists both runs.
- **Gate:** both live runs pass. On both browsers, cases 1, 2 and 4 report passed (a skipped case 2 is not a pass), and case 3 fails at `update-replay.test.ts:689`. A red a pin or a trait answers sends the arc back to Phase 1: commit the fix, rebuild both candidates, and restart Phase 2. A recording-only red is answered by deleting the untracked file and repeating step 3. A red the scenario causes is a second refusal: report it, do not patch it. A Chrome live run that did not pass end to end leaves no recording: delete the file (F6).

### Phase 3: check and commit the recording, file the refusal
1. Check the recording: `tag` `v1.1.0`; `browser` `chrome`; `dials` all loopback; no `nulo:e2e:` keys; plaintext URLs counted (never listed), all loopback.
2. Commit: `test(e2e): record v1.1.0's storage for the update replay`.
3. Dedupe (`gh issue list --state all --search "update replay passkey"`). File one issue with the sections `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`: case 3 encodes pre-1.1 passkey rows and refuses v1.1.0, with both browsers' failure lines. Its Possible fix names A1(b), and that the committed-recording unit pin (`update-recording.test.ts:62-69`) covers v1.0.0 only. Labels: `bug`, `lane:e2e-followups`.
- **Gate**, before step 4: Phase 1's commands, plus `bun run test:all` and `bun run check:plans` after staging. Pass: exit 0.
4. Run the review loop (§ Post-implementation) over the arc diff. Then `git push -u origin worktree-release-prep-1.2.0`, with no PR. Stop and report `LEAD_BLOCKED` with A1.

### Phase 4: delivery, on the orchestrator's answer to A1
1. Under (b), write the scenario change into this plan first, and audit it as a plan change.
2. Merge `origin/dev`, then read `index.md` and `lessons.md`. Run the review loop again on any new diff. Open the PR as a draft (§ Delivery), for the number the Outcome cites.
3. Write the close-out commits (§ Post-implementation).
4. At that head, rebuild both candidates and rerun Phase 2's four runs without `NULO_E2E_UPDATE_RECORD`. Run lint, `typecheck:all`, `test:all` and `check:plans`. Pass: as Phase 2 (under (b), case 3 passes), and the recording unchanged.
5. Push that head. `gh pr view <n> --json headRefOid` must equal the tested SHA, which the body names. Run `gh pr checks <n> --watch` on it, then `gh pr ready <n>`.

### Alternatives not taken
- **Patch case 3 here** (a trait branch or a skip): refused; the brief says stop and report, and a `skipIf` dodge is banned.
- **A ready or draft PR now:** rejected; the brief says stop, and a standing merge policy could land a ready PR whose lane is blocked.
- **Demonstrate case 3 alone first, recording after A1:** rejected; recording now tests I1 on both browsers before the decision, and both answers need the recording. A re-record costs one Chrome live run while `dev` stays on 6.0.0.
- **Generalise the committed-recording unit test (former D2):** dropped; it is outside "fixtures only", and its URL check sees plaintext only (F8). Phase 3 step 1 does the check by hand; the issue carries it.

## Security & Adversarial Considerations

- **Threat:** a tampered zip, or a `SHASUMS256.txt` forged beside it, enters the pins. Defence: our own download, checked three ways (F2). The attestation, made by `release.yml` at the tag commit on a GitHub-hosted runner, is the one check that does not share the release's storage. The pin then refuses any other bytes (`release.ts:55-74`), on every run.
- **Secrets:** the recording holds a throwaway profile under the test password and test accounts. The scenario moves every outside endpoint onto loopback before it records, and refuses while a moved host is held. Residual: I2.
- **Egress:** `e2e:agent` owns anvil, aztec and the playground per worktree. The egress guard blocks the Testnet and Mainnet hosts; no run reaches Testnet or a funded account. bb.js's CRS hosts go out directly by design (`fixtures/egress-guard.ts:79-83`), so "local" means the wallet's networks.
- **Supply chain:** no dependency change. N/A: cryptography, least privilege.

## UI impact

None. The lane changes test files only and touches no screen.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | Traits `sealed` / `own-window` from the tag's files (F3) | infer from v1.0.0 | the brief forbids inference |
| D2 | No unit-test edit; check the recording by hand | generalise the v1.0.0 test (both legs: outside scope; plaintext only) | brief scope; F8 |
| D3 | Run everything, file the refusal, push the branch, stop before any PR, ask A1 | ready PR (round 1 draft); draft PR (Opus) | brief: "stop and report"; Codex and Opus both refused the ready PR |
| D4 | Pins committed before the builds; no commit during Phase 2; the final runs after the close-out | build first | F6: any commit moves HEAD off the candidate |

## Review verdicts

- **Round 1, Opus Plan leg:** conditional approve. Accepted: D3 pre-empts the scope call (now A1 and a stop); I2 overstated (F8); D2 outside scope; dev merge after the reruns; F6's two consequences; the gate named a screenshot that no fixture takes, and let a skipped case 2 pass; rerun wording; PR-body items (F2's command, `isImmutable`, browser versions, the CRS hosts). Rejected: draft PR (D3); recording after A1 (Alternatives).
- **Round 1, Codex** (gpt-6.1-sol, high; the first call failed "model at capacity", the retry ran): reject. Blocking: D3 overrides "stop and report"; the close-out invalidates the final-head runs. Also D2 scope and its plaintext-only check, and F4/F7/I1 wording. All accepted as above.
- **Final Codex pass** (resumed session): conditional approve. Conditions, both accepted: a pin or trait fix during Phase 2 returns to Phase 1 (commit, rebuild, restart); the PR opens as a draft and turns ready only once its pushed head equals the tested SHA. Confirmation resume: **approve**.

## Delivery

- **Arc 1** = Phases 1-4, one PR against `dev`, opened as a draft only in Phase 4 and marked ready only at the tested head. Title: `test(e2e): the update scenarios run from v1.1.0` (47 characters). `Closes #<the Phase 3 issue>` under A1(b), else `Refs #<it>`. No label: `apps/extension/**` trips both e2e filters.
- **Body:** the two digests and the three checks (F2's full command); `isImmutable: false`; the traits with their deciding files; every run with its commit, clean status, browser version, outcome and per-file duration; the recording's UTC date and its 7-day expiry; case 3's failure lines and the issue; the arrival sentence (F5); F8's limit. No e2e envelope: no scenario is added or changed.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `ce16a57a9`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop**, in Phase 3 over the arc diff from `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus `general-purpose` review beside round 1; hard stop at three rounds; each round in `lessons/phase-3.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev --draft`; Phase 4 steps 4-5 then make it ready at the tested head. One rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits, after the `origin/dev` merge in Phase 4: the `## Outcome` block (`Known limits:`, `Open items:` with the Phase 3 issue under A1(a)); lessons within 8 KiB; `STATUS.md` deleted; `git mv implementations-plan/release-prep-1.2.0 implementations-plan/archive/release-prep-1.2.0` in its own commit, the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/release-prep-1.2.0/plan.md` succeeds, run `agent-worktree done release-prep-1.2.0 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/release-prep-1.2.0/plan.md at its stop: Phases 1-3 marked ✓ with their gates reported in the transcript; the Codex loop (gpt-6.1-sol high) converged, quoted; the branch pushed, no PR; the Phase 3 issue filed; A1 reported.
```

```
/loop 15m Drive arc 1 of implementations-plan/release-prep-1.2.0 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits, no commit during Phase 2, one e2e run at a time polled in a bounded loop. Never patch a scenario. Stop after Phase 3 and report A1; Phase 4 only on the orchestrator's answer. Never merge.
```
