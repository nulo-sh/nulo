# Token identity cleanup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet side is a scope-gated `isTokenRegistered` RPC (`packages/wallet-bridge/src/dispatcher.ts`, `packages/wallet-bridge/src/method-scope-checkers.ts`, `packages/wallet-sdk-schema-patch/src/apply.ts`), field-level re-consent for the contracts grant, and consent copy that names the probe (`apps/extension/src/wallet/services/dapp-session/capability-meta.ts`). The faucet and bridge tokens and their frontends live in the unleashed repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Mixed bridge and wallet work, classed as wallet. The faucet and the bridge both said "USDC", which confused people, so the drip tokens became NULO (6 decimals) and OLUN (18) and the bridged pair became AZLO (18 on both L1 and L2), each as a fresh deployment with real on-chain names. One new wallet RPC, `isTokenRegistered`, lets a frontend hide "Add to wallet" for tokens already registered.

The RPC is gated by the existing contracts capability: a dApp may ask only about token addresses its grant lists, and an ungranted address is a scope violation, never a quiet `false`. It is a plain direct read answered from the token registry through an injected reader, and it does not use the prompting registration route.

## Why

On-chain names and symbols are constructor arguments, so a display-only rename would have lied about the contract. Eighteen decimals also forced real parameterization of the bridge frontend: amounts were parsed through a lossy `Number` path and one mint constant was a six-decimal literal that a search for the usual exponent misses, minting a negligible amount at eighteen. Parsing and display moved to bigint and string math, and the deploy script asserts that L1 and L2 decimals are equal before wiring, since the portal moves raw units.

A new capability type was impossible, because the SDK's capability schema is a closed union that rejects new types and strips new fields. Probing registration state without a grant would also have let any app map a person's tokens.

## What shipped

- **The RPC.** Enforced by `requireContractsGrant`, answered by a direct dispatcher handler, added to the schema patch with the paired reachability assertion. Frontends check once per token on connect, cache the answer for the session and fail open when the wallet lacks the method or refuses.
- **Field-level re-consent.** The re-consent delta used to compare capability types only, so a redeploy that added token addresses to a granted contracts list would have been refused forever. The dispatcher now re-prompts when a request's contract list is not a subset of the grant, and approval replaces the grant. Shrinking requests do not re-prompt. A version bump of the app id was rejected, since sessions key on origin, chain and profile and a new id inherits the old grant.
- **Honest consent copy.** The contracts card says it covers checking whether listed tokens are registered in the wallet. A dApp granted a shared token address can therefore probe that one token, which the copy makes explicit.
- **Elsewhere.** Amount helpers (`parseAmount` beside `formatBigInt`), the token constants, the footer and the redeployed contracts shipped in what is now the unleashed repository.
