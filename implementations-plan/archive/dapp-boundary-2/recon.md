# Recon: dapp-boundary-2

One Sonnet explorer (reuse sweep over five capabilities), at dev 13d5f8d0; the planner re-read every load-bearing claim below. Open issues taken in: #670, #673. Closed known limits searched (`registerContract`, `quarantine`, `discovery session`, `chain not supported`): none covers these three paths; #606 and #371 are neighbours, not overlaps.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Typed refusal from the executor that reaches the dApp | `classifyOperationCatch` keeps the code of nine classes (`apps/extension/src/wallet/services/execution/rpc-cancel.ts:95-104`), `InvalidWalletArgumentsError` among them; `unwrapOperationResult` rebuilds it (`packages/wallet-bridge/src/dispatcher.ts:171-187`); the envelope answers `-32602` with a constant message (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts:41,59`). Round trip pinned for `forMethod("executeUtility")` (`rpc-cancel.test.ts:100-165`). | reuse-as-is |
| Complete address from a secret key and an instance | `CompleteAddress.fromSecretKeyAndInstance` / `fromSecretKeyAndPartialAddress` (`@aztec-labs/stdlib/contract`, `dest/contract/complete_address.js:41-55`: `deriveKeys` → `computeAddress(publicKeys, partialAddress)`); the wallet's own account uses it (`packages/aztec-runtime/src/account/nulo-account.ts:103`). The PXE's `registerAccount` reaches the same `fromPublicKeysAndPartialAddress` (`@aztec-labs/key-store` `key_store.js:258-260`). | reuse-as-is |
| Instance address bound to its preimage | `PxeService.registerContract` derives the address and refuses a mismatch before any write (`packages/aztec-runtime/src/pxe/service.ts:433-462`, pinned by `register-contract.test.ts`). | reuse-as-is (the new check relies on it) |
| Chain check at dispatch | `resolveNetwork` throws `ChainNotSupportedError` on an empty read (`dispatcher.ts:1109-1122`); the adapter `dispatcherNetworks` empties the read for a quarantined chain (`apps/extension/src/wallet/services/wallet-sdk/background.ts:226-234`, pinned at `background.unserved-chain.test.ts:341-354`). | reuse-as-is, called once more |
| Rolling back a discovery's row | the expired and abandoned branches of `approveOrRollbackDiscoverySession` (`discovery-approval.ts:41-57`); `DappSessionService.deleteDappSession` emits `onDappSessionDeleted` (`dapp-session/service.ts:382-393`). | adapt (same rollback in the third branch) |

No `build new` row. Search trail for absences: `fromSecretKeyAndPartialAddress` has no caller in `apps/*/src` or `packages/*/src`; no test drives a throw out of `executeAztecRegisterContract` through `executeOperations`; no dispatcher test asserts capability-versus-chain order in one case (searched `ChainNotSupportedError|CHAIN_NOT_SUPPORTED` in `packages/wallet-bridge/src/*.test.ts` and `apps/extension/src/wallet/services/wallet-sdk/*.test.ts`).

## What each method reads today (`packages/wallet-bridge/src/method-descriptors.ts`)

Every network-operation and account-operation method reaches `resolveNetwork` through `buildOperation`. Of the handler-routed ones, `createAuthWit`, `registerToken`, `sendTx` and `grantPublicAuthwit` reach it through `resolveNetworkAndAccount`. These branches never read a network: `getWalletFeatures` (static list); `getAccounts` when an accounts grant holds no account (returns `[]`); `requestCapabilities` with an empty manifest, with every requested type already held and none of them `accounts`, or with a new non-`accounts` type (the window opens and the decision is written); `isTokenRegistered` (token registry read); an empty `batch`. `registerContractClass` is refused at the scope check.

## Conventions and pins to keep

- Dispatch order: known method → arity → batch legs → capability → schema parse → scope → (network inside the handler or `buildOperation`). Pinned at `dispatcher.test.ts:3382, 3494, 3501, ~2996`; `enrichGrantedCapabilities` resolves the network before its `canGet` gate (`:763`). `routeHandlerMethod` returns the handler's own promise (`dispatcher.route.pins.test.ts`).
- `executeAztecRegisterContract` keeps its two existing refusals: `ContractNotRegisteredError` for a missing artifact, and the plain `Error` of `assertArtifactClassId` (`service.class-id.test.ts` asserts the exact class and text). The secret key arrives as wire text: the schema parse at dispatch is a predicate and discards its parsed value (`packages/wallet-bridge/src/wallet-schema-args.ts`), and `PxeService.registerAccount` parses it with `Fr.schema`.
- The executor tests mock `@aztec-labs/stdlib/contract` (`register-contract-void-conformance.test.ts`, `service.class-id.test.ts`; the C2 site passes `secretKey: "0x05"`); real derivation runs in `packages/aztec-runtime/src/pxe/register-contract.test.ts` (`genuineInstance()`) and `stale-anchor.real.test.ts`.
- Discovery rollback tests: `discovery-approval.test.ts:93-112` (not-landed: marker undone, no reject; no assertion on the row) and `background.connect-window.test.ts:399-410` (not-landed: window closed, no marker; no assertion on `h.rows`, unlike the abandoned case at `:412-431`).

## Collisions

- `onDappSessionDeleted` ends every live channel of that `(origin, chainId, profileId)` (`wallet-sdk/session-revocation.ts`, `wireSessionTeardown`). The expired and abandoned branches already trigger it in the same state; while a connect window is open the dedupe guard holds every other discovery of the pair, and a remembered pair never opens a connect window, so no other channel of the tuple was established by this attempt's sibling.
- Lane dapp-boundary-1 edits `dispatcher.ts` for `simulateTx` and `profileTx` (results), plus `background.ts` and `pxe/service.ts`. This lane's dispatcher edit is one statement in `dispatch()`; it touches neither file's other parts.
