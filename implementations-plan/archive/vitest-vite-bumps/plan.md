# Vitest 4 and Vite 8 bumps

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The extension, landing and playground run Vite 8 and the extension and landing run vitest 4, with `vite-plugin-node-polyfills` 0.28 in the extension and playground (see `apps/extension/package.json`, `apps/landing/package.json` and `apps/playground/package.json`), and the constructor mocks in `apps/extension/src/popup/components/popups/NewTokenPopup.test.ts`, `apps/extension/src/popup/components/modules/send/FeeSettingsCard.test.ts` and `apps/extension/src/composables/useFullBackupImport.test.ts` are function expressions. The originals record no delivery; the status rests on those files in the tree.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bump vitest from 3 to 4 in every declaring workspace and bring the landing's vitest, two majors behind, level with the rest. Then try Vite 8 with `vite-plugin-node-polyfills` moved in lockstep, reverting Vite 8 alone if the Aztec packages break under Rolldown or the polyfill plugin fails the build, so vitest 4 would still land.

## Why

Vitest 4 and Vite 8 were deferred out of the dependency-hardening work. Vitest 4 needed only mechanical test changes. Vite 8 replaces esbuild and Rollup with Rolldown and Oxc, so the question was whether the plugin stack and the Aztec packages' CommonJS-in-ESM interop survive it. A recon pass found every Vite plugin already declared Vite 8 in its peer range, so the real risks were the Aztec interop (the config inlines those packages for this reason) and the polyfill plugin's version.

## What shipped

- **Vitest 4.** Constructor mocks must be callable with `new`, so arrow factories (`vi.fn(() => mock)` and `mockImplementation(() => ...)`) became `function` expressions in the three test files that mock service clients as constructors. Mocks that are plain function or method mocks were left alone. The configs used none of the removed or renamed options, so no config change was needed.
- **Vite 8.** Vite is on 8 in the extension, playground and landing, and the polyfill plugin on 0.28 where a workspace uses it.
- **Gate.** The pass criteria were typecheck, all unit suites, the component subset, the extension Chrome and Firefox builds (the main canary for the Aztec interop), the landing and playground builds, and the smoke e2e.
- **Not recorded.** The originals do not record the executed outcome or whether the revert branch was used, only that the tree ends on both bumps.
