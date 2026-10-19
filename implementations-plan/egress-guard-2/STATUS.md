# Status: egress-guard-2

- 2026-10-19: homed in the worktree at 19399c82; recon done (1 sonnet explorer); #835 and #836 verified against the tree (#835 holds, with more drift in the same passages).
- 2026-10-19: plan drafted (option A: the guard counts a node attempt that arrives while the stand-in holds the origin); Codex audit r1 and the Opus Plan leg started.
- 2026-10-19: Codex r1 conditional approve, 6 findings, all accepted; plan revised (F2/F4/F5 corrected, I2 both directions, I4 shutdown, retry 0 on every network run, doc drift).
- 2026-10-19: Opus leg conditional approve, 11 findings, all accepted; D8 (count stops at the close) and D4 (one control-spec case) go against Codex r1's lean; Codex resume to verify.
- 2026-10-19: Codex r2 conditional approve (2, applied), r3 approve. Plan committed; arc 1 starts on egress-guard-2-a1.
- 2026-10-19: arc 1 Phase 1 gate green: lint, typecheck:all, units (51), bun run test (14059), four mutations red plus D8's.
- 2026-10-19: arc 1 Phase 2 gate green: stale-phrase grep empty, positive greps, lint; read against the code.
