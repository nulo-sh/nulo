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

## Arc 2 review round 1, Codex (gpt-6.1-sol, high), session 01a1a28e

Verdict: findings, all low. Accepted:
1. The 100- and 101-call cases read `MAX_CALLS` from the source, so raising it moved both: the tests now hold literals (with the body cap).
2. `readCapped`'s comment claimed at most `cap` bytes are read; it reads the chunk that crosses the cap, then cancels: reworded.
3. `cors.ts` said neither store id can be pinned; Chrome's can, the check takes shapes because an unpacked build and Firefox installs each get their own: reworded.
4. Three test-helper comments narrated their code: cut; `methods.ts`' header compressed to its invariant.

## Arc 2 review round 1, Opus 5.5 (diff review, general-purpose)

Verdict: findings, one medium and five low. Accepted:
1. (medium, demonstrated by trace) The limiter keyed an IPv6 caller on its full address; one host with a /64 could rotate through 2^64 keys, each with its own 100 per 10 s, and spend a key's daily cap from one machine. `limiterKey` counts an IPv6 address by its /64 (IPv4 unchanged); a table of forms and a handler test where two addresses in one /64 share a budget. `infra/subscribe` keys the same way, but its global limiter bounds it; not changed.
2. (low, plausible) Acceptance read only the node's refusal for the key; dRPC's own refusals (a bad key, the cap) are the likelier carriers: step 6 gains that check.
3. (low) Both ceilings unpinned: the literals of Codex finding 1 cover them; a mutation of either now reds.
4. (low) `CI.md:33` still said playground has no `test` script: it runs `bun test`, so the count is five and every workspace has one.
5. (low) The `cors.ts` comment: as Codex finding 3.
6. (low, plausible) A repeated `"method"` key: `JSON.parse` keeps the last value and the bytes go on unchanged, so a provider parser that keeps the first would run the other name, on the same chain's endpoint. Re-serialising would break the bytes-checked-are-bytes-forwarded rule: a known limit, filed at close-out and named in the README.

## Arc 2 review round 2, Codex (resumed)

Verdict: clean. It verified every accepted fix and checked `limiterKey` over 2,305 IPv6 forms (compression positions, case, zero padding); the header format Cloudflare sends in production stays unverified (owner step 6 exercises it).
