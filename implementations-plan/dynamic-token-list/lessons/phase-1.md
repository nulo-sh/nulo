# Phase 1 — `packages/token-list`

## Deviations from plan.md (each with the reason)

- **`parse.ts` is hand-written, not zod.** The signer must validate exactly the bytes it signs, and it runs with `bun --no-install` and no `node_modules`, so zod is out of its closure. One dependency-free validator now serves the signer (strict), the tree tests (strict) and the wallet (lenient), so the three cannot disagree. Biome bans `@nulo/*`, `@aztec-labs/*`, `@aztec-foundation/*` and `zod` in `packages/token-list/src`.
- **`prepare` shows the tokens digest, not the payload digest.** The payload holds the sequence and `issuedAt`, which exist only at signing, so `prepare` cannot know its hash. `prepare` shows `tokensSha256` (the serialized token array). `sign-cli --expect-tokens-sha256` refuses any other token set, and `sign` prints both digests.
- **`sign-cli --seed-env`.** Defaults to `TOKEN_LIST_SIGNING_KEY` (the CI secret). The recovery keyed run passes `--seed-env TOKEN_LIST_RECOVERY_SEED --key-id nulo-recovery-1`, since a keyed-run variable must be named like its 1Password field.
- **No path-filter change in P1.** The extension imports `@nulo/token-list` only from `token-list-pins.test.ts`, which `quality-status` runs on every PR. The bundle is unchanged until P3, which adds the filters as planned.

## Facts found

- 1Password's `generate hex32` (op-remote `rand_hex`) yields `0x` + 64 lower-case hex digits. `importSeed` and `keygen-cli` accept the prefix; the CI secret is stored bare.
- WebCrypto imports no raw Ed25519 private key: a seed goes in as PKCS#8 with the fixed RFC 8410 prefix `302e020100300506032b657004220420`; the public key comes back as the JWK `x`.
- TypeScript 6: WebCrypto parameters need `Uint8Array<ArrayBuffer>`; a bare `Uint8Array` return type (`ArrayBufferLike`) fails `typecheck`.
- Vitest on Bun has no `__dirname` here; tests use `fileURLToPath(new URL(".", import.meta.url))`.
- The worktree guard refuses compound shell commands (heredoc chains, `;`-joined gate runs). Run each command alone.

## Gate (2026-10-13)

- `bun run --cwd packages/token-list test`: 5 files, 25 tests passed.
- `bun run --cwd apps/extension test -- token-list`: 1 file, 3 tests passed.
- `bun run lint`, `bun run typecheck:all`, `bun run check:plans`: exit 0.
