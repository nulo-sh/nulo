# Phase 4: the full gate

- 2026-10-19: merged `origin/dev` at `f214e5cb` (#853, the execute window; no file in common), a clean merge.
- 2026-10-19: `bun run audit:vue` 0 (14,106 tests, build); `bun run test:all` 0; both armed builds 0. Smoke over `viewers-csp` and `keyboard-guards`: Firefox 10/10 (78 s); Chrome 9/10, the trim hold check timing out while it logged 1,100 lines (169 rendered in 60 s, load1 rising past 180 during the run), then 10/10 on its one rerun (54 s).
- 2026-10-19: `bun run test:ci-gating`: two 5 s timeouts under load (`workflow-refs.test.ts`'s whole-tree scan, `publish-packages.test.ts`'s registry hook); both files 40/40 alone at load1 148. CI's runners carry the authoritative run.
