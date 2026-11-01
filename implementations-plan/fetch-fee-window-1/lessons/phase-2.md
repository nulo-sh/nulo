# Phase 2: the fee window on the execute window's helpers (#1477)

- 2026-11-01: helpers added, both windows moved, `JsonViewer`'s opener deleted. The three new fee cases were red with the base's `fee/index.vue` and green after; execute's D13, D14 and D14-lock stayed green unchanged.
- 2026-11-01: `src/utils` is an auto-import directory, so the build regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` with `openJsonWindow`; both are committed.
- 2026-11-01: network `tx-sendTx-default.test.ts` (both cases, the fee question included) and `tx-sendTx-reject.test.ts` green on Chrome.
- 2026-11-01: capture. The scratch spec first failed on `vitest/config` not resolving from outside the repo (dropped the import, spread the smoke config) and on `extensionUrl` needing a leading `/`; the third run rendered the notice and logged `rejectInteraction("fixture-1", "User rejected", "switch")`.
- 2026-11-01, Codex fix R1 (gpt-6.1-sol, high): conditional approve; four findings, all accepted (scan spellings and structural callee, `{ error }` in execute's catch, a bounded test comment, three comments deleted). The rewritten scan first exceeded the cognitive budget (18 > 15); split into two helpers.
- 2026-11-01, Opus fix R1: approve; two comment points accepted.
