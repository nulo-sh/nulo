# Phase 1: re-land the relay

- `git revert --no-commit 9094cf9` on 332cc60 (`origin/dev` 27af8d7 merged): no conflict. Committed as 7339312, `test(e2e): re-land the firefox page-error relay`.
- Exactness: `git diff --cached --quiet 39f3dda --` the eight relay files exits 0 (byte for byte the reviewed relay). `git diff 39f3dda HEAD` outside `implementations-plan/` lists only #300's twelve files, none of them a relay file.
- Gate, 2026-10-11, all at retry 0:
  - `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (740 files passed, 3 skipped; 11252 tests passed).
  - Relay units (`firefox-driver`, `browser-seam`, `page-errors`): 3 files, 96/96.
  - Armed smoke builds, Chrome and Firefox: exit 0.
  - `page-error-capture.test.ts`, Chrome: 1/1 (dist listing hash unchanged across the run).
  - `page-error-capture.test.ts`, Firefox: 1/1; the launch's close check passed; stderr shows the control's own `NULO-PAGE-ERROR-*` lines (A-THROW, B-REJECT, A-AFTER-RELOAD, C-SELF-CLOSE, WEB, A-SENTINEL, B-SENTINEL) and one `unsafe filename` line for its one launch.
