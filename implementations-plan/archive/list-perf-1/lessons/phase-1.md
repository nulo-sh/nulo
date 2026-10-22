# list-perf-1, phase 1: `Icon` without CSS `v-bind`

## Change

- `packages/design/src/core/Icon.vue`: `styles` sets `--icon-hover: var(--txt-<hoverColor>)` only when `hoverColor` is set; `.hovered:hover` reads `var(--icon-hover)`; `hoverColorVar` and the CSS `v-bind` are gone.
- `Icon.test.ts`: one test, the `hovered` class with the inline property for `hoverColor: "primary"`, neither without it. The design package's vitest names the module class `_hovered_<hash>`, so the test matches `/hovered/`.
- `apps/extension/src/utils/css-v-bind-ban.test.ts`: every `.vue` under `SCAN_ROOTS` (248 files at the merged base, all of the tree's SFCs) parsed by `@vue/compiler-sfc`; a finding is each `descriptor.cssVars` entry, keyed by file and expression against `REVIEWED` (empty) as a multiset, with a stale-entry test. The compiler injects `useCssVars` exactly when `cssVars` is non-empty (`compiler-sfc.cjs.js:20411-20420`), and `parseCssVars` strips CSS comments first (`:156-173`).

## Red proof

`Icon.vue` from the base `de500244a` in place, `bun --bun vitest run src/utils/css-v-bind-ban.test.ts` in `apps/extension`: exit 1, 1 failed of 5, the message naming `packages/design/src/core/Icon.vue  v-bind(hoverColorVar)`. Restored the head copy; the same run passes 5 of 5.

## Gate

`bun run lint`, `bun run typecheck:all`, `bun run --cwd packages/design test` (37 files, 541 tests), `bun run test` (913 files, 15,093 tests): all exit 0.
