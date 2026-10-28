# Phase 1: arc 1

## 1.1 `SettingItem` link row with controls

- Red at the base (`f94ca3331`, `origin/dev` merged): `bun --bun vitest run src/components/ui/Settings/Settings.test.ts`, 1 failed | 39 passed. The controls case failed on its first check, `expected 'A' to be 'DIV'`; the default-shape pin passed.
- Green after the change: 40 passed. Root `bun run lint` and `bun run typecheck:all` exit 0.

## 1.2 The list's Switch

- Red at the base page (the rewritten `index.test.ts` against the unchanged `index.vue`): 5 failed | 6 passed. The five new cases failed (no Switch: `expected [] to deeply equal [ 'Testnet', 'Local Network' ]`, the Tab stops short by two, `null` Switch); the six that pin today's links, dot, badge and Developer Mode passed.
- Green after the change: 11 passed. Mutation check: with the watcher's `link.focus()` removed, the focus case fails with focus on `<body>`, so it proves the handoff.
- First gate run: `typecheck:all` refused `wrapper.element.querySelectorAll<HTMLElement>` (TS2347, `element` is untyped) and lint asked for the formatter's layout; fixed with a cast and `biome format`. Then root lint and typecheck:all exit 0; the Settings and networks folders 73/73; the copy-dash, red-text, type-role and toast call-site bans 150 passed, 1 skipped.

## 1.3 The e2e step and captures

Every run at retry 0, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-crud.test.ts --retry=0`, each after the armed build of that browser.

- Red on the base builds (`dist/` built at `843d27f75`, whose `src/` equals the merge's): Chrome 1 failed | 8 passed, Firefox 1 failed | 8 passed, both on `expected [] to deeply equal [ 'Testnet', 'Local Network' ]` (no Switch).
- Green on the head builds: Chrome 9/9 four times; Firefox 9/9 four times.
- Mutation check: with the pointer-through rule removed, the hit-test probe fails on Chrome with 290 missed points (`45,199 DIV`, …): the dot box on the midline and the hairline. So the probe can fail.
- Times, three runs each at host load near 100-130 (file, then the first test):

  | | Chrome base | Chrome head | Firefox base | Firefox head |
  |---|---|---|---|---|
  | file | 17.2, 18.1, 17.4 s | 17.8, 16.5, 20.3 s | 26.2, 34.6, 27.3 s | 35.0, 30.9, 31.4 s |
  | first test | 6.5, 6.6, 6.3 s | 6.0, 6.0, 6.4 s | 9.3, 11.9, 9.3 s | 12.0, 11.6, 11.9 s |

  Medians: Chrome file 17.4 to 17.8 s, first test 6.5 to 6.0 s (within the noise); Firefox file 27.3 to 31.4 s, first test 9.3 to 11.9 s (+2.6 s). The estimate was +3 to 5 s per browser.
- Captures: `NULO_E2E_SHOT_DIR` into `screenshots/` on Chrome; `shotSend` writes the current theme unsuffixed, so the light one was renamed `networks-list-switch-light.png`.
- Slip: `git checkout <base> -- <paths>` to time the base overwrote the uncommitted spec edit; it was re-applied from its script and re-run green on both browsers. Checkpoint before swapping sources.
