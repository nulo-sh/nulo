# fee-balances-build-1: phase 1

- Built from the B3 prototype at `69b4cfdca`; `BigInt(m.balance)` replaced by `parseSide` (D2), `nowrap` on both spans (D3). Six new cases red on base, green on head; every existing assertion passed unedited.
- Codex round 1 (gpt-6.1-sol, high, read-only): approve with fixes. Accepted an unread-open-row case and comment trims (`f1d6cb36d`). Its claim that a dropped string guard left every new case green did not hold (verified: four go red), and it withdrew it in round 2.
- Codex round 2 (resumed): approve with one comment correction (the conversion rounds the rate before refusing it), applied at `c0926dbab`. No third round: the fix was comment-only.
