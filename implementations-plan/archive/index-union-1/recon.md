# index-union-1: recon

One Explore agent (sonnet) over `.gitattributes`, the plans gate and the docs, plus the driver's own measurement and git probes. Base: `origin/dev` at `01c27912`.

## Reuse map

| Need | Already there | Use |
|---|---|---|
| Refuse a duplicate archive line | `judgeArchiveEntry` (`scripts/ci-cd/plans/structure.ts:188-207`): "`<dir>` is listed twice" | as is |
| Refuse an archived plan with no line | `archiveStructureFindings` (`structure.ts:209-225`): "`<dir>` has no line in archive/index.md" | as is |
| Refuse a malformed or dead line | same function: `malformed` lines; "is not in the git index" | as is |
| Run the gate on the real tree, enforced on PRs | `tree.test.ts:15-24` (`checkTree({ cwd: ROOT })`, verdict `pass`), inside `test:ci-gating` (`package.json:32`), run by `_unit-tests.yml:71` under `quality-status` | as is |
| Throwaway repos with branches and merges | `fixture-repo.ts`: `makeRepo`, `git`, `writeFiles`, `commitAll`, `findings` | the new merge test |
| Fixture tests for the archive rule | `structure.test.ts:169` `describe("archive-structure")` (`bun:test`) | add one test |
| Run git from a test at the root | `lib.ts:87` `runGit(cwd, args)`; `createCtx({ cwd: ROOT })` | the scope pin |

## Findings

- `.gitattributes` has 8 lines and no `merge=` attribute; no script or test reads or pins it (grep `gitattributes|linguist|merge=` over `scripts/`, `.github/`, `apps/`, `packages/`). `git check-attr --cached merge` over all 5,992 tracked paths reports nothing (40 ms).
- The only doc that describes `.gitattributes` for the plans tree is `implementations-plan/README.md:95` (portable rule 10). README:110 (Post-implementation step 4) says "never a union merge" about the close-out's trunk merge of `index.md` and `lessons.md`.
- The blueprint skill (outside this repo) scaffolds the two `linguist-generated` lines and says, of `index.md` and `lessons.md`: "Do not configure a union merge driver for these files."
- Churn on `origin/dev` at `01c27912`: `archive/index.md` 26 commits in 24 h, 115 in 7 days; `git log --numstat` shows no commit ever deleted a line from it. `index.md`: 15 commits in 24 h, of which 8 only delete a line, 5 only add one and 2 replace one.

## Git probes (git 2.43.0, scratch repos under `~/.cache/nulo-backlog/index-union-1/probe`)

| # | Case | Result |
|---|---|---|
| 1 | two branches append different lines; `merge=union` on the file; local `git merge` | clean, both lines |
| 2 | one branch appends, the other edits an existing line; union | clean, the old and the edited line both kept |
| 3 | bare clone, `HEAD` has the attribute; `git merge-tree --write-tree` of case 1 | exit 0 (clean) |
| 3b | the same without any attribute | exit 1 (conflict) |
| 4 | a branch without the attribute merges a `dev` that adds it, local | conflict: attributes come from the working tree |
| 5 | case 4 in a bare clone with `HEAD` = the branch without it | exit 1 |
| 5b | case 4 in a bare clone with `HEAD` = `dev` | exit 0 |
| 5c | `HEAD` = the old branch, `-c attr.tree=dev` | exit 0 |
| 6 | case 4 locally with `git -c attr.tree=dev merge dev` | clean, both lines |

Cases 3, 5 and 5b show a bare-repo `merge-tree` reading attributes from `HEAD`. Whether GitHub's mergeability check runs that way is unknown.
