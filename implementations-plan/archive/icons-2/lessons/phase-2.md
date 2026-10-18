# Phase 2: the marks and the words

- 2026-10-18 `gen:glyphs` changed only the `private` and `public` entries of `glyphs.ts`.
- 2026-10-18 D3 control: with the `public` row set to `world-pin` and regenerated, `Icon.test.ts` failed on its "network globe" check (1 failed, 5 passed); the row was reverted and regenerated.
- 2026-10-18 first `bun run lint`: one format error, the shorter public sentence now fits one line in `settings/glossary.test.ts`; `biome format --write` on the two glossary tests. Then: design tests 512/512, lint 0, `typecheck:all` 0, `test` 13977 passed, `test:all` 0, and the square-words grep prints nothing.
