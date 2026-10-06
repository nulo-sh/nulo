# Port client connect

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A terminal, typed connect failure in `packages/extension-messaging/src/background/client.ts` (`RpcConnectError` in `packages/extension-messaging/src/errors.ts`), containment in `apps/extension/src/wallet/services/logger/client.ts`, and one shared port fake exported from `packages/extension-messaging/src/testing/port-registry.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A synchronous throw from `chrome.runtime.connect` is terminal. The request that needed the port rejects at once with a typed `RpcConnectError`, nothing retries and no timer exists. A service worker restart still reconnects through `onDisconnect`, and in-flight requests still reject with the string-shaped "Client disconnected" error. `connect()` keeps its never-rejects contract.

## Why

The old client retried any throw forever with a one-second sleep. In a Manifest V3 extension `chrome.runtime.connect` never throws because the worker is asleep; it returns a port and wakes the worker. The throws that do occur are permanent, such as an invalidated extension context after an update or a bad extension id, so the loop rescued nothing. On an invalidated page it logged once a second while callers waited out their full timeout with no cause, and in unit tests it tripped the throw-on-second-port guard.

Making failure immediate exposed a second loop: the document logger returns its request promise unhandled, and the popup and offscreen unhandled-rejection handlers log through that same logger, so every rejection logged a rejection. Failing fast without containing it would have become a busy loop for the life of the page. `connect()` must not reject because most of its callers are floating promises.

## What shipped

- **Terminal failure**: a failed open rejects the triggering request within the same tick, leaves the client disconnected, schedules nothing and logs one line with Chrome's reason. The connecting state and its poll were deleted, since the port is either open or the call threw. A throw from a logger or listener during connect is swallowed so `connect()` stays safe to float.
- **Containment**: the document logger observes its returned promise so it never reaches the page's unhandled-rejection handler, while an explicit awaiter still sees the rejection.
- **One port fake** with honest semantics: many ports per name, per-port disconnect, a closed port throws on post, and a remote close of an already closed port does nothing. The extension's global test stub, the package's transport harness and the logger tests all use it, and tests assert port counts read off the registry instead of the fake refusing a second port.
- Out of scope: any user-visible change, the offscreen client (it has no loop), and the wallet-core fake browser's separate port registry.
