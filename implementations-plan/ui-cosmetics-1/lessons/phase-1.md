# Phase 1: the Presto step is done on open

- `prestoOpened` added beside `aztecOpened` in `profile-ui-keys.ts`, `get-started.ts`, `useGetStarted.ts` and `stored-shapes.ts`; two golden rows; `bun run baseline:storage` rewrote stamp 0, and a second run changed nothing. `pins.ts` was still empty on `origin/dev` at e34f361ba, so no `--additive` stamp.
- Home starts the mark and pushes Proving at once; the test holds the write pending, sees the route, then the flag.
- Controls (uncommitted): dropping `i.flags.prestoOpened ||` reds the rule row only; dropping the mark in `general.vue` reds the Home row only.
- First typecheck red: `getMockImplementation()` returns a union that is not callable; the held write now assigns into the mock's data directly.
- Gate: lint 0, typecheck:all 0, test 0 (902 files), test:all 0.
