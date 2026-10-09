# Phase 1 — the boot line, explained where it prints

## Change

- `spawnAztecNode` (`apps/extension/tests/e2e/global-setup.ts`) logs once after the spawn:
  `[e2e-setup] the aztec CLI wrapper also starts an anvil on :<port>; its bind error at boot is expected`.
- The `ANVIL_PORT` env line carries a comment: `node_modules/.bin/aztec` (scripts/aztec.sh) starts its
  own anvil on `$ANVIL_PORT`; on the setup's port it loses the bind and exits.

## Re-verified before the edit

- `~/.aztec/versions/6.0.0-rc.1/node_modules/.bin/aztec` links to `@aztec-labs/aztec/scripts/aztec.sh`;
  its `start --local-network` case sets `ANVIL_PORT=${ANVIL_PORT:-8545}` and runs
  `anvil --silent --port "$ANVIL_PORT" &` before `aztec start "$@"` (F1 holds).
- The repo's own comment at `AZTEC_INTERNAL_BIN` calls `bin/aztec` "the wrapper" (the PATH prepender);
  the new comment names `node_modules/.bin/aztec` (scripts/aztec.sh) so the two are not confused. The
  log line keeps the plan's text.

## Gate (2026-10-09) — pass

- `bun run lint`: pass.
- `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts`
  (Chrome): 2/2 green, 70 s. Log lines 701-703: `Starting local Aztec network …`, then the new line
  (`… anvil on :11782 …`) exactly once, then `[aztec-node] Error: Address already in use (os error 98)`
  exactly once (count unchanged).
