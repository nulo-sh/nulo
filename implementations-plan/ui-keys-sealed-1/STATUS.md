# ui-keys-sealed-1: status

- 2026-10-22: adopted worktree `ui-keys-sealed-1` at `5c35ca93`; read the briefs, #1051, #1062, #865, #938, #1050, A4's branch.
- 2026-10-22: recon done (two Sonnet explorers); `recon.md` written.
- 2026-10-22: draft plan and competing outline B written; dual audit next.
- 2026-10-22: dual audit r1: Codex reject (F1-F8), Opus reject (F1-F10); plan revised (D4 flipped to the store option, the pointer a new root, OA-1 rewritten, re-cut proof added); Codex r2 next.
- 2026-10-22: Codex r2 reject (R2-1 to R2-4); plan revised (pointer layout per OA-1, no connection waiter, per-phase pointer checks, KL-1 in OA-1, the C variant's contract); Codex r3 next.
- 2026-10-22: Codex r3 reject (R3-1 deletion sweep vs the shared device row, R3-2 KL-1 wording); both fixed; Opus r2 running, then the final fresh Codex pass.
- 2026-10-22: Opus r2 conditional approve (U1-U5), all adopted; final fresh Codex pass next.
- 2026-10-22: Codex final pass conditional approve (F1-F3 plus OA-1/OA-2 sign-off), all folded in; plan committed, report written.
- 2026-10-22: arc started; OA-1 and OA-2 still unanswered, so the arc builds the three maps only (no pointer) and the privacy text as drafted, toward a draft PR. Merged `origin/dev` at `2b856d1a` (merge `0514e413`); `baseline:storage` unchanged there.
- 2026-10-22: P1 gate pass (maps only): the targeted unit run (27 files, 555 tests), lint, `typecheck:all`, `test` (one rerun: `fpc/service-create.test.ts` timed out under load 280, green at 75), the other `test:all` packages green, step 5 equal, `baseline:storage` unchanged.
- 2026-10-22: P2 gate pass (maps only): unit suites, lint, `typecheck:all`, `test:all`, smoke at retry 0 on Chrome (1845 s, 5 shards) and Firefox (2777 s, 7 shards).
- 2026-10-22: P3 gate pass (maps only): network maps files on both browsers, the three update scenarios on both browsers (replay re-recorded), `sealed-storage.test.ts` on both browsers (red on base), Home timing within 50 ms on both (Chrome 8 rounds, Firefox 7). P4 drafted (privacy 1.2.4 as drafted). Merged `origin/dev` at `c49430a6`: `baseline:storage` unchanged, `typecheck:all` and `test:all` green.
