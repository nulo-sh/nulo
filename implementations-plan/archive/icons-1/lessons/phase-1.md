# Phase 1: the set from Tabler

- `bun add -d --exact @tabler/icons@3.49.0` in `packages/design`: one package in `bun.lock`, integrity `sha512-l+GnSk…anc6lw==`, the recorded value.
- `gen:glyphs` wrote 58 glyphs; Biome formats it in the chained step. Biome also reflowed two lines of the new parser and its test (`biome format --write`).
- Gate: `bun run --cwd packages/design test` 507/507; `lint` 0 errors (25 warnings, none in the touched packages); `typecheck:all` 0; `test:ci-gating` 594/594 (the milestone scanner reads the staged `glyphs.ts`); `test:all` green in every workspace.
- A one-character edit of `send`'s first path fails the drift test; restoring it passes. The drift test also passes under Node (`./node_modules/.bin/vitest`, v24.21.0), the `test:watch` runtime.
