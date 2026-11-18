# connected-app-build-1: status

- 2026-11-18: arc 2 planned on `connected-app-build-1-a2` off dev `8ff0e6489`; the plan reopened from `archive/`.
- 2026-11-18: phase 3 gate: lint red once (one formatting error in the new page test), formatted, green.
- 2026-11-18: phase 3 gate: typecheck:all green; targeted tests green (25 files, 561 passed, 1 skipped).
- 2026-11-18: phase 3 gate: smoke tests/e2e/type-roles.test.ts green at 530bf6a42, Chrome 14 passed + 1 Firefox-only skip, Firefox 15 passed.
- 2026-11-18: phase 3 gate: network e2e at 530bf6a42 (connect-check-window, connect-verify-mismatch, type-roles-windows, cap-window, authwit-variants), Chrome 5 files 19 passed, Firefox 5 files 18 passed + 1 Chrome-only skip.
- 2026-11-18: Codex round 1: approve with fixes (an unreadable stored simulation holder threw on the page; the threshold comment). Both fixed; lint, typecheck:all and the targeted tests (25 files, 562 passed) green again.
