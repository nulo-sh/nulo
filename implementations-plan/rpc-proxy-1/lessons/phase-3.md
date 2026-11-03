# rpc-proxy-1 arc 2: implementation log (phase 3)

## Phase 3, the Worker

- `bun test` with `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` red where a warm run was green: `@aztec-labs/foundation`'s `curves/bn254/field.js` checks `typeof expect !== 'undefined'` and calls `expect.addEqualityTesters` at import, which `bun test`'s global `expect` lacks. A warm cache had a copy transpiled outside the runner. The stdlib checks moved into a plain `bun` child (`test/node-client.ts`, D20).
- A refused kill-switch capture timed the drift test out: the real client retries a 503 on its 1, 2, 3 s schedule. The capture uses a 429, which it gives up on at once, and that became the no-retry assertion.
- The body cap's value was not pinned by the boundary test, which reads the constant: a mutation to exactly 1 MiB stayed green. "The largest batch the client sends is forwarded" (100 entries summing 1 MiB - 1, so 1,048,676 bytes) now reds on it.
- Mutations, each red: the Origin check removed (7 fail), the caller's headers forwarded, `redirect: "manual"` dropped, the 3xx refusal removed, every upstream header copied, the kill switch removed (3 fail), 101 calls allowed, a method allowed by prefix, the CORS pair dropped from refusals (4 fail), the path check removed, a name dropped from `NODE_METHODS`.
- TypeScript 6 types `new Uint8Array(n)` as `Uint8Array<ArrayBuffer>` but a plain `Uint8Array` annotation as `ArrayBufferLike`, which `BodyInit` refuses: `readCapped` returns `Uint8Array<ArrayBuffer>`.
- `bun-version.test.ts` reads tracked files only: its restatement check reds until the new workspace is staged.
- `agent-worktree register rpc-proxy-1` refuses on branch `rpc-proxy-1-a2` (it expects `worktree-rpc-proxy-1`); the orchestrator owns the teardown.

Gate (all at retry 0): lint exit 0; typecheck:all exit 0; `(cd infra/rpc-proxy && BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test)` 54 pass; `bun test scripts/ci-cd/edge-headers.test.ts scripts/ci-cd/bun-version.test.ts` 27 pass; `bun run test:all` exit 0 in 154 s; `bun run test:ci-gating` 747 pass; `bun install --frozen-lockfile` exit 0; `bun audit` through `audit-gate.ts --mode enforce`: 35 acknowledged, 0 unacknowledged; `bun run deploy:dry` bundles with `IP_LIMITER` and `PROXY_OFF` only.
