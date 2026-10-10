# Phase 4 lessons: arc 4, plans ignore patterns (#182)

Arc 4 branches from `dev` at 69eab05 (#261 squash-merged arc 2; D-orch-8), beside arc 3, not on top of it.

## 4.1 Four more shapes

- #182's four shapes (`draft-*.md`, `outline-*.md`, `leg-*.md`, `eli5-*.html`) join `implementations-plan/.gitignore` above `!**/lessons/**`, `CANONICAL_PATTERNS` and the fixture's `CANONICAL_GITIGNORE`. No tracked file matches one, archive included. The issue's `owner-decision` question is the shapes themselves, which the lane map settled, so no owner ask remains.
- Reds on the base code (the new tests with the old `lib.ts` and fixture): 4 fail. They were the `isCanonical` positives, the new tracked-artifact case, the missing-lines count (6 → 10) and the negation's line number (6 → 10).
- The planted file, by the CLI: a scratch repo held the real `.gitignore` and `.ignore`, a plan and `draft-x.md`. `git add -A` left the draft out. After `git add -f`, `check.ts` reported `tracked-artifact implementations-plan/p/draft-x.md:1 — … is tracked although ignored` and exited 1.
- Mutation: with `leg-*.md` removed from the staged `.gitignore`, `check:plans` reported `missing \`leg-*.md\`` (1 enforced finding). With the line restored it reported 0.
- The plans gate reads the index: until the edited `.gitignore` was staged, the tree test `the tree has no finding under an enforced rule` failed on the missing lines.
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test:all` 0 (every workspace; extension 10875 passed, 4 skipped, 7 todo), `test:ci-gating` 0 (480 pass), `lint:actions` 0, `check-no-local-paths.sh` 0, `check:plans` 0, `git ls-files -ci --exclude-standard -- implementations-plan` empty.
- **Two PRs off one base merge clean only on disjoint lines.** Both branches carried the same plan commit under different SHAs. The merge base (`dev`, and again `dev` after a squash) lacks that block, so each side inserts it, and a later edit inside it on either side turns two identical insertions into a conflict. The fix keeps the inserted block identical on both branches and puts each arc's records at anchors the other never touches. `git merge-tree --write-tree <a> <b>` proves it in both orders before a push.
- The blueprint skill (aa-skills, outside this repository) lists the old four shapes; the report flags it, and nothing there changes (D-orch-9).
- Review: Codex round 1 one Low (the merge conflict); the Opus review one Medium (the same), one Low (declined) and one Nit; Codex round 2 clean. Verdicts in plan.md, Phase 4.1.
