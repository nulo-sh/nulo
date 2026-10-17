# Phase 1: a contract's key registers only its own account

- D1 as planned in `executeAztecRegisterContract`: one `CompleteAddress.fromSecretKeyAndPartialAddress` before the first write; `registerAccount` reuses the derived `partialAddress`, and still receives the wire key.
- `register-contract-account.real.test.ts`: both tests pass in 0.35 s (node environment). Red/green: with the refusal line removed, the other-key test fails and the own-key test passes.
- `service.class-id.test.ts`: its C2 success case failed until its `@aztec-labs/stdlib/contract` mock gained `CompleteAddress`; no assertion changed.
- Gate: `bun run lint` 0 (after `biome format` on the executor), `bun run typecheck:all` 0, `bun --bun vitest run src/wallet/services/execution/` 67 files, 1317 tests passed.
