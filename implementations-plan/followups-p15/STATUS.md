# Status: followups-p15

- 2026-10-15: worktree adopted and registered at origin/dev 479ba56d; briefs and the twelve page-15 issues read with comments (#294 #316 #321 #339 #340 #341 #290 #112 #108 #103 #250); recon started (2 sonnet explorers).
- 2026-10-15: recon done (recon.md); plan.md and OWNER-ASKS.md (OA-1 to OA-5, I-1) drafted; one arc. Claims that did not hold: #294 has six dead rows (`token-list-client`), #340's detail reads "Stopped before broadcast", #250's live read already shipped, #112's signed text says it stays open. Round 1: Codex audit and Opus Plan critique started.
- 2026-10-15: round 1: Codex conditional approve (7 findings: 6 accepted, D6 kept with dissent as A3), Opus Plan conditional approve (12 findings: 10 accepted, 2 rejected). #340 ships today's row until OA-3; a receipt read failure keeps the watch; OA-6 and I-2 added. Codex resume (verification round) next.
- 2026-10-15: round 2 (Codex resume): approve; one low recon fix applied. Plan committed for the orchestrator's approval.
- 2026-10-15: merged origin/dev 0ac9e062; phase 1 (#294) ✓ gate F exit 0 (3:21); converse test red on base with six rows, green after.
- 2026-10-15: phases 2-5 (#316 #290 #321 #339) ✓ gate F + aztec-runtime + extension-messaging exit 0 (4:06). Deviation: #339's popup test replaces the old 'node refusal' row with the rebuilt typed error, rejected from parseTokenInterface where it arises.
- 2026-10-15: phases 6-7 (#340 #108) ✓ gate F + wallet-core exit 0 (4:25). Deviation: the lane test is stage-blind (markJournal never reads the row's stage), so it pins the kind once; both stages (pending, queued) are proven in journal-state.test.ts.
- 2026-10-15: phases 8-10 (#103 card and order, #250) ✓ gate F exit 0 (4:13).
- 2026-10-15: phase 11: smoke both browsers green (first head and final head), network trio green, Codex r1 + r2 approve, Opus review folded (73589333).
