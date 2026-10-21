# dapp-boundary-4 recon

Read at `origin/dev` `ad4de50d8` by two Explore agents (sonnet) and the planner. Paths are repo-relative. `B` = `packages/wallet-bridge/src`, `X` = `apps/extension/src/wallet/services`, `R` = `packages/aztec-runtime/src`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Session accounts of this chain at dispatch | `B/dispatcher.ts` `getSessionAccountAddresses(dappSession, chainId)` (raw hex from the CAIP-10 entries); `B/capability-negotiation.ts:284` `sessionAccountsOf` (both spellings, for scope checks) | reuse-as-is (`getSessionAccountAddresses`) |
| Carry it to the executor | `B/operation.ts:118-122` `AztecGetContractMetadataOperation {kind, networkId, address}`; built only by `B/dispatcher.ts:1006-1007` `buildNetworkOperation` | adapt: one readonly field, one builder argument |
| The profile's accounts on a chain, hidden ones included | `X/account/service.ts:241` `getAccounts(profileId, chainId, all?)`; already injected into `ViewExecutorDeps` (`view-executor.ts:68`) | reuse-as-is with `all = true` |
| A node-only contract lookup | `NetworkService.getNodeForUrl(url)` on the network row's primary endpoint, then `node.getContract(address)`; the PXE cascade `R/pxe/service.ts:294-339` (PXE → node → known bundle) cannot give a node-only answer | reuse `getNodeForUrl`; no new PXE seam |
| A node-only class lookup | `AztecNode.getContractClass(id)` (stdlib `interfaces/aztec-node.d.ts:386`). No caller in `apps/` or `packages/` (grep `getContractClass(`) | build new: one call in the executor |
| Bind a registration's artifact to the original class | `R/pxe/artifact-class-id.ts:92-100` `assertWireArtifactClassId(instance, artifact)`: schema parse, current = original, artifact hashes to the original; every failure is `Error(CLASS_ID_MISMATCH)`. Only caller today: `X/account-state/service.ts:457`. It takes wire forms only: `ContractArtifactSchema` refuses a parsed artifact | adapt: split its parsed-form core into an export the dApp path calls |
| PXE-seam refusal of current ≠ original | `R/pxe/service.ts:422-451` throws `Error("registerContract address mismatch: …")` before any write; `R/pxe/effective-class.ts:33-42` `assertNotUpgraded` throws `ContractUpgradedError`, whose doc defines it as a node answer | adapt: a sibling plain `Error` beside the address check, not `assertNotUpgraded` |
| Class gate | `R/pxe/public-events.ts:440-466` `resolveTokenClassStatus` | adapt: add the `originalContractClassId` comparison |

## Facts by area

**Metadata op.** `getContractMetadata` is a `network-operation` (`B/method-descriptors.ts:198-203`); its scope check is `checkGetContractMetadata` (`B/method-scope-checkers.ts:81`); the executor is `X/execution/view-executor.ts:160-208`. The result goes to the dApp unprojected (`X/wallet-sdk/background.ts`). `isTokenRegistered` is a handler route over the token rows and reads no PXE store (`B/dispatcher.ts:328-333`, `background.ts:255-260`). Upstream `BaseWallet.getContractMetadata` takes publication and upgrade fields from one `aztecNode.getContract(address)` for every address (`@aztec-labs/wallet-sdk` `dest/base-wallet/base_wallet.js:467-495`). A node pinned to a network row's own endpoint comes from `NetworkService.getNodeForUrl` (`X/network/service.ts:1011-1017`), as `AuthRegistryService.nodeFor` does.

**Class metadata op.** `executeAztecGetContractClassMetadata` (`view-executor.ts:149-158`) sets both flags from a `pxeOnly` artifact read. Upstream takes `isContractClassPubliclyRegistered` from `aztecNode.getContractClass(id)` and `isArtifactRegistered` from the PXE (`base_wallet.js:496-502`). aztec.js `DeployMethod` uses the first flag to decide whether to publish the class.

**Accounts.** Accounts are hidden, never deleted by a user flow; rows leave only by chain purge (`clearChainState`), keyless-import reconcile (`reconcileImportedAccounts`, a data-integrity path) and profile deletion (grep `deleteAccount|removeAccount`: none).

**Registration.** `executeAztecRegisterContract` (`X/execution/service.ts:1222-1277`) parses the instance, returns early for protocol addresses 0-6, takes the dApp's artifact or looks one up by class id, binds an optional secret key, registers the account under the tagging bound, then calls `PxeService.registerContract`. The dApp-facing refusal is the plain `Error(CLASS_ID_MISMATCH)`, pinned by `X/execution/service.class-id.test.ts`. The executor imports aztec-runtime helpers through the barrel `R/pxe/index.ts`. Every `PxeService.registerContract` caller passes an instance from the wire (guarded), from the PXE (hydrated current := original, `R/pxe/effective-class.ts:28-30`) or from the node (refused when upgraded, `R/pxe/service.ts:324`); none passes current ≠ original by design.

**Class gate.** Callers: `PxeService.getPublicTokenClassStatus` (`R/pxe/service.ts:694-703`) → `X/incoming-transfer/service.ts:397`. The function doc (`public-events.ts:421-439`) and the type doc (`:101-105`) describe the gate.

## Tests and specs to match

- `X/execution/view-executor.test.ts:60-112` harness (fakes cast `as never`; the node fake has only `getNodeInfo`, the account fake only `getAccountContract`); metadata cases `:265-306`; no class-metadata case.
- `B/dispatcher.test.ts`: no op-shape pin for the metadata kinds (`h.ran` records kinds).
- `R/pxe/register-contract.test.ts`: real `PxeService` over a fake PXE, `writes` array, real `NuloAccount` instances.
- `X/execution/service.class-id.test.ts`: mocks `@aztec-labs/stdlib/contract` at the module boundary; its fake instance has no `originalContractClassId`, so it changes with the wire binder.
- `R/pxe/public-events.test.ts:407-467`: the `makeNode` fake returns `{currentContractClassId}` only.
- Network e2e that drive the touched ops: `contracts-getMetadata`, `contracts-getClassMetadata`, `batch-mixed`, `contracts-register`, `public-events-capability` (all under `apps/extension/tests/e2e/network/`). The playground calls both metadata methods (`apps/playground/src/sections/contracts.ts:43-65`).

## Collisions

None with the leads running on this host (popup shell, backup pages, operation journal, e2e harness). `OperationCard.vue:528-533` renders only `op.address` for the metadata kind, so a new op field reaches no screen. Closed known limits read: #965, #966, #967.
