# block-time-1 status

- 2026-10-20 19:20Z: homed (adopted worktree `block-time-1`, base origin/dev ca052f08); recon started (three Sonnet explorers).
- 2026-10-20 19:29Z: calibration run `wait-for-tx-mined.test.ts`, Chrome, proverless, retry 0: exit 0; build 61 s, vitest start to setup 76 s, node boot 47 s, deploy 10 s, file 10.9 s; load1 257 → 180.
- 2026-10-20 19:48Z: dual audit r1: Codex conditional approve, Opus conditional approve; every condition accepted (plan § Audit verdicts).
- 2026-10-20 19:52Z: final fresh Codex pass: r1 conditional approve (seven findings, all accepted), r2 approve. Plan approved for arc 1 under auto-continue.
- 2026-10-20 20:23Z: arc 1 phase 1.2 gate: instrument self-test `bt-st-02` green (spans, transitions across two `stopBackground`, four node-log lines, skew). Phase 1.3 running (`p1-ci-chrome`).
- 2026-10-21T01:01Z: arc 1 phase 1 gate met: CI baselines; Chrome CI proverless set (127 files) + reruns; Firefox P-mech ∪ P-pole (32); smoke shard 2/3 on both browsers; tables, top waits, H5 falsified as written (node path 7.7 % / 6.3 % of the critical job, above 10 % in six P-mech files per browser); projection about 15 h. Two instrument faults found and fixed (D11, lessons/phase-1).
- 2026-10-21T01:15Z: arc 1 phase 2 gate met: knob inventory with V-boot (`p2-vboot`, 12/12): H2 holds, H3 by code, slot readback 12/12, `aztecDebug_mineBlock`/`prove` work on the main port, finality offsets, listeners recorded. The pool age is boot-only (the admin schema strips it), so 3a sets it per boot (D12). Phase 3a running (14 probe boots).
