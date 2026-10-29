# Phase 0: planning consults

## Round 1

- **Codex** (fresh session, `gpt-6.1-sol`, high, read-only): conditional approve, conditions: qualify F4 and I1, seed U2's amount. It reproduced Vue's coalescing: active 7, mark and select 9, select 7 before the flush, and the watcher never runs, so the mark stays 9 (no writer does this). It confirmed the boolean parameter as proportionate and said the review sheet is not shown for a Public From.
- **Opus** (`Plan` agent): conditional approve. Its demonstrated findings: the e2e `strip.to` read passed on the base; the base-swap gate could lose the change; a side the old token forced carries over. It argued for skipping both inits on an import (option a) because the capability watcher clamps on a flag change. Verified: `execution/service.ts:1157-1163` stores dApp tokens with partial interfaces; `token/service.ts:440-446` returns a stored row unchanged.
- Folded into plan.md (F3, F4, I1, I2, D2-D5, phases, Security). Option (a) goes back to Codex for the verdict.

## Round-trip

- **Codex, resumed:** conditional approve. Kept the `keepSide` parameter over option (a): the switch handler then owns its whole invariant, and (a) needs old sides that satisfy the transfer flags, which To's Balances toggle does not guarantee. Judged I2 (a forced side carried over) the owner's, moderate confidence. Found U1's estimate check unpassable (no `NEW` balance row: `balanceRaw` undefined, the estimate cancelled); verified at `send.vue:236-238, 624-626`; U1 now funds both sides.
- **Codex, verify:** conditional approve; the one open condition is owner ask 1, before the PR merges. Its wording fixes to OWNER-ASKS.md (drop a sentence that took a side, state A's cost, mark A as proposed) were applied.
- Result: no auto-continue. Codex's verdict is not a plain approve, and OWNER-ASKS.md holds an ask on the surface the arc touches.
