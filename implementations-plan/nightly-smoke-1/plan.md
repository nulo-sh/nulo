---
plan: nightly-smoke-1
tier: light
status: approved (auto-continue), arc 1 in progress
issues: "#1349"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at 87d04118e
trunk: dev
post_implementation_hardening: not scheduled
---

# nightly-smoke-1: the flag-on-paste check runs only where the held list flags a pair

One arc, one PR against `dev`. Recon: [recon.md](recon.md) (facts R1-R12). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom.** The maintainer who reads the nightly and the release smoke: a red there must mean the shipped build broke, and a green must mean the shipped build ran the flows it can run.
- **Excellent looks like.** (1) `send-picker-add.test.ts` passes at retry 0 against a release-shaped build on Chrome and Firefox, and still runs its whole stacked-popup flow there. (2) The flag on a pasted address's add row is still proven on both browsers in every PR smoke lane, beside a control that shows the flag is per address.
- **Good enough.** The artifact run does not prove the flag, because the release build accepts only the published list and that list flags nothing (R4, R5). It never did: `token-list.test.ts` already skips there (R6).

## Root cause (demonstrated: job log R1, code trace R2-R5)

Initial conditions: the nightly smokes the release build with `NULO_E2E_ARTIFACT_RUN=1`, so `liveLeg` is true and the held list is the published envelope, whose `flagged` is empty. Order: S1 seeds a token, opens the picker, pastes `E2E_LIST_FLAGGED[0]` (a pair only the source run's fixture list flags), and waits 15 s for `select-token-add-token-flagged`. The add row draws the flag only for a pair the verified list flags, so it never appears. Broken invariant: a smoke spec that runs in both modes asserts only what both held lists support. Consequence: both nightly smoke jobs are red, so `publish-nightly` ships nothing, and `release.yml`'s artifact smokes would hold a release's assets the same way. Not a product defect: a person on the release build sees no flag because the shipped list flags nothing, which is correct. Not a flake: deterministic on every artifact run; no flake-ledger row.

**Issue claims that did not hold.** "With the rest of the file green": the file holds one test; the rest of the *suite* was green. "1 failed, 60 passed, 12 skipped" are test-file counts (Chrome: 264 tests passed, 36 skipped). Firefox's file took 29.5 s, not 28.7 s.

## Architecture & Implementation

S1 bundled one source-run-only assertion (the fixture list's flag) into a spec whose other assertions hold in both modes. The fix moves that assertion to the spec that owns list behaviour and already runs only in source runs (R6, R9), and leaves S1 with the flow both modes support. No product code, no helper, no new skip.

**File-level change map** (all under `apps/extension/tests/e2e/`):

- `fixtures/token-list.ts`: `E2E_LIST_FLAGGED` gains a second Testnet pair, `0x…f3` (R10: `f2` is no curve point). Its doc says the first pair is the one a spec seeds as held, the second is never held, and only a source run holds either. The module header's "flags one pair" becomes "flags two pairs".
- `token-list.test.ts`, the flagged test (lines 151-185): after the picker row check, paste the second pair in mixed case (`toUpperCase().replace("0X", "0x")`); wait for `select-token-add-token-flagged`; assert the add button is enabled; `shotSend(page, "send-picker-flagged", "select-token-add-token")`. Control: paste `E2E_LIST_TOKENS[1].address` (listed, unheld, unflagged); wait until no `select-token-add-token-flagged` exists; assert `select-token-add-token` still exists. Import `replaceInputValue` (`./fixtures/extension`) and `E2E_LIST_TOKENS` (`./fixtures/token-list`). The title adds "; a pasted flagged address carries it on the picker's add row".
- `send-picker-add.test.ts`: drop the flagged paste, its two assertions, its shot, the "flag gone" wait and the `E2E_LIST_FLAGGED` import. After pasting `UNLISTED`, wait for `select-token-add-token` visible and assert no `select-token-add-token-flagged` exists (the row and its flag render in one patch, `TokenList.vue:96-97`; this catches a flag drawn on an unlisted address, in both modes), then shoot and press as now. The title drops the flag clause. The header gains one sentence: the flag on the add row is `token-list.test.ts`'s, since only a source run's list flags a pair.
- `README.md:65` (the held-list bullet): "flags one Testnet pair" becomes two, and one sentence states the rule: a smoke spec that needs the held list to flag a pair runs in `token-list.test.ts`'s source-run describe, since the published list flags none. (A network spec that signs its own list, as `network/register-token.test.ts:118` does, is outside the rule.)

**Trade-offs and alternatives not taken** (decision ledger D1).

- **A. Skip S1 unless the held list flags a Testnet pair** (a `skipUnlessListFlags` beside `skipUnlessListPrices`). Smallest diff, but the artifact run loses S1's stacked-popup flow, the part a release build can prove.
- **B. Split S1 into two tests.** `listedExtension` is file-scoped, so the second test reuses the launch, but it repeats the per-test setup and adds a mode-skipped test to a mixed-mode file, duplicating what `token-list.test.ts` owns and sharing S1's state.
- **C. Branch inside S1 on the held list.** The test would pass in an artifact run while its title claims a check it did not make; no spec body branches on the mode today (recon).
- **Chosen (D).** Estimate: about +1.5 s in `token-list.test.ts`, about −1 s in S1, per browser. Measured in Phase 2 (Chrome, one sample each): S1 8.6 → 9.2 s, `token-list.test.ts` 19.6 → 19.4 s; single samples sit inside host noise.

## Phases

### Phase 1: reproduce the nightly red on base ✓

Steps. Set `SCRATCH=~/.cache/nulo-backlog/nightly-smoke-1`. In `apps/extension`, build the release shape with a clean environment: `env -i HOME="$HOME" PATH="$PATH" bun run build:chrome`. Copy `dist/chrome` to `$SCRATCH/artifact-chrome`. Do the same for Firefox into `$SCRATCH/artifact-firefox`. Run, per browser, in `apps/extension`: `env -u NULO_E2E_MIGRATION_FIXTURE -u NULO_E2E_CSP_REPORT NULO_E2E_BROWSER=<browser> NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=$SCRATCH/artifact-<browser> bun run test:e2e -- tests/e2e/send-picker-add.test.ts --retry=0` (this is `ART`). Record the file's duration.

Assumptions: no `.env*` file exists in the worktree (checked); `env -i` leaves no `VITE_*` flag, as `_build-extension.yml` requires for a release build.

**Validation gate.** Pass: on both browsers the run fails with `TimeoutError: Waiting failed: 15000ms exceeded` at `send-picker-add.test.ts:38`. Any other failure stops the arc: the cause is then not R5. Layers: e2e (artifact mode). **Result:** red on both, at line 38, `TimeoutError: Waiting failed: 15000ms exceeded`; Chrome 24.9 s, Firefox 29.7 s (base 87d04118e).

### Phase 2: move the flag check and prove it in both modes

Steps. Rebuild the armed source build per browser (the e2e-testing skill, § Build-armed tests: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`). The source run (`SRC`) is `env -u NULO_E2E_ARTIFACT_RUN -u EXTENSION_PATH NULO_E2E_BROWSER=<browser> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`. Before the edit, run `SRC` on `send-picker-add.test.ts` and `token-list.test.ts` per browser and record each file's duration. Apply the change map. Then rerun.

Assumptions: the paste works with the Testnet node refused, as the picker row check before it does (R9); `0x…a2` gets an unflagged add row, since no held row matches it (R9, R10).

**Validation gate.** Commands, from the repo root unless noted: `bun run lint`; `bun run typecheck:all`; `bun run test:all`; in `apps/extension`, `SRC` per browser on the five smoke files that hold or serve the default list, which gains the pair (`send-picker-add`, `token-list`, `rows`, `send-keyboard`, `type-roles`); `ART` on S1 per browser against the Phase 1 copies (the change touches no product code, so the release build is the same); `ART` on `token-list.test.ts` on Chrome. Pass: every command exits 0; every selected test green, at retry 0; in `ART`, `token-list.test.ts` reports all its tests skipped; S1's per-file duration stays within #1342's budget, 15.8 s Chrome / 18.8 s Firefox, in `SRC` and `ART`. Record both files' before and after durations for the PR body; they gate nothing else, since one local sample sits inside host noise. Layers: lint, typecheck, unit, e2e (both modes, both browsers).

## UI impact

None. Test, fixture and README only; no screen, copy or row changes. No OWNER-ASKS entry.

## Security & Adversarial Considerations

- **Threat model.** No product surface changes. The trust boundary in play is the signed token list: the release build accepts only the production-signed envelope, and the flag reaches the popup only from the verified snapshot (R5). The fix keeps the e2e signer in source runs only; it gives no artifact run a way to plant a flag, which would mean weakening the pinned keys.
- **Gate integrity.** The fix removes no assertion: the flag check moves to a spec that runs on both browsers in every PR smoke lane, and gains a per-address control. It adds no skip, retry or timeout. The nightly keeps every check it can make.
- **Least privilege, supply chain, cryptography.** N/A: no workflow, token, dependency or crypto change.

## Assumptions

- **Facts.** F1: the job log fails at line 38's flagged wait on both browsers (R1). F2: the nightly runs in artifact mode (R2). F3: an artifact run holds the published envelope (R3). F4: the published list flags nothing (R4). F5: the flag's only source is the verified list (R5). F6: `token-list.test.ts` is skipped in artifact mode (R6). F7: `0x…f2` is no curve point, `0x…f3` and `0x…a2` are (R10). F8: no other smoke spec depends on the fixture list's flag (R7).
- **Inferences.** I1: the rest of S1 passes against the release build; the nightly passed every step before line 38, and Phase 2's artifact run proves the rest. I2: a second flagged pair changes no other spec. The pair reaches every held launch through `heldListStorage` → `signTestList`'s default (`fixtures/token-list.ts:78,227`), but no spec seeds or pastes `0x…f3`; Phase 2 runs the five files that hold or serve the list, and the PR's smoke lanes are the full proof.
- **Asks.** None for the owner (D8). The release build's flag path stays unproven by any artifact run: a known limit, filed at close-out (D9).

## Decision ledger

- **D1.** Move the flag check to `token-list.test.ts` (D in Trade-offs) over A, B and C. Panel: see Audit verdicts.
- **D2.** The second pair is `0x…f3`, the first byte after `f1` that is a curve point (R10).
- **D3.** The control address is `E2E_LIST_TOKENS[1].address`, so no third copy of the `0x12…02` literal (R10).
- **D4.** No flake-ledger row: the failure is deterministic (lane brief). The rule goes to `tests/e2e/README.md:65`, where the held list is defined. No `lessons.md` line: it holds 8191 of 8192 bytes (R12).
- **D5.** No product issue: the release build flags exactly what its verified list flags (R5).
- **D6.** S1 keeps a flag-absence check on its `UNLISTED` add row (Codex 1): `token-list.test.ts`'s listed control alone would miss a flag drawn on every unlisted address.
- **D8.** No OWNER-ASKS entry for publishing a flagged Testnet pair (Opus 6, partly rejected): nothing in the lane depends on it, and the known-limit issue (D9) names it as the reopening condition.
- **D9.** Close-out files a closed `known-limit` issue (Opus 6): the release build's flag rendering is proven only by the armed build, since the artifact runs hold a list that flags nothing. Reopen when the published list flags a Testnet pair or a release-only flag regression is reported.
- **D10.** No flake-ledger row, as the lane brief directs; Opus 3 notes the ledger's charter ("every named fingerprint with a root cause") and row 44, the same class. The conflict goes to the orchestrator in the report.
- **D7.** No two-core amplifier (`taskset -c 0,1`) for the red/green proof (Codex 4, rejected): the failure is deterministic, not a race, and the amplifier exists to validate deflakes. Explicit per-mode environments (`SRC`, `ART`) accepted.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): approve with changes; D over A, B and C confirmed. 1. Keep a flag-absence check in S1 (plausible): accepted, D6. 2. Missing imports in the change map (demonstrated): accepted. 3. I1 and I2 are forecasts; run the placeholder-row test; estimate, not "does not move" (demonstrated gap): accepted. 4. Explicit env per mode, per-file durations (accepted); the two-core amplifier (rejected, D7).
- **Opus Plan leg, round 1** (opus): approve with changes; D confirmed, Codex 1-4 judged sound. 1. README rule too broad (demonstrated): accepted. 2. B's rejection reason wrong, the launch is file-scoped (demonstrated): accepted, restated. 3. Ledger charter versus D4 (demonstrated): left to the orchestrator, D10. 4. Phase 2 gate depended on the PR (demonstrated): accepted, moved to the PR body. 5. Local runtime bounds can red on noise (plausible): accepted; the gate holds S1 to #1342's budget only. 6. Known limit unrecorded (demonstrated): accepted, D9; the OWNER-ASKS half rejected, D8. Assumption fixes (R7, R9, the reuse map, I2): accepted.
- **Codex final pass** (resumed session, high): approve, no new material finding; the comment's "one computed" called imprecise (two dependent computeds), reworded "one patch".

## Delivery

Single arc, one PR, no stack. Branch `worktree-nightly-smoke-1` off `dev`. Title: `test(e2e): the flag-on-paste check runs only in source runs, so the nightly smoke passes` (88 characters). Body: the root cause, the change, the Phase 1 red and Phase 2 green runs per browser and mode with durations, both files' runtime before and after per browser, locally and from the PR's CI smoke logs (S1 against #1342's 15.8 s / 18.8 s), each browser's smoke suite wall-clock before and after (the e2e-testing skill, § Runtime budget), the statement that the next nightly is the live proof, `Closes #1349`. No label at creation; the smoke path filter covers `apps/extension/tests/e2e/**`. Open it ready, never draft. Nothing merges before the orchestrator's word.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at 87d04118e. Plan-specific parts:

1. Diff review: absent (`code_review: off`).
2. Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff origin/dev...HEAD`, with the standard's two rules verbatim and the adversarial ask; resume with each fix diff; hard stop at three rounds, then surface. One Opus 5.5 review of the final diff (`Agent`, `general-purpose`) beside the first round. Log each round in `lessons/phase-2.md` and above.
3. Delivery as above, after the loop converges and the Phase 2 gate passes again on the final head; then `gh pr checks <n> --watch` once.
4. Close-out as the PR's final commits, after `gh pr create`: merge `origin/dev` and read `index.md` and `lessons.md`; the Outcome block (`Known limits:` the D9 issue, deduped first with `gh issue list --state all --search "flag artifact"`; `Open items: none`); delete `STATUS.md`; `git mv` into `archive/` in its own commit; move the index line to `archive/index.md`; `bun run check:plans` green.
5. Teardown after the merge: `agent-worktree done nightly-smoke-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/nightly-smoke-1/plan.md` succeeds. The orchestrator notices the merge.

## Seeds (draft; not run, the orchestrator owns execution)

```
/goal Phases 1 and 2 of implementations-plan/nightly-smoke-1/plan.md marked ✓, each backed by its gate's output in the transcript (Phase 1 red at send-picker-add.test.ts:38 on Chrome and Firefox in artifact mode; Phase 2 green in both modes on both browsers); the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists against dev with Closes #1349 and the close-out's archive move (`git show --stat`); `bun run lint` and `bun run test:all` exit 0.
```

```
/loop 15m Drive implementations-plan/nightly-smoke-1 forward: read plan.md and lessons/ first; run the next unticked phase and its gate exactly as written; never widen a timeout or add a skip; after Phase 2, run the Post-implementation section in order; never merge.
```
