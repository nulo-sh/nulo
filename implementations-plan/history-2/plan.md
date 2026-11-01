---
plan: history-2
tier: light
status: approved (Codex round 3); arc 1 under way
issues: "#1416, #1417 (one arc closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at f738cba62
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at f738cba62
post_implementation_hardening: not scheduled
---

# history-2: the transaction page's time, and a retry after a failed fee estimate on the execute window and two popups

Two issues, one arc, one PR against `dev`. Recon and traces: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

At 161 lines this plan is over the light target of 150: the round-1 audit verdicts keep each finding's evidence.

**Sign-off**, the owner on decision page 94, signed 2026-11-01:
- P94-12 = B (#1416): "Show when the send was made, as the journal page does: "Oct 30, 2026 at 15:08"."
- P94-13 = A (#1417): "Pass the failure and a retry through the same fee readout Send uses: each surface shows TRY AGAIN and re-asks through its own estimate path."

## Outcome & Quality Bar

- **For whom**: a person who opens a send from History; a person whose fee estimate fails in a dApp's execute window or in the Change registry or Revoke popup.
- **Excellent**: (1) the transaction page and the History list read the same time for a send; (2) after a failed estimate, each fee card shows Send's failed row, and one press asks the same estimate again; every approval gate stays as today (a fee the person pays holds Confirm or Send until its figure lands, a window-picked sponsor's does not); (3) the snack and the cards never disagree after a retry.
- **Good enough**: the snack keeps its words; an app-paid row keeps today's behaviour (OA1); a lasting failure fails again (#1418).

## Assumptions

**Facts** (at `f738cba62`; detail in [recon.md](recon.md)):
- F1 The tx page formats `updatedAt` (`popup/pages/tx/[id].vue:98-101`); the journal formats `createdAt` with the same `DETAIL_TIME_FORMAT`; `TxSchema` requires `createdAt` (T1).
- F2 `FeeCostReadout` and `FeeSettingsCard` carry `failed`/`retry` and `estimateFailed`/`retryEstimate`, and a keyboard retry moves focus to the method trigger (`FeeSettingsCard.vue:292-296`); only Send passes them (`send.vue:895,905`).
- F3 The window estimates per operation through `useFeeEstimationMap`; its `onError` toasts, except on a refusal or an app-paid row the person does not pay, and drops the id; `handleFeeUpdate` is its only re-ask; `OperationCard` forwards no failure and no retry (T2).
- F4 Both popups estimate through `useWalletTxEstimates`, whose `refresh(key)` is every re-ask and cancel; its `onError` drops the key; both popups toast the same words (T3).
- F5 `useFeeEstimationMap` serves only the window (two instances: fees and authorization previews, `index.vue:189-217,245-270`) and `useWalletTxEstimates`; Send uses the single-slot `useFeeEstimation` (`composables/useFeeEstimation.ts:66`).
- F6 A locked card has no method trigger, so a keyboard retry there would leave focus on nothing (T5).
- F7 An app-paid row renders `AppFeeLine`, never the card (T6). Neither surface has a document-level Enter (T7).

**Inferences**: I1 one snack shows at a time, so a surface needs only the id of its last failure snack; another snack or a person's close can still remove it first, which the id check tolerates. I2 a retry through the existing re-ask path keeps every guard that path holds.

**Asks**: OA1 (an app-paid row after a failed estimate) stays out of the arc; what ships now is today's row and snack.

## Architecture & Implementation

- **#1416.** `txTime` reads `createdAt`, guarded like the journal's `createdAtLabel`. Format and position unchanged.
- **The failure state (D3).** `useFeeEstimationMap` returns `failed: Ref<Record<K, boolean>>`. Its `onError` sets the key, then calls the caller's `onError`; its `estimate` and `cancel` clear the key before the engine runs; its `cancelAll` resets the record. A stale or disposed settle never reaches `onError`, so it sets nothing.
- **The snack (D4).** It keeps its words. A surface keeps the id its last failure snack returned. After a re-ask or cancel leaves no reported failure, it closes the snack if `id !== undefined && toast.value?.id === id` (in that order, so a toast double with no `toast` never throws before a failure).
- **Popups.** `useWalletTxEstimates` returns `failed` and opens the failure snack itself; `deps.onError(err)` keeps its signature and stays for the popup's log line. `refresh` and `cancelAll` retire the snack as above. Each popup passes `:estimateFailed="!!failedFees[i]"` and `@retryEstimate="estimates.refresh(i)"` (`i` is `0` in Change registry). The hook and the popups import the toast as `@/composables/toast`.
- **Window.** `OperationCard` gains `estimateFailed?: boolean` and emits `retryEstimate: [index]`, forwarded only on its `FeeSettingsCard` branch. `index.vue` passes `failed[i]`, binds `@retryEstimate` to `retryFeeEstimate(i)`, which calls `handleFeeUpdate(i, op.feeSettings)`, and keeps the snack id from its `onError`. The `onError` filters (refusal, then app-paid rows the person does not pay) do not change; the second becomes a named `reportsEstimateFailure(op)`, and the window's retire check counts only failed operations it holds true for (D4). `handleFeeUpdate` retires the snack after it schedules. On `!value` (the card withdrew its settings) it now cancels the key and retires the snack, as the popups' `refresh` does (D9).
- **Locked card (D6).** In `onRetryEstimate`, a keyboard press focuses the method trigger, else the locked row (`send-fee-locked`, through its ref's `$el`, as `FeeMethodSelector` focuses its trigger; `tabindex="-1"`, the 2 px accent ring on `:focus-visible`).

### Phase 1: The transaction page reads `createdAt` ✓

- Write the reproducer first, in `popup/pages/tx/[id].test.ts`: "the hero line reads when the send was made, not its last status change". Give `settled()` a `createdAt`. Make the case's `createdAt` local 2026-10-30 15:08 and its `updatedAt` 15:20 (`new Date(2026, 9, 30, 15, 8)`), so the zone does not matter. Assert the whole `textContent` of the time span is `Oct 30, 2026 at 15:08`.
- Run it on the base: it must fail, received `Oct 30, 2026 at 15:20`. Log the line in `lessons/phase-1.md`. Then make the change.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/tx src/popup/pages/journal --retry=0`. Pass: exit 0, the reproducer red on the base and green after. Layers: lint, typecheck, component.

### Phase 2: The map's failure state and the popups' retry ✓

- `useFeeEstimationMap.test.ts`, one case on the real engine: a rejection marks its key; `estimate` and `cancel` clear it; `cancelAll` clears every key; a superseded attempt's late rejection marks nothing, and a landed result leaves it unmarked (the success control).
- `useWalletTxEstimates.test.ts`: mock `@/composables/toast` with a reactive `toast`, increasing ids and a `closeToast` that clears it (as `send.integration.test.ts:146,340`). One case on two keys: both fail, which marks `failed[0]` and `failed[1]`, opens the snack with today's words and hands `deps.onError` each original error once; `refresh(0)` keeps the snack; `refresh(1)` closes it. A second case: after a failure, a snack opened later survives the refresh, and `cancelAll` (the popup's hide) closes the failure's own snack. `popups/popup-stack.pins.test.ts` mounts both popups with an `openToast`-only double: extend it if its cases fail.
- `ChangeAuthwitsRegistryPopup.test.ts` and `RevokeAuthwitsPopup.test.ts`: the `FeeSettingsCard` stub declares `estimateFailed` and emits `retryEstimate`; the toast double gains `toast` and `closeToast`. Extend each failure case: the rejection reaches the stub as `estimateFailed`; a retry asks the estimate exactly once more, with the first call's arguments but its token; after `estimatesLand()` the stub reads `false`, the submit button is on, and the snack is closed. In Revoke, use two chunks and fail chunk 1: its retry asks only chunk 1.
- Run the popup cases on the base: they must fail at the `estimateFailed` read. Log the lines.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/composables/useFeeEstimationMap src/composables/useWalletTxEstimates src/popup/components/popups --retry=0`. Pass: exit 0; the popup cases red on the base as stated. Layers: lint, typecheck, unit, component.

### Phase 3: The window's retry and the locked card ✓

- `index.test.ts` and `scope-follow.test.ts`: the map fakes gain `failed: ref({})`; in `index.test.ts` its `estimate` and `cancel` clear `failed[key]` and the key's result, and `estimate` sets it estimating, as the real map does. The toast double gains `toast` and `closeToast`. The `OperationCard` stub declares `estimateFailed` and emits `retryEstimate`. A wire-shaped person-paid `aztec_sendTx` (`execute.fixture.ts`'s `wireCall` fields, `0x` + 64 hex) runs the cases below. Give the window two such operations and pick a method on each. Fail both through `opts.onError` with `failed` set. Assert each stub reads `estimateFailed`, and Confirm is off. Emit `retryEstimate(0)`: `estimate` was called exactly once more, with `(0, { index: 0, feeSettings })`, and the snack stays. Emit `retryEstimate(1)`: the snack closes. Land both results: no stub reads `estimateFailed`, Confirm is on, and `approve` sends once (the success control). A snack opened after the failures is never closed. A second case, one person-paid operation and an app-paid one with its own cap: both fail, and only the first opens the snack. Its retry closes the snack though the own-cap operation still stands failed; Confirm stays off and `approve` sends nothing. A third case: after a failure, the stub emits `updateFeeSettings(0, undefined)`: `cancel(0)` runs, the stub reads `false`, and the snack closes.
- `OperationCard.fee.test.ts` (the real card and readout, a wire-shaped op): one case: with `estimateFailed` the real `fee-estimate-failed` row renders, and a press on `fee-estimate-retry` emits `retryEstimate` with the operation's index; without it the row is absent.
- `FeeSettingsCard.test.ts`, mounted with `attachTo`: with `lockedMethod: "fj"`, a `:focus-visible` retry puts `document.activeElement` on `send-fee-locked`; a pointer press leaves focus alone.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/windows/execute src/popup/components/modules/send src/popup/components/modules/fee-cards src/popup/pages/send --retry=0`; `bun run test` (every double that mounts a changed file). Pass: exit 0; the window case red on the base at the stub's `estimateFailed`. Layers: lint, typecheck, unit, component.

### Phase 4: Full gate, e2e and captures

- `bun run test:all`.
- In `tests/e2e/network/snack-placement.test.ts`'s execute case, add one check after the snack: `fee-estimate-failed` is in the window; and at the case's end, before it rejects, press `fee-estimate-retry` and wait for the row to leave and the snack to close. It proves `index.vue` → `OperationCard` → readout on a real failing estimate in a real browser; `index.test.ts` stubs `OperationCard`, and `OperationCard.fee.test.ts` fakes the estimate. No new scenario; estimated +2 s, measured in `STATUS.md`.
- Smoke, Chrome then Firefox, from `apps/extension`: `[NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0`. No smoke file opens the execute window.
- Network, Chrome then Firefox, from the repository root, one `e2e:agent` at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/snack-placement.test.ts tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/tx-sendTx-selfPay.test.ts`. `tx-sendTx-selfPay` mounts the locked card.
- Captures, light theme, Chrome, base and head, from scratch specs under `~/.cache/nulo-backlog/history-2/`. Copy them into `tests/e2e/` for the run, then delete them. First commit the implementation and record that commit's SHA. Build the base from `git checkout f738cba62 -- <the changed source files>`. After the run, pass or fail, restore with `git checkout <that SHA> -- <the same files>`, and check `git status --porcelain` is empty. Surfaces: the tx page (seed a send with `createdAt` 15:08 and `updatedAt` 15:20); the execute window's fee card after `openUnfundedDappSend`; each popup's fee card after `interceptRpc` refuses the node, armed once the popup has read its registry state and the card its fee balances (else the card reads "Retrying in the background"); on the head, a locked card (`tx-sendTx-selfPay`'s request with the node refused) after a keyboard TRY AGAIN, with `document.activeElement` on `send-fee-locked` asserted and its ring in the frame. Commit the PNGs to `implementations-plan/history-2/screenshots/`. Add no sleep or retry to make a capture land.
- **Validation gate**: the runs above; `bun run check:plans` after staging. Pass: exit 0 at retry 0; `git status --porcelain apps/extension/tests/e2e` shows only the snack-placement edit; each run's wall-clock in `STATUS.md` and the PR body. Read a red run before any rerun: one rerun for a known flake, a fix for real breakage. Layers: all, both browsers.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, message, permission, stored shape, migration, log line or dependency. `createdAt` is a stored number every row carries; a restored backup can set any value, which only labels its own row, as `updatedAt` already could. A retry re-enters each surface's existing re-ask (`handleFeeUpdate`, `refresh`), so its guards hold, the engine mints a fresh token and supersedes the earlier attempt, and the button is gone while estimating, so presses cannot flood the node. Confirm and Send keep their gates: nothing goes out on a fee the person has not seen. A refusal still replaces the window's fee card (`#fee` slot), so no retry is offered on a request the wallet refused. No log line is added or changed.

## UI impact

- **Transaction page** (P94-12 = B): before, the hero line reads the last status change ("Oct 30, 2026 at 15:20"); after, when the send was made ("Oct 30, 2026 at 15:08"). Format and position unchanged.
- **Execute window, Change registry and Revoke fee cards** (P94-13 = A): before, after a failed estimate the cost row reads "Fee estimated after simulation" beside the snack "Couldn't estimate fee. Try again."; after, it reads "You pay / Couldn't estimate fee." with TRY AGAIN, as on Send. The snack keeps its words and closes once no failure it reported stands (or the popup hides). The PR body says so.
- **Accessibility** (the owner's 2026-10-19 delegation, D6): TRY AGAIN is a Tab stop in DOM order; on a locked card a keyboard press keeps its place on the locked row.
- App-paid rows: unchanged (OA1). Before/after captures for all four surfaces: Phase 4. The PR body quotes both picks.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | `txTime` reads `createdAt`, guarded like the journal | a label or a second time | the owner's pick; format and position stay |
| D2 | One arc, one PR, one commit per issue | a PR per issue | the lane groups them; disjoint files; half the CI runs |
| D3 | `failed` lives in `useFeeEstimationMap`, cleared in its own `estimate`/`cancel`/`cancelAll` | a ref per surface, as Send; clearing in the result sink | result, estimating and failed are one attempt's three states, kept where its lifecycle runs; the map serves exactly the window and both popups (F5; the preview instance's record goes unread); a window-local ref would also work, at a second copy of the clearing; the sink leans on an incidental order (T4); Send stays as built (out of scope) |
| D4 | Keep the snack; close it once no failure it reported stands, if it is still that snack | drop it; close on any re-ask; count every failed key | the snack is the failure's one announcement and the app-paid row's only report; closing early would leave a failed row beside no snack; a failure that opened no snack (an app's own cap) must not hold it open; the id spares any later snack, as Send |
| D5 | The hook opens the popups' snack; the window keeps its own | each popup opens it | both popups open the same words; the window's open depends on its app-paid filter |
| D6 | A keyboard retry on a locked card focuses the locked row (`tabindex="-1"`, ring) | a priority button; no move | accessibility call under the 2026-10-19 delegation: the row is the nearest element before the gone button, and a held Enter repeat there clicks nothing, where on a priority button it would re-ask at another priority |
| D7 | Popup tests on the real hook and map; the window test on its fakes plus the map's own test | a composition test | the component layer holds the re-ask (brief); `COMPOSITION-TESTS.md` drives the service graph, not popups; the window case is wire-shaped, and the popups render no dApp data, so their stored authwit rows stay |
| D8 | Two checks in an existing network case: the row renders, and a press clears it and the snack | a new e2e scenario; the render alone | the press proves the real emit chain and D4's close for about 2 s; no failure mode needs a new scenario |
| D10 | As built: the hook and popup tests read the real toast singleton, the popups' mock passing each open through | a hand-made reactive double | the assertions read the snack on screen, ids included; `afterEach` closes it |
| D9 | Withdrawn settings (`handleFeeUpdate(i, undefined)`) cancel the key's estimate and retire the snack | leave the failure standing | otherwise TRY AGAIN re-sends `undefined` and does nothing (Opus 2: the card emits `undefined` for Fee Juice with an unread balance, `fee-helpers.ts:126`); the popups' `refresh` already cancels on no inputs |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a198eb`): `conditional approve (strengthen retry and multi-key proofs; make capture restoration explicit)`. Opus 5.5 Plan: `conditional approve (name the two fakes, fix the no-op retry, correct the Confirm fact, add a success control)`. C = Codex, O = Opus; each verified against the tree:
- C1/O4 the window case had no success control → landing both results, Confirm on, one approval.
- C2 no test told D4's rule from "close on any retry" → two-key cases in the hook and the window.
- O6 a failure that opened no snack (an app's own cap) would hold it open (demonstrated by trace, `index.vue:215`, `:348`) → the named `reportsEstimateFailure` in the retire check, and the own-cap operation in the window case.
- O2 TRY AGAIN after the card withdrew its settings re-sends `undefined` and does nothing (plausible: `index.vue:464`, `fee-helpers.ts:126`) → D9 and its case.
- C4/O3 Confirm is on after a failure when a window-picked sponsor pays (demonstrated, `fee-figure.ts:42`) → the quality bar and T2 restated; no gate changes.
- O1 `scope-follow.test.ts` and `popup-stack.pins.test.ts` mount the changed code with fakes that lack `failed` and `toast` (demonstrated) → named, the guard order fixed, `bun run test` in Phase 3's gate.
- O5/C5 the locked-row focus: a `Flex` exposes only `wrapper`, and the card test stubs `Flex` → focus through `$el`, mounted attached; a locked keyboard-retry frame in the captures.
- C3 the base-capture checkout could overwrite uncommitted work → a committed checkpoint, restored from its SHA.
- O8 the e2e check proved the render only → a press that clears the row and the snack; the popups' refusal armed after the card's balance read.
- O7 the preview map's unread record → F5; the preview's own missing retry → an issue at close-out (no fee readout there, so outside P94-13).
- O9 → `deps.onError(err)` keeps its signature.
- Both: no trust boundary moves; D3 belongs in the map; D5 and D6 hold; OA1 is rightly an ask.

**Round 2** (Codex, resumed, verification): `conditional approve (correct two contradictory test specifications)`. Taken: the window's recovery control could not reach Confirm on with an own-cap operation still unanswered → split into a two-person-paid recovery case and an own-cap case where Confirm stays off; the hook case asked `deps.onError(err)` for keys → each error once, keys through `failed`. Verified: D9 is a needed local fix inside the pick; the retire predicate meets no harmful refusal path (a refusal is permanent and replaces the card, `index.vue:219,485,697`).

**Round 3** (Codex, resumed): `approve — both round-2 corrections verified in Phases 2-3; no new material findings`.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-4 | `worktree-history-2` | `dev` | `fix: the tx page shows when a send was made, and a failed fee estimate offers a retry` | #1416, #1417 |

`code_review: off`. Merge `origin/dev` before the PR; run `bun run check:plans` after. Open the PR ready, without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter skipped a lane. Body: what changed and why, both picks quoted, the snack's closing rule, the accessibility call (D6), the red-before lines, every gate with its outcome, each browser's e2e wall-clock (no scenario added), the captures, OA1 as open, `Closes #1416` and `Closes #1417`. No parallel lanes: Phase 4 needs every fix.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `f738cba62`. Plan-specific values:

- **Review loop** (single arc, once, after Phase 4 is green): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff f738cba62...HEAD` (the merge base if `dev` was merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim. Resume with `resume-codex.sh`. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) of the diff beside round 1. Log each round in `lessons/phase-4.md` and here.
- **Approval boundary**: a fix that retries on its own, changes the snack's words, the app-paid row, Send, the fee question window or History's rows is a plan change and stops for the orchestrator.
- **Close-out**, the PR's final commits: merge `origin/dev` and read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter; OA1, if unanswered, filed as an `owner-decision` issue on `Open items:`; the window's failed authorization preview ("Couldn't preview authorizations. Try again.", `index.vue:268`, no retry either) filed as an issue after a dedupe search, on `Open items:`; `Known limits:` none unless the loop files one; a lesson only if one generalizes; `STATUS.md` deleted; `git mv implementations-plan/history-2 implementations-plan/archive/history-2` in its own commit, its index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/history-2/plan.md` succeeds, `agent-worktree done history-2 --merged`. The orchestrator's next session notices the merge; this session arms no wait.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-4 of implementations-plan/history-2/plan.md marked ✓, each gate reported passing in the transcript with LESSONS_FILE=implementations-plan/history-2/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1416 and Closes #1417 and the close-out's archive move (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/history-2 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
