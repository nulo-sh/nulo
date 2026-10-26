# Phase C3: A2's flows, absorbed into C1's PR

Every consult, gate and meaningful attempt of phase C3.1. Paths repo-relative.

## The orchestrator's calls (2026-10-26)

- **D-orch-3, C1 absorbs C3.1.** A2 merged on `dev` as `74cf8995b` (#1139) while C1's PR #1140 was open. The orchestrator's merge of `origin/dev` into this branch (`9772b74e9`; the only textual conflict was `implementations-plan/index.md`) left the harness red and the product green, with the four e2e lanes green on that head: `helpers/profile-chaos/backups.ts` imported `downloadPlainPasskeyBackup`, which A2 removed (a passkey profile's full backup always takes a file password now), and three model tests failed (a cited line in `profile/service.ts` and one in `full-backup-restore.ts` moved; `ProfileRowSchema` changed). The plan's own rule, "If A2 merges before C1's PR, C1 absorbs C3.1", applies: same branch, same PR, new signed commits only, the harness fitted to A2 first.
- **D-orch-2, C3 beside C2.** C2 (the agent session launcher) runs in its own worktree on a branch off this one and opens its PR after #1140 merges. The two share only `apps/extension/tests/e2e/README.md` § Chaos runs, so this arc's text there goes under its own sub-heading, never inside the session contract C2 writes, and this branch merges `origin/dev` before each gate and right before its final push.
- **Page 87** is answered (P87-01 to P87-08 on #1127), recorded per ask in OWNER-ASKS.md.
