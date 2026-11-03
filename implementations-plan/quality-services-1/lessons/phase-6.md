# Phases 5 and 6 and the arc 2 boundary

## Phase 5 (owned writers)

- Replace and ensure tests red on throwing stubs, green after. The transaction writer had no test of its own; pinned green at the base before it moved onto the shared slot writer.
- Three tests' `@/utils/core` mocks lacked the new writers (38 reds in `useProfileBootstrap.test.ts`, `auth.test.ts`, `new-profile-helpers.test.ts`). The bootstrap mock mirrors the replace writers, since its tests count client constructions; the unlock and create mocks expose `ensureAccountClient` as a spy, the policy itself pinned once in `core.test.ts`.
- Added pin: the create page loads accounts from the client the slot holds after its await. Red under a mutation that captures `ensureAccountClient()`'s return before the await, green on the real code.
- Gate: vitest `src/utils src/composables src/popup src/onboarding src/components src/stores` 490 files / 8204 tests, lint, typecheck:all exit 0; the writer grep finds nothing outside tests; a rebuild leaves `git status` clean.

## Phase 6 (read-only registry)

- The throwing-write case red before D7, green after.
- A seventh trap write: `stores/app.store.test.ts:387` wrote `managers.network` through a cast, which the recon's grep missed; the issue's count of seven was right. It now installs its client through `replaceNetworkClient` with the client constructor mocked.
- `core.test.ts`'s `isServiceReady` case had relied on the deleted trap writes to create the clients before it faked the clock; it now calls `initAppServiceContext()` first.
- The full extension suite then found two line citations in `tests/e2e/helpers/profile-chaos/model.ts` moved with the code (`auth.vue` 387 → 384, `useProfileBootstrap.ts` 153 → 152); fragments unchanged, re-pinned. Phase 5's gate scope did not include `scripts/e2e`, so its commit carried that red until the re-pin.

## Boundary gate (2026-11-03, merged head 8f2a19386, `origin/dev` a0458e21a)

- Every command exit 0, retry 0: lint, typecheck:all, `test:all` (extension 973 files / 16998 tests), `audit:vue`, both armed builds; smoke `auth-flows` + `wallet-lock` + `settings-crud` + `stale-network` + `security-reset` + `navigation` (31 passed; Chrome 149 s, Firefox 230 s).
- `audit:dup`: 1548 clones / 21291 lines at `origin/dev`, 1548 / 21288 after (production 181 / 8814 → 181 / 8811).
- Line counts, the five production files: 1970 → 1990. `core.ts` 213 → 248 (four writers with their contracts), the call sites 1757 → 1742.

## Review loop

- Round 1, Codex `gpt-6.1-sol` high (fresh session): conditional approve, one low comment finding, accepted: the bootstrap mock's comment named its caller (rewritten as the invariant), the private slot writer's doc restated its body (deleted), `ensureAccountClient`'s doc said "abandoned" (now "would abandon"). It found the fences, captured references, disconnect order, the network-switch dependency, the ensure sites and `freshCore()` sound. Its other two comment notes (the hoisted handles' docs) state the mocks' contracts, not narration; kept.
