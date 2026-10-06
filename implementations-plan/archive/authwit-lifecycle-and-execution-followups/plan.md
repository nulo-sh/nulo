# Authwit lifecycle and execution follow-ups

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A public-authwit grant RPC, a playground panel to grant and consume, an end-to-end lifecycle spec, and a profile ownership check on job cancel. Live in `packages/wallet-bridge/src/method-scope-checkers.ts`, `apps/playground/src/sections/authwit.ts`, `apps/extension/tests/e2e/network/authwit-lifecycle.test.ts` and `apps/extension/src/wallet/services/execution/execution-lane.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the public-authwit lifecycle (grant, consume, revoke, registry toggle) testable by machine and by hand, and fold in the execution follow-ups left by the previous arc.

- The consumer is the canonical test token with two accounts: account A grants a public authwit naming account B as caller, B sends `transfer_public_to_public` from A. A custom Noir consumer contract was rejected for now.
- A grant is emitted through a schema-patched custom RPC (`grantPublicAuthwit`) with its own scope-checker entry, not by hard-coding panel defaults.
- `cancelJob` drops a cancel silently when the job's profile is not the active profile. The profile is the sole principal; the account address is deliberately not checked.
- Job start for `dapp_execute` moves into the execution lane so the direct and queued flows share one start path.

## Why

`revokeAuthwits` and `setRegistryEnabled` sent transactions with no end-to-end coverage, and nothing in the repository consumed an authwit, so revoke was unprovable. The playground only created private witnesses, which never touch the registry that revoke and toggle act on, and nothing injected a public grant except an action shape no dApp used.

The token path proves the identical on-chain lifecycle as a custom consumer would, without delivering a contract artifact to the extension's PXE, without committed compiled artifacts and without a new Noir build. A silent no-op on cancel keeps job-id existence from leaking, and the profile check is the guard on the cancel path. The canonical registry burns an approval on consume, so every lifecycle step uses a fresh grant and the revoke test targets an unconsumed one, otherwise a failed consume would not prove the revoke.

## What shipped

- **Grant surface.** `grantPublicAuthwit` follows the schema-patch pattern in `packages/wallet-sdk-schema-patch` with a paired dispatcher reachability test, and its capability scope is enforced by the scope checker. The approval popup renders spender, method, contract and arguments, so a grant is never approved blind.
- **Playground.** The authwit section has separate grant and consume buttons, hard-scoped to the fixture token, and an account selector so the consume is sent as account B.
- **Lifecycle spec.** `authwit-lifecycle.test.ts` runs grant and consume, revoke through the settings popup then a failing consume, and a registry disable and re-enable, asserting both the on-chain registry writes and the enforcement. The consume passes B as `from` on `sendTx`, so it really comes from B. Both settings popups gained test ids first.
- **Execution follow-ups.** The cancel ownership check, the unified `dapp_execute` start path, and a loud failure under `E2E_REQUIRE_SETUP` for the node-health and anvil soft-skip paths in `apps/extension/tests/e2e/global-setup.ts`.
- **Surfaced after review.** An adversarial pass found the grant RPC's scope check was never reached because the method had no capability-map entry. It was wired and a regression guard added.
