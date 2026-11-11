# Phase 3: channel and mark

- The extension's vitest config registers no auto-imported components (only `unplugin-auto-import` for APIs), so a surface that a component test mounts with the real mark imports `TokenMark.vue` explicitly; tests stub `Icon` by name.
- A generic export in an auto-imported directory (`src/utils/`) becomes a global name: `keyOf` was renamed `listKeyOf`, since four ban tests define a local `keyOf`.
- A build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` from the exports of `src/utils/`; commit them with the export.
- `bun --bun vitest` runs under a saturated host (load1 above 400 on 188 cores) time a scanning test out at the 5 s default (`log-payload-ban.test.ts`); it passes alone, so the gate run notes the load.
