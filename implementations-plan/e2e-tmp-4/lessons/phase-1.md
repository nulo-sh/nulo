# e2e-tmp-4 phase 1: the dirs and the proof

- **Base** (`origin/dev` at `421bf33b4` merged; the merge touched none of the arc's files): step 4 under the stub exit 0, 1 file passed and 2 skipped, 2 tests passed and 42 skipped, 3 dirs left; under the long scratch `TMPDIR` exit 1, the 4 named `owned-processes` cases failed with the socket-path message, 40 passed, 1 dir left (`nulo-aztec-outside-*`).
- **After the edits** (`7cdb55421`): step 6 the same counts, 0 dirs; step 7 (`env -u TMPDIR`) 3 files and 44 tests passed; step 8 the same 4 failures and message, 40 passed, 0 dirs.
- `bun run lint` exit 0 (4 infos, all in files the arc does not touch); `bun run typecheck:all` exit 0 (the extension's `tsconfig.scripts.json` types the three files).
