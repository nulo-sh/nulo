# Phase 2: the surfaces

- **Red on the base templates.** All 13 new cases failed on the dash assertion (`'   '` or `''` where "—" was expected), none on the harness.
- **Harness slips, fixed in the tests.** `RecentActivityView.test.ts`: a UI transfer task needs its `amount` (`executingAmount` formats it once the token resolves); without it the render threw and every later mount in the file read `vm` as null. `SelectTokenPopup.test.ts`: rows order by name, so the blank row (name `"    Token"`) comes first.
- **Gate.** `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (879 files), `bun run test:all` 0, `bun run build` 0. The build added `dashIfBlank` to `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json`, committed. `OperationCard.vue` and `scripts/type-roles` unchanged since the base.
