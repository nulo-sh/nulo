# index-union-1: phase 1

- Red/green: with the base `.gitattributes` in the working tree and the index, the merge test fails at its first `git merge` (conflict) and the scope pin reads `[]`; with the change staged, both pass.
- `check-attr --cached` reads the index, so the pin fails until `.gitattributes` is staged: expected, and the reason the red step stages the base file.
- Gate: lint, `typecheck:all`, `test:ci-gating` (640 pass), `test:release` (341 pass, 10 skip), `check:plans` 0 findings.
