# Recon: ci-followups-4

Base `origin/dev` at `15881c7d` (the branch since fast-forwarded to `b3c98acb`, no dependency change), Bun 1.4.2. Three sonnet explorers (#365's e2e pieces, #172's resolution surface, the `lessons.md` budget) plus the parent's reads and one scratch probe outside the repo. Open PRs at planning time: #426 (incoming-transfers), which touches none of this lane's files.

## Reuse map

| Need | Found | Verdict |
|---|---|---|
| Narrow the fallback | Bun's `install.hoistPattern` (bun-types 1.4.2 `docs/runtime/bunfig.mdx:693-700`); `install.hoist` (`:702-711`); `publicHoistPattern` (`:684-691`) | reuse `hoistPattern` |
| Prove the layout | the battery of `archive/ci-release-supply/plan.md` § Phase 2.4 and its log in `archive/ci-release-supply/lessons/phase-2.md` § 2.4 | reuse, adapted |
| Source-level phantom check | `scripts/phantom-sweep.ts` (manual; always exits 0; skips plugin injections and third-party code, `:1-9`) | reuse as is |
| Load Storybook's framework from the app | Storybook's absolute-path form; `extractFrameworkPackageName` matches by path suffix (storybook 10.5.8 `chunk-7ATDBJYQ.js:14747-14755`) | adapt `apps/extension/.storybook/main.ts:19-20` |
| The raw-field e2e case | the discovered-authwit case, `type-roles-windows.test.ts:235-270`; `openExecute` `:177-191`; `sweepWindow` `:52-61`; `dismiss` `:64-69` | adapt (one case) |
| The rig | `deployDelegatedPullRig`, `ensureStandardPublicChecks` (`tests/e2e/fixtures/aztec.ts:782-848`) | reuse as is |
| An unregistered consumer | the playground registers the consumer only when `delegatedConsumerInstance` is set (`apps/playground/src/sections/transactions.ts:249-263`) | reuse as is |
| The expected site | `identifier-sites.expected.json:909-919`, state "an undecodable call with execute-op-raw-toggle clicked (network)" | already present: no edit |
| Lessons budget rule | `scripts/ci-cd/plans/structure.ts:37` (`LESSONS_BUDGET = 8192`); one line per entry, each with an evidence link under the plans tree | reuse as is |

Nothing is built new.

## Facts the plan rests on

**Resolution (#172).**
- `node_modules/.bun/node_modules` holds 698 links. The root `node_modules` holds only the root devDependencies (`@biomejs`, `@commitlint`, `@types/bun`, `typescript`); workspaces are not linked there.
- Workspace source never reaches the fallback. From `packages/wallet-core`, `require.resolve("vue")` fails under Node and Bun, while the fallback links `vue`. The fallback is on the path of store packages only (bunfig.mdx:704).
- CI caches only `~/.bun/install/cache` and installs fresh (`.github/actions/setup-bun/action.yml:37-44`); no job restores a `node_modules`. `docker-ci-like.sh` bind-mounts the host checkout and reuses its `node_modules`.
- Six third-party imports need the fallback (`archive/ci-release-supply/lessons/phase-2.md` § 2.4), re-read at HEAD:
  - `@aztec-foundation/aztec-standards@6.0.0-rc.1` declares nothing. Its `artifacts/src/artifacts/Token.js:2-4` imports `@aztec-labs/aztec.js/*`.
  - `@pinia/testing@2.0.1` declares the peer `pinia` only. Its `dist/index.mjs:1` imports `vue`.
  - `local-pkg@1.2.1` has `importModule` (`dist/index.mjs:94-98`), a bare `import(path)`. `vite-plugin-pages@0.33.3` calls it for `@vue/compiler-sfc` (`dist/index.js:502`). Its options take no compiler.
  - `storybook@10.5.8` loads the framework preset by name, from its own directory (`chunk-7ATDBJYQ.js:13524-13532`).
  - `vite-plugin-node-polyfills@0.28.0` puts its own specifier, `vite-plugin-node-polyfills/shims/buffer`, into modules that mention `Buffer`, store modules included. Under Vite 8 it hands Rolldown a native `transform.inject` (`dist/index.js` ~`:178-225`). The extension's alias (`vite.config.ts:53-54`) did not catch the specifier in a store module (the 2026-10-10 probe). The playground has no alias for its three shims (`apps/playground/vite.config.ts:26-29`).
  - `@alejoamiras/presto@6.0.0-rc.1` has `dist/lib/presto-prover.js:19`, `import("@aztec-labs/simulator/client")`. The bundler resolves it statically, so passing a simulator does not remove it.
- `@storybook/vue3-vite/package.json` resolves from `apps/extension` under Bun and Node, and the package exports it.
- `@vue/compiler-sfc` unreachable fails no build: vite-plugin-pages logs the parse error, and every page loses its `<route>` meta. `legacy-routes.test.ts` catches it.
- First-party gaps:
  - `packages/aztec-runtime` uses `Buffer` in shipped code (`account-export.ts:80`, `opfs-store.ts:211`). It also uses `node:*` in tests, and it declares no `@types/node` (`tsconfig.json` `types: ["chrome-types"]`). Its typecheck finds the types only through `/// <reference types="node">` in store packages: 49 errors without the fallback.
  - `packages/design`'s stories `import type` from `@storybook/vue3-vite` (`src/ui/Banner.stories.ts:1` and six more), undeclared. `phantom-sweep` reports it; the package's typecheck excludes stories.
- Two `vue@3.5.42` store copies exist: `+7524df…` (TypeScript 6, the app's and the fallback's) and `+1fb4c6…` (TypeScript 5.9, Storybook's).
- No test pins `linker`, `hoist` or `hoistPattern`. `bunfig.toml` trips every e2e path filter and the audit gate's dependency diff (`scripts/ci-cd/audit-gate.ts:198`).

**Scratch probe (2026-10-14, Bun 1.4.2, a two-package fixture outside the repo).**
- `hoistPattern = ["ms"]` gives a fallback of `ms` only. A store package then resolves `ms` undeclared, and `debug` or `chalk` not.
- `bun.lock` is byte-identical under the default and the pattern.
- Switching an existing tree from the default to the pattern changes nothing. `bun install`, `--force` and `--frozen-lockfile --force` all print "no changes" and keep all eight links. Only `rm -rf node_modules` and a fresh install apply the pattern.

**#365.**
- No e2e references `execute-op-raw-toggle` or `execute-op-arg-field`. `OperationCard.fallback.test.ts:243-280` covers the toggle in jsdom, without fonts or computed roles.
- The raw field renders only after the toggle (`CallArguments.vue`, `v-if="rawOpen"`, field rows only).
- `observeIdentifierSites` joins on the exact state string (`fixtures/type-roles.ts:556-558`). A typo yields zero sites, so the case must assert the site is observed.
- No gate checks that every expected state is observed (`coverageOf`, `type-roles.ts:583`, has no caller).
- The file runs in both browsers' sharded network pools; neither `exclude_files` list names it.

**Lessons (8,191 B).**
- Duplicated:
  - Line 20 duplicates `CI.md:48, 100-102` and `.github/WORKFLOWS.md:58`.
  - Line 45's first clause duplicates `.claude/skills/aztec-update/SKILL.md:89-91`.
  - Line 18's conflicted-PR clause duplicates `e2e-testing/SKILL.md:779` and `aztec-update/SKILL.md:217`.
- Line 37 is one test's model, held by `balances.store.fuzz.test.ts:1-24, 355-361`.
- Lines 35 and 52 are stated nowhere else; they stay. No other line has a duplicate in the docs or skills (searched by key phrase).
- Lines 5 and 6 describe the isolated linker, whose CLAUDE.md bullet this lane rewrites.
- Line 42 still holds on 6.0.0-rc.1: `forceBlock` sends a tx (`tests/e2e/fixtures/aztec.ts:467`).
- Line 13 names vue 3.5.41; 3.5.42 is installed. The stamp records the observed version, so it stays.

## Collisions

- aztec-rc3 arc 1 moves every Aztec pin and edits `bunfig.toml`'s `minimumReleaseAgeExcludes`. If it lands first, the aztec-standards and presto gaps must be read again on the new versions. A `package.json` edit in a workspace that reaches a version younger than 7 days re-gates it (CLAUDE.md § Dependency policy).
- Every other worktree on this host keeps its full fallback until its next fresh install (probe).
