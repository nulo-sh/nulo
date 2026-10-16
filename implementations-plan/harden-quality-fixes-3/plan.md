---
plan: harden-quality-fixes-3
tier: mid (the lane brief names it; competing outline, Codex + Opus dual audit, a fresh Codex final pass)
status: planned, awaiting approval
issues: "#544 (arc 1, Closes); #546, #539 (arc 2, Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; a fresh Codex final pass
base: origin/dev at 493ff497
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-quality-fixes-3: the e2e fixture layer, one of each

Two arcs, each one PR against `dev`, no stack (orchestrator D-orch-1). Arc 1 gives the fixture layer a leaf and an acyclic graph, and splits `fixtures/helpers.ts` by concern behind a barrel; no spec changes. Arc 2 removes the copies: the execution canaries' shared flows first, then the other spec copies, then the fixture mechanisms that exist twice. Test-only; `UI impact: none` except the one playground string in [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In.** #544 whole. #546 whole. #539 whole except the playground message (Ask A1). The fifth swallowing catch of known limit #568 (`createSponsoredFeeOptions`), removed with the four the extraction touches (D9).
**Out.** Anything under `apps/extension/src/`. F-01 step 2 and F-06 (#536, #540), F-02 (#537). The send-option spread in `fixtures/aztec.ts` (not in #546's fix). `fixtures/type-roles.ts` and `type-roles.test.ts` (another lane). A cycle rule outside `apps/extension/tests/e2e/`.

## Outcome & Quality Bar

- **For whom:** the next contributor who adds an e2e helper or changes a flow the canaries drive, and the owner reading a canary result on an Aztec bump.
- **Excellent:** (1) `bun run lint` fails on any import cycle in the e2e tree, and the tree has none. (2) A helper lives in the module named for its concern; specs keep their two import lines. (3) Each flow has one owner: a change to the grant, consume, reconnect or send choreography is one edit, and both canaries follow it. (4) No spec's pass condition and no wait budget changes: a merged helper takes each caller's budget as a parameter. The two changes that remain are named: a dApp-side error before the approval window now fails the call at once, and the token fixtures take their balance baseline before the import.
- **Good enough:** modules that import the hub without forming a cycle keep doing so; the lint rule, not a style rule, holds the line.

## Assumptions

**Facts** (citations in recon.md):
1. The runtime cycle set is `fixtures/{extension,helpers,popups,playground,send-page}.ts` and `helpers/legal-drivers.ts`; Biome adds `helpers/import-drivers.ts` and `fixtures/passkey.ts` through the dynamic import at `extension.ts:1082`.
2. Biome 2.5.13's `suspicious/noImportCycles` runs here, ignores `import type`, counts `import { type X }` and dynamic imports as edges, and follows `export *`: a scratch barrel re-exporting a module that imports the barrel was reported on both edges (lessons/phase-0.md).
3. `patchPagePolling`'s accepted directive is on an anonymous callback, which has no move path; the manifest holds 22 acceptances.
4. `helpers.ts` has no module-scope side effect; only `dropdownDiagnostic` is a private name another section calls.
5. `typecheck:all` type-checks `tests/e2e/**` (`tsconfig.e2e.json`).
6. Of nine `clickSelector` sites, only `pressRow` clicks a control that is `aria-disabled` by design.
7. The playground syncs inputs on `input` and `change` alike; `same-token-concurrent-sends` already sets the canaries' send inputs with `setPgInput`.
8. `clickByTestId` waits for a natively disabled target to enable, so `resetProfile`'s submit already waits.
9. The canary test names are pinned in `scripts/ci-cd/canary-expectations.json`; both canaries set `retry: 0`; after the reconnect, both wait for at least two options in `pg-select-account`, whose options are the granted accounts only (`apps/playground/src/sections/authwit.ts:38-45`).
10. `helpers/import-drivers.ts:19` imports `@nulo/wallet-crypto`, which reaches `@aztec-foundation/bb.js` through Poseidon; 13 of the 63 smoke specs load it today.

**Inferences:**
- I1. With every module the hub reaches repointed, the dynamic import at `extension.ts:1082` forms no cycle, so it can stay lazy (D11).
- I2. The rewritten selector predicate is Boolean-equal to today's: a 128-case truth table over a modelled element agrees (lessons/phase-0.md); phase 1.1 repeats it on the real source, and every spec exercises it.

**Asks** (orchestrator; working assumption in brackets):
- A1. The playground's two sections that say "Not connected" would say "Not connected — call connect() first" under one guard. A visible string in the test dApp. [OWNER-ASKS.md OA-1. Ships now: six sections share the guard; `batch` and `data` keep theirs.]
- A2. Arc 1 makes every open PR that edits `fixtures/helpers.ts` or the hub's primitives conflict. [Merge arc 1 promptly once green; a later PR moves its hunk to the module the arc 1 map names.]

## Architecture & Implementation

### Arc 1 (#544): leaves, an acyclic graph, a split by concern

- **`fixtures/dom.ts`** (new leaf; imports `puppeteer` and `./browser` only): from `extension.ts`, verbatim, `patchPagePolling`, `withTimeoutMessage`, `isFrameDetachError` (now exported), `isTargetDetachError`, `waitForHash`, `waitForNameField`, `expectNoNameField`, `expectNameFieldPrefill`, `typeIntoInput`, `clickButtonByText`, `replaceInputValue`, `clickSelector`, `clickByTestId`, `pickFileByTestId`.
- **`fixtures/wallet-pages.ts`** (new; imports `./dom`, `./browser`, `./page-errors`, `./presto`, `./legal`, and `import type { ExtensionContext } from "./extension"`): `openPopup` with its private chain (`openPopupOnce`, `setUpPopupPage`, `loadPopup`, `closeConfirmed`, `popupReady`), `recordPageErrors` with `recorded` and `isPrestoProbeNoise`, `waitForServiceReady`, `seedLegalAcceptance`, `openOnboarding`.
- **The selector predicate (D4).** `patchPagePolling`'s in-page predicate is rewritten under the budget, so its directive and manifest entry go instead of moving:
  ```ts
  (args: { sel: string; visible: boolean; hidden: boolean }) => {
  	const el = document.querySelector<HTMLElement>(args.sel)
  	const shown = (e: HTMLElement) => {
  		const style = window.getComputedStyle(e)
  		if (style.display === "none" || style.visibility === "hidden") return false
  		const rect = e.getBoundingClientRect()
  		return rect.width !== 0 && rect.height !== 0
  	}
  	if (args.hidden) return !el || !shown(el)
  	return !!el && (!args.visible || shown(el))
  }
  ```
  `bun run baseline:complexity` regenerates the manifest (21 entries); `.claude/skills/complexity-budgets/SKILL.md:13` says 21 and drops "in-page selector semantics" from the twelve harness directives (now eleven).
- **Domain modules** (new, under `fixtures/`; each declaration moves verbatim):

  | Module | From `helpers.ts` |
  |---|---|
  | `session.ts` | Session section (`callService` stays private); `readLivenessBaseline`, `waitForWorkerLiveness` |
  | `navigation.ts` | Navigation section; `navigateByHash` |
  | `widgets.ts` | Dropdown (`dropdownDiagnostic` exported), Snackbar, Popup chain helpers; `closeStuckPopup` |
  | `auth.ts` | Auth section without the profile names below; `INCOMING_SCAN_INTERVAL_MS`, `unlockUntilIncomingRow`, `changePassword`, `openForgotPasswordFromAuth` |
  | `profiles.ts` | `createAndActivateProfile`, `readProfileNames`, `expectNewProfileNamed`, `getActiveProfileName`, `resetProfile`, `captureSoleProfileId`, `waitForProfilePurged`, `revealSeedPhrase`, `renameProfile` |
  | `accounts.ts` | Account section |
  | `address-book.ts` | Contact section without `closeStuckPopup` |
  | `networks.ts` | Network section; `openNetworkDetail`, `deleteNetworkRow` |
  | `settings.ts` | Settings: appearance + privacy; `setDeveloperMode`, `setDebugMode`, `setAdvancedToggle`, `enableDeveloperMode` |
  | `tokens.ts` | Token and Token Detail sections; `captureBalanceBaseline`, `waitForFreshBalanceRow`, `waitForTokenCardAmount` and their private storage readers |
  | `transfers.ts` | Transfer and Fee Method sections |

  A name that another lane adds before the rebase goes to the module of the section it sits in. Each module imports the module that owns a name it calls, never the barrel; `send-page.ts` takes `import type { FeeMethodSubtitle } from "./transfers"`.
- **`fixtures/helpers.ts`** becomes the barrel: one comment line, then `export * from` each module above, alphabetical. Its export set is today's plus `dropdownDiagnostic`.
- **`fixtures/extension.ts`** keeps the launch, the fixtures and `registerProfile`/`connectPlayground`; it imports what it calls from the modules that own it and re-exports `./dom` and `./wallet-pages` (`export *`), so its export set is today's plus `isFrameDetachError`. The dynamic imports at `:452-453` become the existing static imports. The one at `:1082` stays dynamic, as the three `./aztec` ones do (D11); its comment changes from the cycle reason to the real one: the import drivers bring `@nulo/wallet-crypto`, and through it bb.js, which only this fixture needs.
- **Repointed imports** (the modules the hub reaches): `popups.ts`, `playground.ts`, `send-page.ts`, `passkey.ts`, `helpers/legal-drivers.ts`, `helpers/import-drivers.ts` import primitives from `./dom` / `./wallet-pages` and helpers from their modules; an `ExtensionContext` they still take from the hub becomes `import type` (Biome counts `import { type X }` as a runtime edge). Every other module keeps its imports (D3).
- **The pin (D2).** `biome.json` gains `{ "includes": ["apps/extension/tests/e2e/**"], "linter": { "rules": { "suspicious": { "noImportCycles": "error" } } } }`. One lint rule covers an edge through the barrel too (Fact 2).
- **Docs.** `tests/e2e/README.md`: a short "Fixture layout" section (the two leaves, the domain modules, the hub and the barrel, the lint rule) and the helper table's file names. `.claude/skills/e2e-testing/SKILL.md:320,630`: name the function and `fixtures/dom.ts`, no line numbers. `apps/extension/scripts/e2e/browser-seam.test.ts:30,368`: the `\//` regex now lives in `fixtures/dom.ts`. `FIREFOX.md` names no moved module; it changes only if a grep for the moved names finds a reference.

### Arc 2 (#539 first, then #546)

**Execution canaries** (`network/frozen-account-canary.test.ts`, `network/passkey-execution-canary.test.ts`):
- `fixtures/playground.ts` gains `txHashOf(resultJson)` (today's body), `setPgInputs(page, values)` (each entry through `setPgInput`, in order) and `selectPgAccount(page, address)` (waits up to 30 s for an `option[value=address]` in `pg-select-account`, selects it, dispatches `change`, throws unless the select reads `address`).
- `fixtures/send.ts` gains `runApprovedPgCall(ctx, page, { button, method, label, popupTimeoutMs = 60_000, contentTimeoutMs = 60_000 })`: snapshot, arm the execute wait, click `pg-btn-<button>`, race the window against a dApp-side error result (the canaries' sentinel, at `popupTimeoutMs - 5_000` as today), `waitForExecuteContent(popup, contentTimeoutMs)`, `approveExecute(popup, { approvableTimeoutMs: 120_000 })`, wait for the result (300 s), `assertPgOk`, return it. `sendDefaultTx` sets its three inputs and returns `runApprovedPgCall(...)`, passing its `popupTimeoutMs` and a new `contentTimeoutMs` option (default 60 s, today's). `reconnectPlayground` gains `timeoutMs = 60_000` for its verify and connected waits, and its doc says it never reloads the page itself.
- `fixtures/browser/index.ts` gains `stopBackgroundIfAlive(owner): Promise<boolean>` beside `stopBackground`: false (and one `console.warn`) when no background is alive.
- Each canary: grant = `setPgInputs` + `runApprovedPgCall` (`grantPublicAuthwit`, popup and content 30 s); consume = `selectPgAccount(page, callerB)` + `runApprovedPgCall` (`consumeAuthwit` / `sendTx`, 30 s, 30 s); after its own unlock, `page.reload` + the connect-button wait, `reconnectPlayground(ctx, page, "transaction", label, { timeoutMs: 30_000 })`, its own wait for at least two account options (kept verbatim: it is the check that both granted accounts came back), `selectPgAccount(page, ownerA)`, `sendDefaultTx(..., { popupTimeoutMs: 180_000, contentTimeoutMs: 30_000 })`; each tx hash through `txHashOf` and `waitForTxMined`. Kept per canary: the derivation oracle and nullifier checks (frozen), the credential recovery and ceremony (passkey), the step logs, the test names, `retry: 0`.
- Every caller passes today's budget (D7). The sentinel joins the grant, consume and `sendDefaultTx` calls: a dApp-side error before the window now fails at once with that error, not at the window's timeout; an ok result still needs the window.
- `network/multi-account-from.test.ts`, `network/account-switch-live-session.test.ts`: their setters go; calls use `setPgInputs` with input names. `network/authwit-lifecycle.test.ts:70`, `network/authwit-consume-smoke.test.ts:89`: `selectPgAccount`.

**The other #539 copies:**
- `passkey-backup.test.ts` imports `registerPasskeyProfile` from `fixtures/passkey.ts`; its copy and its now-unused imports go.
- `fixtures/profiles.ts` gains `confirmProfileReset(page, timeoutMs)`: wait `timeoutMs` for `reset-checkbox-permanent`, click the three boxes, type the active profile's name with `replaceInputValue`, `clickByTestId(page, "reset-submit-btn", timeoutMs)`, whose own predicate waits for the enabled button. Callers and the budgets they keep: `resetProfile`'s tail (10 s: its checkbox is already settled, and its submit click waits 10 s today); `completeResetRitual` in `helpers/crash-truth.ts` (10 s, today's `submitWhenEnabled` window; it keeps its landing wait); `passkey-backup.test.ts` `resetWallet` and the inline ritual in `passkey-paths.test.ts` (5 s, each keeping its navigation and landing waits). `submitWhenEnabled` stays for its other callers.
- `endpoints.test.ts`: a local `openFirstNetworkDetail(page)` (navigate to the networks list, read the first row's name, `openNetworkDetail`) replaces the five preludes.
- Playground: `apps/playground/src/lib/wallet.ts` exports `NOT_CONNECTED = "Not connected — call connect() first"` (its own throw at `:147` uses it); `lib/log.ts` gains `guarded(method, fn)` beside `logCall` and imports `getWallet` and `NOT_CONNECTED` from `wallet.ts`, so the edge runs one way. `authwit`, `simulation`, `transactions`, `contracts`, `phase` and `meta` use `guarded` (`meta`'s variant passes `wallet` to `fn`; `guarded` passes it to every `fn`, which the others ignore). `batch` and `data` wait on OA-1.

**#546, the doubles:**
- Click (D6): one private in-page driver in `fixtures/dom.ts`, `clickLast(page, selector, timeout, pressAriaDisabled)`; `clickByTestId(page, id, timeout)` and `clickSelector(page, selector, { timeout?, pressAriaDisabled? })` call it, and both refuse `aria-disabled` by default. `pressRow` passes `pressAriaDisabled: true`, the one control that explains itself when pressed while `aria-disabled`. `popups.ts:282,338` pass `{ timeout }`.
- Chrome cleanup: `global-setup-smoke.ts` calls `killChromesLoading(EXTENSION_PATH)` at setup and teardown; its own function and `execSync` import go. `apps/extension/scripts/e2e/owned-processes.test.ts` gains one case: no string or template literal in a `tests/e2e/**/*.ts` file other than `sandbox-ownership.ts` contains `pkill` (read with the TypeScript parser, so the comments in `reap.ts:24` and `fixtures/browser/ownership.ts:19` do not count).
- Download capture: `helpers/download-capture.ts` holds `armDownloadCapture(page, { gzip })` and `readCapturedDownload(page)` (backup-export's bodies, one window slot `__downloadCapture`, "download was not captured within 30s"). `backup-export.ts`, `account-io.ts`, `contacts.ts`, `backup-roundtrip.test.ts` and `passkey-backup.test.ts` use them, and `passkey-backup.test.ts:177`'s direct slot read takes the new name; account-io's private pair goes.
- Token registration: `fixtures/aztec.ts` gains `registerTokenOnWallet(wallet, node, tokenAddress): Promise<AztecAddress>`; the four copies call it. No catch: registration is idempotent on the pinned line (#568), so a failure now names its cause (D9). The catch in `createSponsoredFeeOptions` goes too. One case turns red where it passed: a node RPC failure inside a re-registration (`pxe.js:532` asks the node on every call), which the next call would usually meet anyway.
- Network fixture bodies (`fixtures/extension.ts`): exported `requireAztecConfig()` (the three guards and `fixtures/extra-tokens.ts:26-27`); a private `launchOnLocalNetwork()` returning `{ ctx, page }` (launch, register, popup at `/popup/general`, Local network) for `localNetworkExtension`, `tokenReadyExtension`, `feeJuiceReadyExtension`; `FIXTURE_TOKEN_RAW = 1000n * 10n ** 18n` for the mints and the expected rows; the three fund-and-fresh blocks call `importTokenAndWaitForBalance`, which gains `timeoutMs = 90_000` (`tokenReadyExtension` passes its 60 s). That helper takes the baseline before the import; the fixtures took it after. No row exists before the import, so the earlier baseline cannot admit a stale value. The stale "intentionally duplicated" sentences at `:685-698` go.

## Security & Adversarial Considerations

- **Threat model.** Test code only; nothing ships in the extension bundle. The asset is the gates: a refactor that makes a gate pass for the wrong reason. The canaries decide whether an Aztec bump ships, so their pass conditions stay exact: every `assertPgOk`, tx-hash shape check, mined wait, nullifier check, test name and `retry: 0` survives. The error sentinel only fails earlier on a dApp-side error; an ok result still needs the approval window.
- **Process kills.** Smoke moves to the escaped, argument-anchored pattern run without a shell. Today's `sh -c` form interpolates the path into a shell string, so a path holding `"` or `$` breaks it, and the unanchored pattern also matches a sibling build (`dist/chrome-canary`) on a shared host. The new case keeps every `pkill` behind `chromePattern`.
- **Swallowed errors.** Removing the registration catches turns a misattributed red into a red that names its cause; a false pass was impossible before and stays so (#568). A node failure inside a re-registration now reds the call that met it.
- **Same-path runs.** Two runs that load the same `dist/` cannot be told apart by any `pkill` pattern; the suite already forbids two e2e runs in one worktree (`e2e-testing` skill, § Hazards), and this arc keeps that boundary.
- **Supply chain.** No dependency, lockfile, permission or workflow change. `biome.json` gains one rule.

## UI impact

None in the wallet. The playground (the test dApp) keeps every string it shows today; OA-1 asks to unify two.

## Arc 1 (PR A): #544

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`, each exit 0. Commit per phase.

### Phase 1.1: the predicate, in place
- First, prove I2 on the real source: a scratch script under `~/.cache/nulo-backlog/harden-quality-fixes-3/` evaluates the base predicate and the new one over every combination of present, `display`, `visibility`, zero width, zero height, `visible` and `hidden`; the outputs must be equal.
- Change: the predicate inside `patchPagePolling`, still in `fixtures/extension.ts`; `scripts/complexity-baseline/manifest.json` (regenerated by `bun run baseline:complexity`); `.claude/skills/complexity-budgets/SKILL.md:13`.
- Gate: `F`; a second `bun run baseline:complexity` leaves no diff; `bun run baseline:rescore`; `bun run test:ci-gating`; `bun run test:release`.

### Phase 1.2: the leaves, the split, the barrel and the pin
- One change, since no part of it passes the cycle rule alone: `fixtures/dom.ts`, `fixtures/wallet-pages.ts`, the eleven domain modules (new); `fixtures/extension.ts`; `fixtures/helpers.ts` (barrel); the six repointed modules; `biome.json`; the docs listed above.
- Proof, not committed: a scratch script lists every top-level declaration of `helpers.ts` and `extension.ts` at the phase 1.1 head and asserts each appears, byte for byte, in exactly one module at this head. Allowed differences: import lines; the `export` added to `isFrameDetachError` and `dropdownDiagnostic`; `connectPlayground`'s two dynamic-import lines; the comment above the `:1082` import inside the `test` object. It also compares the export sets of `helpers.ts` and `extension.ts`: only those two names are added, none removed. `git diff --stat` shows no file under `apps/extension/tests/e2e/` named `*.test.ts`.
- Proof that the rule bites, not committed: in `fixtures/tokens.ts`, import `waitForToast` from `./helpers` instead of `./widgets`; `bun run lint` must report `noImportCycles` on that edge (exit code alone proves nothing); revert.
- Gate: `F` (lint now runs the cycle rule, which must report nothing); `bun run test:all`; `bun run check:plans`. Record `bun run lint`'s wall-clock at the base and at the head in `lessons/phase-1.md`.

### Phase 1.3: arc 1 e2e gate
- With `load1 < 150`: build the armed bundle (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`).
- Smoke, the whole suite, Chrome then `NULO_E2E_BROWSER=firefox`: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`.
- Network, Chrome then Firefox, proverless: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts tests/e2e/network/multi-account-from.test.ts tests/e2e/network/holdings.test.ts tests/e2e/network/tokens.test.ts` (`fee-methods`: `feeJuiceImportedExtension` with its lazy `importSeed`, and `feeJuiceReadyExtension`; `multi-account-from`: a cap fixture; `holdings`: `tokenReadyExtension` and `extraTokensFixture`; `tokens`: `localNetworkExtension`).
- Pass: all green at retry 0. **Red procedure** (both arcs): log every red in `lessons/phase-<arc>.md` with its failing assertion, before any rerun. A rerun is diagnostic: it never erases a red. A red is explained only when its failing assertion and site match an open flake issue or an unfixed row of the `e2e-testing` skill's flake table whose recorded cause lies outside the arc's diff (a fixed row is no ground), or when the file reds the same way on the arc's base (reported as the blocker). Any other red means the arc broke it: fix the cause. A red execution canary blocks until explained or fixed.

## Arc 2 (PR B): #539, #546

Starts on a branch off `dev` after arc 1 merges; first re-check recon's line numbers against the new modules and log moves in `lessons/phase-2.md`.

### Phase 2.1: the canaries' shared flows
- Change: `fixtures/playground.ts`, `fixtures/send.ts`, `fixtures/browser/index.ts`, the two canaries, `multi-account-from`, `account-switch-live-session`, `authwit-lifecycle`, `authwit-consume-smoke`.
- Gate: `F`. `jscpd` is not a gate; `git grep -n "function txHashOf\|function setPgInputs\|function restartBackground" -- apps/extension/tests/e2e/network/frozen-account-canary.test.ts apps/extension/tests/e2e/network/passkey-execution-canary.test.ts apps/extension/tests/e2e/network/multi-account-from.test.ts apps/extension/tests/e2e/network/account-switch-live-session.test.ts` prints nothing (`same-token-concurrent-sends`' own `restartBackground` is a different flow and stays).

### Phase 2.2: the other spec copies and the playground guard
- Change: `passkey-backup.test.ts`, `passkey-paths.test.ts`, `fixtures/profiles.ts`, `helpers/crash-truth.ts`, `endpoints.test.ts`, `apps/playground/src/lib/{log,wallet}.ts`, six sections.
- Gate: `F`; `bun run --cwd apps/playground typecheck`; `bun run --cwd apps/playground build`.

### Phase 2.3: the doubles
- Change: `fixtures/dom.ts`, `helpers/contacts.ts`, `fixtures/popups.ts`, `global-setup-smoke.ts`, `apps/extension/scripts/e2e/owned-processes.test.ts`, `helpers/download-capture.ts` (new), its six importers, `fixtures/aztec.ts`, `fixtures/extension.ts`, `fixtures/extra-tokens.ts`; `tests/e2e/README.md` (the click row: one driver, the `aria-disabled` rule and its one exception).
- Tests: the `pkill` case is red when `global-setup-smoke.ts` is reverted by hand (proof, not committed) and green after.
- Gate: `F`; `bun run test:all`; `bun run test:ci-gating`.

### Phase 2.4: arc 2 e2e gate
- Smoke, Chrome then Firefox, `--retry=0`: `passkey-backup`, `passkey-paths`, `passkey-retry`, `passkey-toolbar-panel`, `security-reset`, `endpoints`, `contacts-import`, `contacts`, `accounts`, `backup-roundtrip`, `account-import-export`, `auth-flows`, `wallet-lock`. Then the whole smoke suite once per browser.
- Canaries prover-ON, Chrome then Firefox, per the `aztec-update` skill (`PRESTO_ALLOW_ALL=1 presto-server` on `127.0.0.1:59833` with a private `PRESTO_HOME` and a warm-up prove; never stop another agent's server; wait while the port is held): `VITE_NULO_PRESTO_REQUIRED=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts tests/e2e/network/delete-after-prove.test.ts` (`delete-after-prove` is a pinned prover-ON file that calls `sendDefaultTx`); the presto log shows `Proving succeeded`.
- Network proverless, both browsers: `multi-account-from`, `account-switch-live-session`, `authwit-lifecycle`, `authwit-consume-smoke`, `pxe-host-state`, `inflight-call-background-death`, `backup-restore-sw-restart`, `fee-methods`, `tokens` (`localNetworkExtension`), `holdings`, `incoming-transfers` (the four token-registration helpers). Then the whole network suite once per browser on the final head.
- Pass and red procedure as phase 1.3. No e2e scenario is added.

## Delivery

- Arc 1: branch `worktree-harden-quality-fixes-3`; rebase on `dev` and re-apply the module map to any new hunk; `gh pr create --base dev` after phase 1.3 and its Codex loop, no labels. Title (68): `refactor(e2e): break the fixture import cycles; split helpers by concern`. Body: what moved and why, the proofs (declarations byte-identical, export sets, the predicate table), `bun run lint` wall-clock before and after, the smoke wall-clock per browser (this PR's run against the latest successful run on another PR, the `e2e-testing` skill's method), "no e2e scenario added", `UI impact: none`, `Closes #544`, the trailer. Then `gh pr checks <n> --watch`.
- Arc 2: branch `harden-quality-fixes-3-arc2`; the same steps after phase 2.4. Title (69): `test(e2e): one owner per fixture flow; the canaries share their choreography`. Body as above plus the two named behaviour changes (the early sentinel failure, the earlier baseline), the OA-1 state, `Closes #539`, `Closes #546`; the close-out is this PR's final commits. If OA-1 is still open at close-out, #539 is `Refs`, and a comment names the two sections left.
- Parallelism: arc 2 builds on arc 1's modules; no lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision `493ff497`:
- Step 1 is absent (`code_review: off`).
- Step 2 per arc at its boundary, over that arc's diff: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Every prompt carries the standard's two rules verbatim, the arc map ("arc N of 2"), and this plan's rule verbatim: "A moved declaration that is not byte-identical, or a merged flow whose pass condition changed, is a defect." Then one fresh Codex session over the net diff for cross-arc issues. Log rounds in `lessons/phase-<arc>.md`. Hard stop at three rounds.
- Step 3: Delivery above. Step 4: the close-out in arc 2's PR. Step 5: after arc 2 merges, `agent-worktree done harden-quality-fixes-3 --merged`, and the same for the arc 2 worktree if one was made.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Arcs and order | two: the structure (#544), then the copies (#539, #546) on it | the copies first (their helpers would land in `helpers.ts` and move again); one PR (a semantic change hidden in a 3,000-line move); three PRs (a third CI cycle for no review gain) |
| D2 | The layering pin | Biome `noImportCycles` at error over the e2e tree | `noRestrictedImports` on the hub's specifiers (a style rule: flags imports that form no cycle, misses a cycle through another module); a custom graph test (rebuilds what Biome ships) |
| D3 | Which modules repoint | the six the hub reaches, plus the new modules; `ExtensionContext` stays in the hub, taken by `import type` | all twelve others too (churn in files no cycle touches; the rule already holds the line); moving `ExtensionContext` into `wallet-pages.ts` (Opus: cleaner; rejected: it is the launch's type, a type-only import forms no edge, and twelve importers would move) |
| D4 | `patchPagePolling`'s directive | rewrite the predicate under budget; the acceptance goes | move it (an anonymous callback has no move path: a new acceptance needs owner sign-off); leave `patchPagePolling` in the hub (`popups` and `playground` keep the cycle) |
| D5 | Helpers barrel | keep `helpers.ts` as `export *` barrel; specs unchanged | repoint 122 specs and delete it (collides with every lane touching specs) |
| D6 | Click readiness | one driver; both entry points refuse `aria-disabled`; `pressRow` opts in | two explicit policies (the call site still cannot tell them apart); press through `pointerClick` (testid-only, no row scoping) |
| D7 | Budgets of merged copies | each caller passes today's budget through a budget parameter of the shared helper (reversed in round 1) | the shared fixture's value (Opus sided with it: the conditions do not change; Codex: a longer wait admits a slower regression the old gate refused, and the owner forbids raised timeouts; Codex's argument wins) |
| D8 | Canary post-restart block | compose `reconnectPlayground`, `selectPgAccount`, `sendDefaultTx`; the two-option wait stays in each canary | a new `reconnectAndSendAs` (duplicates two fixtures that already exist); `selectPgAccount` alone (both legs: it drops the check that both accounts came back) |
| D9 | Registration catches | delete all five (#568's recorded fix, same file) | keep them (#546's text; hides the cause of a red); delete only the four (one swallowing catch left beside the helper) |
| D10 | Bulk setter | `setPgInputs` over `setPgInput` | a native-setter copy (the playground syncs on both events; the suite already sets these inputs through `setPgInput`) |
| D11 | `extension.ts:1082` | stays dynamic, comment corrected (reversed in round 1) | static (both legs: it would load `@nulo/wallet-crypto` and bb.js in every hub importer, 50 smoke specs that skip it today) |
| D12 | Arc 1 phase order | the predicate in place first, then the structure as one change | leaves first (the moved directive fails `F` until the rewrite; repointing needs modules that do not exist yet; Codex) |
| D13 | How `biome.json` scopes the cycle rule (arc 1, tree over plan) | the rule at error at the root, `off` in a last override for `["**", "!apps/extension/tests/e2e/**"]` | the plan's e2e-only override: Biome 2.5.13 builds its module graph only for a project rule enabled at the root, so the override reported nothing on a planted cycle (`--only` did); the rule at the root everywhere (out of scope: `src/` has cycles). Cost: `bun run lint` 1.36 s to about 3.2 s |
| D14 | What `dom.ts`, `wallet-pages.ts` and the barrel carry besides the moved code | the Azguard attribution line on the two modules cut from `extension.ts` (ACKNOWLEDGEMENTS.md: each derived file carries it); the barrel keeps `helpers.ts`'s selector-contract comment above its one line | a one-line barrel only (drops the contract the specs' entry has always stated) |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session `01a146e7`): reject, 8 findings, all accepted. #1 (High) `selectPgAccount` alone drops the canaries' check that both granted accounts came back (demonstrated by trace): the two-option wait stays in each canary. #2 (High) the shared budgets lengthened waits a gate used to fail (demonstrated): D7 reversed, every caller keeps its budget. #3 phase 1.1 moved the accepted directive before phase 1.2 removed it, and repointed to modules created later (demonstrated): D12. #4 a red that turns green on rerun could hide a race (plausible): the red procedure. #5 `price-fixture` uses `feeJuiceImportedExtension`: `tokens` replaces it. #6 the static `import-drivers` import loads more than I1 said: D11. #7 `NOT_CONNECTED` in `log.ts` made `log ↔ wallet` a cycle: the constant lives in `wallet.ts`. #8 two runs on one `dist/` cannot be told apart: the suite's one-run-per-worktree rule, stated under Security; no new limit. Ledger: Codex sided with the plan on D1-D6, D8 (conditional), D9, D10, with outline B on D7.

**Round 1, Opus lens** (Plan agent, opus): conditional approve, 10 findings; accepted except where noted. #1, #2, #4, #9 match Codex #6, #1, #7, #4. #3 nothing proved the rule sees an `export *` edge: a scratch barrel probe reports both edges (Fact 2), and phase 1.2 repeats it on the real tree. #5 `tokens`, `incoming-transfers` and the prover-ON `delete-after-prove` join the gates. #6 `handshake-import.ts` calls no capture, and `passkey-backup.test.ts:177` reads the slot directly: list fixed, the line takes the new name. #7 the reset helper's budgets: `confirmProfileReset` takes `timeoutMs`, and each caller keeps its window. #8 the byte-identity proof's exceptions now list `connectPlayground` and the `:1082` comment. #10: separate `import type` (taken); the `pkill` case reads literals, not comments (taken); `reconnectPlayground`'s doc (taken); move `ExtensionContext` (rejected, D3); move `stopBackgroundIfAlive` into `send.ts` (rejected: it composes two wrappers of the browser layer, where they live). D9's new red case, a node failure inside a re-registration, is named under Security. Ledger: Opus sided with the plan on all ten rows.

**Final pass, Codex** (gpt-6.1-sol, high, fresh session `01a146f7`): conditional approve, 2 findings, both accepted. It reproduced the 128 predicate cases on the real source, the 22 acceptances and the 19 cycle diagnostics, and found the split's declaration graph acyclic. #1 (Medium, plausible) a matched flake row could still waive a red the arc caused: the red procedure now treats a rerun as diagnostic, accepts only an open issue or an unfixed row whose cause lies outside the diff, and keeps a red canary blocking. #2 (Low, demonstrated) the probe's added barrel import would collide with `tokens.ts`'s own `waitForToast` import: the probe swaps that import's source and requires the `noImportCycles` diagnostic. Ledger: none overturned.

## Seeds

Drafts until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

```
/goal Arc 1 then arc 2 of implementations-plan/harden-quality-fixes-3/plan.md done: every phase marked ✓ with its gate output in the transcript; each arc's Codex loop converged (a resumed pass with no new material finding, quoted); PR A (Closes #544) and PR B (Closes #539 #546, or Refs #539 while OA-1 is open) open against dev only after their loops, checks green; the close-out commits in PR B with `git show --stat` of the archive move.
```

```
/loop 15m Drive implementations-plan/harden-quality-fixes-3 per its plan.md: reality check against plan.md and lessons/; arc 2 starts after arc 1 merges; run each phase's gate as written, e2e only at load1 < 150; Codex per arc at its boundary (gpt-6.1-sol, high); never merge; stop and report when both PRs are green.
```
