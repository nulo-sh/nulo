# Phase 6–7 — arc 3: the hidden check

- Merged `origin/dev` at `93877b8b1` first (#1900, #1886, #1894, #1902, #1897). No conflict; the index files needed no union.
- Component tests: the flagged and late-read cases assert the check; with the `v-if` reverted both are red, with it green (36 tests).
- Lint, `typecheck:all` and the extension's `bun run test` green at `2faf38359`.
- Smoke `token-list.test.ts` on the armed dist: 2 tests green on Chrome (23.5 s) and on Firefox (31.9 s). No spec asserts the check, which has no testid; the flagged scenario proves the popup's real read sets the flag the check now follows.
- Codex `gpt-6.1-sol` high, a fresh session over the arc-3 commit: **approve**, no findings, no nits.
- Capture: the lane's kit with one frame added, `ha-flag-nocheck` (the `flag-popup` scene), light and dark. Clean on the first run.
