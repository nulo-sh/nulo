# Status: e2e-ci-followups-2

- 2026-10-15 21:43Z phase 0: briefs read, worktree adopted at d59459ab, registered.
- 2026-10-15 22:05Z phase 0.4: recon done (#500 cause traced to the first module fetch; #405 confirmed; #322 creator chunk mapped), recon.md written.
- 2026-10-15 22:15Z phase 0.4: CI-log search done (#322 no recurrence in 192 post-#328 Firefox runs); reproducer prototype red at base, static shape green, both engines.
- 2026-10-15 22:25Z phase 1: plan drafted (139 lines); `check:plans` 0 findings; Codex (Sol, high) and Opus audits started.
- 2026-10-15 22:30Z phase 1: Codex round 1 and Opus round 1 both `conditional approve`; every finding adopted (ledger in plan.md); Codex round 2 running.
- 2026-10-15 22:40Z approval gate: Codex round 2 `approve`; plan committed, awaiting the orchestrator's approval.
- 2026-10-15 23:29Z arc1 phase 1 gate PASS: reproducer red at base (ext 3, bridge 2, both engines) and green at head; five files Bun+Node green; bridge test green; extension suite Bun exit 0, Node exit 0 with the 3 BUN_ONLY_FILES excluded (reviewed Bun-only files); lint, typecheck:all exit 0.
- 2026-10-15 23:49Z arc1 phase 2 gate PASS: CI-value case red at base ([10, 2, 3, 5]) and green at head; execution suite Bun exit 0, pins unchanged; Node exit 0; Chrome e2e of both Fast/Urgent files at the CI env 18/18 green, parseFloat(`10`) in the bundle; lint, typecheck:all, test:all exit 0.
- 2026-10-16 00:03Z arc1 review round 1: Codex approve (1 low adopted), Opus conditional approve (3 comment/doc fixes adopted); fixes in 92a419ce; Codex round 2 running.
- 2026-10-16 00:36Z arc1 phase 3 gate PASS: firefox-driver unit Bun+Node exit 0; Firefox smoke retry 0 58/61 files passed (3 skipped), exit 0; seed 1960252198 replay on Firefox at retry 0 through agent.sh green, no recursion; no ports.md row left; lint, typecheck:all exit 0.
- 2026-10-16 00:53Z arc1 final gates PASS on 92a419ce: lint, typecheck:all, test:all, test:ci-gating, lint:actions exit 0; Chrome fee e2e pair 18/18 green at the CI env.
