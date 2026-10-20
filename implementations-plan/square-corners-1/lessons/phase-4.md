# Phase 4: pictures after, smoke, full gate

- 2026-10-20, arc head `a10229c1f`. Armed rebuild; the two notice shots `after`: 2 passed, no rounded element in either theme. The eight notice PNGs are in `screenshots/`.
- The OA-1 build: `git apply` under a trap naming the patch path in quotes, build 0, the trap printed `REVERSED_OK`; `git diff --quiet` and `git status --porcelain -- packages apps` empty before the shots. The six `oa1-*` shots `after`: 6 passed, no rounded element in either theme. In the JSON viewer's search panel, the three checkboxes are native controls whose rendering Chrome rounds while their computed radius is 0; OA-1 says so.
- Rebuilt the arc head; `import-errors-scroll.test.ts` on Chrome at retry 0: 4 passed, 95 s wall-clock (no scenario added or changed). `bun run audit:vue` 0 (218 s; 878 files, 14,437 tests). `bun run test:all` 0 (179 s).
