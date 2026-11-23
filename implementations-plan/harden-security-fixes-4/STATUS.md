# STATUS: harden-security-fixes-4

- 2026-11-23 phase 0: briefs read, worktree adopted at `8ae2c06a4`, registered.
- 2026-11-23 phase 0.4: recon (two Sonnet explorers) and five reproducers, each red on base with a green control.
- 2026-11-23 drafting: plan, recon, owner asks written; two arcs.
- 2026-11-23 plan review: Codex r1 and Opus r1 conditional approves folded in; P4 became a note correction after reading Firefox 153's sender construction; a fresh Codex pass approved once P3's and P5's invariants were narrowed. Plan approved; arc 1 next.
- 2026-11-23 arc 1: branch off `origin/dev` at `8ae2c06a4`. Phases 1-4 gates green: the touched vitest files (46 files, 957 tests), `bun run lint`, `bun run typecheck:all`. The seven new or tightened tests fail against the base sources; the controls pass on both.
- 2026-11-23 arc 1 gate: `bun run audit:vue` green. Review loop converged (Codex clean twice, Opus diff review folded). OA-1 revised: scale per whole slice, option D as its own plan, C keeps senders and the warning line.
- 2026-11-23 arc 1 final head: `bun run test:all` green; `network/session-explicitDisconnect.test.ts` green at retry 0 on Chrome and on Firefox (158.0).
