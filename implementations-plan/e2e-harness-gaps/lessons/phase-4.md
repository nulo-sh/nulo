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

## 4.1 The soak matrix at f8d1200

`bun install --frozen-lockfile` (no changes), tree clean, one workspace at a time; `soak --runtime node --runs 30` (reference), `soak --runtime script --runs 30` (candidate), `compare`. Every summary records `gitSha` f8d1200870bd, `gitDirty` false, one lockfile hash, vitest 4.1.10. Outputs stay in a scratch directory outside the repo.

| Workspace | Reference (Node): failed runs / inventory | Candidate (Bun): failed runs / inventory | Median run, Node / Bun | Compare |
|---|---|---|---|---|
| `apps/landing` | 30 / 60 | 0 / 60 | 887 / 598 ms | **failed** (30 problems) |
| `packages/aztec-runtime` | 0 / 391 | 0 / 391 | 4721 / 2846 ms | OK |
| `packages/design` | 0 / 388 | 0 / 388 | 3304 / 2592 ms | OK |
| `packages/extension-messaging` | 0 / 385 | 0 / 385 | 2152 / 1632 ms | OK |
| `packages/legal` | 0 / 60 | 0 / 60 | 732 / 617 ms | OK |
| `packages/third-party-notices` | 0 / 66 | 0 / 66 | 981 / 920 ms | OK |
| `packages/wallet-bridge` | 0 / 681 | 0 / 681 | 2564 / 1715 ms | OK |
| `packages/wallet-core` | 0 / 278 | 0 / 278 | 2208 / 1569 ms | OK |
| `packages/wallet-crypto` | 0 / 120 | 0 / 120 | 9227 / 6646 ms | OK |
| `packages/wallet-sdk-schema-patch` | 0 / 12 | 0 / 12 | 1545 / 933 ms | OK |
| `apps/extension` | 30 / 11114 | 0 / 11123 | 185357 / 123903 ms | **failed** (13 problems) |

- Every problem in both failed compares sits on the Node reference side; neither candidate fails a run, and no module resolution differs outside the pinned allowlist.
- `apps/landing`: 28 tests of `scripts/legal-pages.test.ts` fail every Node run (`build-legal needs Bun >= 1.4 (Bun.markdown.html is missing)`). The arc's only change there is the base import path.
- `apps/extension`: the 9 entries of § "The soak's Node reference fails" fail all 30 runs; the uncollected `LegalAcceptanceSheet` file makes the inventories differ (1 entry only in the reference, its 10 tests only in the candidate); two Node-only one-offs, `zod-jitless` "reads the jitless flag…" and `content-message-relay` "post-attach: content messages forward synchronously; exactly once", failed 1 of 30 each. A first extension attempt was stopped after 4 Node runs (each failed 9-10) and relaunched in its own session, because its owner job's two-hour cap would have ended it mid-run.
- D-orch-11: a failed compare stops the arc. No run count or compare was relaxed. Filed as #279 with the smallest per-file fixes; making these suites run on Node, or declaring them Bun-only for the soak, is the owner's call.

## 4.1 The other gates

- `pr-quick.yml` dispatched on the branch at f8d1200: run 38065103571, `headSha` f8d1200870bd, **success** (quality-status; unit tests; lint + typecheck; Chrome, Firefox, landing and Storybook builds).
- At f8d1200 (code-identical to 1518723; f8d1200 adds only plan files): the armed smoke build exit 0, no warning block, and its `dist/chrome` byte-identical to the base's armed build; network `tests/e2e/network/networks.test.ts` Chrome 4/4 at retry 0 through `agent.sh`, no block, the watchdog loaded (longest silence 7.9 s), registry rows released; `build-storybook` exit 0, no block; `bunx biome check vitest.base.mts` `Checked 1 file`.
- Smoke `tests/e2e/navigation.test.ts`, Chrome, retry 0: 2 of 4 runs fail "History's and Settings' titles sit 10px below the header…" on `clickBelowBar`'s 5 s opacity wait (#269). The base af4afcc, with a byte-identical armed dist, fails it 1 of 4 on the same host. Pre-existing; #269 now carries the local numbers.
- Not run, because the arc stopped at the failed compares: `bun run test:all` five times, and the Firefox twins (no fixture, focus or window code changed).
