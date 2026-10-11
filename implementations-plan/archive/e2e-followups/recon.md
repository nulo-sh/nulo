# e2e-followups recon

Base: `origin/dev` af4afcc. One Explore sweep (sonnet) for reuse, plus the planner's own checks of every issue claim. Every path is relative to the repo root; `EXT` is `apps/extension`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| The files one `e2e:agent` run will execute, from its pass-through vitest arguments | Nothing turns arguments into files. `EXT/scripts/e2e/agent.sh:16-34` greps the raw arguments. Searched: `vitest list`, `parseCLI`, `createVitest`, `vitest/node`, `requires-proverless`, `readdirSync`, `globSync`, `new Glob`, `tinyglobby`, `shard`, over the whole repo outside `node_modules` and `.claude/worktrees`. `implementations-plan/archive/code-followups-1/recon.md:27` recorded the same absence. | build new: vitest's own `list --filesOnly` answers it (probe below) |
| A unit test that executes a bash script | `scripts/ci-cd/behavior-gating.test.ts:277-300` (`runLive`, PATH stub, `Bun.spawnSync(["bash", …])`), `scripts/ci-cd/no-local-paths.test.ts:13`, `scripts/ci-cd/decide-gate.test.ts:66`. All run under root `test:ci-gating` (`bun test scripts/ci-cd/`). No vitest test under `EXT/scripts/` runs a `.sh`. | reuse the `runLive` shape |
| Open a dropdown, then wait for an item | `setTheme` (`EXT/tests/e2e/fixtures/helpers.ts:1498-1525`) gates on the dropdown's own `data-dropdown-open`; `pinFromTokenPage` (`:1075`) and the contacts menu (`EXT/tests/e2e/helpers/contacts.ts:43-54`) open through `clickByTestId`, which waits for a visible, enabled trigger. `importToken` (`:923`) and `refreshBalances` (`:974`) click the trigger through a bare `querySelector(...)?.click()`. | adapt: one tokens-menu opener on the `setTheme` pattern |
| An unknown thrown value as an `Error` | No `toError`/`asError`/`ensureError`. `errorMessageFromUnknown` (`packages/wallet-core/src/utils/errors.ts:9`) returns a string; `normalizeError` (`packages/wallet-core/src/jobs/error.ts:39`) returns a job envelope. Two inline copies of `err instanceof Error ? err : new Error(String(err))`: `EXT/tests/e2e/helpers/account-io.ts:81`, `helpers/backup-export.ts:53`. Searched: `toError`, `asError`, `normalizeError`, `ensureError`, `coerceError`, `errorFrom`, `wrapError`, `instanceof Error ?`, `new Error(String(` over `EXT/{src,tests,scripts}` and `packages/*/src`. | build new: one fixture helper (a product package gains nothing from a test need) |
| Record page errors | `EXT/tests/e2e/fixtures/extension.ts:341` and `:1273` (identical handlers), `EXT/tests/e2e/network/connect-one-window.test.ts:106` (local, pushes `String(err)`). `ExtensionContext.pageErrors: Error[]` (`extension.ts:42`). | adapt all three onto the one helper |
| The Chrome-only set | `CHROME_ONLY` (`EXT/tests/e2e/fixtures/browser/index.ts:211-215`), three keys, each used by one whole-file `describe.skipIf(isFirefox)`. Named in prose only: `CLAUDE.md:538`, `CI.md:87`, `EXT/tests/e2e/FIREFOX.md:30`, `.claude/skills/e2e-testing/SKILL.md:29`. Not in any workflow, `behavior-gating.test.ts` or `EXT/tests/e2e/README.md`. | reuse; edit the four prose sites with the key |
| A page state the e2e can wait on | `data-settled`, `data-dropdown-open`, `data-incoming-loaded` and others (sweep's table). The compact title bar has none: its state is a hashed CSS-module class and the computed opacity. | not needed: #269's cause is in the page, see below |

## Issue claims, checked

### #249 holds, and is wider

- Reproduced under `bash` with GNU grep 3.11: `grep -rls "@requires-proverless" <marked file> --retry=0` prints nothing (exit 2, swallowed by `|| true`). `--exclude <path>` is read as grep's own `--exclude` and consumes the path. `-t <name>` is an invalid grep option. A vitest name filter (`import-handshake`) is not a path, so `grep -s` skips it. In every case the guard passes.
- CI is not exposed: the only prover-ON callers (the `canary` jobs in `pr-extension-network-e2e*.yml` and `nightly.yml`) pass plain file paths, and every other lane sets `NULO_E2E_PROVERLESS=1`, which skips the guard. The gap is local runs.
- Probe of `bun run vitest list --filesOnly --json=<file> --config vitest.e2e.network.config.ts <args>` (vitest 4.1.10, about 0.7 s, no global setup, no `.e2e-state` writes): no args → 117 files; `--shard=2/4` → 117 (shard is ignored by `list`); `<file> --retry=0` → 1; `import-handshake` → 2 (both handshake files); `--exclude transfers` → 116; `--reporter=json --outputFile=…` → 1, no output file written; `-t "<name>" <file>` → 1; `nosuchfile` → 0; an unknown flag → exit 1.
- Eleven network files carry the marker (the sweep lists them).

### #269 holds: the cause is in the page

- `EXT/src/popup/pages/settings/index.vue:97-102` and `EXT/src/popup/pages/activity.vue:133-138` both create `new IntersectionObserver(([entry]) => { heroVisible.value = entry.isIntersecting }, { threshold: 0 })`. The callback reads the first queued entry. When two rendering updates queue entries before the callback task runs, it receives both, oldest first, and keeps the stale state.
- Diagnostic (an untracked spec, deleted after the run): the armed Chrome smoke build; Settings scrolled to the top, a Tab walk of 20 to 53 presses, then the `clickBelowBar` scroll and the same 5 s opacity wait, twelve times in one launch, with the page's `IntersectionObserver` wrapped to log each callback. 4 of 12 iterations timed out. Each failure followed a callback that delivered two entries, `[true, false]`: the page set `heroVisible` to `true` while the hero sat 300 to 1100 px above the scrollport. The test's own scroll keeps the hero out of view, so no new entry arrives and the bar stays hidden. Every passing iteration had single-entry callbacks up to that point.
- So the test waits on the right condition; the page breaks its own rule ("the compact bar shows once the hero leaves") under fast scrolling. No `scroll-behavior`, ancestor opacity or route transition is involved (the sweep checked all three).
- The unit tests (`settings/index.test.ts:84`, `activity.test.ts:99`) stub the observer as a no-op and never drive the callback.

### #272: the claim of the issue is accurate; the Firefox proof is below

- `CHROME_ONLY.hangingRequest` (`fixtures/browser/index.ts:214`) is used only by `EXT/tests/e2e/network/backup-import-stalled-network.test.ts:154`. The spec arms `interceptRpc(…, PUBLIC_RPC_ORIGIN, { kind: "redirect", to: stub.url })`; the stub (`helpers/rpc-stub`) is loopback. The Firefox driver's redirect (`fixtures/browser/firefox-rpc-intercept.ts`) keeps path and query and must target loopback, which this does.
- No workflow or `behavior-gating.test.ts` pin changes: both Firefox lanes already run the file (it skips inside). The prose sites are the four in the reuse map.
- Planner probe, Firefox, retry 0, `skipIf` removed locally: 2 of 2 tests passed (lessons/phase-0.md).

### #274 holds as a helper defect; the exact race is an inference

- `importToken` and `refreshBalances` click through `document.querySelector('[data-testid="tokens-menu-trigger"]')?.click()`, which does nothing when the trigger is absent, then wait 2 s for the item.
- `tokens-menu-trigger` is static inside `TokensView` (`EXT/src/popup/components/modules/general/TokensView.vue:378`), which mounts with Home under `v-if="appStore.isLogined"` (`EXT/src/popup/pages/general.vue:53`). `switchToNetwork` returns once the header and `nulo:ui:activeAccount` show the new chain, not once Home has re-rendered for it. Whether the trigger was absent, or the menu opened and was closed by a re-render, the failure log cannot say: the helper never checks the dropdown's own state.
- `DropdownRoot.vue:73-76` toggles on every trigger click, so a blind second click closes an open menu. `data-dropdown-open` on the wrapper (`:267`) is the dropdown's own state, unit-tested in `Dropdown.test.ts:208-224`.
- Callers: 13 direct, 4 through `importTokenAndWaitForBalance` (the sweep lists them).
- Planner probe: on the armed Chrome build, a hash change to Home followed at once by the helper's bare click found no trigger 6 of 6 times, and the item never showed (lessons/phase-0.md). A click during Home's mount is a deterministic no-op.

### #275 holds on Chrome; Firefox only ever delivers Errors

- Puppeteer 25.8.0 CDP: `createClientError` (`puppeteer-core/lib/puppeteer/cdp/utils.js:94-105`) returns the primitive itself when the exception is not an error object and has no `objectId`; `Page.js:711` emits it as `pageerror`. The event type is `Error | unknown` (`api/Page.d.ts:565`).
- Puppeteer 25.8.0 BiDi: `bidi/Frame.js:227-242` always emits `new Error(entry.text ?? '')`.
- Handlers: `extension.ts:341`, `extension.ts:1273` (`(err as Error).message?.includes(...)` throws on `undefined` and `null`; any other primitive is pushed as an `Error`), `connect-one-window.test.ts:106` (same filter, pushes `String(err)`).
- Readers of `.message`: `account-import-export.test.ts:99`, `passkey-paths.test.ts:109,195`, `passkey-backup.test.ts:241,303,362`, `security.test.ts:81,116`, `network/account-balance-orphans.test.ts:224`, `network/imported-account-execution.test.ts:106,184`, `_probe-console-capture.test.ts:87`, `contacts.test.ts:59`, `network/backup-restore-sw-restart.test.ts:318`. Most readers use `toEqual([])`.
- `_probe-console-capture.test.ts` (opt-in, `NULO_E2E_CONSOLE_PROBE=1`) already proves that a throw and a rejection reach `pageerror`.

## Collisions and constraints

- Sibling lanes: `e2e-harness-gaps` arc 3 holds `apps/playground` and `EXT/tests/e2e/network/tx-*.test.ts`; nothing here touches either. Its arc 4 branch (blocked on #279) adds `"type": "module"` and keeps the network config's name (checked by the Opus audit).
- `browser-seam.test.ts` forbids `isFirefox` branches under `fixtures/**` and `helpers/**`; the new helpers have none.
- No complexity acceptance sits on a touched function.
- Path filters: every e2e lane (smoke and network, Chrome and Firefox) triggers on `apps/extension/**`, so the arc's PR needs no label.
- Open issues read (`gh issue list --state open --limit 200`): none collides with the five.
