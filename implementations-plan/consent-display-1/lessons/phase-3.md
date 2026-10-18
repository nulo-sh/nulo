# Phase 3: a dApp's token add binds to the shown details

- 2026-10-18: `approve()` in the execute window sat at the cognitive budget (15); a second operand in its guard made it 16. Extracting the delta builder changed nothing, since Biome scores a closure apart from its parent; one computed for the guard did (D13).
- 2026-10-18: each new guard, removed, fails its test: the compare (4 cases), the refusal with no shown details, the pin, the window's guard in `confirm-disabled` and in `approve()`, the shape check (10 cases), and the envelope copy.
- 2026-10-18: network e2e at ce8cc3d7, retry 0, load1 31: `register-token.test.ts` pass (13.4 s) and `type-roles-windows.test.ts` pass (190 s); the run took 4.9 min. No e2e scenario added.
- 2026-10-18: the PR's pictures come from a scratch spec copied into `tests/e2e/network/` for the run and deleted after: an address no contract holds makes the window's read fail; failed import rows are seeded into storage and read after a page reload, since Home reads the journal once at mount. The "before" window ran with `index.vue` from c8a423f2, restored after the run.
- 2026-10-18: Codex arc 2 round 1 (gpt-6.1-sol, high, read-only, session 01a15024): approve; two comment fixes taken, one copy point filed as OA-6. Opus review: approve; four local fixes taken, one known limit (plan, Arc 2 implementation review).
- 2026-10-18: Codex arc 2 round 2 (resumed, on 473a2867): approve, no new material issue. The loop converged in two rounds.
- 2026-10-18: final gates: `typecheck:all` red once at the dev merge (a review fix's test stub typed against the old mock signature; vitest and Biome had passed); fixed by typing the stub's parameters. Lesson: run `typecheck:all` after every review fix, not only lint and the touched tests.
