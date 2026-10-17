# authwit-intent-1: recon

Base: `origin/dev` at `4ad2a80d`. One Sonnet explorer (the reuse sweep) plus the driver's own reads. Paths are repo-relative.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| One refusal point for every dApp `createAuthWit` | `checkCreateAuthWit` (`packages/wallet-bridge/src/method-scope-checkers.ts:269`), beside `refuseAuthRegistryIntent` (`:261`) | adapt: one more refusal |
| Address comparison | `sameFieldAddress` (`packages/wallet-bridge/src/field-address.ts`) | reuse |
| Canonical address spelling before the scope check | `assertWalletSchemaArgs` → `assertCanonicalAddresses` (`packages/wallet-bridge/src/wallet-schema-args.ts`), called at `dispatcher.ts:231` | reuse (relied on) |
| Typed refusal with its own text | `AuthRegistryRefusalError` (`packages/extension-messaging/src/errors.ts:208-230`) | adapt: a sibling `ScopeViolationError` subclass |
| dApp envelope text | `AUTH_REGISTRY_REFUSAL_ENVELOPE`, `scopeViolationEnvelope` (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts:235-246`) | adapt: a second envelope |
| History row for a refused `createAuthWit` | none: the queued journal is `sendTx`-only (`background.ts:659-662`); neither `createAuthWit` route calls the journal | absent: `OWNER-ASKS.md` OA-2 |
| `walletErrorFromPayload` rebuild | `errors.ts:619` | adapt: one by-message line. The refusal never crosses the operation-result channel (thrown in dispatch, mapped at `background.ts:1515`), but `errors.test.ts:345-371` requires every exported subclass to rebuild as itself |
| The entrypoint's payload hash | `DefaultAccountEntrypoint` (`@aztec-labs/entrypoints`, `account_entrypoint.js:104-106`), the class `NuloAccount` wraps (`packages/aztec-runtime/src/account/nulo-account.ts:64`) | reuse in the test, from `apps/extension`, which already declares it (plan D5) |
| The intent hash the wallet signs | `computeAuthWitMessageHash` (`@aztec-labs/aztec.js`, `utils/authwit.js:30-40`), called at `apps/extension/src/wallet/services/execution/service.ts:1294-1300` | reuse |
| bb.js tests outside the jsdom runner | `packages/wallet-bridge/src/auth-registry.pins.test.ts` and its exclude line (`apps/extension/vitest.config.ts:80-81`); wallet-bridge's own runner is node | reuse the pattern |
| Dispatcher `createAuthWit` harness | `packages/wallet-bridge/src/dispatcher.test.ts:2643-2690` (`harness`, `h.authwit`, `h.batch`, `h.counts`; the window fake answers `0xconfirmed`) | reuse |
| Checker refusal table | `method-scope-checkers.test.ts:315-375` (instance, exact message, no argument echoed) | adapt: a sibling block |
| Wire-shaped fixtures | `packages/wallet-bridge/src/testing/wire.ts` (`wireAddress`, `wireCall`); no inner-hash fixture | reuse; inline the inner hash |
| Fee Juice claim selector pin | `packages/wallet-bridge/src/fee-payer.test.ts:28-41` | adapt: split as `auth-registry.pins.test.ts` was |

Absence search trail: `createAuthWit|CreateAuthWit`, `tryCreateQueuedJournal|queuedJournalId` over `background.ts`, `queued-journal.ts`, `dapp-interaction/`, `execution/`, `operation-journal/`; `EncodedAppEntrypointCalls|DefaultAccountEntrypoint|computeOuterAuthWitHash` over `apps` and `packages` tests (no test builds an entrypoint payload today).

## Claims checked against the tree

- **The equivalence the rule rests on holds (demonstrated).** A probe drove upstream `DefaultAccountEntrypoint.wrapExecutionPayload` with a recording signer over one wire-shaped public call (chainId 31337, version 1, nonce 42). The hash it asked the account to sign, `0x1901651d…b11f482`, equals the hash the wallet signs for an inner-hash intent whose consumer is the account and whose inner hash is that payload's `EncodedAppEntrypointCalls.hash()`. A third-party consumer gives a different hash. The vendored account sources agree: the entrypoint checks a witness bound to `this_address` (`authwit/account.nr` in `SchnorrAccount.json`).
- **"Any consumer that resolves to the account's own entrypoint" reduces to equality with `args[0]`.** The consumer the signer's inner-hash branch reads, and `args[0]`, reach the checker only in their canonical spelling. The signer is resolved by exact string from `args[0]` (`account-resolution.ts:72-74`). The account's entrypoint and its `verify_private_authwit` bind the consumer to its own address or to `msg_sender`, so only a consumer equal to the signer reaches the signer's own entrypoint check. Another contract that verifies the same public key still binds its own address. The wallet has one account contract; a passkey profile derives the same `NuloAccount`.
- **The checker sees every dApp `createAuthWit`.** It needs the `accounts` capability (`method-descriptors.ts:155-162`), so grants are never empty at `enforceScopeFor` (`dispatcher.ts:293-305`). It is not refused in a batch, and each batch leg re-enters `dispatch` (`dispatcher.ts:468-475`).
- **"A History row" does not hold as reuse.** No `createAuthWit` writes one today, whether signed, rejected or refused; #716's refusal of an intent naming the registry included. Building one is new persisted state: `OWNER-ASKS.md` OA-2.
- **The fee-payer pin passes unchecked in one runner (holds).** The extension's jsdom runner collects `fee-payer.test.ts` (`apps/extension/vitest.config.ts:47`), maps any WASM error to `"no-hasher"` and skips the selector assertion.
- **Other ways the account signs for a dApp do not take a dApp-chosen consumer.** Witnesses a dApp supplies in `sendTx` are imported with their own signature, never re-signed (`operation-planner.ts:193-201`). A discovered authorization request takes the emitting contract as consumer (stdlib `collectOffchainEffects` sets `callContext.contractAddress`; `decode-authwit-effects.ts:43`), and the frozen account's sources emit no such request. `simulateTx` results drop `partialWitness` (`app-facing-results.ts:54`); `profileTx` is refused (`view-executor.ts:390`). A call intent's inner hash and the app payload hash use different domain separators (221354163 and 463525807).
- **No sender in this repository names the signer.** The playground's inner-hash form defaults to the token contract (`apps/playground/src/sections/authwit.ts:104-115`); `authwit-variants.test.ts:123` and `type-roles-windows.test.ts:226-230` use a contract consumer.
- **Untested:** the full chain through a submitted transaction. The change does not depend on it.

## Collisions

None open on these files. #716 (merged, `dc4a88ec`) owns the registry refusals this change sits beside; `dapp-results-1` (#717, merged at `4ad2a80d`) edited the log redaction keys, which this change does not touch.
