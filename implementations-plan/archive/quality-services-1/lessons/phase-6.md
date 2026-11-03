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
- Deviation: round 1's prompt lacked the standard's two verbatim rules and its adversarial ask; the net session and every resume carry them.
- Round 1, Opus 5.5 diff review (beside it): approve, one nit, accepted: `initNetworks`' doc said it reads the network slot "dynamically here"; the writer does now. It noted a gap older than the diff: no test tells `app.vue`'s replace dependency from ensure (same signature; the old inline arrow had it too). `app.vue` has no harness; not acted on.
- Round 2, Codex fresh session over both arcs (arc 1's squash `5bb259392` plus this diff): approve, two low comment findings, both verified and accepted. The registry header recounted history and promised every consumer works unchanged, which a write no longer does; now its contract in four lines, and the duplicate null-slot comment is gone. In `sealed-entity-storage.ts`, `adoptOwnerless` said it removes the original "in the same dispatch" (it awaits the set first) and `commitLegacyTogether` said "ONE `set`" (none when every twin is stored); both wordings predate arc 1.
- Round 3, the net session resumed with the fix diff: approve, no findings; the fixes are comment-only and match the code. Converged.

## Final gate (after the review loop and three `dev` merges)

- Merged `origin/dev` at `cf9ed1e40` (#1585), then `6c7ba2867` (#1581, the popup lane: the generated auto-import files merged cleanly and a rebuild leaves `git status` clean), then `c7413cfa7` (#1586, `scripts/release` only).
- At `7369124d8`, every command exit 0, retry 0: lint, typecheck:all, `test:all` (extension 975 files / 17029 tests), `audit:vue`, both armed builds; the six smoke files 31 passed on Chrome (152 s) and Firefox (226 s). At `0ca455c52` (`apps/` and `packages/` unchanged since): lint, typecheck:all, `test:all` exit 0.
- `bun run test:release` (not this arc's gate: the arc touches no `scripts/`): 7 of 368 red, every one `Executable not found in $PATH: "zip"`; this host has no `zip` binary.
- `audit:dup` against `c7413cfa7`: 1547 clones / 21270 lines, then 1547 / 21267 (production 176 / 8762, then 176 / 8759). A direct `jscpd` diff of the two clone sets finds one change: the `auth.vue` ↔ `unlock-method.vue` clone is 3 lines shorter. Arc 2 adds no clone. One mislabelled pair of runs (taken while `origin/dev` moved under the worktree) was discarded.
- Line counts, the five production files: 1970 → 1971.
