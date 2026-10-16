# Phase 3: real browsers and shots

## Runtime, before

CI, the latest successful PR run of each network workflow before this arc (2026-10-16), first attempt:

| | Chrome (run 38902121888) | Firefox (run 38902121661) |
|---|---|---|
| suite envelope (`Run / …` jobs) | 18 min | 21 min |
| `type-roles-windows.test.ts` (4 tests) | 121.1 s | 137.9 s |
| `tx-transfer-row.test.ts` (4 tests) | 94.1 s | 116.4 s |
| `tx-sendTx-multicall.test.ts` (2 tests) | 56.2 s | 67.0 s |

No scenario is added; the three files gain reads at rest and one press each.

## Runs

- 2026-10-16, Chrome, local `e2e:agent` at retry 0 over the three files in one sandbox (load1 ≈ 100 at start), head e509d98b: 10/10 green. `type-roles-windows` 146.3 s, `tx-transfer-row` 99.5 s, `tx-sendTx-multicall` 109.2 s (local times on a shared host; CI's are the comparison).
- 2026-10-16, Firefox, same three files at retry 0 (load1 148 at start), head a968c932: 10/10 green. `type-roles-windows` 216.6 s, `tx-sendTx-multicall` 286.2 s, `tx-transfer-row` 174.3 s. The shots (`NULO_E2E_SHOT_DIR`) render the summary as the signed mockup draws it, in both themes.
- 2026-10-16, Chrome again after the second `origin/dev` merge (load1 147.6 at start), head 77ec0214: 10/10 green at retry 0. `type-roles-windows` 167.1 s, `tx-transfer-row` 125.9 s, `tx-sendTx-multicall` 106.4 s, shots in both themes. Firefox's local run predates that merge; the PR's Firefox lane covers the merged head.
- 2026-10-16, the final head after `origin/dev` at #573 merged in (7bee4a1f), both browsers, retry 0: Chrome 10/10 (load1 143.5; `type-roles-windows` 172.7 s, `tx-transfer-row` 129.4 s, `tx-sendTx-multicall` 110.2 s), Firefox 10/10 (load1 149.0; 219.1 s, 173.5 s, 258.5 s).
