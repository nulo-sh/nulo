# connected-app-build-1: phase 3 (arc 2)

- The lane brief said the plan folder was on dev unarchived; arc 1's close-out had archived it (#1835). Arc 2 reopened it with a `git mv` back out of `archive/` and its index line moved back; the plans gate stayed green.
- `[id].test.ts`'s `line` helper read the first `cap-row-sub` on the page, which was the switch row's until the kind rows came first; it now reads the switch row's own line. No assertion changed.
- `bun run lint` was red once on one formatting error in the new page test; `biome check --write` on the changed files, then green.
- Captures: the render lane's capture page (`782858322`) copied in uncommitted for each run and removed after. The first window frame drew the table 169 px wide: the host was an item of `#app`'s row flex with no `flex-grow`, so it took its content's width, and an inline-size container contributes none. The real window's `.approval_wrapper` has `flex: 1`; the host now grows the same way. The page's and the window's chains both stretch the table, which Codex confirmed.
- The window's Details table at 400 px is byte-identical before (dev's `DetailsTable.vue`, copied into the kit) and after, light and dark, from one run.
- Codex (gpt-6.1-sol, high, read-only) round 1: approve with fixes. An unreadable stored simulation holder threw on the page (demonstrated with an in-memory reproducer; the fix's page case is red on the old file); the container comment's arithmetic. Both fixed in `a43cfdb89`. Round 2, resumed: approve.
