# Arc 1: implementation log

## Phases (2026-11-06)

- **Phase 1:** `formatListAmount` / `formatListSplit` in `utils/amount.ts`; the locale helper `useSeparators` lifted to module scope in `amount.test.ts` so the new tables share it; census extended to `[compact, plain, list]`. Gate green: lint (format fix on the new tables first), `typecheck:all`, 188 tests.
- **Phase 2:** twelve calls moved. A first red-at-base run did nothing: zsh does not split `$FILES` (the lessons line on agent shells); rerun with an array. Six new cases red at the base, each on the digits (`28.43950`, `1,234,567.890123`, `999.999`, `0.0005`). `audit:vue` regenerated `auto-imports.d.ts` and `.eslintrc-auto-import.json`, committed on their own. Gate green: targeted 4419, `audit:vue`, `test:components` 1394, `test:all`.
- **Phase 3:** `rows.test.ts` receipt reseeded to `1234567891`. Chrome and Firefox smoke (rows, send-outcome-rows, token-list) 14/14 each at retry 0; the receipt `+1,234.56` needs 185.0 px against 157.7 px at 360 px and fits from 388 px on both browsers (I1 holds). Per-file wall-clock: rows 79 s Chrome / 135 s Firefox, token-list 29 s / 41 s, send-outcome-rows 21 s / 27 s.
- **Captures:** a spec and a config under the lane's scratch folder, outside the repo; the config imports `apps/extension/vitest.e2e.config.ts` by absolute path and narrows `include`/`dir`. Home, Holdings, Send's picker and the token page read `1,234.56` (split `1,234.56` / `<0.01`), `28.43`, `0.000392`.

## Review loop

- **Round 1:** Codex (gpt-6.1-sol, high) clean, three nits; Opus (general-purpose) clean, nits overlapping plus a floor `RangeError` below width 3 (no caller; not fixed). All three Codex nits applied.
- **Round 2 (resumed):** Codex clean; a test-title wording nit applied. Converged.
