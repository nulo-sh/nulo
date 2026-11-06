# Phase 2: the Home row and the About row

- `WhatsNewRow.vue` started as `lang="ts"`; `vue-tsc` refused `#right` on the JS `SettingItem` ("Property 'right' does not exist on type '{}'"), as lessons.md's vue-tsc line says: plain `<script setup>`.
- The first full smoke run red on About: `(await page.waitForSelector(...))?.evaluate(...)` read `undefined` after a hash navigation; `page.$eval` reads it and throws when absent. Green after.
- The build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` for new `src/utils` exports: commit them.
- `audit:vue` ends in a plain `build`, which overwrites the armed smoke build: rebuild before a smoke run.
- Wall-clock, `tests/e2e/security-backup.test.ts`, retry 0 (base measured at `dev` 4ae04b194): Chrome 35.1 s → 38.3 s, Firefox 46.1 s → 47.3 s; the new test 2.1 s and 3.4 s. Update replay's first case with the marker assertion (`NULO_E2E_UPDATE_FROM=v1.2.0`, candidate 1.2.0.1): Chrome 36.9 s, Firefox 50.7 s, both green.
- Gate: `audit:vue` 0 (17703 tests), `test:all` 0 (18 workspaces).
- Codex diff loop: r1 `findings` (one low, the rule's header overstated "a patch never prompts"), fixed in 0d602949e; r2 `clean`.
