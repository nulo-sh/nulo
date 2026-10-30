---
plan: history-1
tier: light
status: planned; panel approved (Codex round 2 approve)
issues: "#1394, #1392 (arc 1 closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at 13bb2133c
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 13bb2133c
post_implementation_hardening: not scheduled
---

# history-1: History orders sends by when they were sent, and a failed fee estimate offers its retry

Two issues, one arc, one PR against `dev`. Recon, traces and the claims that did not hold: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

At 160 lines this plan is over the light target of 150: the audit verdicts keep each finding's evidence.

**Sign-off**, the owner on 2026-10-30: "#1381–#1395 => yes, if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed on Monday."

## Outcome & Quality Bar

- **For whom**: a person who sends several times in a row and reads History or Home; a person on a slow node whose Send fee estimate fails.
- **Excellent**: (1) History and Home list sends newest sent first, the same order on both, and a send keeps its place as it is mined and finalized; (2) after a failed estimate the fee card says so where the fee shows and offers one press that asks again, with Send off until a fee lands, as today.
- **Good enough**: journal and incoming rows keep their keys; the execute window and the two authorization popups keep their snack; the estimate's deadlines do not move.

## Assumptions

**Facts** (at `13bb2133c`; paths under `apps/extension/src/` unless rooted; detail in [recon.md](recon.md)):
- F1 A tx row's sort key is `updatedAt` (`utils/activity-rows.ts:84`), used by History (`:64`) and Home (`popup/components/modules/general/recent-activity-rows.ts:40,50`); the store sorts the same way (`stores/activity.store.ts:163`).
- F2 `commit()` sets `updatedAt = Date.now()` on every status move (`wallet/services/transaction/service.ts:654-658`); `createdAt` is stamped once at `addTransaction` after the node accepted the broadcast (`:313-318`) and kept by `restore()`.
- F3 `createdAt` is recorded right after `node.sendTx` resolves (`wallet/services/execution/execution-coordinator.ts:354-355`): when the send reached the node. A send that waited behind an earlier one (the sequencer, `execution/send-sequencer.ts:1-9`; a dApp send that hands its slot on and re-enters at the tail, `execution/execution-lane.ts:357-380`) sits where it went out, not where Confirm was pressed.
- F4 The tx detail page shows `updatedAt`, unlabelled (`popup/pages/tx/[id].vue:98-101`); the journal page shows its `createdAt`.
- F5 A failed estimate leaves `result` null and not estimating; the readout falls to its idle hint (`popup/components/modules/send/FeeCostReadout.vue:82-86`); the snack names a retry no control offers (`popup/pages/send.vue:450-458`); only a watcher source re-asks (`:645-660`), pinned by `send.integration.test.ts:954-969`.
- F6 The card's "Retrying in the background" line is the gas and FPC read's (`FeeSettingsCard.vue:321,331-335`), which the store retries while the card is mounted (`stores/balances.store.ts:129-133`).
- F7 One snack shows at a time and a later one replaces it (`packages/design/src/composables/toast.ts`); an error snack stays until closed and outlives the page; a scope change closes only a snack with an action (`popup/scope-epoch.ts:17-21`).

**Inferences**:
- I1 The card read's recovery re-asks the estimate: the store's retry bumps `retryVersion`, the snapshot re-commits (`composables/useFeeSnapshot.ts:303-321`) and replaces `gasBalances` (`:99`); `derivedSettings` (`FeeSettingsCard.vue:244-250`) rebuilds, and `buildSettings` returns a new object each time (`fee-helpers.ts:66-75`); the watch at `:262` re-emits it, and Send's deep watcher re-asks. Both legs traced it; Phase 2 pins it. A recovery of the FPC read alone is not traced.
- I2 Neither line was false: they report two reads. The fault is that the estimate offered no reachable retry.

**Asks**: OA1 (the detail page's time, F4) stays out of the arc. Its "what ships now" is today's page.

## Architecture & Implementation

- **#1394.** `scopedTxRows` keys a tx row on `tx.createdAt`; the store's `transactions` reads newest `createdAt` first. History's day headers follow (`TransactionsList.vue:31` groups by `sortKey`). Neither field's writes change: the dropped-resurrection window keeps reading `updatedAt` (`transaction/service.ts:525`).
- **#1392.** `send.vue` gains `estimateFailed` (a ref beside `feeQueued`, as `SelectTokenCard`'s `failed` and `@retry` already are on this page): `onError` sets it after the requeue and unusable-account branches and keeps the id `openToast` returns. The first statement of `requestEstimate`, above its guards, clears the flag and closes the snack if `toast.value?.id` is still that id (D11), so any new question (an input, an emptied amount, a settings re-emit, an identity switch, the retry) retires the old report and no later snack is closed. `FeeSettingsCard` takes `estimateFailed` and emits `retryEstimate`; `FeeCostReadout` takes `failed` and emits `retry`. Its new branch, before the idle hint and after the landed estimate, `v-else-if="failed && !pending"`: the "You pay" label, the line "Couldn't estimate fee." in `txt-danger`, and a native "Try again" button (`data-testid="fee-estimate-failed"` on the row, `fee-estimate-retry` on the button, styled as `incoming-sync-retry` is, with the 2 px accent ring on `:focus-visible`). Send binds `@retryEstimate="requestEstimate"`. A keyboard press unmounts the focused button, so on a `:focus-visible` press the card moves focus to its fee method trigger, the control just before the row, through a `focus()` that `FeeMethodSelector` exposes (D9; `handleRequote` does the same for the amount). The snack's copy and Send's gate stay as they are. The window and the popups pass nothing, so they render as today.

### Phase 1: History and Home order by `createdAt` ✓

- Write the reproducer first, in `popup/components/modules/general/recent-activity-rows.test.ts`: "History and Home order sends by when they were sent, whatever their last status change". Two txs: A sent first (`createdAt` 1_000) and finalized last (`updatedAt` 9_000); B sent second (`createdAt` 5_000, `updatedAt` 5_000). Build rows with `buildActivityRows` and `buildRecentActivityRows` from the same input. Assert both read `[B, A]`.
- Flip `activity.store.test.ts` "transactions read newest first" to crossed values: newest `createdAt` first, whatever `updatedAt` says.
- Run both on the base: each must fail on the order, received `[A, B]`. Log the lines in `lessons/phase-1.md`.
- Make the two one-line changes. Set `createdAt` in the tx helpers of `utils/activity-rows.test.ts`, `recent-activity-rows.test.ts` and `popup/pages/activity.test.ts`; the two read-order pins end in `"createdAt"`. Fix any other fixture that only fails for lack of `createdAt`.
- **Validation gate**:
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/utils/activity-rows src/popup/components/modules/general src/stores/activity.store src/popup/pages/activity --retry=0`.
  - Pass: every command exits 0; both reproducers red on the base at the order assertion and green after.
  - Layers: lint, typecheck, unit, component.

### Phase 2: A failed estimate's state and retry

- Write the reproducer first, in `send.integration.test.ts` with `realFeeRow`; it must fail on the base at the `fee-estimate-failed` lookup, before the change: "a failed estimate shows its retry on the fee row; Try again asks the same estimate and Send turns on when it lands". The estimate rejects once. Assert: the snack call as today; `fee-estimate-failed` reads "You payCouldn't estimate fee.Try again" (whole `textContent`); Send off. Click `fee-estimate-retry` with `sendEvent`. Assert a second `estimateTransferFee` call with the first call's arguments but its token; after `estimateLands()`, `fee-estimate` shows and Send is on. After the press, the failure's snack is closed (`closeToast` called while `toast.value` is that snack); a snack opened after the failure is not.
- Extend the existing input test (`:954`) with `realFeeRow` as the control: after the failure, a retyped amount re-asks and clears `fee-estimate-failed`; an emptied amount shows the idle hint.
- Add the pin for I1 with `realFeeRow` on `FUNDING["no gas, a sponsor"]`, so the sponsor pays before and after: the gas read and the estimate each reject once; advance 800 ms, then `INIT_RETRY_BACKOFF_MS[0]`, then `estimateLands()`. Assert a second `estimateTransferFee` call with no input, then the landed row. Green on the base too: it pins why the card's line stays (D8).
- Update Send's toast double (`send.integration.test.ts:139-141`): a reactive `toast` ref, increasing ids from `openToast`, a `closeToast` that clears it, reset per case. The readout forwards the click event with `retry`, so the card reads `currentTarget.matches(":focus-visible")`.
- Add one `FeeCostReadout.test.ts` case: `failed` with `pending` and an amount shows the bar, not the failed row; `failed` alone shows the row, and the button emits `retry` once. Add one `FeeSettingsCard.test.ts` case: a `:focus-visible` retry (stub `matches`, as `send.test.ts:1898` does) emits `retryEstimate` and focuses `send-fee-method-trigger`; a pointer press leaves focus alone.
- **Validation gate**:
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/send src/popup/components/modules/send src/popup/components/modules/fee-cards src/popup/components/popups src/popup/windows/execute --retry=0`; `bun --bun vitest run src/wallet/services/execution/fee-race.composition.test.ts --retry=0`.
  - Pass: every command exits 0; the reproducer red on the base as stated; the I1 pin green on base and head.
  - Layers: lint, typecheck, unit, component, composition.

### Phase 3: Full gate, the e2e that reach both screens, and the pictures

- Run `bun run test:all`.
- Smoke, Chrome then Firefox, from `apps/extension`: `[NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/home-links.test.ts tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts --retry=0`.
- Network, Chrome then Firefox, from the repository root, one `e2e:agent` at a time: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/transfers.test.ts tests/e2e/network/send-amount-exact.test.ts tests/e2e/network/snack-placement.test.ts`. `snack-placement` drives Send to a failed estimate (`:403-411`) and places its snack against the footer, so it reaches the new row and the snack's close; `fixtures/send-burst.ts:53-59` reads that snack too.
- Pictures (CLAUDE.md § UI changes), from scratch specs kept under `~/.cache/nulo-backlog/history-1/`, copied into `tests/e2e/` for one Chrome run on the base and one on the head, then deleted. History and Home: seed two sends with crossed `createdAt` and `updatedAt`, as F2 makes them. Send: on the network lane, refuse the node's calls with `interceptRpc` so the read and the estimate fail, and capture the card and snack (the lab's state). On the head, hold the node's calls, press Try again from the keyboard and check focus is on the method trigger, then release and capture the landed fee: the retry in the picture is the press, not the read's recovery. Commit the PNGs to `implementations-plan/history-1/screenshots/`. Add no sleep or retry to make a picture land.
- **Validation gate**:
  - Commands: the runs above; `bun run check:plans` after staging.
  - Pass: every command exits 0 at retry 0; `git status --porcelain apps/extension/tests/e2e` is empty before the commit; each run's wall-clock goes in `STATUS.md` and the PR body. Read a red run before any rerun: one rerun for a known flake, a fix for real breakage.
  - Layers: unit, component, composition, smoke and network e2e, both browsers.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, message, permission, stored shape, migration, log line or dependency. Ordering reads a field every stored row carries (`TxSchema`); a restored backup can set any `createdAt`, which places its own rows in its own History, as `updatedAt` already could. The retry re-enters `requestEstimate`, so every guard holds (terms current, valid address, settings, valid amount), the engine mints a fresh token, and Send's gate is unchanged: nothing goes out on a fee the person has not seen (`send-fee-gate.ts:31`). An unusable imported account still leaves the page, with no retry. The engine drops a stale or aborted attempt's rejection (`composables/internal/fee-estimation-engine.ts:110,213-217`), so no earlier question or identity sets the flag; the button is gone while estimating and a superseded estimate is cancelled at the worker, so presses cannot flood the node.

## UI impact

- History, Home's Recent activity and the token pages' lists: before, a send moved above newer ones when it was mined or finalized; after, sends read newest first by when they reached the node and keep their place; a send that waited behind an earlier one sits where it went out. A History day header follows that day. No copy.
- Send's fee card after a failed estimate: before, the idle hint "Fee estimated after simulation" beside the snack "Couldn't estimate fee. Try again."; after, the "You pay" row reads "Couldn't estimate fee." with a "Try again" button, and the snack closes once a new estimate is asked. Where the card's read also failed, its "Retrying in the background" line stays above the new row (the lab's case; the pictures show it). The snack's words, the read line and Send's gate are unchanged. The PR body names the new line and button.
- The tx detail page: unchanged (OA1). Pictures: Phase 3. The PR body quotes the sign-off above.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Key tx rows and the store on `Tx.createdAt`, when the send reached the node | the journal's `createdAt` (Confirm) | the brief asks for a sent-at time and this is it; Confirm time needs a journal link on the Tx, a new stored field and a migration; the two differ by the build and proof, and reorder only around a send that waited behind another (F3) |
| D2 | Change both the store's sort and `scopedTxRows` | drop the store's sort; leave it on `updatedAt` | the store promises every reader of `appStore.transactions` newest first; one rule stated in two places, not two rules |
| D3 | No tie-break key | add `hash` or `updatedAt` | the sort is stable and both lists read one array, so equal keys read the same on both |
| D4 | The detail page keeps its time (OA1) | show `createdAt` there | which time a page shows is the owner's call; the order does not depend on it |
| D5 | Phase 1's reproducer is a unit test over both builders | a page test per list; an e2e | the builders are pure over the store's rows; one input through both proves the order and the agreement; e2e seeds write equal fields |
| D6 | The failed estimate gets its state and retry in the fee row | a snack action | a later snack replaces it (an arrival, a copy), a person can close it, and it outlives the page; the fee row lives and dies with the estimate it reports |
| D7 | Retry only on a press | an automatic retry | a recovery policy is background work the owner has not approved, and on a slow node each try is another multi-minute simulation |
| D8 | Keep the card's read line | reword or hide it | it is true for its read, whose recovery re-asks the estimate (I1, pinned) |
| D9 | The button is a native Tab stop in DOM order, ring on `:focus-visible`; a keyboard press moves focus to the fee method trigger; the snack's live region announces the failure | focus to the amount field; a live region on the row | accessibility calls under the owner's 2026-10-19 delegation: the trigger is the nearest control that stays, so the next Tab reaches what followed the button; one announcement, not two |
| D10 | One arc, one PR | two stacked arcs | disjoint files, one commit per issue, half the CI runs |
| D11 | A new question closes the failure's snack, by its id | leave it open; an owner ask | an error snack stays until closed, so after a retry lands it would contradict the card, against the brief's "make the card and the toast agree"; the id check spares any later snack; page-local, no timer or stored state; a behaviour change inside the sign-off, so no ask |
| D12 | Phase 2 asserts the retry's call count apart from the row, with `realFeeRow` in every case that reads the row | assert the row's absence alone | without `realFeeRow` the row is a stub and its absence passes on any code |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a18f11`): `conditional approve (correct F3/I2, resolve the stale snack, strengthen Phase 2's lifecycle checks)`. Opus 5.5 Plan: `conditional approve (fix 1-4)`. C = Codex, O = Opus; each verified against the tree:
- C3/O1 the snack outlives a retry that lands (demonstrated: error snacks never close on their own) → D11.
- O2 a keyboard press drops focus to the page (demonstrated: the press sets estimating at once and unmounts the button) → D9 revised, a `FeeSettingsCard` case, the keyboard step in the picture.
- O3/C2 the control and the I1 pin could not fail (the row is a stub without `realFeeRow`; the `:508` funding moves the payer from the sponsor to Fee Juice) → D12, the pin on a sponsor that pays throughout.
- C1/O4 F3 overstated Confirm order (demonstrated: the sequencer waits before the slot; `parkSlot` re-enters at the tail) → F3, D1 and UI impact restated; the order stays stable, so no ask.
- C2 I2 claimed a diagnosis the trace does not give → restated. I1 confirmed by both; the FPC-only recovery left untraced.
- O5/C4 the flag must clear above `requestEstimate`'s guards → stated, and the emptied-amount check added. C4's other cases (identity switch, two presses before a render, a requeue) rejected as tests: they reach the same first statement, the engine's existing tests pin stale-rejection drops and the debounce, and the requeue branch returns before the flag is set.
- O6 recon missed `snack-placement.test.ts` and `fixtures/send-burst.ts`, which read the snack → added to Phase 3 and recon. C5/O8 the picture could show the read's recovery, not the press → hold, press, release.
- O7 an always-failing estimate (a drained balance) now offers a retry that fails again: nothing goes out and the snack already promised it → a closed `known-limit` issue at close-out. The execute window and the two authorization popups keep their snack without a retry → an issue at close-out (#1392 names Send).
- O9 nits: F1's `:40`; the Phase 2 gate covers the popups and `fee-cards.comount.test.ts`.
- Both: no trust boundary moves; D2-D8 and D10 hold; the page ref is the right home (an engine option would be a contract for one caller).

**Round 2** (Codex, resumed, verification): `approve, no new material findings`. Two low notes, folded: recon still read "broadcast order is Confirm order" and D1 said "only" (restated); D11 needs Send's toast double to carry ids, a `toast` ref and `closeToast` (Phase 2). It verified D11 cannot close a later snack, the trigger is always mounted on Send, the I1 pin is buildable with the sponsor paying throughout, and the C4 rejections.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-3 | `worktree-history-1` | `dev` | `fix: history orders sends by when they were sent, and a failed fee estimate offers a retry` | #1394, #1392 |

`code_review: off`. Merge `origin/dev` before the PR; run `bun run check:plans` after. Open the PR ready, without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter skipped a lane. Body: what changed and why, the sign-off quoted, the red-before lines, every gate with its outcome, each browser's e2e wall-clock (no scenario added, so no before/after), the pictures, OA1 as open, `Closes #1394` and `Closes #1392`. No parallel lanes: Phase 3 needs both fixes.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `13bb2133c`. Plan-specific values:

- **Review loop** (single arc, once, after Phase 3 is green): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff 13bb2133c...HEAD` (the merge base if `dev` was merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim. Resume with `resume-codex.sh` and the same codex-dir. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) of the diff beside round 1. Log each round in `lessons/phase-3.md` and here.
- **Approval boundary**: a fix that retries on its own, changes the snack's words or when it opens, the card's read line, Send's gate or any other surface's fee row, or touches the detail page's time is a plan change and stops for the orchestrator.
- **Delivery**: as above, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- **Close-out**, the PR's final commits: merge `origin/dev` and read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter (Date, Status, Shipped, Known limits, Open items, seeds retired); OA1, if still unanswered, filed as an `owner-decision` issue; the window and popups' retry filed as an issue; both named on `Open items:`; the always-failing retry filed and closed as a `known-limit` issue on `Known limits:`; a lesson only if one generalizes, deduped; `STATUS.md` deleted; `git mv implementations-plan/history-1 implementations-plan/archive/history-1` in its own commit, its index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/history-1/plan.md` succeeds, `agent-worktree done history-1 --merged`. The orchestrator's next session notices the merge; this session arms no wait.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-3 of implementations-plan/history-1/plan.md marked ✓, each gate reported passing in the transcript with LESSONS_FILE=implementations-plan/history-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1394 and Closes #1392 and the close-out's archive move (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/history-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
