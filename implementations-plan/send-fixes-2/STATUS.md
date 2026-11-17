# send-fixes-2: status

- 2026-11-17: plan written at `0dc22a9c5`; issues #1825-#1828 filed; before captures taken (smoke Chrome, network Chrome).
- 2026-11-17: Phase 1 built (`cee256426`..`db9d5344e`). Gates green at retry 0: lint, typecheck:all, test (1045 files), test:components, check:plans; smoke Chrome `send-keyboard`, `rows`, `send-outcome-rows`; smoke Firefox `send-keyboard`; network Chrome `fee-shortfall-recheck` with the after capture. T1 to T3 red on the base.
- 2026-11-17: Codex round 1 `changes` (three test comments, deleted in `728f7e5c0`), round 2 `approve`. After captures taken (Chrome and Firefox). Next: the PR.
