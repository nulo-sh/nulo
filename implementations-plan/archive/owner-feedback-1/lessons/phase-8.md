# Phase 8: close-out

- 2026-10-18: the three arcs each carried the plan commit and were not stacked. Once #791 put the plan's index line on `dev`, arc 1's merge of `dev` auto-merged `index.md` with `owner-feedback-1` listed twice, since both sides had added the line; `test:ci-gating`'s plans gate failed #788's `quality-status` (run 39153818156: `index-structure … owner-feedback-1 is listed twice`). `d681024d` kept one line. Run `bun run check:plans` after every `dev` merge into an arc branch, before pushing.
- #793 merged before #788, so arc 3 could not carry the close-out (D7); this docs-only PR off `dev` does.
- Open items filed: #796 (the name-matched fee call, plan § Security); #797 (`SettingsSearch.test.ts`'s held Escape, red on attempt 1 of runs 39144528197 and 39145074295, green on attempt 2). #624 commented: the limit now covers the token page, its reopening condition unmet.
- `lessons.md` stood at 8,188 of 8,192 bytes: the index lesson went in by merging the two entries it shares a cause with (the stack gate's add/add, the parallel arcs' decision ids). Chrome's 1/64 px floor ([phase-7.md](phase-7.md)) stays here: no room beside the 1/60 px entry.
