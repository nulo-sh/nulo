# index-union-1: phase 1

- Red/green: with the base `.gitattributes` in the working tree and the index, the merge test fails at its first `git merge` (conflict) and the scope pin reads `[]`; with the change staged, both pass.
- `check-attr --cached` reads the index, so the pin fails until `.gitattributes` is staged: expected, and the reason the red step stages the base file.
- Gate: lint, `typecheck:all`, `test:ci-gating` (640 pass), `test:release` (341 pass, 10 skip), `check:plans` 0 findings.
- Codex r1 (session 01a15ac8): global `merge.verifySignatures=true` false-reds every fixture merge (reproduced with `GIT_CONFIG_GLOBAL`); fixed in the fixture's `-c` list. Opus diff review: same, plus system attributes (taken) and repo-local `info/attributes` (no git switch; known limit). Codex r2: clean.
