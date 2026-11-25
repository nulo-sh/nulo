---
plan: est-pause-1
tier: light
status: implementing
issues: none (decision page 209, question 2 = B)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon by the lead; one Codex pass (gpt-6.1-sol high) over the plan, resumed once to verify the redesign; one over the completed diff, resumed three times to verify its fixes (the first at xhigh, the resume default); one Opus Plan lens
base: origin/dev at 1608de2b0
trunk: dev
post_implementation_hardening: not scheduled
---

# est-pause-1: a pick starts the fee estimate at once; typing keeps its pause

One arc, one draft PR against `dev`; it closes no issue. The plan is archived in the same PR.

**The owner's pick (2026-11-24, page 209 question 2 = B):** "A pick starts the estimate at once. Typing in a field keeps today's pause. The figure after a pick arrives 0.8 s sooner on Send and 0.5 s sooner in the approval window and the authorization popups, at any distance." And: "Beware the user also complain about this on Approvla TX were the fee payer was set by the app."

**UI impact:** Send, the approval window of an app's transaction (an app-paid operation included) and the two authorization popups (`ChangeAuthwitsRegistryPopup`, `RevokeAuthwitsPopup`): the fee figure appears sooner after any change that is not typing or an automatic re-ask. No word, layout, row or figure changes. Sign-off: the owner's words above; the PR stays a draft until the orchestrator lands it on them.

## Outcome & Quality Bar

- **For whom:** a person who picks a fee method, a side, a recipient, a token or Max, or who opens an approval window or an authorization popup, and waits for the fee figure.
- **Excellent:** (1) after a pick the estimate starts with no pause, measured on the local network as the time from the last change to the figure, n ≥ 10, against `origin/dev`; (2) typing and an automatic re-ask after an answer wait exactly as today, and no action starts more estimates than today, proven by counted runs in tests.
- **Good enough:** the estimate itself is as slow as today; this plan removes only the wait before it.

## Assumptions

**Facts** (verified at the base)
- F1 The engine arms one timer per key on every `schedule`, clearing the pending one; the run starts when it fires (`composables/internal/fee-estimation-engine.ts:120-166`). Send passes 800 ms (`popup/pages/send.vue:623`); the approval window's fee map 500 ms (`popup/windows/execute/index.vue:284`); the popups take the map's default 500 ms through `useWalletTxEstimates` (`composables/useFeeEstimationMap.ts:61`).
- F2 Send schedules from ONE deep watch over every input (`send.vue:884-901`), in Vue's pre-flush after the handler that wrote the input, so it cannot tell why an input moved: `amountTerm` is written by typing, Max, a USD conversion, Send again and a token switch; `searchTerm` by typing and by a recipient pick.
- F3 Typing reaches an estimate input in four writes: the token amount field (`components/composite/send/AmountCard.vue:133-148`), its blur normalization (`:182-193`), the USD field's figure converted into the amount by a 250 ms timer (`:324-358`, `:244`), and the recipient field (`popup/components/modules/send/RecipientField.vue:237`, inside `SendPersonStep`), whose model is written by the field's own input listener (`packages/design/src/ui/Input.vue:199-207`), so an ancestor's bubbling listener runs after Vue's flush. The fee card, the approval window and the popups have no text field that feeds an estimate.
- F4 The same 250 ms conversion serves Refresh quote, a press (`AmountCard.vue:444-448`, `send.vue:434-440`).
- F5 Answers and the re-asks they cause: `settleSuccess` / `settleFailure` call the sinks synchronously (`fee-estimation-engine.ts:136-151`). Send's requeue after a `tokenSpent` answer runs inside `onError` (`send.vue:658`) and a sponsor set aside by a short verdict runs through the card's pre-flush watchers (`composables/useSponsorVerdicts.ts:84-105`, `useFeeSelection.ts:284-289`), both in the answer's task. The fee card's Fee Juice re-read after a short answer publishes its settings in a later task (`FeeSettingsCard.vue:272-284`).
- F6 The unit switch changes no input the estimate reads (`fiatMode` is not a watch source); `toggleFiatMode` (`AmountCard.vue:363-381`) is the person's switch, `exitFiatMode` the automatic one.
- F7 The fee card's init commits atomically (`composables/useFeeSnapshot.ts:87-102`), so a window's first settings are published once.
- F8 No e2e spec waits out the pause by a fixed sleep (`git grep` of `800`, `500`, `debounce` under `apps/extension/tests/e2e`).

**Inferences**
- I1 Marking picks instead (the first draft) keeps every unlisted non-typing change on the pause, against the brief's "every other change starts at once", and needs a call at about 20 pick controls. High confidence (Codex, round 1).
- I2 A non-typing change that lands during a typing pause (a balance read, the card's first settings) starts the last estimate input at once, as the brief's rule says for a pick: the waiting estimate is replaced before it starts, so no extra estimate. During a typed USD figure's conversion the last input has not reached the amount yet, so the change lands the conversion first (`convertNow`). Moderate confidence.

**Asks:** none open. The re-read's re-ask (F5, last clause) is built, not asked (Codex, round 2).

## Architecture & Implementation

**Rule (one, in the engine):** an estimate starts at once, at the end of the task that asked for it, unless it was asked in a task where the person typed or an answer was handled; then it waits the pause. Changes made in one task still make one estimate (a 0 ms timer, re-armed by each schedule). A newer change replaces a pending or running estimate as today.

**Mechanics.** The engine keeps one boolean, set by `pauseThisTask()` and at the start of every settle, and cleared by a 0 ms timer. Bound, accepted: the clear runs on the next timer turn, so a change from another task queued before it (an RPC answer within the same millisecond) also waits the pause; this errs toward today's behaviour and never starts typing early. `schedule` arms its timer with `debounceMs` while the mark is set, else 0 ms. `startWaiting(key)` starts an estimate still waiting its pause and never creates one; it consumes the timer entry, so a fired timer cannot start twice.

**Callers.**
- Adapters: `useFeeEstimation` and `useFeeEstimationMap` expose `pauseThisTask`; `useFeeEstimation` also `startWaiting`, deferred with `nextTick` so the change a pick wrote is scheduled first; `useWalletTxEstimates` passes `pauseThisTask` through.
- `AmountCard`: emits `typed` after a typed token amount, its blur normalization and a conversion typing started (`scheduleConvert` learns who started it; Refresh quote stays a press); emits `picked` from Max, the USD Max and the unit switch, the picks that can leave every estimate input as it was; exposes `convertNow`, which lands a pending conversion at once, unmarked.
- `SendPersonStep` emits `picked` from Pay this address, Enter on a pasted address, a recent and an own account, and forwards `RecipientField`'s `picked` (a suggestion taken by press or Enter); a blur that recognizes a typed address emits only `choose`.
- `FeeSettingsCard`: emits `reread` in the Fee Juice re-read's continuation, before the settings it publishes; `OperationCard` forwards it.
- Send: `@typed` on `AmountCard` and a capture-phase `@input` on `SendPersonStep` (its one text field) call `pauseThisTask`; both `@picked` call `startWaiting`; the card's `@reread` calls `pauseThisTask`; `requestEstimate` first calls the card's `convertNow`. No new page state; the requeue is untouched.
- The approval window and both popups: only the card's `reread` binding. Their first estimate, the app-paid ask, a fee pick and a retry start at once; a re-ask after an answer keeps 500 ms. `ChangeAuthwitsRegistryPopup` drops its fee settings on hide: `Popup` remounts the card on each open, which publishes them again.

**Alternatives not taken.** A1 two watches split by source: Max and a recipient pick write the typed fields. A2 mark picks, default pause (I1). A3 classify by focus or `window.event`: heuristics. A4 a mark that waits for the next schedule: outlives a change that schedules nothing. A5 a microtask clear: a capture-phase mark would clear before the field writes.

## Security & Adversarial Considerations

No trust boundary moves: params, guards, tokens, cancels and handoffs are unchanged. The risk is load: more estimates start and are superseded (I2); each holds the PXE for its first simulation. A missed typing write would start half-typed amounts at once: F3 lists every one, each with a test. No loop: every re-ask an answer causes waits the pause as today.

## Phases

**Phase 1: engine and adapters.** Tests (`useFeeEstimation.test.ts`, fake timers): typing waits the pause; an unmarked change starts at once; a pick during a typing pause starts once with the latest params; several changes in one tick start one; a typed change after a pick waits; a re-ask in an answer's task waits; `startWaiting` starts a waiting estimate once and nothing otherwise; dispose. Existing tests that hold an estimate pending mark their task.
*Gate:* `bun run lint`, `bun run typecheck:all`, the composable tests green.

**Phase 2: callers.** Tests: `AmountCard.test.ts` (which writes emit `typed` and which `picked`; Refresh quote's conversion emits neither); `send.integration.test.ts` (a side pick starts at once, a typed amount and a typed recipient wait 800 ms); the approval window (`index.test.ts`, a wire-shaped `aztec_sendTx` fixture, `0x` + 64-hex arguments, and an app-paid operation whose estimate starts with no pause); a popup (`ChangeAuthwitsRegistryPopup.test.ts`: the first estimate starts at once).
*Gate:* `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension build-storybook`.

**Phase 3: gates, e2e, measure.** `bun run audit:vue`, `bun run test:ci-gating`, one at a time, retry 0. E2E: the specs that drive these estimates (git grep of their testids), Chrome. Measure per the brief, counting estimate RPCs per action on both builds; table in the PR and `~/.cache/nulo-backlog/est-pause-1/timings.md`.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `1608de2b0`, bounded work: one Codex pass (gpt-6.1-sol, high, read-only) over this plan and the completed diff, then targeted verification of material fixes. Delivery: one draft PR from `est-pause-1-a1`, title `perf(estimate): a pick starts the fee estimate at once, and typing keeps its pause`, never marked ready. Close-out as the PR's final commits.

**Seeds** (not run): `/goal Ship est-pause-1 per implementations-plan/est-pause-1/plan.md` · `/loop check est-pause-1's draft PR checks`.

## Audit verdicts

- **Codex round 1** (approve with changes), on the pick-marking draft: it narrowed the brief: adopted, the design flipped to the literal rule. A blur-recognized recipient read as a list pick, and Refresh quote and picks before the card's first snapshot still waited: gone under the literal rule. A fired timer could start twice: `startWaiting` consumes it. The sponsor re-ask was missing from the facts: F5.
- **Opus lens** (same draft): the `nextTick` carrier was sound but the draft did not build the brief; Refresh quote was missing; a pick while a typed USD figure converts starts its older amount (I2).
- **Codex round 2** (approve with changes), on the literal rule: (1) the 0 ms clear leaks into the next timer turn: documented and accepted (Mechanics). (2) A bubbling recipient listener marks after the flush: capture phase. (3) Max and a recipient re-picked unchanged keep a typing pause: Max emits `picked`; re-picking the same recipient while its pasted address waits was filed as a known limit (#2017), then built after the diff pass. (4) Blur normalization would add an estimate before a Max press: it emits `typed`. (5) The `converting` rule did not stop an older estimate: dropped; the gap it named predates this plan (I2). (6) The re-read's re-ask must keep its pause: built (`reread`).

- **Codex diff pass** (approve with changes), on the completed diff at f2eb74062: (1) a pick during a typed USD conversion started an estimate for the amount before the typed figure, one more than today: `convertNow`. (2) Pay this address on the address just pasted kept its pause: the person step's `picked`, the field's for suggestions; blur recognition stays unmarked. (3) The re-read tests stubbed the emit they relied on: the card's order (`reread` before its settings) and `OperationCard`'s forward now tested. (4) Two test-helper comments corrected; the execute banner cut to one line, kept by that file's convention. Each binding proven by mutation.

- **Codex verify** (resumed, three rounds). Round 1 (approve with changes): fixes 2–4 hold; `convertNow` regressed Max during a conversion, since the card reads its own `fiatGuard` write only after its render and Send's pre-flush watcher reconverted Max's rounded dollars (one base unit over a 1.234567 balance at $0.50): the page's guard now gates the call, proven on the real card. Round 2: approve. Round 3, on the measurement's finding below: approve; no other surface keeps state across mounts.
- **Measurement** (local network, Chrome, n = 10 per case and build): at 0d76309a0, 4 of 10 reopens of the registry popup started two estimates where the base started one. The popup kept the last open's settings, so the registry status landing first started an estimate the remounted card's publication then replaced; the 500 ms pause had merged the two. Fixed (D7), re-measured: one estimate per action on every case.

## Decision ledger

- D1 The literal rule, typing and answers marked (A2 rejected after Codex round 1). D2 Task-scoped mark cleared by a 0 ms timer (A4, A5 rejected). D3 `startWaiting` for the picks that can change no input, deferred past the flush. D4 A change during a USD conversion lands it first (`convertNow`), rather than marking it typing, which would make a pick wait. D5 Person-step picks emit `picked`; blur recognition does not. D6 The page's own `fiatGuard` gates `convertNow`: the card reads its own model writes a render late. D7 The registry popup clears its settings on hide rather than the engine skipping an estimate whose params repeat, which would also skip a re-read's re-ask.
