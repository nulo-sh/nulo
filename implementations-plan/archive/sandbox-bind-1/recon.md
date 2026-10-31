# sandbox-bind-1 recon

Base: dev at `7bde519db`. Read by hand plus one Explore pass (sonnet). Toolchain facts are read from the pinned Aztec 6.0.0 install (`~/.aztec/versions/6.0.0`), which aztec-up installs outside the repo's lockfile, so `bun patch` cannot reach it.

## How the sandbox starts

- `apps/extension/tests/e2e/global-setup.ts:421-423` starts anvil with `--host 127.0.0.1`.
- `global-setup.ts:543-561` starts the node with `aztec start --local-network` on the run's claimed main, admin and p2p ports and its run data directory.
- The toolchain's `node_modules/.bin/aztec` is `@aztec-labs/aztec/scripts/aztec.sh`. Its `--local-network` branch also starts `anvil --silent --port $ANVIL_PORT` (anvil's default host is `127.0.0.1`), then `exec node --no-warnings dest/bin/index.js start …`. The harness passes its own `ANVIL_PORT`, so this second anvil fails its bind (`global-setup.ts:573-575`).
- A real `bun run e2e:agent` run on Linux: `ss -ltnp` shows anvil and the playground on `127.0.0.1`; the p2p port has no listener (the local network runs with p2p off).

## What Aztec 6.0.0's `aztec start` takes

- `aztec/dest/cli/aztec_start_options.js` (API group): `--port`, `--admin-port`, `--admin-api-key-hash` (`AZTEC_ADMIN_API_KEY_HASH`), `--disable-admin-api-key` (`AZTEC_DISABLE_ADMIN_API_KEY`), `--reset-admin-api-key`, `--node-debug`, `--api-prefix`, RPC batch, body, timeout and CORS options. No listen address, as a flag or an env var (grep of the aztec, foundation, node-lib, stdlib and aztec-node builds); `startHttpRpcServer` accepts a `host`, which the CLI never passes (`aztec_start_action.js:92,127`).
- `aztec/dest/cli/admin_api_key_store.js`: given `adminApiKeyHash` (64 lower-case hex), the node uses it as is and persists nothing. The disable option is read before it, so the spawn sets that option explicitly.
- `foundation/dest/json-rpc/server/api_key_auth.js`: the admin middleware reads `x-api-key` or `Authorization: Bearer`, compares `sha256(Buffer.from(key))` with `timingSafeEqual`, answers 401 with a JSON-RPC error otherwise, and lets `GET /status` through.

## Callers and channels

- The only `nodeAdmin_*` caller: `apps/extension/tests/e2e/fixtures/mining-hold.ts:15-50` (`http://127.0.0.1:${AZTEC_ADMIN_PORT}`), imported only by `tests/e2e/network/same-token-concurrent-sends.test.ts`, which CI runs in the `network-e2e-heavy-concurrent` job (`.github/workflows/_extension-network-e2e-lane.yml:81-92`), proverless, in both browsers' lanes.
- `mining-hold.ts`'s `rpc()` also serves `pendingTxCount(nodeUrl)` on the main port.
- Setup-to-worker values travel by `project.provide` / `inject` (`global-setup.ts:909-916` augments `ProvidedContext`; consumers in `fixtures/extension.ts`, `fixtures/playground.ts`, `fixtures/burst-account.ts`). Every worker of the project can read a provided value. `vitest.e2e.all.config.ts` uses this same global setup.
- No doc, skill or workflow mentions the admin key. The e2e README mentions the admin port at `:28`, `:31` and `:353`.
- Node clients use `localhost` (`resolve-ports.ts:270`, `fixtures/aztec.ts:46`, the wallet's baked `VITE_LOCAL_NETWORK_RPC_URL`); `session-tabNavigate.test.ts:48` opens `http://127.0.0.1:<aztec>/status`.

## Reuse candidates

- `apps/extension/tests/e2e/boot-guard.ts:44-62` (`listeningInodes`) already reads `/proc/net/tcp{,6}` LISTEN rows by port; it skips a table it cannot read and ignores the local address.
- `global-setup.ts` `assertNodeStoresInRunDir` is the pattern for a Linux-only check after `markBootReady()`: its failure is a real failure, never the retried boot exit 86.
- `apps/extension/scripts/e2e/boot-guard.test.ts` holds real-socket tests, with a Linux-only `describe` for the `/proc` reads; it runs under `bun run test`.
- No unit test imports `global-setup.ts` or `mining-hold.ts`.
- `NULO_E2E_RETRY` sets the network config's retry count (`vite.shared.ts:117`); the Docker CI-like runner forwards only a file path to `e2e:agent`.
