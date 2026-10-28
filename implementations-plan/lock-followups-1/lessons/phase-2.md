# Phase 2: arc 2 (#1282, Disable auto-close hands focus to Close)

- Built from `dev` at 2914b9699, after #1320 merged; a plain PR, no stack.
- Red-first on the base: focus stayed on `<body>` after the link's press; the repeat Enter returned `[true]`. After the fix in `0381a3c77`, the composite's 14 cases pass.
- Mutation check: without `refuseRepeatEnter` on Close, the repeat case fails; restored.
- Gate at `0381a3c77`: `lint` 0, `typecheck:all` 0, `test:all` 0 (extension 16158 passed), `audit:vue` 0; armed builds; `security-backup.test.ts` and `keyboard-guards.test.ts` 5/5 on Chrome (43 s) and on Firefox (74 s).
- Review loop: Codex round 1 `clean`; Opus diff review `clean`. Converged in one round.
