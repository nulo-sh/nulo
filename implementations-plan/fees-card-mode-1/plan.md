---
plan: fees-card-mode-1
tier: mid
status: planned (final Codex pass approve); awaiting the orchestrator's approval; the arc waits for fees-display-1 to merge
issues: "#513"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet) plus the driver's read; dual audit (Codex gpt-6.1-sol high, Opus Plan leg); final fresh Codex pass
base: origin/dev at dc4a88ec (plan); the arc's base is origin/dev after fees-display-1 merges
trunk: dev
post_implementation_hardening: not scheduled
---

# fees-card-mode-1: one fee card, handed a rule book per mode (#513)

**Pick (owner, 2026-10-17, decision page 40, P40-03 = A; the Decision block on #513):** "One card, handed Send's or the app windows' rule book when it opens; the template is untouched, no pixel changes."

One arc, one PR against `dev`, `Closes #513`. The arc starts only when the orchestrator releases it, after fees-display-1's PR merges, and it merges `origin/dev` into this branch first. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/` or `implementations-plan/`. Line numbers are at `dc4a88ec`; fees-display-1 moves some, so find each by its symbol.

## Outcome & Quality Bar

- **For whom:** the next maintainer who changes a fee rule for Send or for the app windows; and the person who uses either surface, for whom nothing may move.
- **Excellent:**
  1. The card tests the mode at one line, when it opens. A Send rule lives only in Send's rule book, an app-window rule only in the app's. TypeScript checks that both books return one shape.
  2. The sponsor-verdict rules and the snapshot lifecycle run in unit tests without mounting the card.
  3. Same inputs give the same DOM. The card's existing tests pass with only the edits Phase 3 lists. The `<template>` and `<style>` blocks are byte-identical to the arc's base. A scratch comparison renders the same HTML at the base and at the head.
  4. Each of the four inert leftovers is removed or recorded. None is carried into the new code.
- **Good enough:** the display computeds (fees-display-1's) and all copy stay in the SFC. `runFence` is not adopted. No e2e scenario is added.

## Assumptions

**Facts** (verified at `dc4a88ec`; detail in [recon.md](recon.md)):
1. Send always passes `"private"` or `"public"` (`pages/send.vue:181-194,558-559`; `preselectedBalanceType` is only ever `"private"`). The app callers pass no origin, so the prop's `null` default applies. Choosing the rule book once, at setup, changes no supported caller.
2. The template has no mode branch; it binds `originPrivacy` only as `:data-origin` (`:888`). Two copy computeds read the live origin's value: `nudgeCopy` (`:268`) and `statusNotice` (`:487`). They must follow a private ↔ public flip.
3. Biome counts nested functions in the enclosing function (`noExcessiveLinesPerFunction`, 80 lines, `biome.json:62-65`). `composables/**` has no `noRestrictedImports` override. A long composable is therefore a context object plus module-level functions (`composables/useFullBackupExport.ts:469-492`).
4. Vue runs a watcher's source when the watcher is created. Within one component, queued watchers run first-queued, first-run. So creation order decides only between watchers that one dependency triggers, directly or through a computed. Other pairs run in the order their triggers fire; for props, that is the parent's prop-update order.
5. One test reads script internals (`FeeSettingsCard.test.ts:3067-3081`, `vm.sendSelection`). One Send test holds a recovery on the app-key read that leftover 2 performs (`:2054-2074`).
6. `cacheStore.feePaymentMethods` (in-memory Pinia, not persisted) has no reader. Only the card writes it (`:400-405,879`), and three test assertions read it (`:532-548,593,679`).
7. Client methods are prototype passthroughs that use `this` (`packages/extension-messaging/src/core/service-client-factory.ts:54-58`). An unbound `managers.profile.saveFeePick` throws. The card tests mock it unbound, so they would not catch it.
8. Send's `accountUnusable` model has a parent watcher that navigates away (`pages/send.vue:534-536`). The out-models are not emit-only.
9. fees-display-1 (at `8f264b97`, unmerged) edits the card's display computeds, its shortfall template row and its imports. No other running lane edits a file this arc edits (recon § Collisions).

**Inferences:**
- (a) The arc keeps every watcher's creation order, so the order of no pair can change (Fact 4). The order of watchers that different props trigger is the parent's, which the arc does not touch.
- (b) Two network-sandbox runs at one commit may render the card differently. Profiles use fresh entropy, and fee estimates are the run's own. Phase 4 measures this before it compares anything.

**Asks:** none to the owner: nothing a person sees changes. D11 (a picture pair that is noisy at the base) is settled fail-closed by the panel; the orchestrator approves it with the plan.

## Architecture & Implementation

**Shape.** Three composable modules under `composables/`, all TypeScript, each with a colocated test. Each is a context object plus module-level functions, with a thin exported composable over them (Fact 3). The card keeps its template, style, copy, out-models, display computeds and the wiring.

| Module | Exports | Owns | Moved from the card (`dc4a88ec`) |
|---|---|---|---|
| `useSponsorVerdicts.ts` | `useSponsorVerdicts` (state), `watchSponsorVerdicts` (its watchers) | `shortSponsorIds`, `setAsideSponsorIds`, `lastVerdict`, `droppedForVerdictId`, `recheckFpcId`, `verifyingSponsorId`; the verdict watcher and the four re-check watchers; `picked`, `addressEdited`, `forget` | `:133-146`, `:429-430`, `:442`, `:789-795`, `:802-847` |
| `useFeeSnapshot.ts` | `useFeeSnapshot` (state and runs), `watchFeeSnapshot` (its two watchers) | the store lease, the run, the commit, the recovery recommit, the identity gate: `isInitComplete`, `gasBalances`, `registeredFpcs`, `committedScope`, `snapshotCommitted`, `snapshotPending`, `isLoading`, `failure`; `run`, `invalidate`, `dispose`; the recovery and unusable watchers | `:115-123`, `:186-192`, `:220-233`, `:466`, `:490-780`, `:797-800` |
| `useFeeSelection.ts` | `useSendFeeSelection`, `useAppFeeSelection`, types `FeeSelection`, `SelectionLoad` | the two rule books: Send's picks and derived selection; the app's selected row, its pre-fill, reconcile, persist, drop and the two nudge rules | the 15 mode-switching lines and every line only one mode runs (study § 2), except the two copy reads (Fact 2) |

**The rule book's one shape** (`FeeSelection`; both composables return it; derived members are readonly refs):
- **Derived values:**
  - `effectiveMethod`: the method that pays;
  - `previewMethod`: Send's pending preview, none in the app;
  - `held`: `kind === "hold"` on Send, never in the app;
  - `sponsorShort`;
  - `feeJuiceMissing`.
- **Events:**
  - `pick(m)`;
  - `fpcUpdated(fpc)`;
  - `fpcDeleted()`, called only when the paying row was deleted;
  - `onShort(fpcId) → boolean`: true when it dropped the selection.
- **Snapshot hooks** (`SelectionLoad = { saved: Record<string, AppPick>; baseline: { method, pick } | null }`):
  - `forceRefresh()`;
  - `load(scope, isCurrent)`: captures the baseline before its await, reads, returns null when `isCurrent()` is false after the read, and otherwise pre-fills unless a pick landed meanwhile (the app);
  - `reload(scope)`: the recovery's read, with the baseline captured before its await;
  - `reconcile(load, scope)`: called inside the commit, between the refs and the gate.
- **Send:**
  - `load` merges the saved slots under in-mount picks before the `isCurrent` check, as today, and returns `{ saved: {}, baseline: null }`;
  - `reload` resolves to the same value without reading anything (leftover 2);
  - `reconcile`, `fpcUpdated` and `fpcDeleted` do nothing; `onShort` returns false;
  - beside the interface, it returns its `selection` computed for its unit test; the card never reads it.
- **App:** the moved code, unchanged.
- **Inputs:**
  - common: the props; the `snapshot` and `verdicts` state; the card's `knownFpcs` and `methods`; `saveFeePick: (id, update) => managers.profile.saveFeePick(id, update)` (Fact 7);
  - Send adds `origin: () => props.originPrivacy`;
  - the app adds `lockedMethod: () => props.lockedMethod` and `fallsBack: () => props.fallsBack`.
  - Every prop is read through `props` or a getter when used, never copied at setup.

**The mode choice** (the card's only `originPrivacy … null` test):
```js
/** Chosen once: Send always passes an origin, the app windows never do. */
const rules = props.originPrivacy !== null ? useSendFeeSelection(input) : useAppFeeSelection(input)
```
The two copy computeds keep their live `props.originPrivacy === "private"` reads (Fact 2). For an app card, `null` gives the fee juice wording, as today.

**Setup order.** Fact 4 creates a cycle: `methods` and the rule books read verdict state, while the verdict watchers watch the rule book's `effectiveMethod`. Each module therefore splits its state from its watchers. The card creates them in this order:
1. `useFeeSnapshot(props, { store, selection: () => rules, accountUnusable })`: state only. It reads `selection` only inside a run, after setup.
2. `useSponsorVerdicts({ isEstimating })`: state only.
3. `knownFpcs`, `earlyFpcs`, `methods`, `menuMethods`; then `rules`; then the card's derived values (`displayMethod = effectiveMethod ?? previewMethod`, `feePayer`, `sponsorShortText`, `sponsorFunding`, `derivedSettings`, `nudgeCopy`, `statusNotice`).
4. The watchers, in today's creation order:
   1. the five out-model watchers;
   2. `watchFeeSnapshot(snapshot)` (recovery, then unusable);
   3. `watchSponsorVerdicts(verdicts, { verdict, txShape, priority, isEstimating, rows: methods, payer: rules.effectiveMethod, onShort: rules.onShort })`: the verdict watcher, clear-on-priority-or-tx, payer-disarm, tx-arm, estimate-disarm;
   4. the identity watcher, kept in the card because it crosses two modules: `if (snapshot.invalidate()) verdicts.forget(); await snapshot.run()`.
- `onBeforeMount`: `fpcService.connect()`, then `await snapshot.run()`.
- `onBeforeUnmount`: `snapshot.dispose()` first. It releases the lease before the clients go down, as today. `dispose` is terminal: a later `run()` does nothing (lessons.md, C1 hooks).
- The snapshot's counters and flags (`isMounted`, `runSeq`, `loadingRun`, `readingRun`, `committedKey`, `subscription`, `subscribedKey`) stay plain fields of its context object, never `reactive()`. Otherwise a watcher source that reads `isMounted` would gain a dependency.

**Kept verbatim.** Expressions, comments that still hold, and log lines move unchanged. A cached computed never replaces an inline expression the code reads today: that would change recomputation and object identity downstream. The snapshot exposes `failure: "degraded" | "init" | null`; the card maps it to the two strings it shows today, so all copy stays in the SFC.

**Leftovers.**
1. `destinationPrivacy`: the prop goes, together with its pass at `send.vue:830`, the stub's declaration (`pages/send.test.ts:179,187`) and five test props. Removing the prop alone would put a `destinationprivacy` attribute on the card's root.
2. Send's recovery read of the app key: gone (`reload`, above).
3. `cacheStore.feePaymentMethods`: removed (D6). This covers the card's writes and filter, the store's field, and the three assertions about it.
4. `isMethodsDropdownOpen`: kept. The template sets it, and the pick freezes the template. It gets an Outcome disposition line (D9).

**Not taken** (ledger): two cards (the owner's pick); a policy object of pure functions with the state left in the card (D2); rule books only (outline B, D1); a verdict composable that takes `effectiveMethod` at creation (Fact 4); `runFence` (D7); a committed golden-HTML snapshot (D8).

## UI impact

None. P40-03 A, quoted above: "the template is untouched, no pixel changes". The PR proves it three ways:
- the `<template>` and `<style>` blocks are byte-identical to the base;
- a scratch DOM comparison renders the same HTML at the base and at the head;
- the PR attaches before-and-after pictures of the card, light and dark, in Send and in the execute window, with their pixel counts (Phase 4).

`send.vue` loses one attribute binding that renders nothing.

## Security & Adversarial Considerations

- **Threat model:** an internal restructure. The inputs that cross a trust boundary keep their checks, moved unchanged:
  - the dApp's `lockedMethod`: a locked method is never replaced by a saved or default pick, and a locked mount reads fresh;
  - the worker's `sponsorFunding` verdict: it counts only for a listed row at the address it was read for;
  - stored picks: parsed by `readAppPicks` and `readSendSlots`. A committed selection is resolved against current rows. An app pre-fill can carry a stored `fpc.isProtocol` into `feePayer` and `update:payer` until the commit replaces it (`utils/fee-picks.ts:67-68`, `:645`, `:283`, `:371`).
    - On a first load or an identity change, settings stay `undefined` until the commit.
    - On a same-identity refresh, the gate stays open and settings derive from the pre-filled record (`:685-690`; pinned by `FeeSettingsCard.test.ts:635-647`). The settings name the row by id only, so the worker pays through the row it reads; the stored flag reaches the payer label.
    - The arc preserves this behaviour (G3). At close-out the implementer re-traces it: a closed `known-limit` if a hostile stored pick cannot make a send go out under the wrong payer label; a private draft advisory if it can.
- **Invariants kept, each pinned by an existing card test:**
  - a snapshot never serves another identity (the drift guards);
  - self-paid settings fail closed on an unread balance;
  - a short sponsor's app pick is dropped while its saved record stays;
  - a pick is saved only on an explicit pick.
- **The arc's own risks, each closed in the plan:**
  - an unbound `saveFeePick` would silently drop every pick (Fact 7): passed as a closure, and pinned in `useFeeSelection.test.ts` through a client whose method needs `this`;
  - a prop copied at setup would miss a later lock (O6): read at use;
  - `dispose` is terminal: tested.
- **Logging:** no line added or changed. Moved lines keep their named keys. The scanners read `.ts` as they read `.vue`.
- **Supply chain, crypto, permissions:** nothing is added. The DOM and pixel comparisons are scratch scripts on the installed Vitest and on `Bun.Image`, never committed.
- **Known limits:** #569 and #394 are unchanged. Close-out files two more, both closed:
  - O1: a verdict and an identity change landing in one tick keep the verdict for the new identity;
  - G3: a pre-fill shows a stored sponsor classification until the commit (or an advisory, per the re-trace above).

## Phases (one arc)

- **Fast gate**, for every phase, from the worktree root: `bun run lint && bun run typecheck:all && bun run test` exit 0, plus the phase's new test file green.
- **Card tests:** each phase keeps `FeeSettingsCard.test.ts` green, with only the edits that phase names.
- **Before Phase 1:**
  - merge `origin/dev` (with fees-display-1 merged) and record the merge commit as `<base>` in STATUS.md;
  - write the scratch DOM spec and take its "before" set (Phase 3);
  - take the "before" pictures and their control (Phase 4).

### Phase 1: the sponsor verdicts ✓
- **Change map:**
  - Add `composables/useSponsorVerdicts.ts`.
  - Edit `FeeSettingsCard.vue`: remove the verdict refs and watchers, and add the two calls in the setup order above.
  - The mode branches stay in this phase. The card's `onShort` holds today's app drop (`props.originPrivacy === null && …`).
- **Tests** (`composables/useSponsorVerdicts.test.ts`; `effectScope` with plain refs):
  - a verdict for an unlisted row, or at another address, is ignored, beside a listed control;
  - a funded verdict clears both sets; a short one fills both and calls `onShort`; `droppedForVerdictId` is set only when `onShort` returns true;
  - `picked` un-sets-aside and ends a drop; `addressEdited` clears the short;
  - a priority change and a tx change clear only the shorts;
  - a tx change arms the re-check only for a paying `fpc` row;
  - the payer moving off it, the estimate ending, and a verdict for it each disarm it;
  - `forget` clears all five.
  - **Order pin:** a tx change while the paying sponsor is short ends with that sponsor re-checked. The shorts must clear before the arm; both watchers hang on `txShape`, so creation order decides.
- **Gate:** the fast gate; `FeeSettingsCard.test.ts` unchanged.

### Phase 2: the snapshot lifecycle ✓
- **Change map:**
  - Add `composables/useFeeSnapshot.ts`. No function may go over 80 lines or over a cognitive complexity of 15.
  - Edit `FeeSettingsCard.vue`:
    - add a temporary `selection` object over the card's own load, reload, reconcile and force-refresh functions, still branching on the mode;
    - place `watchFeeSnapshot` and the identity watcher as the setup order says;
    - wire the two lifecycle hooks.
- **Tests** (`composables/useFeeSnapshot.test.ts`; real Pinia balances store, mocked clients, a stub `selection`):
  - the commit calls `reconcile` after the refs are written and before the gate opens;
  - a null `load` ends the run with no lease;
  - an identity change during the read discards the commit;
  - a degraded entry sets `failure: "degraded"` and still opens the gate; a throw sets `"init"` and keeps it closed;
  - `invalidate` is true only when the live key differs from the committed one;
  - a recovery recommit calls `reload`, then commits;
  - the commit and the watcher both write `accountUnusable`;
  - `forceRefresh` reaches `ensure`;
  - `dispose` releases the lease, and a later `run()` subscribes nothing.
- **Gate:** the fast gate; `FeeSettingsCard.test.ts` unchanged.

### Phase 3: the two rule books, the mode chosen once, the leftovers ✓
- **Change map:**
  - Add `composables/useFeeSelection.ts`.
  - Edit `FeeSettingsCard.vue`:
    - add the mode choice;
    - delete the temporary `selection` and every mode branch;
    - remove the `destinationPrivacy` prop, and the `feePaymentMethods` writes, filter and `useCacheStore` import.
  - Edit `stores/cache.store.ts`: remove `feePaymentMethods`.
  - Edit `pages/send.vue`: remove the `:destinationPrivacy` binding.
  - Edit `pages/send.test.ts`: remove `destinationPrivacy` from the stub.
  - Regenerate `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` (CI checks them).
- **Tests in `composables/useFeeSelection.test.ts`**, at least 10 cases per rule book:
  - Send:
    - the pending preview;
    - the pending result keeps its identity while unread identity fields change: moved from the card test `:3067-3081` and read through `selection`, assertions unchanged;
    - the selection follows the live origin;
    - `pick` saves `{ kind: "send" }` under the profile, address and side captured before the save;
    - `load` merges under in-mount picks, and returns null when superseded;
    - `reload` reads no key: a never-happens case, with the app's `reload` as its control;
    - `held`;
    - `sponsorShort` follows the selection resolved without the verdicts;
    - `feeJuiceMissing` holds only on `none`;
    - `onShort` returns false.
  - App:
    - the pre-fill: locked, saved, none;
    - the reconcile: locked, touched, settled, `chosenUnasked`;
    - `pick` persists `{ kind: "app" }` through a `saveFeePick` that needs its `this`;
    - `onShort` drops to the public fallback with `fallsBack`, and to nothing without it;
    - `sponsorShort` follows the drop;
    - the two nudge rules;
    - `fpcUpdated` drops a default whose row became custom;
    - `fpcDeleted`.
- **Edits to `FeeSettingsCard.test.ts`**, all of them:
  - delete the internal-access test (moved);
  - rewrite `:2054-2074` as "a Send recovery reads no saved app picks, and an origin flip right after the retry resolves for the live origin". Its premise, the read, no longer exists; the origin assertion stays;
  - drop `destinationPrivacy` from five prop sets;
  - delete `:532-548`, and the assertions at `:593` and `:679`, which read the removed `feePaymentMethods`;
  - add the **mode pin**: an app card given an origin after it opens still saves an app pick. The existing Send pick tests are its control.
- **Gate:**
  1. Run the fast gate, then `bun run test:all`.
  2. `git diff <base> -- apps/extension/src/popup/components/modules/send/FeeSettingsCard.test.ts` shows only the edits listed above.
  3. `grep -cE 'originPrivacy [!=]== null'` on the card prints 1.
  4. The card is byte-identical to `<base>` from the `<template>` line to the end of the file. Check it with `cmp` on two extracts kept under `~/.cache/nulo-backlog/fees-card-mode-1/`.
  5. **DOM comparison**, zero tolerance:
     - Where: a scratch spec and config under `~/.cache/nulo-backlog/fees-card-mode-1/dom/`.
       - The config spreads `apps/extension/vitest.config.ts`, sets `root` to the app, and includes only the scratch spec.
       - It aliases `@vue/test-utils` and `pinia` to the app's `node_modules`. Planning proved this resolution, and only this.
       - It adds the production component plugin from `apps/extension/vite.config.ts:126-130` (`useComponents` with `nuloDesignResolver()`, `dts: false`), so the design components render as they do in the build.
     - Checks: the run fails on any "Failed to resolve component" warning. Before writing a state's HTML, it asserts that state's distinguishing testid or text, so a state that rendered nothing fails.
     - What it mounts: the real card, with the card test's client mocks and no child stubs. States:
       - Send, private and public: default, hold, none, sponsor short, shortfall, degraded;
       - the execute window, embedded: locked, and default;
       - an authorization popup: `fallsBack` with a short sponsor.
     - Output: the HTML of each state, one file per state.
     - Runs: twice at `<base>` (the two sets must match), then once at the head. `diff -r` must be empty.

### Phase 4: e2e and the pictures
- **Runs** (load1 < 150 before each run; every run at retry 0 through `agent.sh`, Chrome):
  - smoke: `cd apps/extension && bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts --retry=0`;
  - network, each with `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`: `fee-sponsor-funding`, `fee-methods`, `authwit-lifecycle` (both authorization popups through the real card), `tx-sendTx-selfPay`, `tx-sendTx-default`, `tx-sendTx-sponsoredFpc`, `type-roles-windows`.
  - Firefox is not needed: no fixture, focus, window, activation or WebAuthn path changes.
- **Pictures:**
  - Add `shot: { name: "execute-fee-card", focus: "fee-settings-card" }` to the first `sendTx` request at `type-roles-windows.test.ts:205`. It does nothing unless `NULO_E2E_SHOT_DIR` is set, and it changes no scenario.
  - Take the "before" pictures before Phase 1: run `fee-sponsor-funding` and `type-roles-windows` with `NULO_E2E_SHOT_DIR` set to `~/.cache/nulo-backlog/fees-card-mode-1/before-1`. Run them again into `…/before-2`: that pair is the control.
  - Take the "after" pictures at the arc head, into `…/after`.
  - Each run captures the Send card (`fee-sponsor-short`) and the execute window card, both themes.
  - A scratch `Bun.Image` script counts the differing pixels per pair.
- **Gate:**
  - all eight files green at retry 0;
  - Every `after` pair must have zero differing pixels. Any difference stops the arc (D11).
  - The stop report goes to the orchestrator. It carries the pair, its count and box, crops of both images, and the pair's control (`before-1` against `before-2`) with its count and box, as evidence of input-caused noise. Only the orchestrator releases a stopped arc; a real visible change needs the owner.
  - The PR lists every pair's counts, the controls included.

## Decision ledger

| # | Question | Chosen | Codex r1 | Opus |
|---|---|---|---|---|
| D1 | Scope | all three extractions, in the brief's order (outline A) | ship A | ship A |
| D2 | Rule book form | stateful composables, one TS interface | agree (13 members defensible) | agree |
| D3 | The verdict ↔ rule-book cycle | state export, then a `watch…` export; the snapshot split the same way to keep creation order | agree, keep both stages synchronous | agree |
| D4 | The identity watcher | in the card, last | agree | agree |
| D5 | Copy | all in the card; `failure` and `held` are facts; the two copy reads stay live | F1: copy needs the live origin | O3: same |
| D6 | `cacheStore.feePaymentMethods` | remove, with its assertions | agree | agree |
| D7 | `runFence` | not adopted | agree | agree |
| D8 | Proof of no change | byte check, unchanged tests, scratch DOM comparison (zero tolerance), pictures with a control | F2: make the proof deterministic | O2: add a control |
| D9 | `isMethodsDropdownOpen` | keep; an Outcome disposition line | "closed disposition" | O9: no failure hypothesis, so no `known-limit` |
| D10 | Send's recovery read | removed; test rewritten with a control | agree | agree; it narrows a race window |
| D11 | A picture pair that differs | stop, always; the control is evidence for the orchestrator, never a waiver | final: G1 (twice), no waiver | the orchestrator decides |
| D12 | The arc's base | `2247f9f7`: `origin/dev` `689d0934` merged in, fees-display-1 (#733) included | n/a | n/a |
| D13 | Lines that moved at `<base>` | recorded below; no fact changed | n/a | n/a |
| D14 | DOM states beyond the plan's list | added: the menu open (Send short sponsor, execute default) and two app states (nudge, saved pick) | n/a | n/a |
| D15 | Small shapes the plan left open | the snapshot's hooks take a whole `BalanceScope` (one cast where the run opens); `run()` returns at once after `dispose()`; the run's opening is a synchronous `beginRun` (cognitive budget, same tick for the commit and its `finally`); the card maps `failure` inside `statusNotice` | n/a | n/a |
| D16 | Card-test edits beyond the list | the two `useCacheStore` imports the removed assertions used, and one title that named the removed cache | n/a | n/a |

**D13.** fees-display-1 changed the card's imports, `estimatedFeeDisplay`, `queuedCapDisplay`, the shortfall (`shortfallText` became `shortfall`, a `<FeeAmount>` row) and added a `.fee_figure` style. None of it touches a mode line; Facts 1-8 hold, and Fact 9 is now history. Card lines move by -1 above `estimatedFeeDisplay` and +1 below it (verdict refs `:132-145`; `data-origin` `:889`; `destinationPrivacy` `:73`). In the test: the internal-access test is `:3080-3096`; `destinationPrivacy` is at `:1856,2839,2898,3104,3133`; `:532-548,593,679` and `:2054-2074` did not move. `send.vue`'s binding is `:831`. The `send.test.ts` stub also binds `:data-destination` (`:179`), which goes with the prop. The worktree's install predated `dc4a88ec`'s new dependency: `bun install --frozen-lockfile` fixed it, with no lockfile change. The shot on `type-roles-windows.test.ts` landed before Phase 1, since the "before" pictures need it.

**D11.** The brief says "a pixel difference is a stop", and the plan keeps that rule as written. Two network runs at the base can differ: fresh entropy, and each run's own fee figures (Inference b). The control pair shows the orchestrator whether a stop is input-caused noise. It never waives a stop on its own: noise can hide a changed value, and a box can hold unchanged pixels between two noisy spots.

**D11 outcome (2026-10-18).** The stop was raised at Phase 4: all 14 after pairs differed, as all 14 control pairs did. The evidence went to the orchestrator as `~/.cache/nulo-backlog/fees-card-mode-1/d11-stop.md` (lane scratch): per-pair counts and boxes with the control column, card-band counts, crops. Inside the two cards, `fee-sponsor-short` had 0 differing pixels in every pair, and `execute-fee-card` differed only on the "You pay" skeleton row, whose shimmer phase differs between the two base runs too. One whole-image difference had no control twin: the light `authwit-summary` shot caught the authorization's selector before and its decoded name after, a capture race with the asynchronous decode, outside the card. The orchestrator released the arc at 02:5xZ on the control pairs plus the zero-tolerance DOM proof, with three conditions: the PR body reports the counts as measured, this entry records the outcome, nothing else changes.

## Audit verdicts

**Codex r1** (session `01a14bfd`, gpt-6.1-sol, high): `conditional approve (with conditions: resolve the live-origin contract, make pixel proof deterministic, and verify parent-visible watcher ordering)`.
- **F1, accepted.** The copy computeds keep their live origin reads; the gate counts the `null` tests (D5).
- **F2, accepted in part.** The zero-tolerance proof moved to a deterministic layer: the byte check and the scratch DOM comparison. The network pictures get a control pair.
  - Rejected: supplying identical chain inputs to both captures. The private leg is a PXE-local simulation that the e2e cannot intercept (`tests/e2e/send-fee-privacy.test.ts` header), so that would need a new fixture.
- **F3, accepted.** Fact 8 corrects the table's premise. The fix is stronger than the trace Codex asked for: every watcher keeps its creation order, because the snapshot splits like the verdicts.

**Opus** (Plan leg): `conditional approve (with conditions: O1 drop the identity-vs-verdict pin and fix its table row; O2 give the pixel gate a control; O3 make the originPrivacy grep gate fit the copy; O4 pass saveFeePick as a closure; O5 add authwit-lifecycle)`.
- **All of O1-O9 accepted.**
- **O1:** the identity and verdict watchers hang on different props, so prop-update order decides between them (Fact 4). Today a same-tick verdict survives an identity switch. Close-out files it as a closed `known-limit`; its consequence is minor, since a sponsor's funding belongs to the FPC.
- **O5:** recon's "no e2e reaches the popups" was wrong; it is corrected there.
- **O6-O9:** folded into Architecture.

**Final Codex pass** (fresh session `01a14c0b`, gpt-6.1-sol, high): `conditional approve (with conditions: make D11 fail closed, validate the DOM harness, and qualify the stored-metadata trust claim)`. The pass confirmed all 13 watchers keep their creation order, and that `FeeSelection` covers every seam line. All three findings accepted:
- **G1:** D11 has no waiver. A first revision accepted differences inside the control's noise box; the resumed pass showed that a box can hide a regression, so every difference now stops.
- **G2:** the DOM harness adds the production component resolver, fails on an unresolved component, and asserts each state before comparing.
- **G3:** the security statement is qualified, including the same-identity refresh the resumed pass found (`:685-690`). Close-out re-traces it, then files a closed `known-limit` or a private draft advisory.

**Final pass, resumed twice** (same session): first `conditional approve` (the noise box could hide a regression; the same-identity refresh), both fixed as above; then **`approve`**: "D11 consistently stops on every pixel difference, with controls used only as evidence. G3 correctly distinguishes initial loading from same-identity refreshes and requires re-tracing before disposition." No open disagreement remains.

**Implementation review, round 1** (over `3f391f67`; Codex session `01a14cc6`, gpt-6.1-sol, high, read-only, beside the Phase 4 chain): `approve`, three non-blocking comment findings. **Opus** (general-purpose): `conditional approve`, two findings and one pre-existing note. Both confirm that no watcher's creation order, reactive source, teardown step or `this` binding moved, and that template and style are byte-identical. Dispositions in [lessons/phase-4.md](lessons/phase-4.md); every accepted fix is a comment or a test mock, landed in `7bd32565` after the orchestrator released the D11 stop.

**Implementation review, round 2** (same Codex session, resumed over `7bd32565`): **`approve`**, "No new material finding. `7bd32565` leaves the parsed production syntax identical to `3f391f67` in both composables and the card's script. It changes no runtime behavior, watcher registration order, reactive dependency, or production `this` binding." The loop converged in two rounds.

## Delivery

- **One arc, one PR**, no stack.
  - Branch: `worktree-fees-card-mode-1`. It holds this plan's commit, with `origin/dev` merged in after fees-display-1 merges.
  - Title: `refactor(fees): one fee card, handed Send's or the app windows' rule book` (72 characters).
- **Body:**
  - the pick, quoted with its id;
  - the four leftovers and their dispositions;
  - the DOM comparison result;
  - the picture pairs with their counts, including the controls;
  - the validation runs with their outcomes;
  - `Closes #513`.
- **Labels:** open the PR without labels. Add `e2e:extension-network` afterwards only if the path filter would skip the network suite.
- **Files fees-display-1 also touches:** `FeeSettingsCard.vue`, `FeeSettingsCard.test.ts`, `pages/send.vue`, `pages/send.test.ts`, `src/types/auto-imports.d.ts`. This arc builds on their merged state.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `dc4a88ec`, `code_review: off`. Specific here:
- **The review loop:** one pass over the net diff from `<base>`, after Phase 4.
  - Start Codex with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`; resume it with `resume-codex.sh`.
  - Beside the first round, run one Opus review (`Agent`, `model: "opus"`, `general-purpose`).
  - The prompt adds: "Is any behaviour, watcher creation order, reactive dependency or `this` binding of the card changed?"
  - Hard stop at three rounds.
- **Then:**
  1. Run the Phase 3 gate and the Phase 4 runs on the final head.
  2. Stage the files and run `bun run check:plans`.
  3. Push, then `gh pr create --base dev`, then `gh pr checks <n> --watch`.
  - Never merge.
- **Close-out,** as the PR's final commits:
  - the Outcome block, with a disposition line for `isMethodsDropdownOpen` (D9);
  - the two known limits (O1, G3), each filed and closed in the same breath, deduplicated first;
  - lessons promotion, deduplicated first. Candidate: watchers on different props run in prop-update order, not in creation order;
  - `STATUS.md` deleted;
  - the `git mv` into `archive/` in its own commit, with the index line moved to `archive/index.md`.
- **Teardown after the merge:** `agent-worktree done fees-card-mode-1 --merged`, run by the session that notices the merge.

## Seeds (draft)

- `/goal` Phases 1–4 marked ✓ in implementations-plan/fees-card-mode-1/plan.md, each gate's output in the transcript; the Codex loop converged (a resumed round with no new material finding, quoted); the PR against dev exists with `Closes #513`, the DOM comparison empty and the picture counts; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/fees-card-mode-1 forward per plan.md; never idle; decide with Codex; never merge.
