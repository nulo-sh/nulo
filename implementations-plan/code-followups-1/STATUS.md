# code-followups-1 — status

One dated line per gate or decision. The close-out commit deletes this file.

- 2026-10-08 — planning started in the worktree at origin/dev 86a89c5; recon: three Explore agents (sonnet).
- 2026-10-08 — flake claim checked: `[aztec-node] Error: Address already in use (os error 98)` prints on every shard of a green run (8 of 8 in run 37855435855); it comes from the aztec CLI wrapper's own anvil, not from port allocation.
- 2026-10-09 — plan, recon, OWNER-ASKS (none) and the index line written; dual audit next.
- 2026-10-09 — round-1 audits: Codex reject, Opus conditional approve; findings applied (playground change dropped, 101 closed on existing tests, shared-document overlaps named, base fast-forwarded to a6c2fb5). Final fresh Codex pass next.
- 2026-10-09 — final fresh Codex pass: conditional approve; its three conditions and stale-text notes applied in the plan. Stopped at the approval gate.
- 2026-10-09 — implementation started; merged origin/dev (cd20b86, #61) into the branch; index conflict resolved line-level (security-fixes-1's line gone, this lane's status updated).
- 2026-10-09 — Phase 1 gate pass: lint; Chrome network run of incoming-transfers 2/2 green; new setup line once after the start line; one `os error 98` line (unchanged).
- 2026-10-09 — Phase 2: probe confirmed the race live (12/12 reopens stage-less first, 3-14 ms; base read null 0/12); Chrome 5/5 two-windows + 13/13 full file on the pre-fix helper; arc-1 Codex loop: r1 findings (3, accepted) + Opus findings (accepted), r2 one finding (accepted), r3 clean.
- 2026-10-09 — Phase 2 gate pass on the final helper: RecentActivityView 38/38; Firefox 5/5 two-windows + 13/13 full; Chrome 5/5 two-windows + 13/13 full (retry 0, proverless). typecheck:all and test:all pass.
- 2026-10-09 — Phase 3 gate pass: Firefox prover-ON (WASM, no Presto) imported-account-execution 3/3 green; sendTransfer 56.2 s, 52.9 s, 52.1 s; entry 147 routed to delete at close-out; probe copy deleted.
- 2026-10-09 — arc 1 final local gates pass (lint, typecheck:all, test:all, check:plans); PR #65 opened ready (gh stack layer 1 on dev).
- 2026-10-09 — PR #65's `Lint + Typecheck` red: the workflow came from the merge with dev (#62 added `scripts/ci-cd/audit-gate.ts`) while the job checks out the PR head, which lacked the script. Fix: merged origin/dev (4b7718f, #62 and #63) into the branch; gates rerun on the merged head.
- 2026-10-09 — PR #65 checks green on e16994b (all five required aggregators). One rerun: Firefox network shard 5/5, `execute-scope-chain` failed in its fixture (`connectPlayground:openPlayground — Waiting failed: 30000ms exceeded`, the playground page's `pg-status` never appeared); the same lane was fully green on the previous head 893aa79 and on #62; `gh run rerun 37877763202 --failed` → success. Not this arc's code.
- 2026-10-09 — PR #65 merged into dev as ab54194. Arc 2 starts as layer `code-followups-1-tests` on dev (a new `gh stack`, since layer 1's stack is fully merged).
