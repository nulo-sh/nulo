# wallet-bugs-2: status

- 2026-10-18: adopted worktree at 18d29f23; recon (two sonnet explorers) done; plan drafted (one arc, eight phases).
- 2026-10-18: audit round 1: Codex reject, Opus conditional approve; plan revised (D3 hold rule dropped, KL-1/KL-2, gates rebuild).
- 2026-10-18: audit round 2: Codex reject (separate clients' onConnected); D6 replaced by the one-attempt tip read; D3b tightened.
- 2026-10-18: audit round 3: Codex and Opus conditional approve; the one-attempt tip read narrowed to `getArrivalState`, KL-1 reworded.
- 2026-10-18: final fresh Codex pass: conditional approve (quarantine refusal kept on the arrival read; Fact 2 corrected); both applied; resumed: approve.
- 2026-10-18: orchestrator approved at ed41c27b; arc 1 on `wallet-bugs-2-a1` off origin/dev 9470d4e9, plan cherry-picked.
- 2026-10-18: Phase 1 gate pass: tx-enrichment + execute vitest (333 pass; 5 new cases red on base), lint 0, typecheck:all 0.
- 2026-10-18: Phase 2 gate pass: lint 0, typecheck:all 0, rows.test.ts Chrome 9/9 and Firefox 9/9 (Method check red before D5: gap 0, nameless 170 px over).
- 2026-10-18: Phase 3 gate pass: JsonViewer unit 90/90; viewers-csp.test.ts Chrome 5/5, Firefox 5/5 (hold cases red on base; D3b applied after Firefox's trim case was red with D3a alone; filed #773).
- 2026-10-18: Phase 4 gate pass: unit 1751/1751, lint 0, typecheck:all 0, navigation.test.ts Chrome 8/8 and Firefox 8/8 (new cases red on base).
