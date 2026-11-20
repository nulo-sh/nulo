# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [fee-fresh-read-1](fee-fresh-read-1/plan.md) — building — Mainnet app windows read both Fee Juice balances fresh, as Send does; an outranked forced read waits for the one that outranked it, so each Revoke chunk settles on a fresh read (P199-03 = B, #1914)
