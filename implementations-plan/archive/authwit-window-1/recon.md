# authwit-window-1: recon

Base: `origin/dev` at `ea282b7bc`. Two Explore agents (sonnet): a reuse sweep over six capabilities, and a trace of the three discovery paths. The parent checked every claim below against the tree; where an agent's claim did not hold, the line says so. Paths are under `apps/extension/src/` unless noted.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Decode one transaction's authorization requests, refuse the registry, hash per request | `wallet/services/execution/decode-authwit-effects.ts` (`decodeAuthwitEffects`, shared by all three discovery paths since #1552) | adapt: it already reads `onBehalfOf`, then drops any request not naming the signer (`:54`) |
| The record a window renders | `DiscoveredAuthwit` (`packages/wallet-bridge/src/fee.ts:149-160`), built by `toDiscoveredAuthwit` (`wallet/services/execution/discovered-authwit.ts:22-35`) | adapt: one optional field |
| Carry the records to the window, the fee re-ask window and confirm | `TransferFeeEstimate.discoveredAuthwits` (`fee.ts:109`), `OperationAuthwitPreview` (`:164-167`), `PreviewSnapshot.discoveredAuthwits` (`wallet/services/execution/preview-snapshots.ts:30-35`), `FeeQuestion.discoveredAuthwits` (`models/index.ts:106`, `dapp-interaction/spec.ts:154`) | reuse-as-is |
| Hold confirm to what the window listed | `assertWithinPreview` (`preview-snapshots.ts:103-113`) over `discoveredHashes`, a bookkeeping set no path signs from (`dapp-send-executor.ts:509,1061,1183,1217,1382`) | reuse-as-is |
| Decode a record's call into words in the popup | `index.vue:437-462` (`decodeDiscoveredAuthwits`, keyed by message hash), `display-calls.ts:87,100`, `call-surface.ts:168-180` (`authwitTitle`, `authwitLine`), `SendTxSummary.vue:48-58` | reuse-as-is |
| Show a profile account's name for an address | `components/AddressDisplay.vue:64-78`: a contact's name, else the active profile's account name from `appStore.accounts`, else the short address | reuse-as-is |
| A typed refusal the window holds and the dApp gets | `ScopeViolationError` subclasses rebuilt by constant message in `walletErrorFromPayload` (`packages/extension-messaging/src/errors.ts:200-240,702-703`); `refusalKind` / `REFUSAL_REASON` (`popup/windows/execute/refusal.ts`); `holdRefusal` (`index.vue:248-252`); the dApp envelope (`wallet/services/wallet-sdk/error-envelope.ts:226-262`); the journal stage (`mark-failed-unless-cancelled.ts:46`) | adapt: one subclass, one rebuild line, one refusal kind |
| Which accounts a send may read | `sendScopes` (`tx-request-builder.ts:119-126`), `dedupNoFromScopes` (`dapp-send-executor.ts:1516-1531`); the bridge refuses an `opts.additionalScopes` entry outside the session's approved accounts (`packages/wallet-bridge/src/scope-enforcement.ts:80`, pinned by `scope-enforcement.test.ts:149-158` and `wallet-sdk/background.refusal-log.test.ts:73-79`) | reuse-as-is |
| Which witnesses a simulated request carries | `TxExecutionRequest.authWitnesses[].requestHash`; the dApp's witnesses enter as `add_private_authwit` actions (`operation-planner.ts:201-209`, `tx-request-builder.ts:174-191`) or straight into the NO_FROM request (`tx-request-builder.ts:392`) | build new: a two-line hash set; no helper exists (searched `requestHash`, `authWitnesses` under `wallet/`) |
| A record of when and for which app an account signed a private authorization | none | absent: the authwit index (`wallet/services/auth-registry/spec.ts`) holds public grants only, with no origin and no time; `createAuthWit` signs and records nothing (`execution/service.ts:1101-1118`, `packages/wallet-bridge/src/dispatcher.ts:552-575`). Searched `AuthwitIndex`, `authwit-index`, `requestHash`, `createAuthWit` |
| Tests and fixtures | decoder fakes (`decode-authwit-effects.test.ts:12-30`, `discovery-probe.test.ts:27`, `dapp-send-executor.test.ts:67`); real preimage (`authwit-discoverer.real.test.ts`); wire-shaped addresses (`popup/windows/execute/execute.fixture.ts`); the summary (`OperationCard.summary.test.ts`); the refusal (`index.test.ts`); the two-account e2e step (`tests/e2e/network/tx-sendTx-fields.test.ts:58-78`) | reuse-as-is |

## Discovery paths today

| Path | Taken by | Stubbed accounts | Scopes | dApp witnesses in the simulated request |
|---|---|---|---|---|
| Classic (`authwit-discoverer.ts:104-149`) | an op with any `add_private_authwit`, or a fee kind other than `fj`/`fpc` (`discovery-aware-estimator.ts:121-147`) | the sender only (`:131`) | `sendScopes` | yes |
| Folded (`discovery-probe.ts`, `fee/fee-strategy.ts:186-204`) | `fj`/`fpc` with no `add_private_authwit` | the sender only (`:202`) | `built.scopes` | none: an attached witness forces classic |
| NO_FROM (`dapp-send-executor.ts:1351-1387`) | `default_entrypoint` | the op's account only (`:1358`) | `additionalScopes` | yes |

Each stubbed run only reads effects; a validated run follows before anything is approvable or proven (classic: `discovery-aware-estimator.ts:147`; folded: when `requested`, `fee/fee-juice-strategy.ts:41-56`, `fee/fpc-strategy.ts:175-187`; NO_FROM: the real simulation at confirm, `dapp-send-executor.ts:1265-1272`). The stub's `verify_private_authwit` returns valid without reading a witness (upstream `simulated_schnorr_account_contract`).

## What happens today, traced

- **B sends with A's witness attached and A in `additionalScopes`** (the lane's case 1). Classic path. A's real check reads the attached witness and passes; B's stub passes; the token emits a request with `onBehalfOf` = A; the decoder sets `requested` and drops it (`decode-authwit-effects.ts:53-54`). The window lists no authorization. `tx-sendTx-fields.test.ts:68-73` pins exactly that.
- **B sends with A in `additionalScopes` and no witness** (case 2). Folded path for `fj`/`fpc`. The first, stubbed run calls A's real check, which throws `Unknown auth witness for message hash 0x…` from the PXE oracle before any effect is read. The estimate rejects with that plain `Error`; the window shows the toast "Couldn't estimate fee. Try again." (`index.vue:227-232`) and holds Confirm while the fee figure is missing (`fee-figure.ts:52-58`). A confirm reached anyway fails in the same run and the journal records it failed (`dapp-send-executor.ts:367-368`). Nothing names A. `fee/strategies-structural.test.ts:655-689` pins the message for the probe-free path.
- **A send naming an account outside the session.** The bridge refuses an `opts.additionalScopes` entry outside the session's approved accounts before the SW runs anything; a scope the PXE holds no keys for fails as `PxeScopeUnregisteredError` (`packages/aztec-runtime/src/pxe/scope-guard.ts:12-16`). A request on behalf of an address outside the scopes is dropped by the decoder; its own account contract's check runs for real in the validated run.
- **Every dApp `aztec_sendTx` opens the window**: a wallet-sdk session is created at `AccessLevel.Transactions` (`wallet-sdk/discovery-flow.ts:506`), and `isConfirmationNeeded` asks for any operation at or above it (`dapp-interaction/service.ts:867-875`).

## Claims that did not hold

- The lane brief places `decode-authwit-effects.ts` under `popup/windows/execute/`; it is `wallet/services/execution/decode-authwit-effects.ts`.
- The lane brief says the authwit index records silently signed authorizations. It records public grants a send wrote on chain, with no app and no time; no store records a private `createAuthWit` signature, silent or not.
- The lane brief asks for a composition test on the executor's discovery. Discovery simulates and hashes with Barretenberg, which `apps/extension/tests/COMPOSITION-TESTS.md` rules out of that layer (D2, D3, D6). The executor's discovery is proved by its unit tests with injected decode seams, and by the network e2e.
- A recon agent reported that `additionalScopes` are never checked for `aztec_sendTx`. The bridge checks them (`scope-enforcement.ts:80`); the SW trusts them after that, by design (`tx-request-builder.ts:116-118`).

## Collision and dedup risks

- `signable` feeds the build's signatures (`tx-request-builder.ts:174-188`, `dapp-send-executor.ts:1384-1386`) and the probe's `collected` actions; a record the wallet does not sign must never enter either.
- The probe documents `collected` and `discovered` as the same order; a listed-but-unsigned record breaks that pairing, so the comment and any zip must change together (`discovery-probe.ts:37-40`; `discovery-aware-estimator.ts:136` copies both, nothing zips them).
- The reuse key binds a standard send's normalized actions, its carried witnesses included (`operation-fingerprint.ts:16-36`), and the NO_FROM key also binds its scopes (`:205-240`); a standard preview is further bound to its interaction and operation index (`preview-snapshots.ts:79-91`). A reused estimate therefore cannot carry another request's records.
- `#1491`'s pick (P95-07 = B) dropped the line this lane restores for one class of request; the plan keeps its signing half unchanged.
- Open issue `#1571` (six execute-window questions) touches the same window and stays out of scope.
