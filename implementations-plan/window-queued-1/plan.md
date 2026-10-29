---
plan: window-queued-1
tier: light
status: approved by the final Codex pass; arc 1 implementing
issues: "#1360 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at 15a9bd9d3
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 15a9bd9d3
post_implementation_hardening: not scheduled
---

# window-queued-1: a fee method switched while queued leaves the queued sentence behind

One issue, one arc, one PR against `dev`. Recon and the trace: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

**The decision**, the owner's on #1360 (2026-10-29): "**ship it.** On a fee-method switch the window's row leaves the queued reading for the estimating state until the wallet answers again; Confirm behaves the same either way. Ships as its own small PR."

## Outcome & Quality Bar

- **For whom**: a person approving a dApp send who switches its fee method while the window says "Queued behind your previous send".
- **Excellent**: (1) after a switch the row never names a send the wallet has not just reported: it shows the estimating state until the wallet answers the new method's estimate, and reads queued again only if that answer is queued; (2) Confirm is on and off at exactly the moments it is today.
- **Good enough**: no change to Send, the fee card, the worker's queue or the copy.

## Assumptions

**Facts** (at `15a9bd9d3`; detail in [recon.md](recon.md)):
- F1 `handleFeeUpdate` schedules the replacement and never clears `queuedOps[index]` (`apps/extension/src/popup/windows/execute/index.vue:457-465`); the watcher clears it only once the operation stops estimating (`:606-612`), and the engine keeps it estimating across the supersede (`src/composables/internal/fee-estimation-engine.ts:120-125`: `schedule` aborts the old controller at `:97-99`, then sets estimating).
- F2 Behind estimates alone, with no send holding or waiting for the slot, the worker answers no `queued`: `takeEstimateSlot` returns the mutex wait (`src/wallet/services/execution/execution-lane.ts:482-497`; a waiting send still answers queued); `onEstimateStarted` fires only once the slot is held (`service.ts:849-853`). This is D18 of the archived fee-race-1 plan.
- F3 `queuedOps` is read only by `:isQueued` (`index.vue:680`); no Confirm term reads it (`:726-737`, `fee-figure.ts:52-58`).
- F4 Send clears its reading before each new estimate (`src/popup/pages/send.vue:628-629`); the window's `onQueued` already ignores an aborted attempt (`index.vue:184-186`).
- F5 `handleFeeUpdate` is the only window call that supersedes an attempt: init schedules each operation once, previews only at init (`index.vue:345-349`).
- F6 The composition driver runs no window component and keeps no window queued flag (`tests/helpers/fee-race-in-process.ts:706-820`).
- F7 Every claim of #1360 held (recon § The bug, traced).

**Inferences**:
- I1 The fix clears the reading on every settings emission that schedules a replacement: a method or priority pick, and the card's own re-derivations (a snapshot re-commit, an FPC edit through `onFpcUpdated`, `FeeSettingsCard.vue:294-299`). Each already supersedes the attempt today, so the fix adds a reading change, never an estimate. No equality filter is wanted: each is a new question.
- I2 With a send still in flight at the switch, the row reads estimating for the 500 ms debounce plus admission and one call, then queued again only if a send holds or waits for the slot when the replacement asks. The owner's "until the wallet answers again" covers this; Send behaves the same.
- I3 A withdrawn fee choice (`value` undefined) schedules nothing, so the attempt in flight keeps its reading. It is out of the owner's decision and stays as it is.

**Asks**: none. The priority pick and the card's re-derivations reach the same line; D7 records why the owner's decision and fee-race-1's D18 already cover them.

## Architecture & Implementation

- **Change**: in `handleFeeUpdate`, when `value` schedules a replacement, set `queuedOps.value[index] = false` immediately before `scheduleFeeEstimate`. Name the new clearing point in the `queuedOps` doc comment (`index.vue:180-181`); add no other comment. No new state, watcher, event, prop or copy.
- **Flow after the fix**: switch → flag cleared → engine aborts the old attempt (its `onQueued` is now inert) → row shows the estimating state → the replacement's own `queued` answer sets the flag again, or its `onEstimateStarted` and settle leave it clear.
- **Not taken**: D1 and D2 below.

### Phase 1: The fix and its component case ✓

- Add to `index.test.ts` § "execute window — approval envelope", beside the two queued cases: "a fee method switched while queued reads estimating until the wallet answers again, and Confirm holds as before". Drive the real `estimateWhenClear` through the map's `opts.estimate`, on fake timers. The mocked map's `estimate` does what the engine's `schedule` does, synchronously: abort the live attempt's controller, set the result to `null`, set estimating `true`. Catch the aborted attempt's rejection, as the engine's staleness check drops it. Steps and assertions:
  1. Pick `fj`; attempt `tok-a`'s first ask answers queued: `isQueued` true, Confirm off. After the 2 s poll, its second ask stays unanswered.
  2. Switch to a sponsor and emit `updatePayer` `{ type: "fpc" }`, so only the estimate in flight holds Confirm. `estimate` is called last with the new settings. Start `tok-b`; its first ask stays unanswered (the worker holds it in admission or in the slot's line): `isQueued` false, Confirm off.
  3. `tok-a`'s second ask now answers queued: `isQueued` stays false (an aborted attempt's answer is inert).
  4. Control: `tok-b`'s ask answers queued (it waited in admission and a send joined first; an ask already in the slot's line never answers queued): `isQueued` true. A late `onEstimateStarted` for `tok-a` leaves it true. Confirm off.
  5. The replacement lands (result set, estimating false): `isQueued` false, Confirm on.
- Red before: copy the test into a tree with `index.vue` from `15a9bd9d3` and the new test only. It must fail at step 2's `isQueued` assertion, received `true`, with no unhandled rejection.
- Then make the change.
- **Validation gate**:
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/windows/execute/ --retry=0`; `bun --bun vitest run src/wallet/services/execution/fee-race.composition.test.ts --retry=0`.
  - Pass: every command exits 0; the red-before run fails at step 2 only, logged in `lessons/phase-1.md` with its output line.
  - Layers: lint, typecheck, unit, component, composition.

### Phase 2: Full gate and the e2e that hold a window

- Run the full local gate on the head.
- Run the network files that hold a window behind a send or pick a window method beside a queued Send, Chrome then Firefox, from the repository root: `concurrent-sendtx-confirm`, `tx-sendTx-noFrom`, `same-token-concurrent-sends`. Command per browser: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/concurrent-sendtx-confirm.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/same-token-concurrent-sends.test.ts`. Run one `e2e:agent` at a time.
- `concurrent-sendtx-confirm` reads the held window's row for 3 s with no switch (`fixtures/proof-gate.ts:75-88`): a flip there is a finding against I1, not a flake to rerun.
- Smoke: no smoke file opens the execute window (recon § E2E), so no local smoke run. CI's smoke lanes run on the PR.
- The picture (CLAUDE.md § UI changes): a scratch spec, kept under `~/.cache/nulo-backlog/window-queued-1/`, copied into `tests/e2e/network/` for one Chrome run on the head and deleted before lint and commit. It repeats `concurrent-sendtx-confirm`'s setup up to the held second window, then captures the window three times: held and queued; right after `selectFeeMethod` picks another method (the estimating state, I2: arm the row's observation before the pick, check the queued sentence is gone and Confirm off, capture at once); a few seconds later, with the proof gate still held, queued again. No sleep, retry or timing change is added to make the capture land. Commit the three PNGs to `implementations-plan/window-queued-1/screenshots/`. The bug's own case (send gone, an estimate holds the slot) has no existing deterministic browser fixture (D4); the component case is its proof.
- **Validation gate**:
  - Commands: `bun run test:all`; the two network runs above; the scratch spec; `bun run check:plans` after staging.
  - Pass: every command exits 0 at retry 0; the second picture shows no queued sentence; `git status --porcelain apps/extension/tests/e2e` is empty before the commit; each run's wall-clock goes in `STATUS.md` and the PR body. A red run is read before any rerun: one rerun for a known flake, a fix for real breakage.
  - Layers: unit, component, composition, e2e on a live local network, both browsers.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, stored row, message, permission, log line or dependency. The change writes one popup-local boolean that only selects which existing fee-row state renders. What it must not do is weaken Confirm, and it cannot: Confirm reads `estimating` and `results`, never `queuedOps` (F3), and the component case pins Confirm off through the switch and on only once the replacement lands. A dApp cannot reach `handleFeeUpdate`; only the card's emission does, on the person's pick or its own re-derivation (I1).

## UI impact

The window's fee row after a fee-method switch while queued, and after any other new fee setting the card emits while queued (a priority pick; the card's own re-derivation, D7): before, "Queued behind your previous send" until the replacement's run starts, even with no send in flight; after, the existing estimating state until the wallet answers the new method's estimate, then queued again only if that answer is queued. No new copy, control or layout; Confirm unchanged. Pictures: Phase 2. Sign-off, the owner on #1360 (2026-10-29): "On a fee-method switch the window's row leaves the queued reading for the estimating state until the wallet answers again; Confirm behaves the same either way." The PR body quotes it.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Clear in `handleFeeUpdate`, before the schedule | clear on the attempt's `signal` abort inside `queueWatch` | the caller that asks a new question owns the reading, as Send's `requestEstimate` does (F4); the abort hook would also fire on cancel and dispose, which need no reading change, and covers no other reachable supersede (F5) |
| D2 | Keep `queuedOps` keyed by operation | key the reading by attempt token | the engine does not expose the live token; adding it is a public-contract change for one caller |
| D3 | Clear only when a replacement is scheduled | clear on every `handleFeeUpdate`, `undefined` included | a withdrawn choice schedules nothing, and the attempt in flight still owns its reading (I3) |
| D4 | One component case; no committed e2e scenario | an e2e switch in a held window | the case is a popup-local flag; reaching "send gone, another estimate holds the slot" in a browser needs a second timed holder, which the component case sets up directly |
| D5 | The composition catalog does not gain the sequence | a hand list in `fee-race.composition.test.ts` | its driver runs no window component and keeps no window flag (F6); the sequence would test a copy written for it, the second wallet fee-race-1's D12 rejects |
| D6 | One arc, one PR, `gh pr create` | a `gh stack` | one issue, one file and its test |
| D7 | A priority pick and the card's re-derivations clear the reading too | filter `handleFeeUpdate` to a changed `paymentMethod`; an owner ask | each schedules a replacement, a new question; a filter keeps "Queued behind your previous send" on screen behind another estimate, which fee-race-1's D18 ruled out ("the sentence never names a send that does not exist", its signed-off UI impact) and adds a comparison for one caller. The owner's sentence names the reading after a new estimate, which Send already gives every input. Stated in UI impact and the PR body |
| D8 | The picture comes from a scratch spec on the held window (I2) | no picture; the bug's own case in a browser | CLAUDE.md requires one for a popup surface; the held window shows the same estimating state the fix restores, and the bug's case has no existing deterministic browser fixture (D4) |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a189a5`): `conditional approve (with conditions: correct F2/I1/I2 and make the test's scheduling contract explicit)`. Opus 5.5 Plan: `conditional approve (with conditions: name the priority change and the card's recommit in UI impact; add a test pin for the superseded attempt's late queued answer; spell out how the test mimics the engine; attach a UI artifact)`. C = Codex, O = Opus; all accepted, each verified against the tree:
- C1 F2 held only with no send waiting: `isSendInSlot` counts a waiting send (`execution-lane.ts:482-484`) → F2 qualified; the Security line no longer says only the person's pick reaches the line.
- C2/O1 I1 was incomplete: an FPC edit (`FeeSettingsCard.vue:294-299`), a recommit or a verdict-driven change re-derive the settings too → I1 rewritten; O1 asked for it in UI impact → D7 and the UI impact line.
- C3 I2 overpromised the return to queued: a send that finishes during the debounce leaves none → I2 says "if a send holds or waits for the slot when the replacement asks".
- C4/O3 the test's engine mimicry: the synchronous abort, cleared result and estimating flag, the caught rejection, the real `estimateWhenClear`; O3 a slot wait never answers queued, so step 2's ask is "in admission or in the slot's line" and step 4's queued answer is a send joining first → Phase 1 rewritten. C4's late `onEstimateStarted` for the old token → step 4.
- O2 the fix leans on `onQueued`'s `!signal.aborted`, which no test pins; with the old attempt asleep at the switch the case passes either way → step 1 leaves `tok-a` mid-ask, step 3 answers it after the switch.
- O4 Confirm held in steps 1-3 for a reason unrelated to the fix (no payer emitted, so the missing figure held it) → step 2 emits a sponsor payer, so the estimate in flight is the only hold.
- O5 no picture, against CLAUDE.md § UI changes → D8, Phase 2.
- O6 `tx-sendTx-noFrom` cannot reach the changed line; `concurrent-sendtx-confirm` guards I1 → both kept (the lane names the files that hold a window; about 70 s), and a flip in the latter is a finding.
- O-facts: F1's engine lines (`120-125`, abort at `97-99`); D1's "the watcher already clears" on dispose was wrong (dispose leaves estimating set) → reworded.
- **Round 2** (Codex, resumed, verification): `approve`. Two low notes, folded: the picture arms its observation before the pick and adds no sleep or retry; D8 says "no existing deterministic browser fixture", not "no browser path". It argued D7 both ways and found it sound. It traced step 2 red on the base `index.vue` (to be confirmed by the run).
- Both, round 1: D1-D3 and D5 hold; no new state, lifecycle, protocol, recovery policy or contract; the clear cannot land after the replacement's own queued answer (the clear and `schedule` share one synchronous stack, the replacement asks after the 500 ms timer).

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-2 | `worktree-window-queued-1` | `dev` | `fix(execute): a fee method switched while queued reads estimating until the wallet answers` (90) | #1360 |

`code_review: off`. Merge `origin/dev` before the PR; run `bun run check:plans` after. Open the PR ready, without labels; add `e2e:extension-network` afterwards only if the path filter skipped that lane. Body: what changed and why, the owner's sentence quoted, the red-before line, every gate with its outcome, each browser's network wall-clock (no e2e scenario added, so no before/after), `Closes #1360`. No parallel lanes: one phase depends on the other.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `15a9bd9d3`. Plan-specific values:

- **Review loop** (single arc, once, after Phase 2 is green): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff 15a9bd9d3...HEAD` (merge base if `dev` was merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim. Resume with `resume-codex.sh` and the same codex-dir. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) of the diff beside round 1. Log each round in `lessons/phase-2.md` and here.
- **Approval boundary**: a fix that clears or sets `queuedOps` anywhere else, or changes any Confirm term, is a plan change and stops for the orchestrator.
- **Delivery**: as above, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- **Close-out**, the PR's final commits: merge `origin/dev` and read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter (Date, Status, Shipped, Known limits, Open items, seeds retired); a lesson only if one generalizes, deduped; `STATUS.md` deleted; `git mv implementations-plan/window-queued-1 implementations-plan/archive/window-queued-1` in its own commit, its index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/window-queued-1/plan.md` succeeds, `agent-worktree done window-queued-1 --merged`. The orchestrator's next session notices the merge; this session arms no wait.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-2 of implementations-plan/window-queued-1/plan.md marked ✓, each gate reported passing in the transcript with LESSONS_FILE=implementations-plan/window-queued-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1360 and the close-out's archive move (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/window-queued-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
