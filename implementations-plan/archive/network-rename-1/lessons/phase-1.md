# Phase 1: the rule, its wiring and their tests

- Implemented as planned at 9610cd9aa: `RETIRED_DEFAULT_NAMES` and `retireDefaultName` in `seeds.ts` (the kind's list is looked up through the seed, so a row with no `kind` never matches); `retireDefaultEndpoints` became `retireDefaults`, reading the profile's rows once and applying the rule after the endpoint move; the replay's `nameAfterUpdate` expects the recorded Mainnet row under `seedForKind("mainnet").name`.
- Mutation (step 5): with `const next = moved` in place of the rule, the extended unlock case reds (`expected [ 'tn' ] to deeply equal [ 'mn', 'tn' ]`); restored, it passes.
- Gate: `bun run lint` exit 0 (no finding in the touched files); `bun run typecheck:all` exit 0; `bun run test` 993 files, 17465 passed; `bun run test:all` exit 0 in every workspace; `bun --bun vitest run src/wallet/services/network` 9 files, 323 passed.
