# authwit-onbehalf-1: recon

Base `c4173bb8e` (origin/dev). One Sonnet reuse sweep plus the planner's own reads. Paths are under `apps/extension/` unless noted.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The decode loop the three discovery paths share | `src/wallet/services/execution/decode-authwit-effects.ts:31-50`; callers `authwit-discoverer.ts:139`, `discovery-probe.ts:62`, `dapp-send-executor.ts:1439` | adapt: one `signer` parameter, one filter inside the loop |
| The decoded request's structural type | `discovered-authwit.ts:13-18` (`innerHash`, `msgSender`, `functionSelector`, `args`; no `onBehalfOf`) | adapt: add `onBehalfOf` |
| The upstream field | `@aztec-labs/aztec.js` `CallAuthorizationRequest.onBehalfOf`: "the account that must sign the authorization", the third field `fromFields` reads; `innerHash` binds `msgSender`, selector and args only, never `onBehalfOf` | reuse as is |
| Address equality | `.equals` on `AztecAddress` (`service.ts:1319`); elsewhere in the execution services `toString()` equality. No `sameAddress` helper (searched `sameAddress\|addressEquals\|addressesEqual\|isSameAddress` in `apps`, `packages`) | reuse: `toString()` equality of two canonical `AztecAddress` strings |
| The account each path signs as | classic: the build's `account` (`authwit-discoverer.ts:103-106`); folded: `built.account` at the three probe calls (`fee/fpc-strategy.ts:175,234`, `fee/fee-juice-strategy.ts:41`; `FeeEstimate extends BuiltStandardTx`, `tx-request-builder.ts:81-85`); NO_FROM: `d.account` (`dapp-send-executor.ts:1456-1458`) | reuse |
| Preview and confirm agreement | `assertWithinPreview` (`preview-snapshots.ts:103-114`) is a subset check over hashes; `enforcePreview` (`dapp-send-executor.ts:679-692`). Preview and confirm run the same decoder | reuse; no change |
| Code reading `onBehalfOf` today | none (searched the repo outside `node_modules`); only `authwit-discoverer.real.test.ts:41-51` builds it, as `0xabcd`, beside an account `0xacc0` | build new (the filter) |
| Decoder fakes | `decode-authwit-effects.test.ts:10-19`, `discovery-probe.test.ts:25-33`, `authwit-discoverer.test.ts` (module fake), `dapp-send-executor.test.ts:63-71` (`vi.mock` of `fromFields`, serves all three paths). None has `onBehalfOf` | adapt: each fake names the test's sending account |
| Probe ctx pin | `fee/strategies-lifecycle.test.ts:368-371` reads `chain.node`, `chain.network` | adapt: also `chain.signer` |
| The window | `src/popup/windows/execute/SendTxSummary.vue:121-126` (one `execute-discovered-authwit-line` per record), call line `:78-93` (`execute-op-call-line`, `data-sender-kind`). Component tests: `OperationCard.summary.test.ts` (wire-shaped fixture, `tokenCall` helper `:83-99`, sender test `:388-400`), `OperationCard.discovered.test.ts` | reuse; no component change |
| The e2e scenario | `tests/e2e/network/tx-sendTx-fields.test.ts:50-67` drives #1491's exact situation (`pg-btn-sendTx-onBehalf`, `apps/playground/src/sections/transactions.ts:150-172`): B sends with A's witness and A in `additionalScopes`, `wait: "NO_WAIT"`, asserts a hash only. The pre-attached witness routes the estimate through classic discovery (`discovery-aware-estimator.ts:115-117`) | adapt: window assertions and a receipt |
| e2e helpers | `waitForExecuteApprovable` (`fixtures/popups.ts:399`), `waitForExecuteContent` (`:502`), `waitForTxMined` (`fixtures/aztec.ts:843`, waits for PROVEN) | reuse |
| Folded-path control | `tx-sendTx-delegated-authwit.test.ts:74-110`: folded discovery finds the donor's own pull authwit (on behalf of the sender) and counts one row | reuse as the never-dropped control |

## Open work and collisions

- #1491 (open, `ux`, `owner-decision`) is the lane's issue; its decision comment records B.
- Closed known limits searched (`authwit discovery`): #999 (a cancel during the discovery build) is unrelated.
- The archived `exec-dapp-1` plan deferred this filter as D10 and OA-1; its I4 is the trace #1491 restates.
- No other open issue names `onBehalfOf` or the discovered line.
