# Phase 1: the migration

## Attempts

- **Template comment as root** (Icon.vue): an HTML comment beside the `<svg>` made the root a fragment, so `attributes()` read nothing. The paint invariant moved into the script.
- **e2e typecheck** (`tsc -p apps/extension/tsconfig.e2e.json`): 20 `TS2307 Cannot find module './core/*.vue'`. `tsc --explainFiles` showed the chain `failed-send-check.test.ts` → `journal-state.ts` → `@nulo/design` barrel. Fix: plain-TS modules import `GlyphName` from `@nulo/design/core/glyphs.ts` (D18).
- **vue-tsc on `StaleNetworkTakeover.vue`** after `lang="ts"`: `content` possibly undefined under `v-else`; `"notice" in c` narrowed to `unknown`. Fix: `v-else-if="content"` and a typed local (D19); the type-role identifier inventory's four branches re-keyed.
- **`bun run test`, first run**: 24 failures, then Bun 1.4.2 `panic: Segmentation fault` in the vitest launcher (load1 ≈ 160). Failures were stale names (`lock`/`globe` → `private`/`public`, `cancel` → `square-cross`, `dapp` → `app`), `<i>` lookups of the old ligature, the PublishStrip count now including its chevron glyph, and the inventory. Second run after the fixes: 814 files pass, no crash.
- **Lint**: `noExcessiveCognitiveComplexity` on the guard's template and props walkers; split into `scanProp`, `checkDefault` and `isDefineProps` rather than suppressed.

## Gate

Commands from the repo root, all exit 0:
`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run --cwd packages/third-party-notices test`, `bun run build`, `bun run --cwd apps/extension build-storybook`.
Guard proof: `ImportSecretForm.vue:55` set to `check-circle` → `icon-names.test.ts` fails naming that line; reverted → passes.
`find apps/extension/dist/chrome -iname '*material*'` prints nothing; `grep -ci "material symbols" dist/chrome/THIRD-PARTY-NOTICES.txt` is 0.
