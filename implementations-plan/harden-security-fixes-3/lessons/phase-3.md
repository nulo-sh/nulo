# Phase 3: a bound on dApp-added tagging sources

| When (2026-10-19) | Step | Outcome |
|---|---|---|
| 17:3x | Trace whether a dApp registration can reach an approval window or write an Activity row (Explore, sonnet) | no: register operations run straight to `executeOperations`, never through `dappInteractionService.execute`; no journal row; a refusal reaches the dApp only as its envelope. So the refusal changes nothing a person sees (HS3-D7) |
| 17:4x | PXE-level tests (`tagging-source-bound.test.ts`), real `PxeService` over a fake store, real key derivation, wire-form arguments | 7 pass; red with the bound removed (4) and with a non-distinct count (1) |
| 17:5x | Handler-level tests (`register-bounds.test.ts`), real handlers over the real `PxeService`, arguments and errors crossing as the RPC carries them | 5 pass; red with no bound passed, with the contract registered first, and (`register-contract-account.real.test.ts`) without the public-key check |
| 17:5x | Commit hung in `ssh-keygen -Y sign` on the agent socket | killed the hung commit, reran under `env -u SSH_AUTH_SOCK`: signed |
| 18:0x | `test:all` | red: 8 static-scan tests timed out at 5 s with load1 at 575; rerun red: one 30 s timeout at load1 2900, then the seeded-RNG vectors after it in the same describe drifted by one draw. No touched file; both passed in `audit:vue` and in the first run |
