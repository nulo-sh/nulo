# Phase 1: arc 1 (#544)

- 2026-10-16 phase 1.1: the rewritten `patchPagePolling` predicate was compared with the base one, both extracted from the real source by the TypeScript parser and run over present × display × visibility × zero width × zero height × visible × hidden: 128 cases, 0 differences. Control: a mutant (`&&` → `||` in `shown`) differs on 6 cases, so the table can see a change. Scratch script, not committed.
