# authwit-copy-1: phase 1 (arc 1)

- Captures, first attempt on base sources: the temporary History step timed out in `readJournalDetail` (10 s). Cause: the journal detail page shows only the selected account's records (`journal-detail-scope.ts`), and the refused send belonged to the second account. Fix: read History at the end of the spec, after `switchAccountByAddress(wallet, sender)`. The committed D6 step does the same.
- Captures, #1656 after: the temporary playground send (Crowdfunding `donate`, the sender's own witness from `createAuthWit` over `transfer_in_private(sender, crowdfunding, amount, 0)`, the canonical sponsor's payload) listed "Lets <crowdfunding> move 5 PULL from Account 1 to <crowdfunding>" with "Already authorized by Account 1." on a real local network: the carried request hash matches the decoder's message hash for the sender as it does for another account. Base sources listed nothing.
- New unit cases red on base sources (the source files swapped from 4291a8c98, the tests kept): Phase 1, 3 of 3; Phase 2, 6 of 6. A zsh loop over `$FILES` swapped nothing on the first try (one word in zsh; the lessons.md entry); rerun under bash.
- `tx-sendTx-fields` on Chrome, proverless, retry 0: 38.6 s on base sources (4291a8c98, unchanged spec); 42.0 s with the change and its committed History step (account switch, History read); 53.4 s on base sources with the temporary capture steps.
- Review: Codex round 1 clean; Opus nits folded (40cc29f02); Codex round 2 clean.
- Full Chrome smoke at 40cc29f02, retry 0: 62 files passed, 11 skipped (276 tests passed, 28 skipped), 1687.9 s.
- OA-4 A (the owner's pick): branch rebased onto `origin/dev` first (two unrelated commits). The flipped confirm test red on the B source (1 of 3 in its describe), green after.
- Phase 4 gates, retry 0: lint, typecheck:all, `bun run test` (993 files), `test:components` (99), the execute window (23 files), `check:plans`. `tx-sendTx-fields` through `agent.sh`, prover on: Chrome 89.9 s, Firefox 164.9 s, host load about 380 on 188 cores (the arc's earlier 42.0 s was proverless).
- Codex round 3 on the diff since the reviewed head: clean.
