# test-infra-1: phase 1 (one walker)

## The comparison

Scratch, not committed, under `~/.cache/nulo-backlog/test-infra-1/walk/`:

- `old-walkers.ts` holds the 14 walkers as they were at `0fe841be` (`git show 0fe841be:<file>`), each verbatim but for its root: the 13 guards' plus `source-scan.ts`'s default typography walk. It writes each sorted repo-relative list and prints its count and sha256. Run from the worktree root: `bun ~/.cache/nulo-backlog/test-infra-1/walk/old-walkers.ts "$PWD" ~/.cache/nulo-backlog/test-infra-1/walk/old`.
- The new side is what the migrated guards actually walk: `sourceFiles` temporarily appended each result with its caller to a dump file (`NULO_WALK_DUMP`), the 13 guard files plus `inventory.test.ts` and `type-role-ban.test.ts` ran under `bun --bun vitest run` (14 files, 262 passed, 1 skipped), and `compare.py` grouped the dump by caller. The dump was then removed (the committed `source-scan.ts` is the pre-dump copy).
- `dotted-new.ts` runs the migrated `DottedTerm.scan` reading (`walkElements`, `staticAttr`, `boundAttr`) and prints `file<TAB>key|bound|(none)` sorted; `old-walkers.ts` prints the old regex reading the same way.

## Result (same working tree, 2026-10-17)

| guard | count | sha256 (first 12) | old = new |
|---|---|---|---|
| typography default (`inventory`, `type-role-ban`, `surfaces`, `identifier-sites` sites, `a11y-css`) | 770 | 2281ddd81044 | yes |
| `copy-dash-ban` (with `SCAN_FILES`) | 782 | ba6e853d3dd6 | yes |
| `log-payload-ban` | 1854 | e92eae673a0a | yes |
| `useLogFilters.scan` | 994 | 8f82e29cb394 | yes |
| `storage-facade-ban` | 1435 | d805bc0568b6 | yes |
| `profile-ui-keys.scan` | 1435 | d805bc0568b6 | yes |
| `toast-call-sites` | 717 | 0c4e6d6b051d | yes |
| `legal/call-sites` | 746 | ddb5d5c0f6a6 | yes |
| `expiry-deferral.pins` | 746 | ddb5d5c0f6a6 | yes |
| `DottedTerm.scan` (files) | 221 | c31e58aff9fd | yes |
| `DottedTerm.scan` (occurrences: file, key or bound) | 6 | 0892995b0a31 | yes |
| `icon-names` | 810 | f0fcefdd8b71 | yes |
| `useConfirm` | 748 | 3da9188966d2 | yes |
| `a11y-css` (skeleton walk) | 239 | 07fd7f53efc0 | yes |
| `identifier-sites` `producerHits` | 979 | d6b5ee262e80 | yes |

Re-run after the per-guard skips, on the tree merged with `origin/dev` at 17d42d5a: all 14 lists and the DottedTerm occurrences equal again (typography default 773, `copy-dash-ban` 785, `log-payload-ban` 1858, `useLogFilters.scan` 997, `storage-facade-ban` and `profile-ui-keys.scan` 1439, `toast-call-sites` 720, `legal/call-sites` and `expiry-deferral.pins` 749, `DottedTerm.scan` 221, `icon-names` 813, `useConfirm` 751, `a11y-css` 239, `producerHits` 982).

## Notes

- Equal lists over today's tree do not prove equal coverage of tomorrow's. The first draft pruned `node_modules` and `dist` in every walk and gave `useLogFilters.scan` and `toast-call-sites` the shared `TEST_FILE`, `STORY_FILE` and `DECLARATION` classes; Codex showed, on synthetic trees, a file under `src/dist/` the storage guard would no longer read and a `.test.js` toast call the toast guard would no longer check. Each guard now keeps its exact old skips: the prune is gone from the walker, `log-payload-ban` skips `/(node_modules|dist)/`, `identifier-sites` `producerHits` skips `/node_modules/`, `useLogFilters.scan` skips `.(test|spec).ts` and `toast-call-sites` `.(test|stories|d).ts`.
- `icon-names` keeps stories in its walk (its retired-icon check reads every line of them) and keeps its own SFC parse, which needs each script block's `lang`.
- `copy-dash-ban` now reads SFCs through `parseSource` and `NODE`; its scan results are unchanged (its own tests and the full-tree review pass).
- `sourceFiles` returns sorted lists where several old walkers returned readdir order; no guard's assertion depended on order (all green).
- A first test draft assumed `packages/design/src` holds a non-exempt `.css`; it holds none (`base.css` and `utilities.css` are both the generated layer). The test reads `.ts` there instead.
