# Phase 4 — #30 the restore stash dies with finalize

- OA-3 before shots were taken first, on 3fb939b (proverless network run, Chrome, both themes): the import of a backup whose token artifact has `burn_private` renamed ends on Home with "Profile imported" and no warning. The OA-1 before shots were already taken on 3fb939b by the interrupted session.
- The `finally` needs `return await` on both branch calls: a bare `return` of the branch promise inside `try` runs the `finally` before the branch settles. No test can see the difference today (the passkey branch takes or refuses before its first await, and the password branch never stashes), so the await is there so the guard reads the settled state.
- The already-active row stubs `sessionManager.isActive` for the restored id: no public path opens a session for a restored row without consuming or bypassing the stash.
- Red on the base: the five table rows fail with the base `service.ts`; the guard test passes on the base and fails with an unguarded `finally { drop }`, so it pins the identity check specifically.
- Gate: `vitest run src/wallet/services/profile/` 334 passed; `bun run lint` 0 (after a formatter pass on the test file); `typecheck:all` 0.
