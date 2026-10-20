# Phase 0: planning consults

- Recon: one Explore sweep on Sonnet, nine capabilities; its findings are in `recon.md`. It confirmed the pinned #863 test, the `exceedsBalance` overlap with an unknown balance, the field-error precedent and the absence of `--nulo-error`.
- Codex (gpt-6.1-sol, high), plan round 1: conditional approve. Four findings: the visible states the plan decided without an ask (USD mode, a zero balance), a stub test that compared props the stub never declared, I2's wrong reason, and the rerun rule. All folded but a component witness for the USD overlap (the card trusts its prop; the overlap is page timing). Codex reproduced I1 on Vue 3.5.42 in memory.
- Opus 5.5 (Plan), plan round 1: conditional approve. The same stub gap, the in-flight test's missing success control, OA-3 to OA-5, I2, the restore spec never run in the network harness, the account switch's missing control, two nits. All folded. It verified I1 in `@vue/reactivity` 3.5.42 and D3's trace.
- Codex, plan round 2 (resumed): approve, no remaining finding.
