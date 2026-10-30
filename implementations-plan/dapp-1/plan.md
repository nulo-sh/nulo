---
plan: dapp-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev 13bb2133c
issues: "#1381, #1383, #1384 (closed by the arc); #1382 (the owner's question)"
---

# dapp-1: what a dApp request reads after a disconnect or a restart, and the playground's connect race

A Settings disconnect leaves the app's open approval window live, and Confirm there records "Popup closed early" (#1383). A request a restart ends before Confirm reads "Transaction failed", blaming fees (#1384). The playground lets a superseded Connect overwrite a newer connection (#1381). One arc, one PR against `dev`. #1382 stays open as the owner's question.

## Issue map (claims checked at `13bb2133c`; detail in `recon.md`)

- **#1383** holds, for a capabilities window too. The dApp's own call already rejects ("Wallet disconnected", upstream `handleDisconnect`); only the wallet side is wrong.
- **#1384** holds. The boot sweep is the only producer of `stuck_queued` at a restart; every other non-proving stage gets `stale_on_resume`, as the reaper's header says.
- **#1381** holds as written. Cancelling the old discovery alone still throws "No wallet discovered" (upstream `cancel` ends the iterator empty), so the run needs a fence too.
- **#1382** is not a one-line add: no request fingerprint and no per-app approval history exist (`JournalCall` is contract + argument count). The question goes on the issue; the execute window does not change.

## Outcome & Quality Bar

For a person who disconnects an app mid-request, or whose wallet restarts with a request open, and later reads History; and for a lab or e2e run driving the playground.

- **Excellent:** every row a disconnect ends reads like its siblings ("Refused before sending"), and no window stays to offer a Confirm that cannot work. A restart's row reads "Interrupted before sending … Nothing was sent", like every other stage a restart ends. The latest Connect press owns the playground's status.
- **Good enough:** no new copy and no new kind. A fee question of an approved send stays open (D3, owner ask OA-1).

## Assumptions

Facts:
1. `rejectInteraction` deletes the record before `windowManager.cancel`, which removes the window (`dapp-interaction/service.ts:309-321`; `window-manager.ts:160,236`); a later page reject is a storage miss.
2. `onDappSessionDeleted` carries the deleted row (`profileId`, `chainId`, `dappMetadata.url`; the purges emit its self-reported `id`, `dapp-session/service.ts:494-536`); `onVerificationRefused` carries the same tuple; `payload.session` of execute, capabilities and fee payloads is a row snapshot.
3. A revoked app's unrun calls already fail as `wallet_refused` (`background.ts:145`, `:706`, `:877`; asserted by e2e `verify-hold`).
4. `WINDOW_END_KINDS` maps a `WindowEndedError`'s end to the row's kind (`queued-journal.ts:291-318`); `wallet_refused` retitles the row "Transaction" (`:267`, `:287`) and is GC-evictable (`gc.ts:56-69`).
5. `classifyReapKind` files `queued` as `stuck_queued` in both sweeps (`reaper.ts:261-265`); `wasNeverSent` holds for `from: queued` (`operation-journal/spec.ts:300-304`), and `stale_on_resume` then reads "Interrupted before sending" (`journal-state.ts:243-245`; today pinned only from `simulating`, `journal-state.test.ts:527-533`).
6. `error.kind` is an open string in the sealed journal schema: no stored-shape stamp.
7. The playground has no test runner; `infra/subscribe` runs `bun test` with `@types/bun` 1.4.2 and a `test/tsconfig.json`.

Inferences:
- I1. `DappInteractionService` subscribes before the wallet-sdk teardown (`runtime.ts:285`, `:305`), so the window ends before the channel; the reply is dropped after termination (`live-session.ts:30-34`). Either order yields the same row.
- I2. Declaring `@types/bun` 1.4.2 re-gates the playground's tree on publish age; Aztec 6.0.0 cleared the 7-day gate on 2026-10-29, so the install passes. The `bun.lock` change also puts `bun audit` in enforce mode for this PR. Phase 3 proves both.

Asks: OA-1 (`OWNER-ASKS.md`, the fee question after a disconnect; arc 1 does not touch that window). #1382 goes to the owner on the issue.

## Architecture & Implementation

**#1383.** `WINDOW_ENDS` gains `"disconnect"`, mapped to `wallet_refused`. `DappInteractionService.init` subscribes to `onDappSessionDeleted` and `onVerificationRefused`, the same two events `wireSessionTeardown` ends channels on. Each ends, synchronously, every stored interaction whose `payload.session` names the event's app (origin, chain id, profile: the tuple `revokeLiveSessions` matches) and that is not a fee question. It iterates a snapshot of `storage` and skips an event with a missing field. The end runs `rejectInteraction`'s body (storage delete, then `windowManager.cancel` with `WindowEndedError(APP_DISCONNECTED, "disconnect")`), extracted as a private method so no promise is dropped. After registration, `interaction()` re-reads the row of a session-bearing, non-fee payload once, fire-and-forget, as `reconcileCancelledJournal` does: a deletion between the request's own row read and its registration ends it the same way. A missing read proves a deletion only under a live session of the row's profile, since a locked or switched profile also reads `undefined` (`dapp-session/mac-storage.ts:105-111`). So the re-read captures `captureExecutionFence()` first, leaves the window to its own guard when that throws or names another profile, and ends it only when the row is absent and `isFenceLive(fence)` still holds after the read (`profile/service.ts:684-728`). `executeAndResolve`'s `!liveSession` (a Confirm claimed before the delete) throws the same end under the same test on `authorizedFence`; otherwise, and for the profile-mismatch disjunct, it keeps its plain `Error`. `describeApprovalFailure` keeps that class, logged at `debug`. `validateSession` is unchanged. `APP_DISCONNECTED` is a developer line (`journal/[id].vue` shows `error.message` in developer mode only).

**#1384.** `classifyReapKind` files `queued` as `stuck_queued` on the periodic tick only; the boot and unlock sweeps file it `stale_on_resume`. A `queued` row may hold an approved send waiting for its slot; it still sent nothing, since broadcast follows the committed `submitting` stage (`execution/execution-coordinator.ts:346-353`).

**#1381.** `connect()` takes a run number; a new press supersedes the run before it and cancels its discovery. The provider and pending connection stay local until the run is current at its end. After each await a superseded run writes no state and no module global, cancels its own pending connection if it holds one (`PendingConnection.cancel`; `confirm()` resolves at once), and swallows its error, so the click handler sees only the current run's failure. Connect stays enabled while discovering: the second press is how a person recovers from the wallet's silence (#330).

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/dapp-interaction/{window-end,service}.ts` | end, subscribers, re-read, typed row-gone throws, `describeApprovalFailure` |
| `apps/extension/src/wallet/services/wallet-sdk/queued-journal.ts` | `disconnect: "wallet_refused"` |
| `apps/extension/src/wallet/services/operation-journal/reaper.ts` | boot-sweep classification, doc comments |
| `apps/extension/src/wallet/services/dapp-interaction/{service,service.composition}.test.ts`, `wallet-sdk/queued-journal.test.ts`, `operation-journal/reaper.test.ts` | tests; `onDappSessionDeleted` + `onVerificationRefused` on the three service-starting stubs (`service.composition.test.ts:79`, `service.test.ts:620`, `:902`) |
| `apps/playground/src/lib/wallet.ts`; `apps/playground/{package.json,test/}` | run fence; `bun test`, `@types/bun` 1.4.2, `test/tsconfig.json`, `test/connect.test.ts` |
| `CLAUDE.md` | three sites name the playground's `bun test`: the runner sentence (Working in this repo), the bump inventory, the `@types/bun` pin list |

Alternatives not taken: a kind `app_disconnected` (new copy; siblings already read `wallet_refused`); `SessionEndedError` (reads "the wallet locked"); a `stuck_queued` interrupted arm in `journal-state.ts` (D4); disabling Connect while discovering (blocks the recovery press); `cancel` without a fence (still writes the error).

## Security & Adversarial Considerations

- **Threat model:** a dApp controls its calls, not the row tuple; the subscribers match the wallet-held tuple, so a dApp cannot end another app's request, and only a row deletion or a refused check (a person, an expiry, a purge) triggers them. `rejectInteraction` accepts `"disconnect"` from wallet pages only; any wallet page can already reject any known interaction id with any end, unchanged.
- **Fail closed:** ending a request removes authority. The `onVerificationRefused` twin also closes a refused app's window when its row delete fails (`dapp-session/service.ts:447-452`), where Confirm would otherwise pass the row check.
- **Logging:** ids through `describeExternalId`, never an origin; the expected disconnect end at `debug`.
- **Supply chain:** `@types/bun` 1.4.2 is already locked; frozen install; `bun audit` enforces on this PR. Crypto, least privilege, CI tokens: N/A.

## UI impact

The owner, 2026-10-30: "#1381–#1395 => yes, if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed on Monday."
- **Execute and capabilities windows:** a disconnect, or a refused check whose rows stay, closes them (today they stay with Confirm live). No text changes.
- **History row and page, disconnect:** "Transaction failed" / "Popup closed early" → "Refused before sending" / "The wallet refused this request before anything was signed. Nothing was sent." (existing copy). As every `wallet_refused` row, the title becomes "Transaction" (its call dropped), as the app's other refused calls already read, and the row joins the refused rows' GC cap.
- **History row and page, restart before Confirm:** red "Transaction failed" / "Stopped before broadcast … Often balance, fees, or invalid call." → amber "Transaction was interrupted" / "Interrupted before sending … Nothing was sent." (existing copy); Reason row "Stuck queued" → "Stale on resume". Rows stored before the change keep their reading.
- Playground: the latest press owns `pg-status`.
- Captures: History and the journal page for each before and after record, Chrome, light and dark, in `screenshots/`, linked from the PR body at the head SHA.

## Phases (arc 1)

Each phase lands its test red first, on its own commit, then the fix.

### Phase 1 — a disconnect ends the app's pending requests (#1383)
- `service.composition.test.ts`: the DappSession stub gets real `EventHandler`s and a settable row. Case A: open an execute and a capabilities request of the app, emit the row's deletion; both windows removed, both calls rejected with `WindowEndedError` end `disconnect`, `failQueuedForError` files `wallet_refused`. Case B (table, control): a deletion on another chain, of another profile, and a fee question of the app; each window stays, the record stays `queued`. Case C: park `execute()` at the profile gate, delete the row, release; the window is removed after registration. Case C' (control): the same with the profile locked during the re-read; the window stays for its lock guard. Case D: a refused check with no delete closes the window. Keep the late-reject assertion (`:168`).
- `queued-journal.test.ts`: row `disconnect` → `wallet_refused`, title `Transaction`. `service.test.ts`: the row-gone pin expects `WindowEndedError` end `disconnect`; the profile-mismatch pin keeps its plain error.
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/dapp-interaction src/wallet/services/wallet-sdk --retry=0`. Pass: exit 0; cases A, C, D red on the test commit.

### Phase 2 — a restart reads as interrupted (#1384)
- `reaper.test.ts:124`: expect `stale_on_resume`, `journalTerminalDisplay(...).state === "interrupted"` and `categoricalLabel(...).label === "Interrupted before sending"` on the reaped row. The periodic pin (`:90`) stays `stuck_queued`.
- **Gate:** lint, typecheck:all, `cd apps/extension && bun --bun vitest run src/wallet/services/operation-journal src/utils/journal-state.test.ts --retry=0`. Pass: exit 0; red on the test commit.

### Phase 3 — the playground's latest Connect wins (#1381)
- `apps/playground/test/connect.test.ts` (`bun:test`, `mock.module` on `@aztec-labs/wallet-sdk/manager`; the mock's `cancel` ends its iterator at once, as upstream). Case 1: run 1 waits, run 2 connects, run 1's discovery ends empty; run 1 settles without error, its `cancel` was called, `status` stays `connected`, and the module's provider and wallet are run 2's. Case 2: run 1 superseded during `establishSecureChannel`; its pending connection is cancelled, run 2's state untouched. Case 3 (control): a lone run whose discovery ends empty rejects with "No wallet discovered".
- `"test": "bun test"`, `@types/bun` 1.4.2, `test/tsconfig.json`, typecheck of `test/`; `bun install`, then `bun install --frozen-lockfile`; the three CLAUDE.md sites.
- **Gate:** lint, typecheck:all, `cd apps/playground && bun test`, `bun run test:all`, `bun run test:ci-gating`. Pass: exit 0; cases 1 and 2 red on the test commit; the frozen install passes.

### Phase 4 — e2e and captures
- Network e2e at retry 0, Chrome then Firefox (`NULO_E2E_BROWSER=firefox`), from the repo root, one run at a time:
  - prover on: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/{tx-sendTx-default,tx-sendTx-reject,concurrent-sendtx-approve,connect-check-window,connect-verify-mismatch,connect-deny,connect-unserved-chain,connect-locked-queue,session-reconnect,verify-hold}.test.ts`;
  - proverless: the same with `NULO_E2E_PROVERLESS=1` on `lock-cancels-dapp-send` and `inflight-call-background-death`.
- Smoke at retry 0, both browsers: `cd apps/extension && bun run test:e2e -- tests/e2e/send-outcome-rows.test.ts tests/e2e/rows.test.ts --retry=0`. No new e2e scenario: the composition, reaper and playground tests hold every failure in-process.
- Captures: a throwaway smoke spec, never committed, seeds the four records with `seedJournalRecord` (before: `popup_bound` keeping its call title, `stuck_queued`; after: `wallet_refused` retitled, `stale_on_resume`; each failed from `queued`) and shoots History and each journal page.
- **Gate:** every run green at retry 0; `bun run audit:vue`; `bun run test:all`; `bun run check:plans` after staging.

## Decision ledger

- **D1** `wallet_refused` for a disconnect: what every other call of a revoked app already gets, so one disconnect reads the same on every row. Rejected: `user_rejected` (the person rejected no request), a new kind (new copy). Codex and Opus agree.
- **D2** The subscribers live in `DappInteractionService.init`, beside its journal subscription; `wireSessionTeardown` keeps owning channels.
- **D3** A fee question stays open. Codex: its send is approved, and excluding it keeps the approval boundary. Opus: it is a new consent, so Accept would broadcast at a higher fee for a disconnected app. Ending it changes what an approved send does and how its row reads, so it is the owner's: OA-1. Arc 1 ships the exclusion.
- **D4** Only the boot and unlock sweeps change: the periodic `stuck_queued` reading is not in the issue, and its path is unverified.
- **D5** The gap between the request's row read and its registration is closed by one fence-checked re-read after registration (Codex: the capabilities path awaits token reads there, so the gap is real); rejected: a known limit, since `reconcileCancelledJournal` is the house pattern. Opus proposed the same end for `validateSession`'s missing row; dropped in the final pass, since that read cannot tell a deletion from a lock and the request holds no fence there.
- **D9** Known limit, filed and closed at close-out (Codex final, Opus): a deletion inside a request's admission, before `validateSession`, reads "Popup closed early"; and a refused check whose row delete fails, landing wholly inside a request's registration gap, leaves that window live with its row. Each needs an event inside one request's own awaits; the second also a failed storage delete. Closing either needs revocation state (a tuple tombstone), which this lane does not add.
- **D6** `bun test` over vitest for the playground: Bun-native, no vitest config or DOM shim, the house pattern of `infra/subscribe`.
- **D7** A superseded playground run cleans up only its own pending connection, never through the module's `provider`, which may be the newer run's.
- **D8** `onVerificationRefused` is subscribed too (Opus): it mirrors `wireSessionTeardown`, adds no state, and covers a refusal whose row delete fails.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve. Adopted: D5 re-read; superseded-handshake cleanup (D7); proverless split and smoke runs; capabilities, chain, profile and fee controls; stubs; the dApp gets "Wallet disconnected", not a 4001; no dropped promise. Confirmed: D1, tuple key, D4, `bun test`.
- **Opus round 1** (Plan agent): conditional approve. Adopted: retitle and GC class in UI impact; the three stubs in the map; `verify-hold`, `connect-verify-mismatch`, `connect-locked-queue`; fee control and Phase 3 assertions; backstop only on `!liveSession`, logged at `debug`; D8; the `validateSession` site; the pin fact corrected; I2 reworded with `bun audit`; three CLAUDE.md sites. Raised to the owner: D3 (OA-1). No finding rejected.
- **Codex final** (resumed): conditional approve. Adopted: absence counts as a deletion only under a live fence (re-read and backstop), `validateSession` unchanged, D9. Confirmed: expiry re-entrancy safe, D7, the e2e selection, OA-1.
- **Codex verify** (resumed, 2026-10-30): `approve`. The fence-checked re-read and backstop resolve its conditions; D9 bounds the rest; nothing reopened.

## Delivery

One arc, single PR from `worktree-dapp-1` to `dev`, title `fix(dapp): a disconnect ends its requests, a restart reads interrupted, latest connect wins` (≤ 92 chars). Body: what and why, the UI impact with the owner's words and the captures, the runs, `Closes #1381`, `Closes #1383`, `Closes #1384`, `Part of #1382`. No labels at creation; `e2e:extension-network` only if the path filter skipped it. The close-out lands as the PR's final commits. No lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `13bb2133c` binds. Here: `code_review: off`; the loop runs `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff 13bb2133c...HEAD`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus diff review beside round 1. Close-out: the Outcome, D9's closed `known-limit` issue, a comment on #1382, `STATUS.md` deleted, `git mv` into `archive/` in its own commit. Teardown after the merge: `agent-worktree done dapp-1 --merged`.

## Seeds (orchestrator-owned; not run)

- `/goal` Phases 1–4 of implementations-plan/dapp-1/plan.md marked ✓, each gate's output in the transcript; the Codex loop converged; the PR open against `dev` with the close-out commits; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/dapp-1 forward per its plan.md: reality check, next unticked phase, its gate, the loop at the end, Delivery; never merge.

Size: about 145 lines, under the light target.
