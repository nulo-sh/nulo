# Phase 1: arc 1 (#1281, a settle keeps a selection a newer pick names)

- Red-first on the base: the regression failed (`expected 'pB' to be 'pA'`); both controls passed. After the fix in `0964d0488`, all 63 `auth.test.ts` cases pass.
- Mutation check: with the list condition removed from the give-way, both controls fail (the deleted-selection settle and the no-id event); restored.
- A test that assigns `appStore.profile = undefined` and then reads `appStore.profile?.id` fails `typecheck:all` (TS narrows to `never`); read through a getter, as the neighbouring cases do.
- The `auth.vue` citation in `tests/e2e/helpers/profile-chaos/model.ts` moved from line 382 to 387; `profile-chaos-model.test.ts` 250/250.
- Gate at `0964d0488`: `lint` 0, `typecheck:all` 0, `test:all` 0 (extension 16151 passed), `audit:vue` 0; armed Chrome build; `auth-flows.test.ts` and `security-reset.test.ts` 8/8 on Chrome (68 s).
- Review loop. Codex round 1: one comment finding (the TSDoc overstated the heard pick as newer than the read). Opus diff review: the same comment, and a coverage gap (no test pinned `follows !== followsAtStart`); both fixed in `9de3bbcf6`, the new case mutation-checked. Codex round 2: `clean`.
