# Unserved chain connect

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A dApp asking to connect on a chain the active profile has no network for now gets silence and a "Network not available" notice (`apps/extension/src/popup/windows/network-unavailable/index.vue`) instead of a connect window, and a session whose network later disappears gets a typed `CHAIN_NOT_SUPPORTED` error. The gate is in `apps/extension/src/wallet/services/wallet-sdk/background.ts` and `NetworkService.servesChain` in `apps/extension/src/wallet/services/network/service.ts`.
- **Open items**: the playground's `balance_of_public` utility button that can never succeed, and a deleted dApp-session row tearing down another profile's live channel on the same origin and chain, both tracked in #128 and #228.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Refuse a connection to a chain the profile has no network for at discovery time, and say so in the wallet.

- **Notice, not a connect window.** It opens exactly where the connect window would, including the drain of queued discoveries after unlock, with a title, one sentence saying the app and the wallet need to be on the same network, and a single Close button. The app still gets silence, and no session row is written. Escape and Close dismiss it and approve nothing.
- **Stale rows.** A remembered row for an unserved chain stops auto-approving and is dropped, so the origin's next discovery takes the new-connection path. No migration.
- **Typed error.** A live channel whose network is removed gets EIP-1193 code 4901 with the constant `CHAIN_NOT_SUPPORTED`, naming no chain the wallet does serve.
- **Same caps.** The notice goes through the connect window's popup caps and dedupe.

## Why

A dApp that asked for the wrong chain got the normal connect window. After Allow, every call failed with the generic "The wallet could not process the request.", and a refresh did not help, because the dispatcher threw a plain error for a chain with no network. Nothing a person allows should break silently, and a dApp developer should get an error they can act on.

## What shipped

- `ChainNotSupportedError` in `packages/extension-messaging/src/errors.ts`, thrown by the dispatcher in `packages/wallet-bridge/src/dispatcher.ts` and mapped to the 4901 envelope, logged at debug since a connected dApp polls.
- `servesChain` counts a profile whose default networks are not written yet as having them, because a first activation's queue drain can outrun the shell's seeding and the active network can never be deleted. An in-memory set covers the gap between the two writes.
- The discovery gate captures the profile-switch epoch before reading the profile, awaits `servesChain` before the session lookup so the lookup stays the last yield before dedupe registration, and refuses if the epoch changed. A confirmed Allow re-checks `servesChain` before writing, so removing the network while the window is up writes no row.
- The notice interaction type cannot be resolved into a discovery approval by a page.
- A connect made while locked, on a served chain, works after unlock by password and by passkey, refresh included; `apps/extension/tests/e2e/network/connect-locked-queue.test.ts` covers that path. A network e2e (`apps/extension/tests/e2e/network/connect-unserved-chain.test.ts`) and a background test cover the refusal.
- Dropped by design: a muted "requested chain" line, with the chain id the notice payload would have carried.
