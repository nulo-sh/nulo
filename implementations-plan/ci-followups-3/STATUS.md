# Status: ci-followups-3

- 2026-10-11: worktree adopted and registered; #309, #305, #306 read in full; #309's cause established from GET calls, rule insights and the run log (a draft PATCH without `tag_name`); recon (1 sonnet explorer) done; #305's 2^32 bound found to contradict run-id seeds.
- 2026-10-11: plan.md, recon.md, OWNER-ASKS.md (OA-1, the stray release) drafted; Codex audit (gpt-6.1-sol high) and the Opus Plan lens started.
- 2026-10-11: round 1: Codex conditional approve (8 findings), Opus conditional approve (9 findings); all verified; D2 reversed (two writes, each naming the tag), OA-1 gains the stray `untagged-…` tag, OA-2 added; Codex round 2 (resume) next.
- 2026-10-11: round 2: Codex conditional approve (2 Medium, 2 Low; round-1 conditions met; D2 reversal accepted); all accepted and applied; Codex round 3 (resume) next.
- 2026-10-11: rounds 3-4: Codex conditional approve (index line in the Phase 4 gate; 3 Low), then **approve**. Plan committed; awaiting orchestrator approval.
- 2026-10-11: phase 1 gate pass: attach-assets-run tests green; base copy red (apply happy path 'belongs to untagged-100', verify-published edit lacks tag, realIO body lacks tag_name); test:release, test:ci-gating, lint, typecheck:all exit 0.
- 2026-10-11: phase 2 gate pass: chaos-seed unit 15/15; e2e:agent seed=abc red at load with the refusal, exit 1, no seed line; seed=1095865833 green on Chrome and Firefox, actions equal PR run 38162383273 after destination relabelling; lint, typecheck:all, test exit 0.
- 2026-10-11: phase 3 gate pass: lint:actions 0; behavior-gating + aggregators green (aggregators unchanged); both base proofs and the three release.yml mutations red on the leg-for-job pin only; test:ci-gating 526/526.
