# dapp-boundary-3: recon

Read at `2c0df3b9` (origin/dev) by three read-only explorers (reuse sweep, upstream registry semantics, the address-visibility toggle's cost) and the planner. Paths are repo-relative; `B` is `node_modules/.bun`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| The registry's address | `STANDARD_AUTH_REGISTRY_ADDRESS` from the address-only leaf `@aztec-labs/standard-contracts/auth-registry/constants`, already read by `apps/extension/src/wallet/utils/auth-registry.ts:2,17`. In rc.3 the registry is a standard contract, not a `ProtocolContractAddress`; aztec.js does not re-export the constant (`aztec.js/dest/utils/authwit.js:2` imports it from the same leaf). `packages/wallet-bridge` does not depend on the package; its biome override bans only `@nulo/aztec-runtime*` and `@nulo/extension*` (`biome.json:358-380`). | reuse-as-is (add the workspace dependency) |
| Address comparison that tolerates hex spelling | `sameFieldAddress` / `fieldAddressKey` (`packages/wallet-bridge/src/field-address.ts:26-29`): junk yields `undefined`, never a match | reuse-as-is |
| A refusal that carries no request value | `scopeViolation()` over the closed `ScopeViolationMessage` union (`packages/wallet-bridge/src/scope-violation.ts:11-31`) | adapt: two new wallet-worded literals |
| The dApp-facing answer and the person-facing record of a refusal | `ScopeViolationError` → frozen `SCOPE_VIOLATION_ENVELOPE` (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts:124-127, 222-231`); a refused dApp send is journaled `scope_refused` (`execution/mark-failed-unless-cancelled.ts:34`, `wallet-sdk/queued-journal.ts:287`) and its History row reads "Not allowed" / "The app asked for more than you allowed. Nothing was sent." (`apps/extension/src/utils/journal-state.ts:251-252`) | reuse-as-is |
| Where a dApp's call list and intents are checked | `checkTransactionCalls`, `checkSimulationTransactions`, `checkCreateAuthWit` (`packages/wallet-bridge/src/method-scope-checkers.ts:101-117, 136-160, 259-313`), reached through the registry-derived map before any window (`dispatcher.ts:233-235`) | adapt |
| Where the wallet turns a transaction's authorization requests into signed witnesses | one decode loop, `decodeAuthwitEffects` (`apps/extension/src/wallet/services/execution/decode-authwit-effects.ts:26-44`), shared by the standalone discoverer (`authwit-discoverer.ts:104-149`), the folded probe (`discovery-probe.ts`), and the NO_FROM send (`dapp-send-executor.ts:1313-1329`); a fakeable crypto seam (`AuthwitDecodeCrypto`) | adapt |
| Address+selector classification precedent | `fee-payer.ts:12-16, 41-50`: a pinned hex address and selector, pinned by `fee-payer.test.ts:30,39` | not needed (the rule keys on the address only) |
| A method-level deny precedent | `checkRegisterContractClassDisabled` (`method-scope-checkers.ts:376`), a plain `Error` that reaches the dApp unclassified | not reused (a scope refusal must stay typed) |
| Test shapes | the "no request value reaches a scope refusal" table (`method-scope-checkers.test.ts:107-215`, helpers `listed()`, `tx()`, `grant()`); `refusedSend` / `facts` in `dispatcher.test.ts:1074-1115`; `@nulo/wallet-bridge/testing` `wireCall` (hard-coded selector `0x1234`), `wirePayload`; the probe's fake crypto in `discovery-probe.test.ts` | reuse-as-is |

## Upstream facts (6.0.0-rc.3, read from the installed artifact's embedded Noir source)

- Registry at `0x2ba8714679fbee823f108f366f878ce3249861637de705b0ac7cfbd0f81b3a9c` (`standard-contracts/src/standard_contract_data.ts:23`). Functions: `set_authorized(Field,bool)` and `set_reject_all(bool)` write the caller's own entries; `set_authorized_private(approver, message_hash, authorize)` writes `approver`'s entry after `assert_current_call_valid_authwit(approver)` and enqueues the only-self `_set_authorized`; `consume(on_behalf_of, inner_hash)` clears an approval; `is_reject_all` and `is_consumable` are public views; `utility_is_consumable` is a utility.
- `assert_current_call_valid_authwit` emits a `CallAuthorizationRequest` offchain effect before it checks the witness (`aztec-nr/aztec/src/authwit/auth.nr`). `set_authorized_private` is the registry's only function that verifies a private witness.
- aztec.js grants a public authorization with `SetPublicAuthwitContractInteraction`: one `set_authorized` call sent through `wallet.sendTx` (`aztec.js/dest/utils/authwit.js`); its public fee payment method merges the same call into a payload (`dest/fee/public_fee_payment_method.js:96`). `lookupValidity` reads through `executeUtility(utility_is_consumable)`. The `Wallet` interface has no public-authorization method.
- `FunctionSelector.fromSignature` is async; a scope check is synchronous.
- The wire `createAuthWit` intent is `{consumer, innerHash}` or `{caller, call}`; no bare hash (`aztec.js/dest/wallet/wallet.js:87`).

## The wallet's own registry writes

All public, built downstream of the scope check, none emits a private authorization request: the grant (`grantPublicAuthwit` → `add_public_authwit` → `tx-request-builder.ts:552-570`), the revoke (`auth-registry/service.ts:330`), the registry switch (`set_reject_all`). No playground button, e2e or unit fixture sends a dApp call to the registry; every e2e that grants uses `grantPublicAuthwit` (`authwit-lifecycle`, `authwit-consume-smoke`, `frozen-account-canary`, `passkey-execution-canary`, `snack-placement`, `type-roles-windows`).

## The address-visibility toggle (held arc)

- Without `canGet`: `getAccounts` is refused (`method-scope-checkers.ts:316-322`) and the capability answer lists no account (`dispatcher.ts:896-912`).
- Still answered: a NO_FROM `simulateTx` resolves the first session account (`dispatcher.ts:1131-1162`, `account-resolution.ts:64-79`) and its app-facing result keeps every call context and the fee payer (`execution/app-facing-results.ts:41-49, 58, 75`); an explicit `from` refuses a non-member and serves a member (`dispatcher.ts:1154-1155`) on `simulateTx`, `sendTx`, `createAuthWit`, `registerToken`, `grantPublicAuthwit`, and on `profileTx` before its own refusal (`view-executor.ts:388-390`).
- The row: `accountAddressRow` (`popup/windows/capabilities/permission-rows.ts:87-91`), shown only with `canGet === true` (`build-items.ts:125, 196`); the detail panel shows its line when `canGet !== false` (`components/composite/capabilities/CapabilityDetailPanel.vue:27-30`); the grant description (`dapp-session/capability-meta.ts:39`).

## Collisions

- `SECURITY.md` § Authorization enforcement: the docs lane owns a rewrite of its `createAuthWit` paragraph; this lane adds one separate paragraph after it.
- Running leads (onboarding-3, sheet-1, fees-display-1, ui-dedupe-1, test-infra-1, ci-dedupe-1, type-roles-coverage) touch none of the arc 1 files. The held arc touches the connect window, which no running lead names.

## Search trail for absences

- The registry's references at the base: `grep -rniE 'AuthRegistry|auth-registry|STANDARD_AUTH|ProtocolContractAddress'` over `packages/*/src`, `apps/*/src`.
- No dApp-origin registry call anywhere: `grep -rniE 'set_authorized|set_reject_all|SetPublicAuthwit|set_authorized_private'` over `apps/playground`, `apps/extension/tests`, `packages`.
- No pinned registry selectors: `grep -rn 'b839de91\|8955f5fc\|79a3d418'` over the tree.
