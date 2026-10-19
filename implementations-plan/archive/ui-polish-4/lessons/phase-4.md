# Phase 4: #825

- 2026-10-19: `totalUnknown`, `awaitingPrices` and `summaryMeta` read the failed state first. The three new cases red on the base page (`$0.00`; the skeleton under a live-added priced row; `0 tokens` with fiat off) and pass on head. Gate: test 26/26, lint 0, typecheck 0.
