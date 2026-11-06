# Phase 1 — the Worker

- 2026-11-05: gate green. `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test` in `infra/subscribe`: 91 pass, 0 fail (6 files, bundle test included); `bun run lint` 0; `bun run typecheck:all` 0.
- Mutation check (each reverted): reading any 409 as sent, skipping the MAC, dropping the `Idempotency-Key`, dropping the expiry, dropping the address re-validation: each reds at least one test.
- TS 6: `Uint8Array.from(...)` must be typed `Uint8Array<ArrayBuffer>` to pass as a WebCrypto `BufferSource`.
