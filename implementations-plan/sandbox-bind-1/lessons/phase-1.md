# Phase 1: the per-run admin key

- The key-check test was proved against two mutations of `assertAdminKeyRequired`: skipping the keyless 401 check reds the "answers a keyless call" stub, and accepting a JSON-RPC error as an answer reds the "HTTP 200 with an error" stub. Both restored, green.
- Biome reflows long lines in `tests/e2e/**` and `scripts/e2e/**`: run `biome format --write` on the touched files before `bun run lint`.
