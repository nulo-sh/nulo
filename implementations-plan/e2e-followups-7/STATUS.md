# e2e-followups-7 status

- 2026-10-13: homed (adopted worktree off `origin/dev` e900f710); briefs, #349 and its comment read; recon (1 Explore agent, sonnet) returned.
- 2026-10-13: code trace names a suspect writer: the transaction worker's finality commit re-projects the account's balances (`token-balance/service.ts` `onTransactionUpdated`). Probe round 1 (Chrome, two cores, retry 0) started.
- 2026-10-13: probe round 1 (Chrome) reproduced the failure; the trail names the grant's finality commit as the writer. Rounds 2-3 Chrome and 1-3 Firefox running.
- 2026-10-13: Codex decision consult (gpt-6.1-sol, high): verdict T, the sequential barrier before the mint. Plan drafted; Codex plan audit and Opus Plan lens running.
- 2026-10-13: Codex plan audit conditional approve, Opus lens conditional approve; all conditions applied; Codex verify: approve. Base widened copy written; Firefox base rounds 2-3 running.
- 2026-10-13: base rounds done (Chrome 4/7 drained failed, Firefox 0/9 with the late write in 6/9); base widened copy red 3/3 per browser; probe edit and copy removed, tree clean.
- 2026-10-13: arc-1 started; merged origin/dev (dd922823, #356); Phase 1 code committed (0fcecdae); lint, typecheck:all, test exit 0. Head widened copy running.
- 2026-10-13: Codex review r1 conditional approve, Opus lens conditional approve; fixes 91353f1c; Codex r2 no new material finding. Head widened copy Chrome 4/4 green, each final commit before the spend.
- 2026-10-13: head widened copy Firefox 4/4 green, final commit before the spend in each drained case; copy deleted. Runtime, amplified and failed-send-check runs queued.
- 2026-10-13: amplified gate passed: Chrome 15/15 drained + 5/5 control, Firefox 15/15 + 5/5, worst headroom 44%. failed-send-check running.
- 2026-10-13: failed-send-check Chrome 2/2, Firefox 2/2. Phase 1 gate passed. Arc gate next.
- 2026-10-14: merged origin/dev (1823144f); snack-placement on the merged head Chrome 4/4, Firefox 4/4; arc gate (test:all, test:ci-gating, lint, typecheck:all, check:plans, lint:actions) exit 0.
