# Phase 4–5 — arc 2: the popup line and the kept row

- Merged `origin/dev` at `93aeedbc1` first. Only #1895 had landed since the arc-1 head; #1894, #1886, #1891 and #1897 were still open, so the index files needed no union.
- Page test, first run red: an added token with `updatedAt: 0` holds the import's balance wait until its task finishes. The case now finishes the task, then sends the empty balance, in the worker's order. Removing `keepSearchedRow` from the page reds it at the fold assertion.
- Static gates and `bun run test:all`: green at `2334574d9`.
- Smoke on Chrome and Firefox (`token-list`, `send-picker-add`, `settings-crud`): 12 tests green on each. The new popup step in the flagged scenario adds about 0.3 s on Chrome (12.41 s to 12.73 s).
- Network on Chrome and Firefox (`holdings`, `send-picker`): 4 tests green on each.
- Codex `gpt-6.1-sol` high, a fresh session over the arc-2 diff: **approve**, no runtime bug. It asked for one test, now added: a read parked by an earlier showing must never reach the current one. Its two comment nits are taken. Its correction to E6's rationale is taken: a changed query can still match partially, and what keeps focus is that it sits in the search field.
- Captures: the lane's kit plus two scenes, `flag-popup` and `empty-kept`. The first run timed out on one page load (a Vite reload) after two frames; the rerun of the rest was clean. The kit logs a `displaceIdx` prop warning because its root registers no popup order. Arc 1's kit did the same, and no frame shows it.
