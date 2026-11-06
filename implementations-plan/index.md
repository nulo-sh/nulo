# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [rpc-fallback-1](rpc-fallback-1/plan.md) — arcs 1 and 2 in progress; arc 3 waits on OA-1, OA-2, OA-8 — each network fails over to its next endpoint and returns to its primary; then Nulo's relay as the second endpoint (#1624)
- [discovery-allow-1](discovery-allow-1/plan.md) — arc 1 in review (#1722) — the connect window says what Allow reveals; an opt-in "every site may see Nulo" switch
- [chips-3](chips-3/plan.md) — arc 1 in review (#1723) — the direction chip becomes C2 at the C2S size; the token-symbol question
- [tx-logs-1](tx-logs-1/plan.md) — approved, arc 1 building — developer mode downloads one failed request's logs; the dApp gets the trace id in its error
