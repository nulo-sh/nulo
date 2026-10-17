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

## Notes

- Three old skip patterns named file kinds the tree does not hold under those roots: `useLogFilters.scan`'s `.spec.ts`, and `toast-call-sites`' `.ts`-only `test|stories|d` (no `.test.js` or `.stories.js` exists). The policies use the shared `TEST_FILE`, `STORY_FILE` and `DECLARATION`; the lists above are equal.
- `icon-names` keeps stories in its walk (its retired-icon check reads every line of them) and keeps its own SFC parse, which needs each script block's `lang`.
- `copy-dash-ban` now reads SFCs through `parseSource` and `NODE`; its scan results are unchanged (its own tests and the full-tree review pass).
- `sourceFiles` returns sorted lists where several old walkers returned readdir order; no guard's assertion depended on order (all green).
- A first test draft assumed `packages/design/src` holds a non-exempt `.css`; it holds none (`base.css` and `utilities.css` are both the generated layer). The test reads `.ts` there instead.
