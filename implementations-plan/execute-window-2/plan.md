---
plan: execute-window-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 24c68cb4
trunk: dev
status: completed
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-19
- **Status:** completed. One PR against `dev`, #832, carrying this close-out; merging it is the orchestrator's call.
- **Shipped:** #832: an estimate or preview that meets a scope refusal records it on the request; every later attempt and approval answers it; Reject, unload or closing the window answers the dApp with it (4100), while a cancel and the timeout keep their own end; the queued History row is retitled through `refusalOf`; the execute window shows `Nulo won't send this` and the reason in the fee's place, no toast, and only Reject (`confirmHidden`). Closes #758.
- **Not changed:** #777 (pictures on the issue, OA-2; nothing ships, D9); #104 and #106 (the owner's C, defer; commented, open); #575 closed as shipped by #721 before this lane reached it.
- **Owner asks:** OA-1 open as #834, A ships (D10); OA-2 open on #777.
- **Known limits:** none.
- **Open items:** #834 (OA-1); #777 (OA-2); #104 and #106 stay open under the owner's deferral.
- **Lessons:** none promoted: `lessons.md` is at 8192 of 8192 bytes, and the smoke-build note is already the `e2e-testing` skill's; the notes stay in [lessons/phase-1-2.md](lessons/phase-1-2.md) and [lessons/phase-3.md](lessons/phase-3.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.
- **Size:** 164 lines against the light tier's 150: the record keeps the arc's review verdicts across two merges of `dev`, and this block.

# execute-window-2: the execute window states a refused request; Reject ends it as that refusal

One arc, one PR against `dev`, `Closes #758`. Recon: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md); owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). The pick, quoted: **P42-15 = C**, "Build the better form now as this lane's next arc (the mockup's words are a draft for your sign-off)."

## Issues

| Issue | Arc | Disposition |
|---|---|---|
| #758 | arc 1 | Built as P42-15 C describes (D1-D6). Two claims in the issue do not hold: Confirm goes off only when the person pays (with Sponsored it stays on, `fee-figure.ts:32-38`), and after Reject History reads "Popup closed early", not "You rejected" (`queued-journal.ts:285-294`). Both cases end as "Not allowed" after this arc. |
| #777 | no code | `owner-decision`. Pictures of its options over the real window (OA-2); nothing ships (D9). |
| #104, #106 | no arc | The owner's pick on each Decision section is **C, "Defer: leave open until a real dApp shows the gap"** (page 19), so the lane brief's "build what they say" builds nothing. Both gaps still hold at HEAD (recon). #106's `Where` does not hold: `runFastArm` reads no mint. Close-out comments the reason; both stay open. |
| #575 | out of scope | p42-followups-1 maps P42-19 to #514 and #719 and the `createAuthWit`, simulation and utility cards; #575's `send_transaction` card is not named. Closed as shipped by #721 on 2026-10-18, before close-out. |

## Outcome & Quality Bar

- **For whom**: a person approving a dApp send that Nulo will never send, and the dApp's developer.
- **Excellent**: (1) the window says plainly that Nulo won't send this and why, in the fee card's place, with no toast and only Reject; (2) whether the person presses Reject or closes the window, the dApp reads the typed refusal (4100) and History reads "Not allowed" with the refusal's own line; (3) every other estimate failure behaves exactly as today.
- **Good enough**: one sentence covers both call-binding sites (a call, an authorization's call); a window left to time out, or a request the dApp or the feed cancels, keeps today's end (D1).

## Assumptions

**Facts** (verified at `24c68cb4`; citations in `recon.md`; Fact 2 corrected in review)
1. A refusal reaches the window as a typed instance: `walletErrorFromPayload` rebuilds `ScopeViolationError` and `AuthRegistryRefusalError`; the window's `onError` gets it and toasts it as generic today.
2. Within an estimate or preview the only scope refusals are the registry decode refusal and the call-binding refusal, at a call (`CALL_BINDING`) or at an authorization's call (`AUTHWIT_CALL_BINDING`, `titlesRow: false`); the bridge's scope checks run before any window.
3. `rejectInteraction` ends the request with `new UserRejectedError(reason)`; a window the person closes ends it with `WINDOW_CLOSED_BY_USER`; `WindowManager` hands the same value, in the worker, through `interaction()` to `background.ts:930-951`, where `failQueuedForError` and `toWalletResponseError` already map a scope refusal to `scope_refused`/`registry_refused` and 4100. `DappInteraction` is declared in `dapp-interaction/spec.ts:75`.
4. `withEstimateAdmission` and the builders rethrow the thrown instance, so `refusalTitleOf`'s title survives to that catch (traced by the Opus leg).
5. `OperationCard`'s `fee` slot replaces the whole fee block; a `v-if`'d `<template #fee>` inside the `v-for` switches it; every window holds one operation.
6. `DappApprovalFooter` has no way to drop Confirm; four windows share it. `index.test.ts:177` stubs `OperationCard` as `<div />`.

**Inferences**: I1. A refusal is the wallet's verdict on the request, kept as policy (D7), not a proven property: discovery is folded for `fj`/`fpc` and standalone otherwise, so one attempt might refuse where another would not (plausible but unverified); the record fails closed. I2. A future plain `ScopeViolationError` at an estimate would read the call words; Fact 2 says none exists.

**Asks**: OA-1 (the words, and the dApp's 4100 at Reject: draft, ships now); OA-2 (#777's form: ships nothing). Neither blocks the arc.

## Decisions

- **D1. The worker records the refusal on the request; the person's end of it becomes the refusal.** `ExecutionService`'s two interaction-bound entries (`estimateOperationFee`, `previewOperationAuthwits`) catch a `ScopeViolationError`, call `recordRefusal(interactionId, error)` on the `InteractionOperationSource` seam, and rethrow it. `DappInteractionService` keeps the first one on the stored `DappInteraction` (in memory, dies with the request; an id no longer stored records nothing). In `interaction()`, when a refusal is recorded, the window's own ends become that refusal: a `UserRejectedError` (Reject, the window's unload, and its reject when the profile locks or changes) or `WINDOW_CLOSED_BY_USER` (the close, which can win the race with Reject's unawaited RPC). A cancel, the timeout and every other end stay as they are. Rejected: the popup names the refusal (it would choose the dApp's answer, and the worker-side title is lost); settling at estimate time (the window closes under the person, against the pick's Reject); substituting only in `rejectInteraction` (Reject's own close can win, Codex and Opus r1); awaiting the RPC before closing, or letting the worker close the window (each fixes one path of the race and changes the window's close flow); substituting on the timeout too (no window ended it); a live-session condition on the substitution (Codex r2: it guards a bit the person cannot keep anyway, see Security).
- **D2. Classify by class.** `AuthRegistryRefusalError` → the registry words; any other `ScopeViolationError` → the call words (I2); anything else keeps today's log and toast. A pure `execute/refusal.ts` holds the kind and the words.
- **D3. The notice uses the existing `fee` slot** from `index.vue`: no `OperationCard.vue` edit, no new `.vue`. Look: `UnreadableArgsNotice`'s orange warning line, then the reason in `body`/`secondary`; `role="alert"`, mounted with its text, as the footer's error row. Focus is not moved: a control that vanishes drops focus to the page, Tab reaches Reject, and a moved focus would take a held Enter's repeat.
- **D4. Only Reject, full width**: `DappApprovalFooter` gains `confirmHidden` (default false), as `wideTooltip` is a per-window prop; `approve()` also returns while refused.
- **D5. The no-sender preview gets the same form**: both refusals reach it, and today its Confirm leads to the same refusal.
- **D6. The queued path keeps a binding refusal's resolved title**: `failQueuedForError`, which holds the error, passes `refusalTitleOf(error)` to `failQueuedIfUnclaimed` (a new optional `failedTitle`), which writes it, else "Transaction" for a classified refusal, as `markFailedUnlessCancelled` does at execution; its doc comment is rewritten. A registry refusal stays "Transaction". The record keeps the queued contract: no raw error (`normalizedRaw: null`), as every refusal before a claim already has (test 1). Rejected (Opus r1): writing `normalizeError` there, which adds a developer-mode raw block to every refusal before a claim, a change outside the pick; OA-1 states the developer view that ships.
- **D7. Terminal, as policy**: the record belongs to the request, not to an attempt. Once recorded, the two estimate entries throw it before running and `approveInteraction` throws it before claiming, so a superseded attempt's refusal, which the window drops as stale, reaches the window through the next attempt or a Confirm. If the person rejects first, the dApp still reads the refusal. The window never clears it; the record is first-wins.
- **D8. Merge order**: #795 (consent-display-1 arc 2) edits `index.vue`, `index.test.ts`, `dapp-interaction/service.ts`, `spec.ts`, `execution/service.ts` and the bridge README; p42-followups-1 A1 edits `DappApprovalFooter.vue`. Hunks are disjoint, so the arc is built now; its PR opens only after both merge, on a branch with `origin/dev` merged in and the gates rerun.
- **D9. #777 ships nothing**: any at-rest flag changes how the summary reads.
- **D10. The draft words ship, as the orchestrator directed** ("an OWNER-ASKS entry with the ship-now form, and the arc ships with them"). Both legs asked that the merge wait for OA-1's answer: merging is the orchestrator's call, the PR body quotes OA-1, and the close-out files OA-1 as an `owner-decision` issue if the PR merges before an answer.

## Architecture & Implementation

| File | Change |
|---|---|
| `wallet/services/execution/service.ts` | `InteractionOperationSource` gains `recordRefusal(interactionId, refusal: ScopeViolationError): void` and `refusalOf(interactionId): ScopeViolationError \| undefined`; the two entries throw a recorded refusal first, else record and rethrow (D1, D7) |
| `wallet/services/dapp-interaction/spec.ts`, `service.ts` | `DappInteraction.refusal?`; `recordRefusal` (stored id only, first wins), `refusalOf`; `interaction()`'s end (D1); `approveInteraction` throws it before claiming (D7) |
| `wallet/services/wallet-sdk/queued-journal.ts` | `failQueuedForError` resolves the title; `failQueuedIfUnclaimed` takes it (D6) |
| `popup/windows/execute/refusal.ts` (new) | `RefusalKind = "registry" \| "call"`, `refusalKind(error)`, `REFUSAL_TITLE = "Nulo won't send this"`, `REFUSAL_REASON` (OA-1) |
| `popup/windows/execute/index.vue` | `refusal: Ref<RefusalKind \| undefined>` (Fact 5), set by both `onError`s before any log or toast and by `approve()`'s catch; the `#fee` slot `execute-op-refusal` (`data-kind`), `-title`, `-reason`; `confirmHidden`; the `approve()` guard |
| `components/composite/DappApprovalFooter.vue` | `confirmHidden` (D4) |
| `packages/wallet-bridge/README.md` | the call-binding paragraph: the check also runs when the window estimates, and Reject then answers this envelope |

Tests (each red on the base copy of its source):
- **T1** `dapp-interaction/service.test.ts`: after `recordRefusal`, Reject and the window's close each end the dApp's request with that instance (registry and call), and `approveInteraction` throws it without claiming; controls: no record → `UserRejectedError` and today's close; with a record, a cancel keeps `JobCancelledError` and the timeout its own end; a record for an unknown or approved id changes nothing; the second record loses.
- **T2** `execution/service.test.ts`: both entries record a `ScopeViolationError` and rethrow the same instance, and with a record they throw it without running the executor (the superseded-attempt case); a generic `Error` and a `JobCancelledError` record nothing.
- **T3** `wallet-sdk/queued-journal.test.ts`: `failQueuedForError` with a titled binding refusal writes its title; registry → "Transaction"; `popup_bound` → no title.
- **T4** `popup/windows/execute/index.test.ts` (its `OperationCard` stub renders `<slot name="fee" />`), with `walletErrorFromPayload`-built errors: fee `onError` with each class → the notice with its words, no toast, no Confirm, `approve()` inert, Reject → `rejectInteraction`; the preview `onError` and an `approveInteraction` rejection the same; control: a generic `Error` keeps the toast and Confirm. The real card's slot switch is proven by the e2e.
- **T5** `DappApprovalFooter.test.ts`: `confirmHidden` drops Confirm; default keeps it.
- **E2E** `tests/e2e/network/scope-refusal.test.ts` test 2 changes, no new scenario: wait up to 120 s (the old approvable wait) for `execute-op-refusal` with `data-kind="call"`, assert no `execute-confirm-btn`, press Reject; the answer, kind, titles and developer message stay as written; its raw-envelope reads become "no `journal-detail-error-raw`", test 1's contract for a refusal before a claim (D6). Wall-clocks, Chrome and Firefox, before and after, in the PR body.

## Security & Adversarial Considerations

- **Threat model**: a connected dApp controls its calls and their order. The change cannot widen what it obtains: the refusal comes only from the worker's own checks; the record holds a wallet-built error with a constant message; an approval refuses while a refusal is recorded (D7), and a `sendTx` execution rebuilds and re-runs both checks.
- **Trust boundary**: the popup never supplies the refusal class or text; `recordRefusal` and `refusalOf` are not RPC methods, and ignore ids that are not stored. Only the person's Reject or close ends a refused request as its refusal.
- **What the dApp learns**: when the window ends a refused request it reads 4100, as the pick says. A registry refusal comes from a simulation over the account's private notes, so a contract built to raise one on a private condition learns that bit when the window ends: Reject, its close, or the window's own reject when the wallet locks while it is open (`useDappApprovalWindow.ts:114-116`); today it learns it only if the person confirms. Every way the person can leave the window tells the app; a live-session condition (Codex r2) would spare only a window left untouched until the wallet locks, and the plan accepts that end as the window's own (Codex r3: approve). OA-1 C (4001 for every end) is the control, the owner's call. Exploitability unknown; one bit per request.
- **Logging**: no new log line; the refusal text is a closed union. No dependency, crypto or permission change.

## Phase 1: worker

Warning: before any code change, take the base pictures (Pictures, steps 1-2).
Steps: D1, D6, D7's worker half; T1-T3.
**Gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/dapp-interaction src/wallet/services/execution/service src/wallet/services/wallet-sdk/queued-journal`. Pass: exit 0; T1-T3 red on the base copies. Layers: lint, typecheck, unit.

## Phase 2: window

Steps: D2-D5, D7's window half, the README paragraph; T4, T5.
**Gate**: `bun run audit:vue`; `bun run test:all`. Pass: exit 0; T4, T5 red on the base copies. Layers: lint, typecheck, unit, component, build.

## Phase 3: e2e and pictures

Steps: the e2e change; the after pictures (step 3).
**Gate** (load1 < 150, one `e2e:agent` at a time): `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/scope-refusal.test.ts tests/e2e/network/authwit-lifecycle.test.ts`, then the same with `NULO_E2E_BROWSER=firefox` (the footer is a window change); smoke on an armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`), Chrome then `NULO_E2E_BROWSER=firefox`: `agent.sh` leaves a network build in `dist/`. Pass: exit 0 on both browsers; a Firefox "Popup closed early" in test 2 is a D1 defect, never a rerun. Layers: smoke and network e2e.

## Pictures

Scratch spec `ew2-shots.test.ts`, kept in `~/.cache/nulo-backlog/execute-window-2/`, copied into `apps/extension/tests/e2e/network/` for the run only, through `agent.sh` with `NULO_E2E_SHOT_DIR`; `shotSend` takes both themes; the window at 400 x 800, the popup at 360 x 600. PNGs go to `implementations-plan/execute-window-2/screenshots/`. Warning: step 2 edits two production files; run `git diff --stat` before every commit.
1. Base, #758 before: test 2's call-binding send; the window with the toast; Reject; the History card.
2. Base, #777 (OA-2): `type-roles-windows`' delegated send, with two uncommitted scratch edits: `decodeAuthwitBatch` marks every authorization `unavailable` (the real failed-batch path), and `SendTxSummary.vue` mounts `UnreadableArgsNotice` (with advice) under a raw authorization row. Shoot C; remove the advice node, shoot B; remove the notice, shoot A (today). Then `git checkout --` both files.
3. After, #758: the same send; the notice; Reject; History. The registry words as a labelled mockup: the call reason text swapped in the live window.

## UI impact

- **Execute window, a refused send** (P42-15 C): the notice replaces the fee card, the toast is gone, Reject alone, full width. Words: OA-1's drafts (ship now).
- **History, that send after Reject or close**: "Not allowed" with the existing line; title "Transaction" (registry) or the resolved function (call binding), the pick's History mockup; developer view: the refusal's message, no raw block (D6). A `grantPublicAuthwit` window has no History row, as today.
- **Every other screen**: unchanged; the footer default keeps Confirm. #777: none (OA-2).

## Delivery

- Branch `execute-window-2-a1` off `origin/dev`, carrying the plan commit. One PR, `gh pr create --base dev`, title `feat(execute): the window states a refused dapp send, and reject ends it as that refusal` (88). Open it after the gates and the Codex loop, and after D8's merges; no label at creation, then `e2e:extension-network` only if the path filter skips that lane.
- Body: what and why; P42-15 C quoted by id and text; OA-1's words quoted as what ships now; the issue's two corrections; the before and after pictures (both themes) and OA-2's three; the runs with outcomes; the scope-refusal wall-clocks; `Closes #758`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `24c68cb4`. Specific here:
- Step 1 is absent. Step 2 runs once over the arc's diff from its merge base with `origin/dev`, after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1; prompts under `~/.cache/nulo-backlog/execute-window-2/`; hard stop at three rounds; rounds in `lessons/phase-3.md` and the table below.
- Approval boundary (a plan change; stop): the popup naming a refusal, settling at estimate time, recording anything but a `ScopeViolationError`, substituting the refusal on any end but Reject and close, a raw block in queued records, an `OperationCard.vue` edit, any persistence, words beyond OA-1, any #777 change.
- Close-out in the PR's final commits: Outcome; comments on #104, #106 and #575 (reasons above) and on #777 (its pictures); OA-1 filed as an `owner-decision` issue if the PR merges before its answer (D10); lessons promoted only within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`. Teardown after the merge: `agent-worktree done execute-window-2 --merged`; trunk `dev`; `implementations-plan/archive/execute-window-2/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a15056) | conditional approve | I1 rests on payer independence: D7's terminal record, read by both entries and approval; D6 needs the error in `failQueuedForError`; test 2's raw reads fail on the queued path (D6, E2E); Reject's close can win the race (D1, by substitution in `interaction()`); `NULO_E2E_RETRY=0` and the smoke gate | the worker closing the window (D1); holding the words for sign-off before shipping (D10: the orchestrator's instruction) |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the same raw-read failure and title placement; the Reject race; Fact 2 adds the authorization's binding; I1 restated; the README paragraph; the private bit (Security, OA-1 C); `spec.ts` in the table; the T4 stub; focus left alone (D3); the 120 s wait; `git diff --stat` before commits | writing a raw error in queued records (D6: a change to every refusal before a claim); merging only after OA-1's answer (D10); awaiting the RPC before closing (D1) |
| plan 2 | Codex, resumed | conditional approve | none new on D1-D7: the substitution, the approval guard and D6 verified, no regression | a live-session condition on the substitution (D1, Security: an unattended lock ends as the window's own reject; OA-1 C is the control) |
| plan 3 | Codex, resumed | **approve** | the lock-time end stated as accepted policy in D1 and Security | none |
| arc 1 | Opus 5.5 (general-purpose) | conditional approve | the vacuous T1 sub-assertion; every attempt answers the first recorded refusal (`refusalBound`); the comment cap | its conditions are the Phase 3 gates and D10, already in the plan |
| arc 1 | Codex, gpt-6.1-sol (session 01a150a0) | **approve** | T2 and T3 base-red runs recorded (`lessons/phase-3.md`) | none |
| arc 1, after the merge of `dev` | Codex, resumed | **approve** | none new: `confirmHidden` drops #805's two-line Confirm whole; the `fee` slot contract is unchanged | none |
| arc 1, after the second merge | Codex, resumed | **approve** | none new: the queued retitle follows `refusalOf`'s title and call, as execution does | none |

## Seeds

```
/goal Phases 1-3 of implementations-plan/execute-window-2/plan.md marked ✓, each backed by its gate passing in the transcript; LESSONS_FILE lines printed; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one PR against dev closing #758 with its pictures, opened after #795 and p42-followups-1 A1 merged, its close-out archiving the plan; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/execute-window-2 forward per its plan.md and the README § Post-implementation standard at 24c68cb4: run the next gate, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
