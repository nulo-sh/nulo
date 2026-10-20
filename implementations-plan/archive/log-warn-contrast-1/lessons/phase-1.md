# Phase 1: the gate

- The ERROR loop in `theme-contrast.test.ts` § status text now iterates a literal two-row table (ERROR, WARN). Base `ab5442d7` (the arc base; `24399338` at plan time, moved by #891 and #882, neither touching `packages/design`).
- `bun run --cwd packages/design test -- src/theme-contrast.test.ts` on the untouched `base.css`: exit 1, `Tests 1 failed | 100 passed (101)`. The one failure: `light: a log viewer's WARN line on its tint >= 4.5:1`, `expected 2.912788284758858 to be greater than or equal to 4.5`. Dark WARN and both ERROR tests pass. As predicted.
