# Phase 1: arc 1

## 1.1 `SettingItem` link row with controls

- Red at the base (`f94ca3331`, `origin/dev` merged): `bun --bun vitest run src/components/ui/Settings/Settings.test.ts`, 1 failed | 39 passed. The controls case failed on its first check, `expected 'A' to be 'DIV'`; the default-shape pin passed.
- Green after the change: 40 passed. Root `bun run lint` and `bun run typecheck:all` exit 0.

## 1.2 The list's Switch

- Red at the base page (the rewritten `index.test.ts` against the unchanged `index.vue`): 5 failed | 6 passed. The five new cases failed (no Switch: `expected [] to deeply equal [ 'Testnet', 'Local Network' ]`, the Tab stops short by two, `null` Switch); the six that pin today's links, dot, badge and Developer Mode passed.
- Green after the change: 11 passed. Mutation check: with the watcher's `link.focus()` removed, the focus case fails with focus on `<body>`, so it proves the handoff.
- First gate run: `typecheck:all` refused `wrapper.element.querySelectorAll<HTMLElement>` (TS2347, `element` is untyped) and lint asked for the formatter's layout; fixed with a cast and `biome format`. Then root lint and typecheck:all exit 0; the Settings and networks folders 73/73; the copy-dash, red-text, type-role and toast call-site bans 150 passed, 1 skipped.
