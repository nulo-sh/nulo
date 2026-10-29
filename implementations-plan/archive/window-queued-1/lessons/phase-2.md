# Phase 2: full gate, the e2e that hold a window, the picture

- `bun run test:all`: exit 0 in 161 s (extension 16413 passed).
- Chrome, one `e2e:agent` run at retry 0, proverless, the three gate files plus the scratch spec: `concurrent-sendtx-confirm` 1/1 (39 s), `tx-sendTx-noFrom` 3/3 (65 s), `same-token-concurrent-sends` 17/17 (589 s); 811 s for the run. The run exited 1 on the scratch spec alone: the fixture's account had only the sponsor row enabled, so no other method could be picked. No gate test failed.
- The scratch spec, second try: closing the method menu by clicking its trigger again did not close it (5 s wait timed out). Third try, a priority pick (Fast) in the held window: green in 39 s; it saw the queued sentence leave the row with Confirm off, then return while the proof gate still held. Pictures under `screenshots/`. The spec was deleted from `tests/e2e` before the commit (`git status --porcelain apps/extension/tests/e2e` empty).
- Review round 1: Codex `clean`; Opus one low test-hygiene finding, fixed; the window file reran green, 69/69.
- Review round 2 (Codex, resumed, over the hygiene fix): clean. Converged.
- Firefox (158.0), one `e2e:agent` run at retry 0, proverless, the three gate files: `same-token-concurrent-sends` 17/17 (660 s), `tx-sendTx-noFrom` 3/3 (75 s), `concurrent-sendtx-confirm` 1/1 (43 s); 855 s for the run, exit 0.
- Final head (`8f3e7056d`): `bun run lint` exit 0, `bun run typecheck:all` exit 0 (41 s), `bun run test:all` exit 0 (156 s). The e2e runs predate only the test-hygiene commit, which changes no shipped code.
- Not promoted to `lessons.md` (its budget is nearly spent): `vi.clearAllMocks` keeps queued `mockReturnValueOnce` values (vitest 4.1.12), so a case must consume every once-value it queues.
