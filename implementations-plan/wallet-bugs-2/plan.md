---
plan: wallet-bugs-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 18d29f23
trunk: dev
post_implementation_hardening: not scheduled
status: approved (orchestrator, ed41c27b); arc 1 implementing
---

# wallet-bugs-2: seven small popup defects, one arc

One arc, one PR against `dev` (D1), closing #714, #648, #616, #638, #579, #654 and #615. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Consults: [`lessons/phase-0.md`](lessons/phase-0.md). Over the light target (150 lines): seven issues, each with its own phase, gate and tests.

## Outcome & Quality Bar

- **For whom**: a person reading the popup: a dApp's function on an approval or a journal page, a long log while searching it, a value they select to copy part of, received funds on Activity while the node is down, token rows while balances load.
- **Excellent**: each defect is gone at its cause, with no timeout, retry or suppression; nothing else on those screens moves; the two visible changes ship with before and after pictures at 360 px in both themes.
- **Good enough**: no new control, no shared row or skeleton component (D8), no change to the node client's retries.

## Assumptions

**Facts** (at 18d29f23; recon has the rest)
1. `humanizeMethodName("constructor")` returns `Object`, printed as its source; `plainMethodName("constructor")` is "Constructor" (`apps/extension/src/utils/tx-enrichment.ts:34-36,73-79`).
2. The journal Method row has no gap (`popup/pages/journal/[id].vue:297-300`); `rows.test.ts:912-976` seeds a journal record with the #648 name and one with an unbreakable name, and opens only the first's page (`:966`).
3. CodeMirror 6.43.9 holds a view within 4 px of its end at its end on each update (`dist/index.js:778-782,8227-8236`). A transaction's effects are read against its new document, unmapped (`@codemirror/state` `resolveTransactionInner`), and a snapshot restores the top line's offset (`view/dist/index.js:8675-8679`).
4. `selectedWithin` exists and three components guard with it (`utils/selection.ts:8`, `Header.vue:134-136`); `navigation.test.ts:94-130` has a real-browser drag helper and a clipboard spy.
5. The feed's `load` awaits `getArrivalState`, which reads the tip only for a scope with no arrival row or a pending floor; the popup gives up after 60 000 ms (`useArrivals.ts:230-269`, `service.ts:859`, `extension-messaging/src/background/client.ts:17`).
6. That tip goes through the offscreen PXE (`incoming-transfer/service.ts:401-402`): it queues behind the chain's write guard (held by `proveTx`, `simulateTx`, `getNotes`), may bind a runtime (three attempts) and rides the retrying node client (`packages/aztec-runtime/src/pxe/service.ts:664-666,890-930`). `readTip`'s four callers all take arrival floors (`:469,742,859,1292`). The execution service reads the same tip in one attempt, past the PXE's guard (`execution/service.ts:582-589`, through `NetworkService.getSingleAttemptNodeForUrl`, "for a caller that retries on its own schedule", `network/service.ts:905-915`).
7. Four bars at 9 px stand for 13 px lines (`TokenCard.vue:96`, `TokenSeedRow.vue:44`, `TokensView.vue:408,412`); the marks beside them are 9 px, and 12 px beside the same role on the token page (`TokenCard.vue:101,104`, `BalanceView.vue:325,335`).
8. Smoke runs load the built `dist/<browser>` and never build (`tests/e2e/global-setup-smoke.ts`); the network config retries twice unless `NULO_E2E_RETRY=0`.

**Claims that did not hold**
- #579: "the node client retries for about 60 s". One refused call's retries take about 6 s; 60 005 ms is the popup's RPC timeout. The worker's own 60 s is unmeasured; the fix does not depend on it.
- #654: `SelectTokenCard.vue:122` stands for an 11 px `caption` line; it keeps its bar.
- #714: "plus one table row `constructor` → Constructor": not needed (Fact 1); a curated row would put a wallet label on a dApp's name in the capability window (D2).
- #615: six cites are stale, not one (recon).

**Inferences**
- I1 (#579). A node that rejects promptly (refused, as the archive measured) fails the one attempt at once, so the feed paints as soon as the arrival read returns. An attempt that stays pending (DNS, connect, headers, body) still holds the paint until the 60 s request timeout (KL-1).
- I2 (#616). After the snapshot, a trim that lands on the first line of a hold moves `scrollTop` up with the view fixed, leaving a gap of one line (under 20 px), so the scroll handler re-arms. Traced, to be shown red in Phase 3 before D3b lands.

**Asks**: none open. OA-1 (#615's wording) ships its drafted form now.

## Architecture & Implementation

**File-level change map** (paths under `apps/extension/` unless rooted)
| File | Change | Issue |
|---|---|---|
| `src/utils/tx-enrichment.ts` (+ test) | the two string tables as `ReadonlyMap`s; `formatTransferType` reads through `Object.hasOwn` | #714 |
| `src/popup/pages/journal/[id].vue`; `tests/e2e/rows.test.ts` | Method row in the App row's shape, a local `method_value` rule, label testid `journal-detail-method-label`; the journal visits measure it | #648 |
| `src/components/JsonViewer/LogsViewer.vue` (+ test); `tests/e2e/viewers-csp.test.ts` | D3; the hold tests check the view across lines and a trim | #616 |
| `src/utils/selection.ts` (+ test); `Header.vue`, `TxHashRow.vue`, `TxDebugPanel.vue`, `AddressDisplay.vue`, `settings/about.vue`, `tx/[id].vue`, `received/[id].vue`, `TokenMetadataPopup.vue`, `ReceivePopup.vue`; `tests/e2e/navigation.test.ts` | `endsSelection(e)` at every click-to-copy handler; About's version lines get testids | #638 |
| `src/wallet/services/network/service.ts` (+ test), `execution/service.ts`, `incoming-transfer/service.ts` (+ test); `tests/e2e/type-roles.test.ts`, `tests/e2e/helpers/activity-seeds.ts` | `NetworkService.readChainTip` (moved from the execution service), read by `getArrivalState`; `seedArrivalRow` deleted | #579 |
| `TokenCard.vue`, `TokenSeedRow.vue`, `TokensView.vue` | bars and marks on the 13 px scale (D7) | #654 |
| `store/remote-code.md` | OA-1's sentence and clause; six cites re-pointed | #615 |

**Decision ledger**
- D1. One arc, one PR, no stack (orchestrator's D-orch-1). Deviation at implementation: the orchestrator named the branch `wallet-bugs-2-a1`, cut from `origin/dev` at 9470d4e9 (#759 landed after the plan's base, touching none of this plan's files) with the plan commit cherry-picked; every "diff from base" below reads from 9470d4e9.
- D2 (#714). `Map` for the two string tables, as `token-transfer-vocabulary.ts` does; `Object.hasOwn` for `TRANSFER_TYPE_LABELS`, whose number keys coerce to strings (a `Map` would split `0` from `"0"`). No new label row: `getMethodLabel` answers only for the wallet's allowlist.
- D3 (#616). (a) In `onLogAdded`, while the viewer does not follow, the trim and append carry `view.scrollSnapshot()` mapped through their change set, so CodeMirror keeps the view instead of holding it at its end. (b) Only if Phase 3's trim case is red with (a) alone: `updateShouldAutoScroll` re-arms only on a scroll that moved `scrollTop` down, as a person's scroll does and a trim's restore (which moves it up) does not; the scroll button then re-arms the follow itself, since at the end it moves nothing (Codex round 2). Rejected: no re-arm while a selection or the search panel holds (both legs: it stops the button and a person's scroll from resuming the follow, a change nobody signed); a threshold under one line (misses a trim at gap 0); nudging the view off CodeMirror's band (moves the view).
- D3c (implementation, 2026-10-18; `lessons/phase-3.md`). D3a takes one snapshot per CodeMirror measure: a snapshot read after a trim's dispatch and before the measure anchors 100 lines off and replaces the pending one, so later lines in that frame carry no effect and CodeMirror maps the pending one. D3b applied: Firefox's trim case was red with D3a alone. The trim case reaches the cap by finding a trim one line at a time, since the toolbar's Clear logs never renders (#773, left out: visible).
- D4 (#638). `endsSelection(e) = e.detail > 0 && selectedWithin(e.currentTarget)`: a pointer click that ends a selection inside its target; Enter and Space (detail 0) copy as today. Header adopts it; `ScopeAddress`/`ScopeClassId` keep theirs (collision). `AddressDisplay` guards its whole click and takes the event as a parameter (it reads the global `event` today); its parent cards get their guard in the same commit, and their inner explorer link keeps its propagation stop.
- D5 (#648). The Method row takes the App row's shape (`align="start" gap="16"`, shared `app_key`). Its value is a local `method_value` (`detail_value_mono`, `min-width: 0`, `text-align: right`, `overflow-wrap: anywhere`, `line-height: 1.4`): it wraps at spaces and breaks a word only when longer than the line. Rejected: `app_value` (breaks inside words on every line), truncation (needs a control), a shared class or `DetailRow` (one caller).
- D6 (#579). The arrival tip is an advisory read whose callers re-read on their own schedule (every coordinator trigger; a failed read leaves the floor pending or the scope unbaselined, both resolved by a later read). Move the execution service's `readChainTip` to `NetworkService`; the incoming reader gains it beside `getLatestBlockNumber`, and `getArrivalState` (the paint path, `service.ts:859`) reads its tip through it: one attempt on the primary endpoint, no PXE guard, no runtime bind, no retry chain, nothing logged. Account add, Allow and token add (`:469,742,1292`) keep the retrying PXE read: one attempt there could leave a scope unbaselined or a floor pending past a fresh receipt, which would then never play (Codex round 3). Both reads share `readTip`'s safe-integer check and its debug line on failure; no caller-selectable mode. The new read refuses a quarantined chain before it builds or calls a node (`isChainQuarantined`), as the PXE client does today (`pxe/client.ts:95-98`; final Codex pass), so a quarantined scope sends no request and stores no floor. Popup, coordinator and arrival rules are unchanged. Rejected, round 2: a stored-state read for the feed's `load` (round 1's D6): a full read that a separate client's `onConnected` starts after the feed's read holds it in `settledAfter` again (Codex, by trace), and removing that dependency changes the coordinator's generation rule; it also moved baseline writes off feed visits (two known limits). Rejected throughout: rows before the judgement (a row would slide after it paints), a deadline on `afterRead` or on the tip read (a timeout over a wait), a baseline written in the background (a new lifecycle). Residual KL-1.
- D7 (#654). Measure first. The four bars scale by 13/11 to 11 px; the two marks go to 12 px, the size they have beside `meta` on the token page (one size for the marks beside that role; Opus), with 11 px named in the PR as the alternative (Codex). If the loading column's measured box differs from the loaded one, its gap and `min-height` take the loaded box.
- D8. No shared token-row skeleton: three sites edited in place.
- D9 (#615). The draft in OA-1 names the warning surfaces and both sequence checks; the cites are re-pointed. Store copy is the owner's.

## Security & Adversarial Considerations

- **dApp-controlled names** (#714): a function name reaches the label lookups on approval, grant and journal surfaces; the fix closes `Object.prototype` keys there and in `formatTransferType` (a restored row's `type`). Attacker capability: pick a name; boundary: what an approval screen prints. No other wire-keyed table has a production caller (recon).
- **Clipboard** (#638): fewer writes, never more; the sanitizing copies are untouched.
- **Arrivals** (#579): the arrival tip becomes a node-only scalar read on the network's own endpoint, outside the PXE (no encrypted state, no runtime; neither path checks the node's chain identity per read), and refused for a quarantined chain before any request, as the PXE client refuses it today. Every write it feeds keeps its service-epoch, lock and scope fences and the safe-integer check, so it adds no way to skip or replay a played receipt.
- **Logs** (#616): no new log line; selections and the search panel are never logged.
- **Store text** (#615): makes the remote-code statement complete; no code path. No dependency, CI or crypto change.

## Phase 1: #714, prototype keys in the label tables

1. Replace the two string tables with `ReadonlyMap`s; read `TRANSFER_TYPE_LABELS` through `Object.hasOwn`.
2. Tests (`tx-enrichment.test.ts`): `constructor`, `toString`, `__proto__` and `hasOwnProperty` through `humanizeMethodName` (title-cased), `getMethodLabel` and `tokenMovementLabel` (`null`), and `formatTransferType("constructor")` (`"constructor"`); red on base; the existing `shield` and mint rows are the controls.

**Gate**: `cd apps/extension && bun --bun vitest run src/utils/tx-enrichment.test.ts src/popup/windows/execute`, then from the root `bun run lint` and `bun run typecheck:all`. Pass: exit 0; the new cases fail on `git show 18d29f23:apps/extension/src/utils/tx-enrichment.ts`. Layers: lint, typecheck, unit.

## Phase 2: #648, the journal Method row

1. Take the before pictures on the unmodified tree (smoke run S below, `rows.test.ts`, with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/wallet-bugs-2/shots/before`).
2. Add the label testid alone, and the `rows.test.ts` check: the named record's journal visit and a new visit to the nameless record's page (`UNBREAKABLE_METHOD`) each measure the Method value inside the box's right edge, with at least 15.5 px between label and value; the named record's value takes two lines or more. Run it: red (gap 0).
3. Apply D5. The check goes green; take the after pictures.

**Gate**: from the root `bun run lint`, `bun run typecheck:all`; S on `rows.test.ts`, Chrome then Firefox. Pass: exit 0, red before step 3 recorded in `lessons/phase-2.md`. Layers: lint, typecheck, smoke e2e.

## Phase 3: #616, the logs viewer holds its place

1. Apply D3a. Give the `LogsViewer.test.ts` stub `scrollSnapshot` and `scrollDOM` geometry.
2. `viewers-csp.test.ts`: the selection and search tests log two lines and assert a chosen visible line keeps its viewport position (±1 px) with the scroll button shown (red on base: CodeMirror moves it on the first line). A new case fills the log to its cap, holds a selection at the end, and logs the line that trims: the same assertions. Rewrite the header comment: where the view lands is now the proof.
3. Run the trim case with D3a alone. Red: apply D3b, with unit cases (a scroll event that moves `scrollTop` up into the band does not re-arm; one that moves it down does; the button at the end re-arms, and the next line is followed). Green: drop D3b and record the run.

**Gate**: `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; S on `viewers-csp.test.ts`, Chrome then Firefox (selection in a shadow root differs there). Pass: exit 0. Layers: unit, smoke e2e.

## Phase 4: #638, a drag is not a click

1. Add `endsSelection` to `utils/selection.ts`; return early on it in each handler of the change map; move Header to it; give About's two version lines testids.
2. Tests: `selection.test.ts`: detail 1 with a selection inside → true; detail 0 → false; collapsed → false. Component tests with a body-attached mount and a real `Range`: `TxHashRow` emits no `copy`, `AddressDisplay` neither toggles nor emits, `tx/[id].test.ts`'s from card copies nothing; each with a plain-click control. `navigation.test.ts`'s drag test also drags across About's wallet version line: no clipboard write; a click on it writes (both browsers).

**Gate**: `cd apps/extension && bun --bun vitest run src/utils/selection.test.ts src/components src/popup/components/modules/tx src/popup/pages`, then root lint and typecheck; S on `navigation.test.ts`, Chrome then Firefox. Pass: exit 0; the new cases red on base. Layers: lint, typecheck, unit, smoke e2e.

## Phase 5: #579, the arrival tip in one attempt

1. Move `readChainTip(networkId)` from `ExecutionService` to `NetworkService` (public, not an RPC method, as `readPublicStorageOnce`); the execution service's `readTip` dep calls it.
2. Give the incoming reader `getChainTipOnce` over it, refusing a quarantined chain first (`ChainNotSupportedError`); `getArrivalState` reads its tip through it, the other three `readTip` callers keep `getLatestBlockNumber` (D6).
3. Tests. `network/service.test.ts`: `readChainTip` reads the primary endpoint's tip through the single-attempt node, once, and a refusal rejects without a second call (red on base: no such method). No execution test stubs `readChainTip` (the gate tests stub `ChainTipGate.readTip`), so they stay as they are. `PublicEventReader`'s doc (`public-event-indexer.ts:28`) stops calling the reader the PXE client. `service.scenarios.test.ts`: `getArrivalState` takes its tip from `getChainTipOnce` and account add from `getLatestBlockNumber` (red on base). The reader's wiring test: a quarantined chain makes no tip request and `getArrivalState` writes no baseline or floor; a live chain is the control. Delete `seedArrivalRow` and its call (`type-roles.test.ts:499`): with Testnet refused, that spec's incoming row now shows without it (red on base: the 15 s wait times out), the browser regression for #579.

**Gate**: `cd apps/extension && bun --bun vitest run src/wallet/services/network src/wallet/services/execution src/wallet/services/incoming-transfer src/composables`; S on `type-roles.test.ts`; from the root `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/incoming-transfers.test.ts`. Pass: exit 0. Layers: unit, smoke and network e2e.

## Phase 6: #654, bars and marks on the 13 px scale

1. Warning: if #743 has merged, merge `dev` first and open Home through its `waitForHomeReminders`. Take the before pictures and measurements (Home's token rows loading and loaded, 360 px, both themes, both browsers): each row's height and the right column's box in both states, into `lessons/phase-6.md`.
2. Apply D7.
3. Test only if the heights differed: `rows.test.ts` asserts a token row's height is the same loading and loaded (red on base). Otherwise none: the sizes are drawn values (pinning them was rejected in `icons-d2-1`).

**Gate**: S on `rows.test.ts`, `type-roles.test.ts`, `shipped-token-list.test.ts`, Chrome then Firefox; after pictures. Pass: exit 0. Layers: smoke e2e.

## Phase 7: #615, the remote-code note

Apply OA-1's "what ships now"; re-point the six cites to recon's lines. **Gate**: `cd apps/extension && bun --bun vitest run scripts/store-listing.test.ts`. Pass: exit 0.

## Phase 8: arc gate

**S (a smoke run)**, warning first: a smoke run tests the last build, so rebuild after every source change. From the root, per browser `<b>` (`chrome`, `firefox`): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <files> --retry=0`. One `e2e:agent` at a time in this worktree; load1 under 150 before a build or a run.
From the root: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`; then every phase's e2e on the final tree. Pass: every command exits 0, one rerun for a known flake. The PR body names each changed e2e's failure mode and measured time, and each touched file's wall-clock before and after per browser.

## UI impact

- **Journal page, Method row** (#648): "#648 a dApp operation's journal page: a long Method value runs into its label (wrap or truncate with the full value reachable; pictures before and after at 360 px, both themes)" (lane brief). Ships the wrap; the owner signs the PR's pictures.
- **Token rows** (#654): "loading bars and the private/public glyphs are sized for 11 px lines beside the signed 13 px text (match the signed scale; pictures before and after)" (lane brief). Ships D7; the PR names 11 px marks as the alternative.
- **Store text** (#615): OA-1.
- #714, #616, #638, #579: no visible change beyond the defect's absence (lane brief). #714 prints "Constructor" where the native source was; #616's follow comes back on a scroll to the end, the button or the 30 s timer, no longer on the next line; #638's drag over a contact name no longer flips it to the address.

## Issues

| Issue | Arc | Phase |
|---|---|---|
| #714, #648, #616, #638, #579, #654, #615 | arc 1 | 1, 2, 3, 4, 5, 6, 7 |

## Delivery

One branch, `wallet-bugs-2-a1` → `dev` (D1), one PR. Title (75 chars): `fix(popup): seven small defects: labels, wraps, log follow, copy, feed, bars`. Body: each fix and its why; the validation runs with outcomes; the pictures for #648 and #654; OA-1 quoted; `Closes #714`, `Closes #648`, `Closes #616`, `Closes #638`, `Closes #579`, `Closes #654`, `Closes #615`; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Open it without labels after Phase 8 and the Codex loop; add `e2e:extension-smoke` or `e2e:extension-network` only when the path filter skips a suite the change needs. The close-out lands as its final commits.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 18d29f23. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff 18d29f23...HEAD` after Phase 8: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/wallet-bugs-2/`; hard stop at three rounds; rounds in `lessons/phase-8.md`.
- Approval boundary: a background baseline write, a timeout or retry on the arrival or tip read, a change to the coordinator's generations, a hold rule on the follow, a new control, or a shared row or skeleton component is a plan change and stops for the orchestrator.
- Close-out: file KL-1 as a closed `known-limit` issue (dedupe first); Outcome block; `lessons.md` promotes nothing unless a retirement pays for it (8 KiB budget); `STATUS.md` deleted; `git mv` to `archive/` in its own commit. Teardown: slug `wallet-bugs-2`, trunk `dev`, `implementations-plan/archive/wallet-bugs-2/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | reject | OA-1 wording (surfaces, both checks); the hold rule on the follow drops (D3); a trim proof in the browser (Phase 3); a real-browser drag case (Phase 4); smoke runs rebuild, `audit:vue`, `NULO_E2E_RETRY=0` (Phase 8); its two #579 findings, answered by trace in round 2 and then made moot by the new D6 | none |
| 1 | Opus 5.5 lens | conditional approve | the hold rule drops, D3b as the scroll-direction rule; the seed deleted for a committed regression; marks at 12 px; OA-1 wording; gates from the root; D3a only in `onLogAdded`; `AddressDisplay`'s event and UI line; #648's testid first, a local rule; its #579 test and known-limit items, moot under the new D6 | none |
| 2 | Codex, resumed | reject | D3b: a strict "moved down" test and the button re-arming itself | — (the round-1 D6 was replaced, not defended: see below) |
| 3 | Codex, resumed | conditional approve | only `getArrivalState` takes the one-attempt read, the action callers keep theirs (D6); KL-1 covers every pending attempt; the Arrivals security line rewritten | none |
| 3 | Opus 5.5 lens | conditional approve | KL-1 longer under a newer read; the reader's doc; no execution test moves | keep all four callers on one attempt (Codex's narrower change wins: the action callers' behaviour is outside #579); delete the PXE tip method (moot: it keeps three callers) |
| final | Codex, fresh session | conditional approve | the one-attempt read refuses a quarantined chain first, with its test (D6, Phase 5); Fact 2 corrected, the nameless record's journal page visited (Phase 2) | none |
| final, resumed | Codex | approve | both conditions met as written; no new finding | none |

Round 2's blocking finding replaced D6: each page's `IncomingTransferServiceClient` fires its own `onConnected`, so a coordinator full read can start after the feed's stored read with no refresh behind it, and `settledAfter` holds the feed again. The new D6 leaves the coordinator alone and removes the slow transport instead, reusing the execution service's one-attempt tip read; round 1's KL-1 and KL-2 no longer arise.

Known limit to file at close-out. **KL-1** (#579): a request that rejects promptly fails without retries; one that stays pending (DNS, connect, headers, body) holds a scope's first feed paint (no arrival row, or a pending floor) until the one attempt's 60 s request timeout, and longer while a newer coordinator read is in flight (`settledAfter` waits for it; base behaves the same). Rows arrive late, none is lost. Reopen on a report of late rows with such an endpoint, or evidence that one occurs.

## Seeds

```
/goal Phases 1-8 of implementations-plan/wallet-bugs-2/plan.md marked ✓, each backed by its gate passing in the transcript; LESSONS_FILE=implementations-plan/wallet-bugs-2/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one PR from worktree-wallet-bugs-2 to dev opened after that, closing #714 #648 #616 #638 #579 #654 #615, with the pictures for #648 and #654, its close-out commits archiving the plan (git show --stat in the transcript); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wallet-bugs-2 forward per its plan.md and the README § Post-implementation standard at 18d29f23: reality-check plan.md and lessons/, run the next phase's gate, rebuild before every smoke run, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
