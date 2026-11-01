# port-leak-1: recon

One Explore agent (sonnet), plus the planner's own reads, at base `fcc4da219`. Paths are under `apps/extension/` unless they name a package.

## The page and its siblings

- `src/popup/pages/settings/connected-apps/[id].vue`: `fetchAccounts` builds `new NetworkServiceClient()` (L111) and, per chain with a network, `new AccountServiceClient()` (L131). `onBeforeUnmount` (L202-204) disconnects only `dappSessionService` (built at L179). The file is the one the issue cites (no change since `51ea220b1`).
- `src/popup/pages/settings/connected-apps/index.vue`: one `DappSessionServiceClient` at setup (L46), disconnected (L110-112). Not the same shape.
- `DappSessionVerification.vue` and `GrantedCapabilitiesList.vue` (`src/popup/components/modules/settings/connected-apps/`) build no client.
- House shape for a page's clients: built at setup, each disconnected in `onBeforeUnmount` (`src/popup/pages/tokens/[id].vue:57-73,211-216`).

## The client lifecycle (`packages/extension-messaging/src/background/client.ts`)

- Construction opens nothing; the first request opens the port and waits for Ready (`ensureTransportReady`, L209-213; `openPort`, L77-99).
- `disconnect()` closes the port, ends a Connecting episode and rejects every pending request (L101-108) with `new Error(CLIENT_DISCONNECTED_MESSAGE)` (`core/base-client.ts:354-356`; the message is exported from `@nulo/extension-messaging/errors`).
- A request after `disconnect()` opens a new port (the class of closed known limit #457).

## Error routing

- The popup sets `app.config.errorHandler = forwardVueError` (`src/popup/index.ts:95`). It logs a client-disconnect rejection at debug, any other error at error (`src/wallet/logger/console-forwarding.ts:25-32`).
- Component tests capture an async hook's rejection with `global.config.errorHandler` (`src/popup/pages/activity.test.ts:367-378`).

## Test patterns to reuse

- No shared fake models a client's disconnect. The closest pattern: `src/composables/useFullBackupExport.test.ts:21-53`, a hoisted list of built clients, each module mocked as `vi.fn(function () { return h.make("kind") })`, then `expect(disconnect, kind).toHaveBeenCalled()` per client (L225, L537).
- The page's own `[id].test.ts` mocks the network and account clients as bare `vi.fn()` (L21-22), so it cannot assert their disconnect; its session-client mock hides its `disconnect` (L23-33).
- Tests that need the real rejection build `new Error(CLIENT_DISCONNECTED_MESSAGE)` by hand (`src/popup/pages/send-submit.test.ts:342`).

## E2E that reaches the page

- Smoke (`vitest.e2e.config.ts`): only `tests/e2e/update-replay.test.ts:493-499` opens the list, never the detail page, and the whole file is skipped unless `NULO_E2E_UPDATE_FROM` is set (L657).
- Network: `tests/e2e/network/type-roles-windows.test.ts:172` opens the detail page and waits for an account row, so it drives the network and account reads end to end. `tests/e2e/network/connect-check-window.test.ts:290` opens the detail page of an app that never connected (no accounts). Both reach it through `openConnectedApp` (`tests/e2e/fixtures/popups.ts:333-344`).
- `bun run e2e:agent` passes its arguments to vitest and builds for `NULO_E2E_BROWSER` (`scripts/e2e/agent.sh:11,84`).

## Run commands

- One file, from `apps/extension`: `bun --bun vitest run --retry=0 "src/popup/pages/settings/connected-apps/[id].test.ts"` (quote the brackets).
- The settings suite: `bun --bun vitest run --retry=0 src/popup/pages/settings/`.
