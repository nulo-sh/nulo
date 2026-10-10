# tokens-and-balances — status

- 2026-10-10 — phase 0: adopted worktree `tokens-and-balances` (origin/dev `fd47407`), read the briefs, nine issues, page 8 (P8-01, P8-02) and charter C9/C12.
- 2026-10-10 — recon: two Explore agents (sonnet) plus driver read; recon.md written. #105 regrouped out of Arc 1 (every effective pin hides a figure; OA-1). #94 widened to the set point (same release, same harm).
- 2026-10-10 — draft: plan.md and OWNER-ASKS.md (OA-1, OA-2) written; dual audit next.
- 2026-10-10 — round 1 dual audit: Codex reject (10 findings), Opus conditional approve (10 findings). #94 redesigned as an attempt loop that resumes under a fresh ticket; #93 incarnation keys rejected with reason (D1); OA-1 corrected; OA-3 (Arc 1 race-path effects) and OA-4 (background log levels) added. Final fresh Codex pass next.
- 2026-10-10 — final fresh Codex pass, round 1: reject (9 findings, all accepted, two in part). #94 gains R1-R4 (owned issue after the last await, a drain of displaced writes, failure journaled at once, liveness that saw a reservation is false); Arc 1's merge now waits on OA-3; Arc 2 uses one dedicated refusal marker. Round 2 (resumed session) next.
- 2026-10-10 — final pass round 2: reject (8 findings, all accepted). The hit path journals only; R1 adds the fence before every success; the drain repeats until empty, re-acquires a lapsed ticket and covers every token-row write; one post-set liveness read; OA-3 discloses R4's one success-to-error change. Round 3 next.
- 2026-10-10 — final pass round 3: reject (3 findings). Accepted: R5 (a displaced restore or deletion refuses with `token lock lost`, disclosed in OA-3) and the gate and pin wording. Rejected for this plan: serializing the lockless chain sweep (a pre-existing race outside the lane's issues), routed to an issue. Round 4 next.
- 2026-10-10 — final pass round 4: reject on one point (the purge needed R5 too); accepted with the two disclosures and the wording. The reviewer accepted routing the sweep race to an issue. Round 5 next.
- 2026-10-10 — final pass round 5: conditional approve (two wording conditions, applied). Plan ready for the orchestrator; Arc 1 merges on OA-3, Arc 2 waits on page 8, Arc 3 on OA-1; the chain sweep's id-reuse race is to be filed as an issue.
- 2026-10-10 — arc 1 start: merged origin/dev 28d4ffe (no token or balance code); D-orch-1 to D-orch-4 recorded; the sweep race is #262.
- 2026-10-10 — gate 1.1 pass: lint, typecheck:all, snapshot + modules/general 259/259; the late-add BalanceView test is red on base fd47407's `BalanceView.vue` (expected true to be false).
- 2026-10-10 — gate 1.2 pass: lint, typecheck:all, token + network + write log 296/296; 15 of the new token tests and both R4 tests red on base fd47407 (lessons/phase-1.md); D-arc1-1, D-arc1-2 recorded.
- 2026-10-10 — gate 1.3 pass: lint, typecheck:all, profile + profile-deletion + utils + usePinnedTokens 1500/1500; the two #93 order tests red on base fd47407.
- 2026-10-10 — arc gate: audit:vue pass (extension 10901), test:all pass; Codex r1 approve with fixes (1 Medium, 1 Low), Opus approve with fixes (4 Low, 2 nits); fixes applied (D-arc1-3, D-arc1-4).
