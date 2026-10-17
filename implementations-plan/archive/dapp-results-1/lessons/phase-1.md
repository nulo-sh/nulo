# Phase 1: three redactor keys

- 2026-10-17, red on base. The new `test.each` rows run against `563b0627`'s `utils.ts`: 3 failed, 60 passed. Each row failed on its sentinel assertion (`expected '[{"newNotes":…' not to contain '918273645011'`, the same for `taggingIndexRanges` and `witness`), not on serialisation.
- 2026-10-17, green. With the three keys: `utils.test.ts` and `log-payload-ban.test.ts` 122 passed (the guard flags no line). Gate F: lint, typecheck:all, test (13571 passed), test:all, each exit 0.
