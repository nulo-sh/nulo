# Phase 1: build, gates, review

- 2026-11-17, `fa16cac69`: `bun run test` red in `src/popup/pages/send.test.ts` ("the publish line carries the facts on an unfinished form…"), a second pin of the page's long warning words the plan's recon missed (it grepped `tests/e2e` and the render lane's test list). Rewritten to the short sentence, whole and exact (`7a29add73`); the gate reran green.
- 2026-11-17: a zsh array, not a space-joined string, for a list of paths in one Bash call: `$SRC` stayed one word and the base-copy step failed safely before writing anything (the known agent-shell lesson).
