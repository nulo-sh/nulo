# Phase 4: pictures after, smoke, full gate

- 2026-10-20, arc head `a10229c1f`. Armed rebuild; the two notice shots `after`: 2 passed, no rounded element in either theme. The eight notice PNGs are in `screenshots/`.
- The OA-1 build: `git apply` under a trap naming the patch path in quotes, build 0, the trap printed `REVERSED_OK`; `git diff --quiet` and `git status --porcelain -- packages apps` empty before the shots. The six `oa1-*` shots `after`: 6 passed, no rounded element in either theme. In the JSON viewer's search panel, the three checkboxes are native controls whose rendering Chrome rounds while their computed radius is 0; OA-1 says so.
- Rebuilt the arc head; `import-errors-scroll.test.ts` on Chrome at retry 0: 4 passed, 95 s wall-clock (no scenario added or changed). `bun run audit:vue` 0 (218 s; 878 files, 14,437 tests). `bun run test:all` 0 (179 s).
- Fix loop round 1: Codex (session `01a15930`) 2 findings, Opus diff review 4; all fixed (plan.md § Audit verdicts). Red/green on the reworked pin: base card from `origin/dev` 1 failed of 16, naming `.card { border-radius: 16px }`; head 16 passed.
- Fix loop round 2: Codex 1 finding (a comment inside an inline property name), fixed by parsing inline styles as CSS. Red/green: base 1 failed of 17, head 17 passed.
- Fix loop round 3: Codex `clean`; converged.
- `origin/dev` took #915 (this notice's new words) and #909; merged in (no conflict). The four popup notice pictures were re-shot on the merged head: before from a build with `origin/dev`'s card restored under a trap (`RESTORED_OK`), after from the head; readings 16px before, none after. The onboarding pictures did not change. Final gates on the merged head: `import-errors-scroll.test.ts` 4/4 at retry 0 (70 s), lint 0, `typecheck:all` 0, `test:all` 0 (214 s).
