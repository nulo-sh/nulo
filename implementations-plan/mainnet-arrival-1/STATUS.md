# mainnet-arrival-1 status

- 2026-10-19 adopted the lane worktree at `2f591ddd` (origin/dev); recon started (2 Sonnet explorers).
- 2026-10-19 plan drafted (plan A + outline B); dual audit next.
- 2026-10-19 round 1: Codex conditional approve (6 findings), Opus conditional approve (10); all accepted, plan revised (D9, D10; OA-1 gains delivery and the hand-added Mainnet). Final fresh Codex pass next.
- 2026-10-19 final fresh Codex pass r1: conditional approve (3 findings, accepted); resuming to verify.
- 2026-10-19 final Codex pass r2: approve. Plan committed; A1 next (auto-continue).
- 2026-10-19 A1 started on `mainnet-arrival-1-a1` off origin/dev with the plan commit.
- 2026-10-19 A1 phase 1: code and tests in; `vitest run src/wallet/services/network src/wallet/services/stale-network` pass; proofs recorded (lessons/phase-1.md); `lint`, `typecheck:all` exit 0; `test`, `test:all` running.
- 2026-10-19 A1 `test` and `test:all` exit 0. Review r1: Codex 1 low, Opus 3 low, all fixed (D14); network tests pass; resuming Codex.
- 2026-10-19 A1 Codex r2 1 low (comment) fixed; r3 clean. Loop converged; e2e gates next.
- 2026-10-19 A1 phase 1 gate: smoke e2e (4 files, 21 tests, retry 0, 128 s) and network e2e (2 files, 6 tests, retry 0, 121 s), Chrome, pass; `bun run test` and `typecheck:all` on head exit 0. PR next.
- 2026-10-19 `test:all` on head exit 0; Codex r2/r3 recorded (D15); phase 1 ticked.
- 2026-10-19 A2 (phase 2, owner's D, P66-01) started on `mainnet-arrival-1-a2` off origin/dev `ab5442d7`; arcs split A2/A3 (D-orch-2). Design consult: Codex request-changes, Opus sound-with-fixes; D16-D22. Code + unit tests in; Chrome smoke of the new file green at retry 0 (9.2 s); OA-2 screenshots written.
