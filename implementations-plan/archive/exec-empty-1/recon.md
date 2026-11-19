# exec-empty-1: recon

One Explore agent (sonnet), read-only, at 24d59880f, plus the driver's own reads. Paths are under `apps/extension/src/` unless they name a package.

## The path of a no-account request with no call

Every gate from the dApp to the build lets an empty call list through. #1728's path holds.

| Gate | What it does with `calls: []` |
|---|---|
| aztec.js `ExecutionPayloadSchema` (`@aztec-labs/aztec.js` 6.0.0, `dest/wallet/wallet.js:23`) | `calls: z.array(FunctionCall.schema)`, no minimum: passes. |
| Bridge schema parse (`packages/wallet-bridge/src/wallet-schema-args.ts`, called at `dispatcher.ts:234`) | Parses against a copy of `WalletSchema`; no count rule: passes. |
| Scope checkers (`packages/wallet-bridge/src/method-scope-checkers.ts:109`, `:144`) | `if (calls.length === 0) return`: passes on purpose. |
| `handleSendTx` (`packages/wallet-bridge/src/dispatcher.ts:493-511`) | Sets `executionMode: "default_entrypoint"` for `from: "NO_FROM"`, keeps `opts.from` as the sentinel; no count check. |
| Extension ingress, dApp-interaction service and spec | No emptiness check; `queued-journal.ts` reads the calls only for a title. |
| Window init (`popup/windows/execute/index.vue:388`) | Schedules the authorization preview for every default-entrypoint operation. |
| `ExecutionService.previewOperationAuthwits` → `dapp-send-executor.ts:581-594` → `prepareNoFrom` (`:1320`) → `TxRequestBuilder.buildNoFrom` | No count check before the build. |
| `buildNoFrom` (`wallet/services/execution/tx-request-builder.ts:439-489`) | `refuseSeveralNoFromCalls` (`:134-138`) refuses only `> 1`. The empty list then reaches the network, the node info, the PXE registrations and the resolver before `resolveNoFromCall` (`:398-400`) throws the plain `Error("DefaultEntrypoint requires exactly 1 call, got 0")`. |

The window's preview `onError` (`index.vue:311-313`) asks `holdRefusal` (`:264-268`), which asks `refusalKind` (`popup/windows/execute/refusal.ts:17-26`). A plain `Error` has no kind, so the window opens "Couldn't preview authorizations. Try again." and keeps Confirm. `ExecutionService.refusalBound` (`wallet/services/execution/service.ts:823-834`) records only a `ScopeViolationError` or an `isDefaultEntrypointRefusal`, so every retry runs the build again and fails the same way.

## What a new sibling class must join

- `packages/extension-messaging/src/errors.ts`: the classes (`:446-467`), the `DefaultEntrypointRefusal` union (`:475`), `isDefaultEntrypointRefusal` (`:480`), `REBUILT_AS` (`:766`, the three siblings at `:790-792`).
- Consumers of the predicate or union, which then need no edit: `service.ts:830` (records the refusal), `mark-failed-unless-cancelled.ts:49` and `wallet-sdk/queued-journal.ts:322` (`wallet_refused`), `dapp-interaction/spec.ts:110` (`RecordedRefusal`).
- `popup/windows/execute/refusal.ts`: the `RefusalKind` union, `refusalKind` and `REFUSAL_REASON`, which tests each class by `instanceof`.
- `error-envelope.ts:127` classifies only `ScopeViolationError`; every default-entrypoint class falls to `UNCLASSIFIED_ERROR_MESSAGE`, which is the answer the dApp gets today.

## Reuse

No class, code or helper for an empty call list exists in `packages/` or `apps/extension/src` (searched `no ?calls|empty ?call|NoCall|zero calls|calls.length (===|<|==) 0|at least one call`). The only matches are the scope checkers' vacuous passes and two post-build lookalikes (`execution/fast-path.ts:90`, `execution-lane.ts:686`). The shape to copy is `DefaultEntrypointMultiCallError` (`errors.ts:460-467`): a constant message, no details.

## The sibling (#1727) as evidence

Commit ca5b1da84 added the utility and several-calls classes, the predicate and the union, and one row in each pinned table: `errors.test.ts` (wire table and two-hop), `tx-request-builder.pins.test.ts`, `service.refusal.test.ts`, `mark-failed-unless-cancelled.test.ts`, `queued-journal.test.ts`, `error-envelope.test.ts` (direct and rethrown), the window's `index.test.ts` preview table. It added no e2e: the network spec's public-call scenario (`tests/e2e/network/tx-sendTx-noFrom.test.ts`) already drives the shared refusal path end to end. Its captures came from temporary, uncommitted playground sends and spec steps through `shotSend` (`tests/e2e/fixtures/shots.ts`, both themes under `NULO_E2E_SHOT_DIR`, Chrome only).
