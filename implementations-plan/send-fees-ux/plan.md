---
plan: send-fees-ux
tier: light
status: arc 1 merged (#532); arc 2 in progress (page 20: OA-1 B, OA-3 B, OA-4 B; OA-2 B waits on the skeleton mockup)
issues: "#316 #340 (closed by arc 1); #503 #505 (arc 2 closes); #504 (open: OA-2 waits on the owner's skeleton mockup)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with two resumes (fixes, then confirmation); one Opus Plan leg
base: origin/dev at dfdf4c31
trunk: dev
post_implementation_hardening: not scheduled
---

# send-fees-ux: Send and fee-card follow-ups

One arc, one PR against `dev`. It ships the signed words of #316 and #340 and measures #504's wait. Four calls are open (OWNER-ASKS OA-1 to OA-4). Phases 4 to 7 and 1b build an answer that lands before the PR opens; without one, nothing a person sees changes for #503, #504 or #505. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **#505** is the signed rule, not a defect. OA-10 A (page 9, 2026-10-14, on #217) keeps "Queued behind your previous send" with Send disabled for a fee someone else pays (`send.vue:300,304`; pinned by `send.integration.test.ts:732`). The current send's payer decides, not the predecessor's. Changing it is OA-3.
- **#504**: the estimate does not gate "Select method". The trigger waits for the forced balance snapshot (`FeeSettingsCard.vue:616-627`). Two causes of the wait are traced but not measured. A forced read waits out a read already in flight, then reads again (`gas-balance-reader.ts:81-99`). The private leg queues behind a running proof, since the PXE runs one call at a time (`helpers/batched-view-simulation.ts`), 20 s per attempt in the store, and a forced read can first wait out an earlier attempt (`balances.store.ts:499-518`). Phase 3 measures both.
- **#340, #316**: the behaviour shipped in #490; the signed words and the edit form's address rule remain.

## Outcome & Quality Bar

For a person sending on Testnet and approving app transactions in the popup. Excellent: (1) no screen reads as a choice not made or an error the app did not make; (2) nothing is estimated or sent on data the person did not see, as today. Good enough: #504's wait is measured and its cause named; what the field shows meanwhile is the owner's call (OA-2).

## Architecture & Implementation

- **#316.** Form rules only, as the add form's (D4). In `EditFpcPopup.vue` the address rule refuses, only when the address changed, an address another row holds (`sameFieldAddress`, excluding the edited row by id). The warning sits beside the field; the existing `if (!isAddressValid.value)` in `isAvailableToUpdateFpc` also checks the field's error (no new nesting). `NewFpcPopup.vue:46,56,175` read "Already added". Name rules keep "Already exist" (I3). On OA-4 B only: `addressChanged` compares with `sameFieldAddress`, so a re-cased own address is no change.
- **#340.** In `utils/journal-state.ts`, `too_many_pending` leaves the `dapp_execute` arms of `nothingSentLabel` and `kindLabel`. `kindLabel` gives it `{ label: "Refused before sending", context: "Too many sends were already waiting. Nothing was sent." }`. `failedSubtitleFor` joins it to `wallet_refused`; `nothingSentLabel` falls through to `kindLabel`. The comment at `:244` goes. `humanizeErrorKind` has no UI caller and stays.
- **Conditional, #503 (OA-1 B or C).** `OperationCard.vue:287-297`: the legend always shows, with its own testid. A second line shows the landed figure under the existing `execute-op-app-fee`. While `isEstimating`, it shows "Fee up to" and `<Skeleton />` (B) or the answered words (C) under a new testid, with `aria-busy` on the row. A `default_entrypoint` operation is never estimated and shows the legend alone.
- **Conditional, #504 (OA-2 B).** `FeeSettingsCard.vue` passes `pending = snapshotPending && !displayMethod` to `FeeMethodSelector.vue`, which shows `Skeleton` with "Checking" for screen readers instead of "Select method". A hold, a failed init or a dropped sponsor still reads "Select method".
- **Conditional, #504 (OA-2 C, on top of B).** A pending selection with no saved pick previews the default walk. One pure helper in `send/fee-privacy.ts` applies the precedence: the pick's row, then its saved label, then the default only when both the early FPC list and peeked balances exist. Balances come from a new read-only `balancesStore.peekGas(scope)` over `execution.peekGasBalances`; it writes no entry. `runInit` starts it without awaiting it, through a helper with its own catch. The helper keeps the answer only while `myRun === runSeq`, the card is mounted and the identity is live. The preview shows only while `snapshotPending`. The origin is read live. A `data-fee-settled` attribute on the card (from `snapshotCommitted`) becomes what `waitForFee` (`tests/e2e/fixtures/send-page.ts:83`) waits on, since the trigger can now name a method before the commit. D2 and D3 hold the alternatives.
- **Conditional, #505 (OA-3 B).** `send.vue`: a `queueMode` computed (queued, and either self-paid with a cap or payer `sponsor`) replaces `queueCap` in the two gates and the label. A sponsored queued send sends no `feeCap` and no estimate id. `FeeCostReadout.vue` gets a queued-sponsor branch, and `SendReviewSheet.vue` a `queuedSponsored` prop. The service already proves a cap-less queued send without asking (`transfer-executor.ts:365`). One rule is new, because `takeTurn` re-resolves the paying row (`:540-547`). `sequence()` already resolves the row at entry; the run keeps whether it was Nulo's sponsor. In `buildPass`, right after `run.release = turn.release` and before any reuse or build, a send that entered with Nulo's sponsor and whose resolved row no longer is fails closed with the existing "Stopped before broadcast" row. A self-paid or hand-added-sponsor send, queued or not, with or without an estimate id, is untouched. The flag lives only in the run: no stored or wire field.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. A phase is ✓ only when its gate passes. Each phase logs to `lessons/phase-N.md`.

1. ✓ **#316.** Change: `EditFpcPopup.vue`, `NewFpcPopup.vue` and its "duplicate addresses" pins. A new `EditFpcPopup.test.ts` block. Never: another row's address, pasted in upper case, warns "Already added", disables Save, and Enter calls no `updateFpcAddress`. Controls: a new address saves, and a rename beside an untouched address that another row also holds saves. UI impact: P18-09 A, "'Already added' on both forms". Gate: `F`.
   ✓ **1b, on OA-4 B only (arc 2).** The own address re-cased reads as no change: Save stays disabled and nothing is called. Test beside phase 1's. UI impact: OA-4 B.
2. ✓ **#340.** Change: `journal-state.ts`, `journal-state.test.ts:688-712` (header comment and expectations). The `test.each` over `pending` and `queued` expects the new label and line on the detail page and "Refused before sending" on the card. Control: a `wallet_refused` record keeps its own line. UI impact: P18-11 A, "Refused before sending" / "Too many sends were already waiting. Nothing was sent.". Gate: `F`.
3. ✓ **#504, measure (no code lands).** Numbers: [lessons/phase-3.md](lessons/phase-3.md); posted on #504.
   - Probe: temporary `console.info("[fee-timing]", { stage, ms })` lines with numbers only. Mark them in `FeeSettingsCard` (mount, prefill read, FPC leg ready, gas leg ready, commit, and whether `peekGasBalances` hit and was stale) and in `balances.store.ts` (the wait for an earlier attempt, the new attempt, a timeout).
   - Collect: turn Developer Mode on in the run, since `readSwLogTrail` (`tests/e2e/fixtures/journal.ts:310-319`) is empty without it, and read the trail once the commit marker has flushed (2 s).
   - Runs, through `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts --retry=0` with a temporary step: Send opened twice with no transaction between, once after a send, and once while a real proof runs (prover on). The proof gate holds before `pxe.proveTx` (`execution-coordinator.ts:265`), so the proverless burst cannot show this. Open Send only after the offscreen prove call has started (its line in the trail).
   - Record per open, in `lessons/phase-3.md`: the time to each marker, the wait for an earlier attempt, any timeout or "Couldn't load fee data", the peek hit, and whether the default from the peek matches the committed one. Then revert.
   - Pass: the numbers are recorded, `git diff --stat -- apps` is empty, and a comment on #504 gives them.
   - Stop: a timeout or degraded commit while a proof runs, or most warm opens missing the peek, goes to the panel. Fixing that cause is a plan change.
4. **Not taken (OA-2 = B).** **#504 C, on OA-2 C only.** Change: `fee-privacy.ts`, `balances.store.ts` (`peekGas` writes no entry; header comment), `FeeSettingsCard.vue`, `tests/e2e/fixtures/send-page.ts` (`waitForFee` waits on `data-fee-settled`; its comment and `helpers.ts:1438`'s). Unit tests for the helper's precedence. `FeeSettingsCard.test.ts` cases, with the peek and the FPC list landing in either order:
   - the preview before the read, and no settings or payer emitted (never), then the commit (control);
   - a peek that misses, rejects or never answers: no default preview (phase 7 owns what shows), and the commit is not delayed;
   - an A→B→A switch whose first peek answers last is ignored;
   - an origin flip while pending;
   - no preview after a failed init;
   - a saved pick wins;
   - a fresh read that chooses another method replaces the preview.

   UI impact: OA-2 C. Gate: `F`, then `fee-methods` and `send-fee-privacy` once.
5. **#503, on OA-1 B (arc 2).** Change: `OperationCard.vue`, `OperationCard.fee.test.ts:326-367` (wire-shaped). It covers estimating (legend and loading line), landed (legend and figure), failed (legend only), a priority fee, and a `default_entrypoint` control with no loading line. `fee-sponsor-funding.test.ts:255-260` waits for the landed figure (`execute-op-app-fee`), matches its exact pattern on that element, and checks the legend apart. UI impact: OA-1, quoted. Gate: `F`, then that network spec once.
6. ✓ **#505, on OA-3 B (arc 2).**
   - Change: `send.vue`, `FeeCostReadout.vue`, `SendReviewSheet.vue` and their tests. `send.integration.test.ts:732` becomes: a queued send that Nulo's sponsor pays shows the answered row and "Queue send", and sends no cap and no estimate id. Never: a hand-added sponsor stays disabled.
   - `transfer-executor.test.ts`, at the unit layer because the no-id path builds fresh, which a composition test may not simulate (`tests/COMPOSITION-TESTS.md`). (a) A cap-less sponsored send behind a held predecessor builds once after release and writes no `reask`. (b) Never: Nulo's sponsor row re-pointed while queued fails closed before any build. Controls: a self-paid send that becomes queued after its estimate, with an estimate id and without one, still builds.
   - `tests/e2e/fixtures/send-burst.ts` (`readEstimateState`, `expectEstimateQueued`: enabled exactly while a cap shows or the payer is Nulo's sponsor) and the spec header of `same-token-concurrent-sends`. One held-send scenario there submits the sponsored send while held and checks its row stays queued until release. Wall-clock before and after.
   - UI impact: OA-3, quoted. Gate: `F`, then `NULO_E2E_PROVERLESS=1` and `same-token-concurrent-sends` once.
7. **Waiting (arc 2 leaves it out).** OA-2 B is signed, but the owner asked to see the whole fee block as a skeleton first; that mockup is being made. **#504 B, on OA-2 B or C.** Change: `FeeSettingsCard.vue`, `FeeMethodSelector.vue` and tests. Pending with no preview shows the skeleton. Control: a hold shows "Select method", never an endless skeleton. UI impact: OA-2 B. Gate: `F`.
8. ✓ **Full gate.**
   - `bun run test:all`, `bun run test:ci-gating`, and `bun run check:plans` after staging.
   - Smoke on Chrome and on Firefox (`NULO_E2E_BROWSER=firefox`): `cd apps/extension && bun run test:e2e -- tests/e2e/<f>.test.ts --retry=0` for `send-fee-privacy`, `send-keyboard`, `send-outcome-rows` and `settings-crud`.
   - Network once on Chrome: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<f>.test.ts --retry=0` (`agent.sh` hands its arguments to vitest), for `fee-methods`, and `same-token-concurrent-sends` with `NULO_E2E_PROVERLESS=1` (its file requires it, `scripts/e2e/proverless-guard.sh`).
   - Screenshots of each changed surface.
   - Pass: all green.

## Security & Adversarial Considerations

- **A pasted FPC address.** `isValidHex` checks the shape only. `sameFieldAddress` returns false on a malformed field, so that input never matches a stored row. The service's contract lookup and artifact check stay the boundary. The duplicate rule lives in the forms only; a direct service call can still store a duplicate, which gives two rows on Send paying through one contract. That holds today (D4).
- **Approval window (OA-1).** The app name keeps `safeWire(name, 64)`. Under B it stays beside the true figure at Confirm time, so a name like "Swap · Fee up to 0.0001 FJ" reads next to the real one (OA-1 says so). Exploitability unknown; no code. Tests use wire-shaped fixtures.
- **The preview (OA-2 C).** The peek answers from the SW's memory for one network and account. It is emptied on lock, unlock and profile switch, and the card drops an answer for any other run or identity. It is display-only: no settings, payer, estimate or send derives from it (phase 4 never-case). It is never logged.
- **OA-3 B.** Nothing is capped for a send the person does not pay. At its turn the executor re-resolves the paying row. A row re-pointed while the send waits (the attacker needs the person to edit their sponsor's address) could otherwise send through an unvouched contract, which can spend an authorization the account granted it (`fee-helpers.ts:276-278`). The fail-closed rule stops that. A drained sponsor is not checked on a fresh build (`skipFeeEnforcement`), so such a send can prove and then be refused by the node.
- **Supply chain, crypto, privileges:** no dependency, key, workflow or permission change.

## Assumptions

- **Facts.** (1) #505's gate and its signed rule: above. (2) A cap-less queued send proves without asking (`transfer-executor.ts:365`; test `:1561`, which does not hold a predecessor). (3) #503: `OperationCard.vue:287-297` (`v-if`/`v-else` on `feeEstimate`); the branch never reads `isEstimating`; `index.vue:174` holds Confirm only for an app-set fee figure. (4) #504: `FeeMethodSelector.vue:57`; `FeeSettingsCard.vue:241-249` and `:616-627` (a forced read on every Send mount). (5) `GasBalanceReader.peek` serves any entry from this SW lifetime. It marks an entry stale after the TTL, a settled transaction or a PrivateFPC change (`gas-balance-reader.ts:116-142`), and is emptied on lock, unlock and profile switch. (6) #340 and #316 code and pins: recon.md. (7) `fee-sponsor-funding.test.ts:257-260` matches the whole badge's text. (8) `send-burst.ts:97` requires Send enabled exactly while a cap shows.
- **Inferences.** I1: on an idle open, the forced gas leg dominates the time to commit; phase 3 measures it. I2: while a send proves, the private leg waits for the proof, which may be the wait the owner saw (#504 and #505 came from one smoke); phase 3 measures it. I3: P18-09 A covers the address rule only; it names "a sponsor address already stored".
- **Asks.** OA-1 to OA-4 (OWNER-ASKS.md).

## Decision ledger

| # | Question | Chosen | Not taken |
|---|---|---|---|
| D1 | #505 | no code without OA-3 B | build B now: it reopens a signed fee rule, which the lane brief leaves to the owner |
| D2 | #504 fix | measure; the field's look is OA-2 (B recommended) | ship the preview under the lane brief's "cache" record (Codex: keep it; Opus: needs the owner): it can show a stale, untagged "Public Fee Juice" on a private send and change the e2e "settled" signal, beyond "existing words"; a persisted last method (OA-2 D, new stored data); a forced read that joins one in flight (breaks the rule at `gas-balance-reader.ts:85-96`); commit on cached data (an estimate on stale data) |
| D3 | peek source (C) | read-only `balancesStore.peekGas` | `peek: true` caps: a peek never lands while the card's forced read is pending (`balances.store.ts:406`), and it would write display data into the shared entry; a new service client in the card |
| D4 | #316 rule | the forms, as the add form | a service refusal (the name rule has none; the archived plan's D3) |
| D5 | #503 init debounce (500 ms) | unchanged | skip it at init: one option for one caller |
| D7 | #504 probe collection (deviation, arc 1) | popup marks in a page global, worker marks in a `chrome.storage.session` key, read by the test | Developer Mode plus `readSwLogTrail`: Codex round 1 allowed any temporary numeric-only probe, and this one needs no logger level or flush wait |
| D8 | delivery (deviation, arc 1) | arc 1 ships phases 1-3 with OA-1..OA-4 at A and leaves the plan open; the page 20 picks ship in arc 2, which closes the plan | one arc that waits for page 20: the signed #316 and #340 words would wait on unsigned asks |
| D6 | #505 test layer | executor unit tests and one e2e scenario | a composition test (lane brief): the no-id path builds fresh, which the harness may not simulate |
| D9 | arc 2 branch (deviation) | `send-fees-ux-arc2` off `origin/dev` after #532's squash | reuse `worktree-send-fees-ux`: it is pushed with arc 1's unsquashed history, and no pushed branch is rewritten |
| D10 | #505's e2e scenario (deviation) | convert the sponsored "two private sends of the same token" case (18/19) to queue B while A is held | a new scenario: the other sponsored held cases still prove "the estimate lands once A is mined", so a conversion proves the new path with no added runtime |
| D11 | where "entered with Nulo's sponsor" lives | `sequence()` returns `sponsored` from the row it already resolves; `TransferRun` keeps the entry value | a second `getFpcImpl` read at entry (another await before the journal row, racing the first) |
| D12 | #504 in arc 2 | left out on the orchestrator's word; phase 7 waits | build OA-2 B now: the owner asked to see a whole-block skeleton before it ships |

## Delivery

Single arc: branch `worktree-send-fees-ux`, one PR against `dev` with `gh pr create`, opened only after phase 8 and the Codex loop converge. Title: `fix(wallet): sponsor address check on edit, cap refusal words` (60 characters), widened to the answers it carries, at most 93. Body: the change and why; a `UI impact` line per surface with screenshots; the validation runs; phase 3's numbers; e2e wall-clock before and after for any changed scenario (else "no e2e scenario added or changed"); `Closes #316 #340`. Add `Closes #503`, `#504`, `#505` when OA-1, OA-2, OA-3 have answers the arc carries; an answer of A closes its issue by comment. OA-4 still open at close-out becomes an issue. Comment on each issue left open. Open the PR without labels. Add `e2e:extension-network` if the path filter skips the network lane. No parallel lanes.

**Arc 2** (D8, D9): branch `send-fees-ux-arc2` off `origin/dev` after #532, one PR against `dev` with `gh pr create`, opened after the full gate and the Codex loop. Title: `fix(wallet): app fee legend while estimating, queue sponsored sends` (65 characters). `Closes #503`, `Closes #505`; #316's OA-4 B rides along (the issue is closed); #504 stays open (phase 7 waits). Body quotes page 20's picks. The close-out (Outcome, archive move) waits for #504's arc.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at `dfdf4c31`, single-arc placement. Plan-specific values: no diff review (`code_review: off`). Loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, at most three rounds, each logged in `lessons/phase-8.md`. A fix that grows the design stops for the orchestrator; persistence, permissions, public contracts and background work go to the owner. Close-out: the PR's final commits, after merging `origin/dev` and reading `index.md` and `lessons.md`. Teardown after merge: `agent-worktree done send-fees-ux --merged`; the delivering session arms the background wait the standard names.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a1418a): conditional approve, 7 findings, all accepted. #1 phase 5 read the wrong e2e element; #2 `send-burst.ts:97` contradicts OA-3 B; #3 a composition test cannot reach the no-id path (D6); #4 two security statements overstated (the address check, the drained-sponsor stage); #5 the peek's run ownership, failure isolation and arrival order; #6 phase 3 could not capture debug lines and needed opens during a proof; #7 a sponsor row re-pointed while a cap-less send waits (the fail-closed rule, OA-3). Its view that the preview could ship under the lane brief's record lost to Opus #2 (D2).

**Round 1, Opus Plan:** conditional approve, 16 findings, all accepted. #1 the trigger stops being the e2e "settled" signal (`data-fee-settled`); #2 the preview needs the owner (OA-2 C); #3, #9, #10, #15 the peek off the init's path, guarded by `runSeq`, shown only while pending, through a helper; #4 a stale, untagged Fee Juice preview (OA-2 C text, F5); #5 the private leg waits behind a proof (I2, phase 3); #6 phase 5's selector, testids and the `default_entrypoint` control; #7 the fixture and the re-pointed row; #8 the edit rule only on a changed address, a re-cased own address as no change (now OA-4, Codex r2 #5); #11 D3's reason; #12 "since the last unlock"; #13 a card prop for phase 7; #14 a hostile app name beside the figure (OA-1); #16 #504 closes only with an answer. Phase 2 also drops two stale comments.

**Round 2, Codex** (resume): conditional approve, 5 findings, all accepted. #1 phase 3 could not read its probes (Developer Mode off), the burst spec needs `NULO_E2E_PROVERLESS=1`, and the proof gate holds before `pxe.proveTx`, so contention needs a prover-on run; #2 20 s is per attempt, not the whole wait; #3 OA-2 now excludes a hand-picked method, and phase 4 leaves the miss to phase 7; #4 the payer rule keyed on "entered with Nulo's sponsor", checked in `buildPass`, never on "queued with no cap", which would refuse an ordinary send that became queued; #5 the re-cased own address is OA-4, not information. It agreed the preview belongs in OA-2 C.

**Round 3, Codex** (resume, confirmation): **approve**. All five round 2 resolutions verified; no regression found.

**Implementation rounds 1-2** (phases 1-2 diff; round 2, Codex resume: approve, the loop converged). Codex (gpt-6.1-sol, high, session 01a141e3): conditional approve; its one in-scope finding, the rename control's out-of-field addresses, fixed (84e49ca0). Opus diff review: approve after the same fix. Pre-existing, outside the arc: the submit button is live while the duplicate list loads (#528, known limit); a row another network adds while a form is open (#529, known limit); a Send-page send the cap refused reads "Stopped before broadcast" (OA-5, ships as is). Log: [lessons/phase-8.md](lessons/phase-8.md).

**Arc 2 implementation rounds 1-2** (phases 1b, 5 and 6; round 2, Codex resume: approve, the loop converged). Codex (gpt-6.1-sol, high, session 01a144e6): conditional approve, 2 findings: an edit of Nulo's sponsor row between the press and the worker's first read escapes the fail-closed rule, as it does for a send that is not queued (known limit #569: closing it needs the approved payer on the wire); the refusal's slot and ticket release was unasserted (test added). Opus diff review: approve; the same window (#569), a dead estimate-id change (reverted) and an overclaiming comment (narrowed). Log: [lessons/phase-8.md](lessons/phase-8.md).

## Seeds

`/goal` (recommended): `/goal All phases of implementations-plan/send-fees-ux/plan.md that apply are marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/send-fees-ux/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex fix loop over the whole diff converged (a resumed pass reporting no new material finding, quoted); the PR exists on GitHub, opened after the loop (gh pr view output); the close-out's archive move is committed (git show --stat); bun run test and bun run lint exit 0.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/send-fees-ux forward; never idle. Each firing: (1) read plan.md and lessons/, the source of truth. If the plan directory is gone, run git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-fees-ux/plan.md: success means merged, so run agent-worktree done send-fees-ux --merged, report its output, clear this loop and stop; failure means delivered, so only watch the PR's checks. (2) Otherwise take the next phase that applies and is not ✓, run its gate, mark ✓, log lessons/phase-N.md. (3) Settle a decision with Codex (run-codex.sh ... high read-only gpt-6.1-sol) and log it; a visible change waits for its owner ask. (4) After phase 8, run the Post-implementation section: the Codex loop, the PR, the close-out, the checks. Never merge. The same step failing 5 times: reassess with Codex.`
