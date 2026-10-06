# Production hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a set of security and reliability changes after the package-boundary work: best-effort zeroization (`packages/wallet-crypto/src/zeroize.ts`), a build-time passkey relying-party gate (`apps/extension/src/wallet/services/passkey/check-rp-id.ts`), proactive session expiry through alarms, offscreen request telemetry (`packages/extension-messaging/src/offscreen/telemetry.ts`), artifact class-id verification (`packages/aztec-runtime/src/pxe/artifact-class-id.ts`), a content-script envelope validator (`apps/extension/src/wallet/services/wallet-sdk/content-script-validator.ts`), an opt-out strict security mode, and the split of the network entity into a chain and its endpoints.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Eleven hardening plans were written and audited, then reduced by decisions about what a pre-launch wallet needs now. Nine shipped. Two stayed deferred: per-collection storage migrations until there are users (a different data-preserving migration framework later shipped as its own effort, see `CLAUDE.md`), and encrypted metadata at rest.

Every shipping plan had to meet one bar: pure functions in the lowest package that can hold them, ports injected rather than mocked, no singletons outside the composition root, a test seam at every boundary, and no untyped `any`.

- **Zeroization** of secrets and password hashes at their use sites, with the caller-versus-callee responsibility written into the doc comments of the seal and session functions.
- **Passkey relying-party gate**: the value stays fixed, and a build-time check fails on a manifest that does not grant the host permission or on a drifted literal in passkey code. It covers both the create and get flows.
- **Proactive session expiry** through `chrome.alarms`, ignoring stale deliveries and locking at once if a shortened TTL has already passed.
- **Offscreen telemetry only**: request-level observability and cleanup of a failed send. Durable pending state was descoped because a reaper behind the request timeout could never run.
- **Registry trust**: a fetched artifact is accepted only if its recomputed class id matches, checked inside the registry rather than the fetcher.
- **Content-script scope**: broad injection stays, because the wallet SDK's discovery is page-initiated and a wallet absent from the page cannot be found. The change is a documented threat model and a schema-validated envelope at the service-worker seam.
- **Strict security mode** is on by default: the session secret is not persisted, so a service-worker restart locks the wallet, for password and passkey profiles alike. An opt-out exists for people who prefer silent restore.

### Network model

The `Network` entity conflated a logical chain with the endpoint used to reach it, so a per-endpoint PXE store would have lost state whenever a user switched RPC for the same chain. It was split into a chain-level `Network` that nests `NetworkEndpoint` entries and names a primary endpoint, which `getNode` resolves. PXE state belongs to the profile and chain, not the endpoint. A pending transaction pins to the URL it was submitted on, with a URL-keyed node cache. One coordinator purges a chain in a fixed order with the PXE last, and deleting a network or a profile both use it. Adding or editing an endpoint probes it and rejects a chain-id mismatch, which makes the endpoint trust boundary explicit in `SECURITY.md`.

## Why

The cheap, always-on changes close known gaps without touching the user experience. The two plans that would have cost users something were reshaped rather than shipped as designed: re-entering a password on every restart became a default that can be opted out of, and per-endpoint isolation was replaced by fixing the model it exposed as wrong. The crypto vectors, key-derivation labels, storage keys, ciphertext format and passkey relying-party value stayed byte-identical through the arc.

## What shipped

- Each change above has unit tests against injected fakes, and e2e coverage for the endpoint and service-worker-restart paths.
- The telemetry sink logs only the method name, request id, timing, a terminal status and a structured error code, through a sanitizer, and defaults to a logging sink rather than a no-op after a review found the first version dropped every event.
- A network detail page with endpoint management and a storage version that wipes and reseeds, with no migration, because there were no users.
