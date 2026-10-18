# Recon: send-fixes-1

Base: `origin/dev` at `24c68cb4`. Three Explore agents (sonnet) plus the planner's own reads; every line below was checked against the tree.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Re-ask sheet button label (P42-05) | `SendReviewSheet.vue:65-68` `submitLabel`; fee line `:165` already reads "Fee is now {now}, above the {cap} you accepted." | adapt (one branch) |
| A typed error that survives the worker→popup hop | `WalletError` subclasses + `REBUILT_AS` (`packages/extension-messaging/src/errors.ts:586`); row table in `errors.test.ts` | adapt: one class |
| A bounded, single-attempt identity read | `NetworkService.probeIdentityOnce(rpcUrl, kind, timeoutMs)` (`network/service.ts:953`), used by the reset with `RESET_NODE_PROBE_MS = 5_000` (`network-reset/spec.ts:18`) | reuse as-is |
| The start's account step | `useProfileBootstrap.initAccount` (`:167-181`), `network-switch.ts` `loadAccounts` (`:62-80`) | adapt (catch one type) |
| Header chip + inactive dot, account skeleton | `Header.vue:211-238`, `header-account.ts:17-20` (`"loading"` when no account on the network) | reuse as-is |
| The reset's saved copy of imported keys | journal `nulo:core:network-reset@<profile>` (`stale-network/repository.ts:22`), entries `{type:1, name, oldAddress, newAddress, encryptedSigningKey}` sealed under `(toChainId, newAddress)` (`account/service.ts:454-478`) | reuse (read only) |
| Unseal a journal key | `recreateImportedForReset` (`account/service.ts:403-430`): DEK, `unsealImportedScalar(dek, toChainId, newAddress, key)` | adapt: the password DEK |
| Account-file export | `AccountService.exportAccount` (`:631-672`): `exportPlain` password gate, `exportImportedKeysDek(profileId, password)`, `buildAccountExport`, `encryptAccountExport` | adapt: shared tail |
| Export page | `settings/security/export/account.vue` (picker → agree → password → create → protect → download) | adapt (picker source) |
| Takeover paused screen | `StaleNetworkTakeover.vue:98-114` `SCREENS.paused`; copy in `stale-network/copy.ts:59-72` | adapt (one action) |
| A route the paused takeover yields to | `stale-takeover.ts` `YIELDING` includes `/security\/export/` | reuse as-is |
| Smoke e2e seed: an active custom network on a dead node | `tests/e2e/helpers/stale-network.ts:217` `addNetwork` (`DEAD_NODE`, `active`, no account) | reuse as-is |
| A refused-at-send outcome (#112) | none: `failedFrom` records a refusal as `failed` from `submitting` with a hash (`operation-journal/service.ts:647`), and `SendCheck` checks it (`send-check.ts:166-178`). "Refused by the network" exists in no source file (grep over `apps`, `packages`) | not built (OA-1) |

## Findings by issue

### #112
- The only `node.sendTx` is `execution-coordinator.ts:299`; a refusal is rethrown unclassified, except `existing nullifier` on an account's first send.
- The node client retries a failed POST, not a per-call JSON-RPC error inside HTTP 200 (`packages/aztec-runtime/src/utils/fetch.ts:152-175`); nothing counts attempts.
- The default Testnet endpoint is still dRPC's load balancer (`wallet/constants/network-endpoints.ts:2`, seeded `network/seeds.ts:45`). Its gateway retries a timed-out request on another upstream, so one refusal does not prove no upstream took the send (`archive/send-queue-activity/lessons/phase-3a.md`, D21).
- `service.composition.test.ts` pins "a sendTx the node refused reads 'Not confirmed yet' too" (the test after the one starting `:1167`).
- Owner's latest signed pick on the issue: page 15, OA-6, **A** ("nothing is built for #112, which stays open").

### #498
- Start: `runBootstrapCore` awaits `initNetworks` then `initAccount`; `initAccount` awaits `ensureDefaultAccount`, which on a custom chain with no derived row probes the node inside the per-tuple lock (`account/service.ts:271-285, 342`).
- The probe is `_probeChainIdentity` on the retrying client: about 6 s on a refused node, 4 × 60 s on a silent one, so the popup's 60 s RPC deadline fires first (`DEFAULT_RPC_TIMEOUT_MS`, `extension-messaging/src/background/client.ts:17`). Every failure is the plain `Error("Failed to fetch node info")`; a transport-rule refusal (`http://[::1]`) is flattened to it too.
- A rejected `initAccount` leaves `isLogined` false; the boot path shows "The wallet could not finish starting up." with RETRY (`app.vue:559-568`). The Header chip and skeleton both need `isLogined`.
- The `watch(appStore.network)` run (`app.vue:242-247`) also fires at start and calls `loadAccounts`, which calls `ensureDefaultAccount` on an empty chain with no catch: an unhandled rejection today.
- The endpoint forms match the exact string "Failed to fetch node info" (`endpoint-error-text.ts:22`, `NewNetworkPopup.vue:136`); their probes (`addNetwork`, `addEndpoint`) keep `_probeChainIdentity`.
- P20-08's record: "A node that answers with a different L1 identity still stops start in every option."

### #710
- Paused = a journal with no live flight (`getPendingReset`, `network-reset/service.ts:238-246`). After the purge the old rows and keys are gone, so `exportAccount` answers "unknown account address".
- `refuseDuringReset` guards the full, passkey and imported-keys backups only (`account/service.ts:929-1125`), not `exportAccount`.
- `StaleNetworkView.reset.imported` lists names only (`importedNames`, `:127-132`); no reader gives the journal's imported addresses.
- The account file (`packages/aztec-runtime/src/account/account-export.ts:47-97`) carries this build's regime digests, `l1ChainId`, `address` and `signingKey`; import re-derives the address under the running build and refuses a mismatch (#468).
- Passkey profiles have no password, so `account.vue:36-39` bounces them; the settings index hides the mode.
- P38-05 = D ("C now, B as a follow-up plan"); B reads "An owner-authenticated export of a refused journal's imported keys as account files." The page drew no button copy.

### P42-05
- Surface: the queued send's re-ask sheet. Asserted at `SendReviewSheet.test.ts:280` and `tests/e2e/network/same-token-concurrent-sends.test.ts:732`. The fee window's own "Send for" (`popup/windows/fee/index.vue:113`) is another surface, held by p42-followups-1.

## Collisions

No open PR touches a file below (checked 2026-10-18 against #723 #743 #788 #793 #795). The listed leads hold none of: `SendReviewSheet.vue`, `same-token-concurrent-sends.test.ts`, `useProfileBootstrap.ts`, `network-switch.ts`, `network/service.ts`, `errors.ts`, `account/service.ts`, `network-reset/service.ts`, `StaleNetworkTakeover.vue`, `stale-network/copy.ts`, `export/account.vue`. Closed known limits read: #468 (an earlier key file after an address change), #551 and #553 (a reset against a silent node).
