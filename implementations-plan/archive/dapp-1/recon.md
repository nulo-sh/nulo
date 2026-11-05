# dapp-1: recon

Read at `origin/dev` `13bb2133c` (2026-10-30) by two Explore agents (Sonnet) and the planner. Paths are repo-relative; `ext/` is `apps/extension/src/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| End one pending request, close its window, answer the dApp | `ext/wallet/services/dapp-interaction/service.ts` `rejectInteraction` (storage delete, then `windowManager.cancel` with `WindowEndedError(reason, end)`); `cancelInteractionForJournal` (by journal id) | reuse `rejectInteraction` |
| Learn that an app's session row was deleted (Settings disconnect, expiry, profile purge) | `DappSessionService.onDappSessionDeleted` (emitters in `ext/wallet/services/dapp-session/service.ts`); one subscriber today, `wireSessionTeardown` (`ext/wallet/services/wallet-sdk/session-revocation.ts:94`) | reuse; add a second subscriber in `DappInteractionService.init`, beside its journal subscription |
| Name how a request ended before approval, and classify the record | `WINDOW_ENDS` (`ext/wallet/services/dapp-interaction/window-end.ts`), `WINDOW_END_KINDS` + `queuedFailureKind` (`ext/wallet/services/wallet-sdk/queued-journal.ts:291-321`) | adapt: one end, one row |
| The reading a revoked app's unrun call already gets | `dropUnrunMessage(..., "wallet_refused")` and the identity guard (`ext/wallet/services/wallet-sdk/background.ts:668-678`, `:874-878`): "Refused before sending" | reuse the kind |
| Boot-sweep classification of a lost record | `classifyReapKind` (`ext/wallet/services/operation-journal/reaper.ts:261-265`); the module doc already says the boot sweep files non-proving stages as `stale_on_resume` | adapt one line |
| The restart reading for a record that never sent | `nothingSentLabel` (`ext/utils/journal-state.ts:238-249`): `stale_on_resume` → "Interrupted before sending" / "Your wallet stopped before sending this. Nothing was sent."; card `interrupted` (`:110`) | reuse as is |
| Latest-run-wins fence | `ext/composables/runFence.ts`; the in-file `subscribedHandle` check (`apps/playground/src/lib/wallet.ts:106-108`) | follow the in-file pattern (a counter); the playground imports nothing from the extension |
| Playground test runner | none (`apps/playground/package.json` has no `test`); `bun test` with a `test/tsconfig.json` is the house pattern in `infra/subscribe` | adapt the `infra/subscribe` shape |
| "This request repeats one just approved" (#1382) | nothing: no payload fingerprint, no per-session approval history; `JournalCall` holds contract + arg count only (`ext/wallet/services/operation-journal/spec.ts:117-122`); `getOperations` filters on no session | build new; out of this lane |

Search trail for the absences: `fingerprint|payloadHash|callHash|requestHash|dedupe|idempoten` over `ext/` (non-test); `pg-btn-connect`, `vitest`, `*.test.*` under `apps/playground`; `endSessionRequests|onDappSessionDeleted` over `ext/wallet/services`.

## Facts the plan rests on

- A Settings disconnect deletes the row; `revokeLiveSessions` ends the app's channels; nothing touches `DappInteractionService.storage`, so the open window keeps Confirm live.
- Confirm after it: `approveInteraction` claims, `executeAndResolve` finds no row and throws a plain `Error("Session no longer valid; aborting")` (`service.ts:373-376`); `describeApprovalFailure` flattens it to a string; `handleWalletMessage`'s catch calls `failQueuedForError`; the default arm files `popup_bound` ("Popup closed early"). Pinned today by `service.test.ts` (row-gone abort).
- The dApp's own pending call already rejects: upstream `ExtensionWallet.handleDisconnect` rejects every in-flight request with "Wallet disconnected" (`@aztec-labs/wallet-sdk` 6.0.0, `src/extension/provider/extension_wallet.ts:315-335`).
- `session_ended` reads "Stopped when the wallet locked", so it is wrong for a disconnect. `wallet_refused` is in the GC's `REFUSED_BEFORE_SENDING` class (`ext/wallet/services/operation-journal/gc.ts:56-63`), as the sibling rows already are.
- A restart: `closeRestartEndedTabs` closes the window; the boot sweep fails every `queued` row as `stuck_queued`, which has no interrupted arm, so it reads "Transaction failed" / "Stopped before broadcast … Often balance, fees, or invalid call". `progress.from` is `queued`, so `wasNeverSent` holds.
- `error.kind` is `z.string()` in the sealed journal schema: no stored-shape stamp for a kind change.
- Playground claims of #1381 hold as written (`connect.ts:12`, `:38-43`; `wallet.ts:67-88`). Upstream `DiscoverySession.cancel` aborts and ends the iterator with no wallet, so cancelling alone would still write "No wallet discovered": the run also needs a fence.
- No e2e asserts `stuck_queued`, `popup_bound`, "Popup closed early" or "Stopped before broadcast"; e2e reads `pg-status` `data-status` values and never a disabled Connect.

## Collisions

- Closed limits read: #380 (a queued send lost at a restart is accepted; this lane changes only its reading), #941 (a window created during a restart), #871/#872 (lock and switch readings).
- Open work: none overlaps (`gh issue list --state all --search` on "disconnect window", "stuck_queued", "playground connect", "Popup closed early", "interrupted restart queued"); #83, #828 and #872 are the closed precedents for classifying a pre-send end.
