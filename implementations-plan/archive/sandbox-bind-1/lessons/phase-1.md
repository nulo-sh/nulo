# Phase 1: the per-run admin key

- The key-check test discriminates: skipping the keyless 401 check reds the stub that answers a keyless call; treating any object body as an answer reds the stub that returns HTTP 200 with a JSON-RPC error; dropping the URL from the transport error reds the closed-port case. A separate `error` check was dropped in review: an error answer carries no `result`, so the `result` check already refuses it, and no test could tell the two apart.
- Biome reflows long lines in `tests/e2e/**` and `scripts/e2e/**`: run `biome format --write` on the touched files before `bun run lint`.
