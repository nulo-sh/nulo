# authwits-2 status

- 2026-11-17: worktree adopted at `0dc22a9c5`; briefs read; recon (two sonnet explorers) done.
- 2026-11-17: sandbox probe, Chrome and Firefox, proverless, retry 0: Q1 and Q2 numbers in plan.md § Findings; both runs exit 0.
- 2026-11-17: Q3 and Q5 frames captured from `proto/authwits-2-status` (local, never pushed).
- 2026-11-17: plan drafted; Codex plan round: conditional approve, two follow-ups, approve.
- 2026-11-17: #1829 and #1830 filed (`bug`); frames recaptured (52, exit 0).
- 2026-11-17: arc 1 built on `authwits-2-a1`: phases 1 to 3 green, Codex pass approve.
- 2026-11-18: arc 2 planned on `authwits-2-a2` off dev `6aaebe886`: P166-01 B (stays on the page), P166-02 N1, P166-03 S for arc 3; chip source D7.
- 2026-11-18: phase 4 gate: lint 0, typecheck:all 0, authwits card + page + helper tests 32/32.
- 2026-11-18: phase 5 gate: lint 0 (second run; first: a complexity 17 in the composable, refactored, and two formats), typecheck:all 0 (second run; a test spy type), 9 files 205 tests + bans pass.
- 2026-11-18: phase 6: `bun run test` 1047 files passed, 1 failed (type-roles inventory: the page's new chip site); entry added; type-roles tests 3/3.
- 2026-11-18: phase 6 smoke type-roles Chrome (armed build): 14 passed, 1 skipped, 109.8 s, retry 0.
- 2026-11-18: phase 6 smoke type-roles Firefox (armed build): 15 passed, 163.6 s, retry 0.
- 2026-11-18: phase 6 network Chrome, proverless, retry 0: lifecycle, variants (4), consume-smoke: 6 passed, run 291.1 s.
- 2026-11-18: phase 6 network Firefox, proverless, retry 0: 6 passed, run 302.5 s.
- 2026-11-18: Codex pass on arc 2: conditional approve; findings 1, 2, 4 fixed (row identity, Revoke gated on Ready, encoded_call wording), 3 rejected (D13); lint 0, typecheck:all 0, touched tests + bans 345 passed (the `action_operations` digest re-pinned).
- 2026-11-18: after the Codex fixes, network authwit specs, proverless, retry 0: Chrome 6 passed (266.9 s), Firefox 6 passed (282.4 s).
