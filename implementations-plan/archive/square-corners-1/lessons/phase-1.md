# Phase 1: the pin

- 2026-10-20, base `a51ebd22` (the arc branch rebased onto `origin/dev` before any code; #907 and #877 touch no file this arc reads). `bun --bun vitest run src/components/NotificationManager.test.ts` on the untouched card: 1 failed, 12 passed. The one failure is "its sheet and template round no corner", received `[".card { border-radius: 16px }"]`. The eight spellings, the three zero forms and the non-vacuity test pass.
