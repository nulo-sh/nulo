# Phase 4: ESM configs (arc 4)

## 4.1 Inventory

- Branch `e2e-harness-gaps-esm` off `origin/dev` at af4afcc (#278's squash), D-orch-9. Vite 8.2.1, vitest 4.1.10, Node 24.21.0, Bun 1.4.2, TypeScript 6.0.3.
- Reproduced on the base: `bun --bun vitest run` in `apps/extension` prints Vite's `configLoader: 'native'` block with 6 "ESM syntax in a file loaded as CommonJS" lines (`vitest.config.ts`, `vite.shared.ts`, `../../vitest.base.ts`, and three e2e modules the config bundles); `bun run build` prints 16 such lines plus 3 extensionless-import items. The ten other workspaces already declare `"type": "module"`; only the root base warned for them.
- Tracked `.js`/`.cjs`/`.mjs` under `apps/extension` outside `src/`: only `public/theme-boot.js`, a classic script the popup and onboarding pages load in the browser. `src/` holds six `.js` modules, all ESM syntax, and `src/shims/function-bind-stub.cjs`, which keeps its extension.
- Every `apps/extension` tsconfig is `module: ESNext`, `moduleResolution: Bundler`, so the package type moves no TypeScript resolution.
- Bare `__dirname`: `scripts/check-rp-id.ts`, `scripts/store-art.ts`, `scripts/store-icons.ts` (run by Bun, which provides it in an ESM-typed package: probed) and test files run through vitest's module runner. `require(`: `src/components/LegalAcceptanceSheet.test.ts` (vitest) and a `node -e` string in `scripts/e2e/boot-guard.test.ts`. No `module.exports`. Nothing under `apps/extension` is loaded natively by Node except through Vite's config loader or vitest.
- No CI path filter names the base file; unit tests and lint run on every PR, and only builds are filtered.

## 4.1 The change

- 40b9c22: `"type": "module"` in `apps/extension/package.json`; `vitest.base.ts` → `vitest.base.mts`, its eleven importers naming `../../vitest.base.mts`; `biome.json`, `ARCHITECTURE.md`, `CLAUDE.md`. The CommonJS lines went to 0, but the same block then listed what they had masked: extensionless relative imports and JSON imports without attributes, on every unit, e2e, build and Storybook run, and `vitest run --configLoader native` failed with `ERR_MODULE_NOT_FOUND` on `./vite.shared`.
- 1518723 (D22): the 26 relative imports in the config graph name their extension, the three JSON imports carry `with { type: "json" }`, the stall watchdog's parameter property is a field assigned in the constructor (Node's type stripping rejects a parameter property), and `vitest.base.mts`'s header says why it is `.mts`.

## 4.1 Measurements on 1518723 (`VITE_CONFIG_NATIVE_IGNORE_WARNING` unset)

- `bun --bun vitest run` (`apps/extension`): exit 0, no native-loader block, no CommonJS line; 734 files passed, 3 skipped; 11112 tests passed, 4 skipped, 7 todo, the same counts as the base.
- The ten other workspaces' `bun run test`: exit 0, no block.
- `bun run build`: no block; `dist/chrome` byte-identical to the base build (579 files, sha256 of every file).
- A Node 24.21.0 probe calling Vite's `loadConfigFromFile(…, "native")` loads all eight: `vitest.config.ts`, `vite.config.ts`, `vite.{chrome,firefox}.config.mts`, `vitest.e2e{,.network,.all}.config.ts`, `.storybook/main.ts`.
- `vite build -c vite.chrome.config.mts --configLoader native`: exit 0, no block, `dist/chrome` byte-identical to the base.
- `bun run lint`, `bun run typecheck:all`: exit 0. `bunx biome check vitest.base.mts`: `Checked 1 file`.
- On 40b9c22, before D22: `build-storybook` exit 0; the armed smoke build; smoke `tests/e2e/navigation.test.ts` Chrome 5/5 at retry 0; network `tests/e2e/network/networks.test.ts` Chrome 4/4 at retry 0. Rerun on the soaked commit below.

## 4.1 The soak's Node reference fails for `apps/extension`, at the base too

- `bun --no-install run vitest run` in `apps/extension` (Node, the default bundle loader: exactly the soak's `--runtime node` launcher) fails 8 tests in 7 files at 1518723, and the identical set at the base af4afcc (a scratch worktree, `bun install --frozen-lockfile`; `diff` of the two FAIL lists is empty). `--configLoader native` fails the same 8. Causes, each a test written for Bun:
  - `scripts/store-icons.test.ts` (3): `ReferenceError: Bun is not defined` at `Bun.Image.backend`.
  - `scripts/e2e/port-registry.test.ts` "three writers in separate processes…" and `scripts/e2e/reconcile-lock.test.ts` "waiters in separate processes…": the children start through `process.execPath`, which is Node under a Node parent, and import raw TypeScript Node cannot strip (a parameter property in `port-registry.ts`, an extensionless import in `lockfile.ts`); every child exits 1.
  - `src/components/LegalAcceptanceSheet.test.ts` (collection): a native `require("@nulo/wallet-core/utils")` reaches the barrel's extensionless `./alarm-dispatcher`.
  - `src/popup/windows/{json,logger}/index.test.ts`: the assertion pins JavaScriptCore's wording, `undefined is not an object (evaluating …)`; V8 says `Cannot read properties of undefined (reading 'id')`.
  - `src/presto/presto-core-deps.test.ts`: `@alejoamiras/presto-core/package.json` is not in its `exports`, which Node enforces and Bun does not.
- So `compare` for `apps/extension` cannot pass at any commit since these tests landed, whatever this arc does.
