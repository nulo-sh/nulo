# Phase 0: planning consults

## Recon (2026-10-18)

Three Explore agents on sonnet (send refusal path; popup start; reset export and the re-ask button). Findings in [recon.md](../recon.md).

## Codex plan audit, round 1 (2026-10-18, gpt-6.1-sol, high, read-only)

Verdict: `reject (with blocking findings: #498 contradicts "never waits on a node" and does not deliver the inactive dot)`. Seven findings; each verified against the tree before folding:

1. High, "never waits" vs the P20-08 mismatch rule: verified (both cannot hold). Folded as a brief-vs-record line; the bound is an engineering choice under the signed option B, so no owner ask. The shared change also reaches `createAccount` and the reset's `verifyCustomL1` (verified, `account/service.ts:256`, `network-reset/service.ts:489-495`): F9.
2. High, the silent-node dot stays "sync": verified (`app.store.ts:515-525`, no catch). Folded: a rejected status read reads "inactive". The bounded `probeNodeStatus` it suggested was rejected: it would turn every node slower than 5 s inactive on every network.
3. Medium, a switch from A to an empty dead B could return with A's account active: verified (`network-switch.ts:64-74`). Folded: catch narrowly, run the tail.
4. Medium, Protect still calls `exportAccount`: verified (`account.vue:124,155`). Folded: one helper routes both.
5. Medium, the derived-address file hands out another identity: accepted. Folded as refuse-on-mismatch (D3) and known limit K1.
6. Low, the AEAD covers only the key and its tuple: verified; threat statement corrected.
7. Low, the refused-port e2e cannot prove the bound: accepted; I1 rewritten, the service test pins the bound.

Also found while folding: the signed P38-05 D drawing (`p38-paused-d-*`) already fixes the export button's words and place and the Delete chain sentence, so the draft's OA-2 and OA-3 were not owner questions.

## Opus Plan leg (2026-10-18, opus)

Verdict: `conditional approve (with conditions: fix findings 1 to 4)`. Ten findings; 1-4 overlapped Codex's 3, 2, 1 and 4 and were folded with them. New and adopted: held rows need `type: Imported` for the page's warning (4), the other probe callers named (5), the scroll at 360×600 shown in pictures (7), passkey profiles as known limit K2 (8), no error log per popup open (9), one password check, the DEK open's full unseal (10, verified at `profile/service.ts:1907-1925`). Rejected: an owner ask for the 5 s bound and the bounded dot probe (reasons in plan.md § Audit verdicts); leaving phase 1's network e2e to CI.

## Codex rounds 2 and 3 (resume, same session)

Round 2: `conditional approve (with conditions: show Inactive when unreachable-node startup finishes)`; adopted (the caught error sets the status to Inactive behind the fence). Round 3: `approve`.
