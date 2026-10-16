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

## 4a.1 The soak's Node reference (#279)

- Branch `e2e-harness-gaps-soak-node` off `origin/dev` at dd92282 (D-orch-15). Vitest 4.1.10 appends a CLI `--exclude` to the config's `exclude` (its coverage chunk, `resolved.exclude.push(...resolved.cliExclude)`), so `--exclude <file>` removes exactly that file from the Node reference.
- The four fixed suites, run directly (`bun --bun vitest run` and `bun --no-install run vitest run`, apps/extension): 4 files, 33 tests, green on both engines; the landing's `legal-pages.test.ts` 30/30 on both, about 0.6 s of subprocess renders per run.
- The comparator's new rules each fail when removed: dropping the pass-every-run check, the reference refusal, the never-ran check or the set-aside each reds `lib.test.ts` (1, 1, 1 and 4 tests).
- Gate at ebf00f8 (`bun install --frozen-lockfile`: no changes; clean tree), the #279 suites as filters, 3 runs per engine: `apps/extension` reference Node 24.21.0 3/3 clean, 33 tests; candidate Bun 1.4.2 3/3 clean, 43 tests; `COMPARE OK`, the report naming `store-icons` (4 tests) and `windows/{json,logger}` (3 each) as set aside. `apps/landing` 3/3 on each engine, 30 tests, identical digests, `COMPARE OK`. Median run: extension 4350 / 5007 ms, landing 1596 / 1921 ms (Node / Bun).
- `bun run lint`, `bun run typecheck:all`, `bun run test:all` (extension 749 files, 11,700 passed), `bun run test:ci-gating` (533 pass) green at ebf00f8.
- Not fixed here: the full matrix at f8d1200 also saw two Node-only one-offs, 1 of 30 runs each (`zod-jitless`, a test timeout around its first dynamic `zod` import, and a `content-message-relay` `beforeEach` timeout), on a host at load 200 to 330. Arc 4's full matrix will show whether they hold on a quiet host.
- Review: Codex round 1 (two medium findings on when a listed file must have run, one comment), round 2 (one medium: vitest also matches a filter as a relative or absolute path), round 3 clean; Opus approve with small fixes. Final head 05b01b0: the same 3-run soak, both `COMPARE OK` (extension Node 33 / Bun 43, median 4444 / 3959 ms; landing 30 / 30, 1835 / 1316 ms); `lint`, `typecheck:all`, `test:all` (extension 11,700), `test:ci-gating` (533), `lint:actions` green.

## 4.1 The soak matrix at e1c4f33f (after #279)

- The matrix waited for a quiet host (D-orch-16, D-orch-19): from 04:32Z to 09:22Z on 2026-10-14, every 10-minute reading had either live registry rows or, with none, load 66 to 229. It started at 09:32Z (load 58, 0 rows) and ended at 12:44Z. The per-workspace table and the side gates are in `plan.md` § Audit verdicts, "Phase 4.1's gate at e1c4f33f".
- 10 of 11 workspaces `COMPARE OK` on the first pass. `apps/extension` failed only on Node run 16: `zod-jitless` timed out at 5 s under load 120 to 200. That is the one-off this file's 4a.1 section expected to reappear under load. `content-message-relay`'s one-off did not recur.
- The quiet-host re-run of the extension's Node reference saw no load under 60 before the window closed at 14:27Z (readings 69 to 200, 0 rows; D-orch-21). The orchestrator's poll ran it on 2026-10-15 from 04:37Z (load 25) to 06:12Z: 30/30 clean, `COMPARE OK`. So the reference held on a quiet host. That fits a load-related timeout, which the same one-off under load at f8d1200 also suggests, but two failures in 60 loaded Node runs cannot rule out a rare intermittent.
- What made the evidence hold across the two days: nothing was committed to the branch between the matrix and the re-run. The compare checks one `gitSha` and lockfile hash across both files. The re-run's JSON and the matrix's Bun candidate both record e1c4f33f, with lockfile `e273ead5…`.

## 4.1 The soak matrices at 685b032 and 30a39be

- 685b032, after the `dev` 116974d merge: 12 of 13 `COMPARE OK`. The extension failed on four load timeouts, three of them `zod-jitless` (#500). A quiet start reading did not keep a two-hour side quiet: the Node re-run started at load 50 and was at about 230 by its failing run 25.
- The fix moved the cold import instead of waiting for a quiet host. `zod-jitless`'s two imports moved into `beforeAll`, under the hook's 10 s budget, keeping their order and the assertion; deleting the flag import still fails the test on both engines.
- 30a39be, with `dev` 2dcdad4 merged: 13 of 13 `COMPARE OK`, no failed run on either engine, every side started under load 150 (D-orch-24). Its sampled load (29 to 137) was lower than 685b032's and the merge brought other code, so the pass shows the fix holds under that load, not that it alone cleared the gate. The relay test's hook timeout, which the fix does not cover, did not recur; it is #535.
- The matrix ran on a clean-room install: Bun 1.4.2 keeps what an earlier install linked, so every workspace's `node_modules` was deleted before `bun install --frozen-lockfile`.
