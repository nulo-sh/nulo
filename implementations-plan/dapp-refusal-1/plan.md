---
plan: dapp-refusal-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 8d9ff149
standard: implementations-plan/README.md § Post-implementation standard, read at 8d9ff149
---

# dapp-refusal-1: the execute window settles a dApp send the wallet refuses during its estimate

#758 (dapp-boundary-3's OA-4 b, settled 2026-10-17 as its own plan). When an estimate or preview of a stored dApp send meets a wallet refusal (the call-binding check, or the registry check of #716), the window today shows the estimate failure. After this plan the request ends as a refusal: the dApp reads the scope refusal and History reads "Not allowed", on the standard send and on the send with no sender account. One arc, one PR against `dev` (D-orch-1), built only after the owner signs OA-1. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md), pictures in `screenshots/oa1/`.

**Claims that did not hold** (captured at `0c340d37`, recon.md § Runtime facts):
- "A standard send: … Confirm off." Only when the person pays the fee. With a sponsor as payer (the local network's default) Confirm stays on beside the toast, and Confirm ends in the refusal.
- "Reject ends the request … History reads 'You rejected'." No code writes `user_rejected`: a Reject files `popup_bound`, read as "Transaction failed" / "Popup closed early". Filed as #828; not in this lane.
- The no-sender path holds as written: preview toast, Confirm on, Confirm ends in the refusal and "Not allowed".

## Outcome & Quality Bar

- **For whom**: the person whose window opens on a send the wallet will never allow; the developer of the dApp that sent it.
- **Excellent**: (1) the window never offers a path that cannot succeed: once the wallet refuses, it says so in History's own words, and its only control ends the request; (2) the request then ends as a refusal at Confirm ends today: the dApp reads the same envelope, History the same kind and label, and a binding refusal the same title; (3) the dApp learns of the refusal only when the person presses OK; every other end answers as it does today, the same on both branches, so a refusal found by simulating the person's account is never read by the app without the person acting (D2).
- **Good enough**: no new e2e scenario; the registry refusal is proven at unit seams, as in dapp-boundary-3.

## Assumptions

**Facts** (verified at `0c340d37`, lines re-read at `8d9ff149`; paths under `apps/extension/src/` unless named):
- F1 The window toasts a failed estimate unless the op is app-paid and the person does not pay (`popup/windows/execute/index.vue:169-175`), and a failed preview always (`:217-220`). Confirm waits for an estimate only when the person pays or the app sets its own fee (`:182-184`, `popup/windows/execute/fee-figure.ts:34-40`).
- F2 `ExecutionService.estimateOperationFee` and `previewOperationAuthwits` take the interaction id and read the stored request through `InteractionOperationSource` (`wallet/services/execution/service.ts:128-134, 764-790, 807-809`). Every fee strategy rethrows unchanged (`execution/fee/*-strategy.ts` catch arms).
- F3 The refusals are `ScopeViolationError`s: the call binding (`execution/contract-resolver.ts:113-128`), raised while building a standard send (`execution/tx-request-builder.ts:617-625`), a no-sender send (`:348-367`) and an encoded-call authorization the dApp supplies (`execution/authwit-discoverer.ts:197`); the registry refusal, an `AuthRegistryRefusalError` (`execution/decode-authwit-effects.ts:35-36`), reaching the estimate and the preview typed (`execution/dapp-send-executor.test.ts:1783-1830`).
- F4 `DappInteraction.cancelledAt` is the existing "ended before approval" flag: approve and resolve refuse on it, the window replays it (`wallet/services/dapp-interaction/spec.ts:79-84`, `dapp-interaction/service.ts:250-252, 278-280`). Its live writer is the feed cancel, which also closes the window (`:193-201`); `cancelInteraction` has no production caller.
- F5 An execute window ends by Reject, also run by its `beforeunload` and by a lock or profile switch (`dapp-interaction/service.ts:304-314`, `composables/useDappApprovalWindow.ts:91, 114-116, 130`), a closed window or the 10-minute timeout (`window-manager/window-manager.ts:96-99, 222-233`), a feed cancel (`dapp-interaction/service.ts:193-201`), or approval. Each end before approval rejects the dApp's promise with its own error, passed on unchanged (`packages/wallet-bridge/src/dispatcher.ts:513-528`). The interaction lives in service-worker memory: a restart drops it, and the reaper closes its row `stuck_queued`.
- F6 The ingress catch maps the error to the dApp's envelope and fails the queued row by its class: `scope_refused` or `registry_refused`, retitled "Transaction" (`wallet/services/wallet-sdk/background.ts:930-952`, `wallet-sdk/queued-journal.ts:243-296`, `wallet-sdk/error-envelope.ts:126-130, 224-261`).
- F7 A binding refusal carries its row's renaming (the function its selector runs, and the refused call's contract and argument count) in an in-process `WeakMap` read by `refusalOf` (`execution/contract-resolver.ts:92-110`); only the claimed path reads it (`execution/mark-failed-unless-cancelled.ts:41`). `scope-refusal.test.ts:130-134` pins the title it gives.
- F8 The popup rebuilds both refusal classes from the RPC payload (`packages/extension-messaging/src/errors.ts:641-650`). History's words: `utils/journal-state.ts:244-253, 312-314`.
- F9 A row failed before any claim stores the message and no raw error (`wallet-sdk/queued-journal.ts:257-263`); a claimed row stores both (`packages/wallet-core/src/jobs/error.ts:39-52`). Developer mode shows the raw block only when stored; `scope-refusal.test.ts:145-148` pins it for the claimed path.

**Inferences** (attack these):
- I1 A refusal does not depend on the fee picked: binding reads only the dApp's calls; a registry request comes from the dApp's calls, since the wallet's own fee calls raise none (dapp-boundary-3 F8). It can depend on private state (S1), so a later estimate could take another branch; the first refusal still ends the request (D7).
- I2 The refusal instance reaches the entry points unwrapped on every path the window drives (F2, F3); Phase 3's e2e fails if a layer wraps it.
- I3 The same instance reaches the ingress catch, so `refusalOf` works there: estimate → entry point → record → OK → `WindowManager.cancel` → dispatcher → catch, all in one service-worker lifetime.

**Asks**: A1 = OA-1, the window's surface. The arc waits for it; what ships until then is today's estimate failure.

## Architecture & Implementation

**Shape (OA-1 B2).** The estimate's entry point hands a refusal to the request's owner, which records it on the interaction, as `cancelledAt` records a cancel. The window shows History's words over the request with one OK. Only OK settles the request with the refusal; every other end answers as today. No new event, lifecycle, persistence or option.

```ts
// dapp-interaction/spec.ts, on DappInteraction
/** A refusal an estimate or preview met: approval is refused, and only the window's OK settles the request with it. */
refusal?: ScopeViolationError
// dapp-interaction/spec.ts, on Methods (popup RPC)
settleRefusedInteraction(id: string): void
// execution/service.ts, on InteractionOperationSource
refuseStoredRequest(interactionId: string, refusal: ScopeViolationError): void
```

**Flow.** (1) The window's estimate or preview RPC → `ExecutionService` → `withEstimateAdmission`; inside its run, a `ScopeViolationError` from an admission that is not aborted calls `refuseStoredRequest(id, error)` in the same synchronous step as the check, then rethrows. (2) `DappInteractionService.refuseStoredRequest` sets `refusal` on a stored execution interaction with neither `cancelledAt` nor a refusal, else does nothing. (3) `approveInteraction` and `resolveInteraction` throw the refusal after the `cancelledAt` check, before any claim. (4) The window reads a `ScopeViolationError` in its fee and preview `onError` and in approve's catch: no toast, all estimates cancelled, Confirm off, the overlay shows `refusalLine(error)`. (5) OK calls `settleRefusedInteraction(requestId)`, then `closeWindow(true)`; the service deletes the record and calls `WindowManager.cancel(handle, refusal)`. (6) The ingress catch answers the dApp by the error's class (F6) and renames the row `refusalOf(error) ?? { title: "Transaction" }`.

**File-level change map.**
| File | Change |
|---|---|
| `wallet/services/execution/service.ts` | the refusal hand-off inside both entry points' runs; the interface method |
| `wallet/services/dapp-interaction/spec.ts`, `service.ts`, `client.ts` | `refusal`; `refuseStoredRequest`; `settleRefusedInteraction` (RPC, passthrough); the throw in approve and resolve |
| `wallet/services/wallet-sdk/queued-journal.ts` | `failQueuedForError` passes `refusalOf`; `failQueuedIfUnclaimed` takes it; its doc comment |
| `utils/journal-state.ts` | `refusalLine(error)`: History's label and context for the error's kind |
| `popup/windows/execute/index.vue`, `components/composite/DappCancelledOverlay.vue` | the refusal state, the overlay and its OK, Confirm off; the overlay's doc names a refusal |
| tests beside each, `tests/e2e/network/scope-refusal.test.ts` | Phases 1-3 |

## Security & Adversarial Considerations

- **Threat model.** A connected dApp with a transaction grant controls its calls and its contracts. The boundary: the dApp RPC, and the person's private state for that dApp's contracts, which a dApp reads only with a simulation or utility grant.
- **S1, the consent-free bit (mechanism demonstrated in source, exploit plausible but unverified; the reason for D2).** A dApp contract's private function reads its own notes for the account and, on a condition, calls the registry's `set_authorized_private` naming the account; the registry emits the authorization request before it checks the witness. The window's automatic estimate simulates it with the account's scope; the decode loop refuses only on that branch. Any answer that differs between the branches without the person acting leaks one bit per window. D2 answers the refusal only on OK; a timeout, a lock, a profile switch, a closed window and a feed cancel answer exactly as they do on the other branch. Residual: the person's OK, as today the person's Confirm.
- **Superseded estimates.** An estimate whose cancel the SW processed before it threw records nothing: the hand-off checks its admission signal and records in one synchronous step (D7). One that throws before its cancel arrives records its refusal, which by I1 still ends the request, and only on OK.
- **No new privilege.** The page names only an id it already holds. The SW decides the refusal by running the stored request, and settles with it only once recorded. Any extension page can already reject a request.
- **Text.** The dApp gets the existing envelopes; the window and History use the existing kind labels; refusal messages carry no request value (dapp-boundary-3 F11). A refusal thrown from approve logs at `debug`, as an expected refusal.
- **Races.** Approve claimed first: the executor refuses at Confirm, as today. Refusal first: approve throws it, the window shows the overlay.
- **Supply chain, cryptography.** None added.

## UI impact

- **Signed**: nothing. The lane's surface is OA-1 in full: the execute window, History's row and the dApp's answer when an estimate or preview meets a refusal.
- **Before** (A pictures): a toast; Confirm on with a sponsor or no sender, off when the person pays; Reject reads "Popup closed early", Confirm "Not allowed".
- **After, as recommended** (B pictures): a full-window notice in History's words, "Not allowed. The app asked for more than you allowed. Nothing was sent." (the registry check: "Not allowed. Apps cannot change your public authorizations. Nothing was sent."), and OK. After OK, History reads "Not allowed", titled by the function the call runs or "Transaction"; the dApp reads the same envelope as at Confirm; developer mode shows the refusal's message without the raw block (F9). Closing the window instead, or a lock or the 10-minute limit, ends the request as today ("Popup closed early").

## Phases (arc 1, after OA-1)

### Phase 1: the estimate hands a refusal to the request's owner

1. Add `refusal` to `DappInteraction`, and `refuseStoredRequest` to `InteractionOperationSource` and `DappInteractionService`. Keep `refuseStoredRequest` off the RPC list: only the service worker may record a refusal.
2. Throw the refusal in approve and resolve, after the `cancelledAt` check.
3. Add `settleRefusedInteraction` to `Methods`, the service's RPC list and the client's passthrough list.
4. In both interaction-bound entry points, hand a `ScopeViolationError` from a run whose admission is not aborted to `refuseStoredRequest`, then rethrow.
5. Make `failQueuedForError` rename a classified row `refusalOf(error) ?? { title: "Transaction" }`.
6. Add the tests:
   - `dapp-interaction/service.test.ts`: after a refusal, `settleRefusedInteraction` rejects `execute()` with that instance and closes the window once (the success control). After a refusal, Reject, a closed window, the timeout and a feed cancel each end `execute()` with today's error, never the refusal. Approve throws it and never executes; resolve throws it and never settles. The RPC list names `settleRefusedInteraction` and not `refuseStoredRequest`. A second refusal keeps the first. An unknown id, a cancelled record and a fee-question payload stay unchanged, and `askFeeAgain` still answers. Without a refusal, `settleRefusedInteraction` changes nothing and approve still executes.
   - `execution/service.display-decode.test.ts` (its `InteractionOperationSource` stub), a new `describe`: an estimate and a preview whose run throws `ScopeViolationError` or `AuthRegistryRefusalError` call `refuseStoredRequest` once with that instance, then reject with it. Controls: an aborted admission, a plain error, a `JobCancelledError` and a success never call it. A cancel processed before the throw records nothing; a cancel after the record leaves it.
   - `wallet-sdk/queued-journal.test.ts`: a titled binding refusal renames the row with its function and refused call; an untitled one reads "Transaction"; `popup_bound` keeps its title.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0 each; each refusal test fails with its line removed, its control stays green, both runs logged in `lessons/phase-1.md`. Layers: lint, typecheck, unit.

### Phase 2: the window shows the refusal and settles it on OK

1. Add `refusalLine` to `utils/journal-state.ts`, built from the kind labels.
2. In `popup/windows/execute/index.vue`, read a `ScopeViolationError` in both `onError`s, before their `console.error`, and in approve's catch, after its rearm. Log it at `debug` only. Show the overlay with no toast, cancel all estimates and previews, keep Confirm off. Bind OK to `settleRefusedInteraction`, then `closeWindow(true)` whatever the call returns.
3. Add the tests in `popup/windows/execute/index.test.ts`, with the error built as the RPC rebuilds it:
   - each fee `onError`, the preview `onError` and approve's catch, given a `ScopeViolationError`, show the scope line with no toast, no error-level log and Confirm off; after approve's catch, the handed-off estimates are cancelled;
   - an `AuthRegistryRefusalError` shows the registry line;
   - OK calls `settleRefusedInteraction` once, never `rejectInteraction`, and closes the window;
   - control: `Error("node down")` toasts as today, with no overlay.
   - `utils/journal-state.test.ts`: both lines equal History's label and context.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0 each; the window tests fail with the refusal branch removed. Layers: lint, typecheck, unit, component.

### Phase 3: arc gate

1. Change test 2 of `tests/e2e/network/scope-refusal.test.ts`: wait for `dapp-cancelled-message` to read the scope line; capture it; click `dapp-cancelled-ok-btn`; keep every dApp and History assertion, except that developer mode now shows no raw error block, as for every row refused before it ran (F9). It proves the real refusal reaches the owner unwrapped and ends with the same envelope, kind and title (I2, I3).
2. Run `bun run test:all`. Merge `origin/dev`, then rerun lint, typecheck and `bun run test`.
3. While `load1 < 150`, run on Chrome at retry 0, one at a time: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/scope-refusal.test.ts`, then `tests/e2e/network/authwit-lifecycle.test.ts`. Run `scope-refusal` again with `NULO_E2E_BROWSER=firefox`: the window now closes through a new path.
4. Capture the built overlay, light and dark, at 400 px, for the PR.

**Validation gate.** Pass: every command exits 0; both e2e files green on Chrome, `scope-refusal` on Firefox; per-browser wall-clock of `scope-refusal` before and after in the PR body. Layers: all unit layers, network e2e. No new scenario: the hand-off is one branch per entry point and one record field, proven at the SW and window seams; the adapted test proves the wire end to end.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | The SW's estimate entry points hand the refusal to the owner | the popup asks the SW; the executor settles; a new event to the window | the SW holds the decision, the instance and the owner seam (F2); a page would hold only a rebuilt error; the executor has no interaction; the estimate's own rejection reaches the window, and approve's catch covers a lost one |
| D2 | Only the window's OK settles with the refusal; every other end answers as today | settle at once; any end settles with it (first draft) | S1 (Codex r1: a timeout or a lock would answer differently per branch) |
| D3 | The window's words are History's kind labels | new copy | one source; nothing new to sign but the composition |
| D4 | The pre-claim row takes `refusalOf` | "Transaction" | keeps the title and call a refusal at Confirm gives (F7) |
| D5 | The trigger is the `ScopeViolationError` class | per-check | both checks share it; any other failure keeps the toast |
| D6 | No new e2e scenario; the NO_FROM path proven at the preview seam | a second scenario | same branch at both entry points and in the window |
| D7 | An estimate cancelled before it throws records nothing; the first recorded refusal ends the request | record every refusal; let a later estimate clear it; a cancel handshake | a cancel the SW processed first ends a result the window will not show; a request refused on one branch is refused, so a refusal recorded first stands |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): `reject`, six findings, all accepted: any end settling with the refusal only delayed S1 (D2 revised: only OK settles); a feed cancel must not hand over the refusal; a superseded estimate must record nothing (D7); F5 overclaimed a service-worker restart; the tests lacked cancellation order, automatic ends, a superseded refusal and a fee-question control; F3 named the wrong authorization path.
- **Opus 5.5** (Plan agent, read the first draft): `conditional approve`. Its S1, D2 and feed-cancel conditions were already met by the Codex r1 revision. Applied: a refusal branches before the window's `console.error` and logs at `debug`; approve's catch cancels after its rearm, with a test; F1 names the app-set fee; F4 names the feed cancel as `cancelledAt`'s live writer; `refuseStoredRequest` stays off the RPC list, with a test; resolve's throw is tested; the estimate tests reuse `service.display-decode.test.ts`'s stub. Declined: filing S1 as a closed known limit, since D2 prevents the leak rather than accepting it, and the residual (the person's OK) equals today's Confirm.
- **Codex r2** (verification, same session): `conditional approve (with conditions: qualify D7's cancellation ordering and test both orders)`. Applied: D7 and the Security line now say a cancel processed before the throw prevents the record, the check and the record share one synchronous step, and Phase 1 tests both orders; F5 says an end before approval. Its other checks found the round-1 findings resolved: no automatic answer differs by branch (`beforeunload` and a lock still run Reject; approve's and resolve's throws reach the page, not the dApp), and the tests and the Opus changes stand. Converged.
- **After the panel**: dev moved to `8d9ff149` (#826 renamed `refusalTitleOf` to `refusalOf`, which now carries the refused call beside the title). Names and cited lines follow it; the design is unchanged.

## Delivery

- One PR against `dev` from `dapp-refusal-1-a1` (off `origin/dev`, carrying this plan): `feat(dapp): settle a send the wallet refuses during its fee estimate` (69 characters). `Closes #758`.
- Open it without labels; add `e2e:extension-network` only if the path filter skips the network suite.
- Rebase onto `execute-window-2` arc 1 and consent-display-1 arc 3 if either lands first; both edit `index.vue` and its tests.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `8d9ff149`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, over the arc's diff from its merge base, after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: the PR above, then `gh pr checks <n> --watch`.
- Step 4 as the PR's last commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after the merge: `agent-worktree done dapp-refusal-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-refusal-1/plan.md` succeeds.

## Seeds

`/goal` (recommended): `Arc 1 of implementations-plan/dapp-refusal-1/plan.md is done: Phases 1-3 marked ✓ in plan.md, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/dapp-refusal-1/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop; bun run test and bun run lint exit 0.`

`/loop 15m Drive arc 1 of implementations-plan/dapp-refusal-1 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After the gate, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`
