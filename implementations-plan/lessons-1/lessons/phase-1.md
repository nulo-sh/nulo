# lessons-1, phase 1: the two edits and the review loop

- 2026-10-21: branch `lessons-1-a1` off the plan commit; the two edits applied from the plan's table and compared byte for byte with the approved scratch proposal (`cmp` equal); 8178 B; `check:plans` 0 findings.
- Gates at that head, retry 0: `lint` exit 0 (9 s), `typecheck:all` exit 0 (106 s), `test` exit 0 (215 s), `test:all` exit 0 (219 s), load1 185 to 276 on 188 cores.
- Codex r1 (gpt-6.1-sol, high, session 01a15fe6, default `~/.codex` login): approve, no finding.
- Opus diff review (model opus), beside r1: approve with changes. #1 "runs no Vue unmount hook" can read as excluding `onScopeDispose`, the hook fee-estimate-cancel-1's own bug sat in (its recon § Facts): taken, "runs no Vue teardown" (−4 B). #2 the evidence link carries the page-side half only through KL1: taken in the plan, F2 now cites `popup/windows/execute/index.vue:516-518`; the line keeps one link (no room for a second). #3 `pagehide` and `visibilitychange` also fire on a close: no change, the advice stands.
