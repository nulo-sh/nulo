# Phase 2: full gate, the e2e that hold a window, the picture

- `bun run test:all`: exit 0 in 161 s (extension 16413 passed).
- Chrome, one `e2e:agent` run at retry 0, proverless, the three gate files plus the scratch spec: `concurrent-sendtx-confirm` 1/1 (39 s), `tx-sendTx-noFrom` 3/3 (65 s), `same-token-concurrent-sends` 17/17 (589 s); 811 s for the run. The run exited 1 on the scratch spec alone: the fixture's account had only the sponsor row enabled, so no other method could be picked. No gate test failed.
- The scratch spec, second try: closing the method menu by clicking its trigger again did not close it (5 s wait timed out). Third try, a priority pick (Fast) in the held window: green in 39 s; it saw the queued sentence leave the row with Confirm off, then return while the proof gate still held. Pictures under `screenshots/`. The spec was deleted from `tests/e2e` before the commit (`git status --porcelain apps/extension/tests/e2e` empty).
- Review round 1: Codex `clean`; Opus one low test-hygiene finding, fixed; the window file reran green, 69/69.
