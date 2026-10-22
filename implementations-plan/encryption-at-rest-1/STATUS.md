# STATUS: encryption-at-rest-1

- 2026-10-19 phase 0: worktree adopted (`2f591ddd`), tier deep per the lane brief, Phase 0 answers from the orchestrator's common brief.
- 2026-10-19 phase 0.4: recon done (three Sonnet explorers); `recon.md` written.
- 2026-10-19 deep step 1: three independent drafts started (Codex Sol high, Opus Plan, main).
- 2026-10-19 deep step 1: three drafts done (Codex 784 lines, Opus 352 lines, main); consolidation started.
- 2026-10-19 deep step 2: consolidated plan.md (ledger D1-D19), OWNER-ASKS.md written; contradiction check started (Codex resume, Opus Plan).
- 2026-10-19 deep step 3: contradiction check done. Codex INCONSISTENT (11 findings), Opus CONSISTENT-WITH-FIXES (17); all adopted, no ledger flips; D20-D27 added, OA-4 added.
- 2026-10-19 deep step 4: double audit done. Codex CONDITIONAL APPROVE (8; 7 adopted, 1 rejected), Opus CONDITIONAL APPROVE (11; all adopted). UI keys left the lane (D26); OA-4 retired.
- 2026-10-19 deep step 5: final fresh Codex pass: CONDITIONAL APPROVE (3 conditions, adopted), then APPROVE on re-read. Plan ready for the orchestrator; OA-1..OA-4 open.
- 2026-10-20 A1 P1: fixed-IV vectors (`5ef932ba`), then the frame and the row seal (`2eea38db`).
- 2026-10-20 A1 P2/P3: keyring, sealed store, keyless sweep, contacts and dApp sessions sealed (`8dee1b86`); composition and smoke e2e green on Chrome and Firefox.
- 2026-10-20 A1 review: Codex r1 three medium findings and Opus three low, all fixed (`498a9646`); Codex r2 APPROVE. Full smoke green at retry 0 on both browsers. The list-load gate holds on Chrome and not consistently on Firefox (+40 to +70 ms at 2 000 rows): OA-5 opened; A1 waits for OA-4 and OA-5 (`lessons/phase-1.md`).
- 2026-10-20 A1 follow-up: decision page 74 answered P74-01 (A, lands inside 1.0.0 after #938, the owner's build test and one green nightly soak), OA-4 (A) and OA-5 (A). Merged `dev` (`ae50812e`); Codex on the merge: APPROVE.
- 2026-10-21 A1 re-resolved against `dev` (20 commits, merge `22702f04`): one doc-comment conflict, one composition stub fixed, the new plaintext `dappRegistrations` root disclosed; Codex on the merge: APPROVE. No re-stamp and no pin: the landing order against #938 is the owner's open call.
- 2026-10-21 A2 P4/P5: journal and transaction history sealed (`4f85fd1d`), composition tests (`ca2c21f2`), e2e readers through the build-flagged seam and the sealed goldens (`1f3cd1a1`); decisions in `lessons/phase-2.md`.
- 2026-10-22 A2 review: Codex r1 one medium and Opus one low, Codex r2 one medium, all fixed (`352f3925`, `fc153ec5`, `23d2eae1`); Codex r3 APPROVE. Smoke, the network suite (Chrome proverless and prover-ON, the Firefox twins) and the update replay on both browsers green at retry 0. Merged `dev` with #938: stamp 1 marks journal and txs additive and is pinned (`lessons/phase-2.md`).
- 2026-10-22 A3 P6/P7: balances and both authwit roots sealed (`7e4eb2ef`), the five incoming roots sealed with scoped keyed keys and post-seal fences (`25d2f80c`), stamp 2 additive with one sealed golden per root (`12a19253`), e2e readers through the seam (`fe19cc8d`); decisions and the downgrade measurement in `lessons/phase-3.md`.
