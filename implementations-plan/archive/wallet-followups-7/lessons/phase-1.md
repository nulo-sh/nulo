# Phase 1: one token contract spelling (#329)

- 2026-10-13. `parseTokenInterface` binds the parsed `AztecAddress` and its `toString()` once; the pin check, `ensureRegistered` and `TokenInterface.contract` use that spelling. `findToken` lower-cases both sides. The New token popup's duplicate check lower-cases both sides (D-orch-2); `sameFieldAddress` was not used there because it refuses values at or above the field modulus, and the popup's existing fixture `0x` + 64 `a` is one.
- T1 also asserts no second registration of a contract already registered in lower case: on base `ensureRegistered` compared the typed spelling and registered it again.
- Gate: `bun --bun vitest run src/wallet/services/token src/utils/tx-amount.test.ts src/popup/components/popups/NewTokenPopup.test.ts src/wallet/services/execution/register-token.test.ts` 21 files, 338 passed; `bun run lint` 0; `bun run typecheck:all` 0.
- Red on base: with `git show e900f710:` copies of `service.ts` and `NewTokenPopup.vue`, exactly T1, T2 and T2b fail (3 of 74); restored from a scratch copy.
