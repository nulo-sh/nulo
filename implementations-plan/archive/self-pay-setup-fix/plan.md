# Simulate and profile as the account the dApp named

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet bridge dispatcher in `packages/wallet-bridge/src/dispatcher.ts` resolves `aztec_simulateTx` and `aztec_profileTx` as the session-authorized account named in `opts.from`, and the network suite proves self-pay and PrivateFPC payments on the node's real setup rules in `apps/extension/tests/e2e/network/sim-from-selfpay.test.ts` and `apps/extension/tests/e2e/network/selfpay-phase.test.ts`, driven by `apps/playground/src/sections/phase.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The dispatcher honors the dApp's `opts.from` on simulate and profile, as it already did on `sendTx`, and refuses an account outside the session instead of substituting another. The gate that proves it runs in the wallet's own generic playground against the harness node, not against a deployed bridge. The tools app, the bridge code and the contracts were out of scope.

## Why

A bridge claim paid from the account's own public Fee Juice failed in the dApp-facing simulate with `Setup function not on allow list`, and a sibling attempt on the private-credit path failed with `unknown nullifier`. The dispatcher built both simulate and profile as the session's first account and overwrote the dApp's `from` with it. A simulate of a self-pay payload from the second granted account therefore ran as the first: the fee-payer check saw a different payer and chose the external-payer plan, nothing ended setup, and the PXE's kernelless split filed every public enqueue as setup. The bridge simulates before it sends, so the claim never went out. `executeUtility` names its account through `scopes` and `createAuthWit` signs as its first argument through its own handler, so neither was affected.

## What shipped

- **Dispatcher.** One shared reader of `opts.from` (omitted, `null` and `NO_FROM` mean none) serves send, simulate and profile. Unit pins mirror the `sendTx` block: `from` acts as that account, an account outside the session is refused as not authorized, no `from` keeps the first account, and `executeUtility` and `createAuthWit` are unchanged. The refusal does not reveal whether an ungranted address is a wallet account.
- **Repro.** `sim-from-selfpay.test.ts` simulates with validation on, with the second account as owner and payer, and checks the wallet resolved that account.
- **Gate.** `selfpay-phase.test.ts` runs never-sent and deployed accounts, first and second granted account, simulate and send, paying from public Fee Juice or the PrivateFPC credit. Its call shapes are a public transfer and a `mint_to_private` whose public finalization is the same non-allow-listed enqueue the hub claim makes. Simulate cells bind to their own request's arguments and leave state unchanged; send cells check balances and the payer's fee debit. A negative control, a different payer with no fee call, must be rejected by the node with the production error text, and the harness asserts the node's allow-list is unmodified.
- **CI.** The repro runs in the shard pool and the matrix in the dedicated `fee-methods` job at retry 0, both pinned by `scripts/ci-cd/behavior-gating.test.ts`.
- **Not covered.** Driving the hub claim itself through the tools app and a testnet canary were left as follow-ups; the gate proves the wallet's phase layout and account identity, not the hub.
