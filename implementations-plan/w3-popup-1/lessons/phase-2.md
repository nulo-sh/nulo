# w3-popup-1, arc 2 (phase 4): implementation log

- OA-1 answered A (P102-01, 2026-11-03). Branch `w3-popup-1-a2` off `origin/dev` after #1580; `bun install --frozen-lockfile` first.
- Phase 4 (#1405): 38 cases red at `d9413d213` (the unit table, since `bareAztecAddress` did not exist; six recipient rows and the saved-contact row; two Holdings rows; the picker's add row); the controls (a name keeps its space, an inner joiner keeps the hint or offers nothing) green at the base; all green after `d8994012f`.
- The Chrome build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` for a new `utils/` export (utils are auto-imported); they ship in the fix commit.
- Captures (Chrome, light): a scratch smoke spec, deleted after use, pastes `<address> ` + U+200D through an `insertFromPaste` input event, leaves the field and shoots the page. Before: the three source files at `origin/dev`, rebuilt; after: the head build. zsh does not split an unquoted `$F` into words: the first try reverted nothing; an array did.
- Gates at `d8994012f`: lint, typecheck:all exit 0; the arc's vitest files 173 green at retry 0; smoke `send-keyboard`, `send-picker-add`, `token-list`, `holdings-add-token`, `type-roles` on Chrome (173 s, 23 passed, 1 Firefox-only skipped) and Firefox (307 s, 24 passed), retry 0. No e2e scenario added or changed.
