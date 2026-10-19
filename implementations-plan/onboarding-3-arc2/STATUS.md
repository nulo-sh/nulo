# STATUS: onboarding-3, arc 2

- 2026-10-19 15:40Z: phase 1 merged: onboarding-4-a1 (9c0d5c25) and origin/dev (56361a49), both clean; `bun install --frozen-lockfile` passes.
- 2026-10-19 15:58Z: phase 1 fast gate: lint 0, typecheck:all 0, test 14,216 passed and 1 failed. `service.fence-entry` "every facade call passes a fence" timed out at 5 s at load 200. Its rerun at load 141 passed 21 of 21.
- 2026-10-19 16:30Z: plan addendum drafted; recon done (3 sonnet Explore agents).
- 2026-10-19T16:28Z: plan converged: dual audit (Codex and Opus, approve with changes, folded in) and the final fresh Codex pass (approve with changes, folded in).
- 2026-10-19 17:05Z: phase 2 unit gate: `general.test.ts` 21/21, service integration (new cases) green, lint 0, typecheck 0. Red proofs: inverting `feeJuiceShown` fails 5 Home cases; counting no imported row fails both new service cases.
- 2026-10-19 17:10Z: phase 2 Chrome smoke (head, retry 0): `stale-network` 4/4, `security-backup` 3/3.
- 2026-10-19 17:15Z: phase 3: #867 filed and closed (`known-limit`).
- 2026-10-19 17:25Z: phase 4: capture spec run three times on Chrome, deleted each time; 30 PNGs in `screenshots/`, linked from OWNER-ASKS.md.
- 2026-10-19T17:26Z: fix loop converged: round 1 (Codex one Low, Opus seven Lows; all fixed, d2fa6663), round 2 clean.
- 2026-10-19 18:20Z: phase 2 gate: Firefox smoke security-backup 3/3 and stale-network 4/4; network fee-methods 8/8 on Chrome (agent.sh, retry 0).
- 2026-10-19 18:52Z: Firefox S1a re-timed, back to back at load 145 to 210: base 26.5 s and 20.4 s, head 25.7 s and 22.3 s.
- 2026-10-19 19:38Z: phase 5 full Chrome smoke (head, retry 0): 260 passed, 4 failed, 14 skipped (64 files, 2714 s). The four were all `appearance` tests, each timing out at 60 s while load1 ran 400 to 975. The one rerun of that file at load 146 passed 4/4 in 12.6 s.
- 2026-10-19 20:45Z: phase 5 full Firefox smoke (head, retry 0): 264 passed, 14 skipped (64 files, 2937 s).
- 2026-10-19 20:55Z: phase 5 `bun run test:all` 0 (extension 14,221 passed). The temporary baseline worktree is removed.
- 2026-10-19 21:38Z: round 2 (the owner's P67 answers) started.
- 2026-10-19 21:55Z: OA-21: six layouts drawn by a scratch capture spec, run twice on Chrome and deleted each time; 36 PNGs, pushed at 52651804 (`SHOTS_READY`).
- 2026-10-19 22:00Z: P67-02 B built. Unit gate: 64/64 across the four touched files. Red proofs: leaving the flag out of `feeJuiceShown` fails three cases; dropping the watcher's write fails both Home cases. lint 0, typecheck:all 0.
- 2026-10-19 22:07Z: smoke at retry 0, armed builds: Chrome `stale-network` 4/4 and `security-backup` 3/3 (S1a 12.4 s); Firefox the same (S1a 18.7 s).
