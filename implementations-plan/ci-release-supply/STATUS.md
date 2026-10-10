# STATUS: ci-release-supply

- 2026-10-09: worktree adopted at ac259a7; registered in the workspace manifest.
- 2026-10-09: recon (three Explore agents, sonnet) returned; #176 and #193 found closed by #238; #82 found to change one onboarding title (OA-1).
- 2026-10-10: plan drafted with a competing outline; sent to the dual audit.
- 2026-10-10: round 1: Codex reject (10 findings), Opus conditional approve (11); every finding accepted or rejected with its reason; plan revised; OA-3 became an ask.
- 2026-10-10: final fresh Codex pass: reject (2 High, 6 Medium); all eight verified and accepted as text fixes; #183 gains the auto-unstick preflight.
- 2026-10-10: resume of the final Codex session: reject (one High: the verifier fix dropped SHASUMS' own attestation check); all six points accepted and applied; the panel did not reach approve; handed to the orchestrator.
- 2026-10-10: approved by the orchestrator with D-orch-1 to D-orch-4 (no stack, arc 1 only, probe branch approved, unreviewed fixes reviewed first); arc 1 started.
- 2026-10-10: phase 1.1 gate passed (lint, typecheck:all, test, test:ci-gating, lint:actions, build-storybook).
- 2026-10-10: phase 1.2 gate passed (lint, typecheck:all, test, test:ci-gating, lint:actions; red on the base lanes shown).
- 2026-10-10: phase 1.3 local gate passed (lint, typecheck:all, test, test:ci-gating, lint:actions); waits on the D-orch-4 review before it counts.
- 2026-10-10: arc 1 review round 1 (Codex reject, Opus approve with fixes); D2/D3/D5 answers recorded (D-orch-4); fixes D15-D17 applied; phase 1.3 gate passed; #250 filed.
- 2026-10-10: arc 1 review round 2 (Codex resume): reject on the pre-existing retarget gap only (accepted residual, #251); sweep concurrency group removed.
- 2026-10-10: phase 1.4 probe run 38013958157: no fold (rule 1); branch deleted. Phase 1.5 = CI.md rewrite; gate passed (test:release: 3 zip-missing host failures, no release script touched).
