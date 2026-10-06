# Network e2e through a local playground dApp

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the test dApp `apps/playground`, the helpers `apps/extension/tests/e2e/fixtures/playground.ts`, `apps/extension/tests/e2e/fixtures/popups.ts` and `apps/extension/tests/e2e/fixtures/dappSession.ts`, and the dApp-protocol specs under `apps/extension/tests/e2e/network/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cover the wallet's dApp-facing surface in the network suite through a local, deterministic test dApp instead of an external page.

- The playground exposes every wallet-sdk call with stable `data-testid` hooks and a monotonic result feed, and the global setup spawns and tears it down per run.
- Popup windows (discover, capabilities, execute, verify, json) gained testids following the suite's `<area>-<entity>-<verb>` and `data-<entity>-id` conventions; the old external-page connect helper was replaced.
- A later refactor made the playground canonical: it takes accounts from the granted-capabilities response, and the tests built on the Nulo-custom `getCompleteAddress`, `registerToken` and `simulateViews` calls were dropped. `registerToken` later returned as an optional custom RPC behind the runtime schema patch.
- Fee-method coverage through a pre-funded account import was dropped from that round, because the private fee claim needs the claimer's own signature and the wallet had no private cold-start path.

## Why

On a default dApp session only a transaction send opens a popup, since the confirmation level is the strict top level. Every other method is silent, so the suite is built around that: silent-path assertions, an elevated confirmation level fixture for the popup path, and a snapshot of open targets plus a pending-then-terminal result row, not timing, to prove no popup opened.

A wallet must work with every wallet-sdk dApp, so its tests must drive a deliberately generic one.

## What shipped

Parameterized specs for connection lifecycle, capability requests (basic, partial, repeat, widening), silent read and state-changing methods, simulations, authwit variants, batch partial failure, each send variant (default, no-from, fee payer, multicall, reject, sponsored), scope and capability refusals, multi-account routing, rapid fire, locked-mid-session and tab lifecycle. The playground disables hot reload in test mode so tab updates cannot kill sessions, and drops local-storage persistence as a flake source.
