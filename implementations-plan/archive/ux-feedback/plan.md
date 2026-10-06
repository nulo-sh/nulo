# UX feedback program

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: first run without a name field (`apps/extension/src/utils/profile-name.ts`), dApp windows opened at the browser window's top-right (`apps/extension/src/wallet/services/window-manager/window-manager.ts`), a bounded tooltip and the glossary (`packages/design/src/ui/Tooltip.vue`, `apps/extension/src/utils/glossary.ts`), the snackbar, one-target rows and once-per-receipt arrivals (`packages/design/src/ui/ToastManagerBase.vue`, `apps/extension/src/components/ui/RowTarget.vue`, `apps/extension/src/composables/useArrivals.ts`), and the redrawn permission window (`apps/extension/src/popup/windows/capabilities/index.vue`).
- **Open items**: Firefox prover-on `imported-account-execution` overran the 300 s toast wait once Firefox's protocol timeout was raised to match Chrome's, a slow WASM-proved transfer whose cause is not established (the shared extension process or host load), so it is still to be rechecked, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Build every decision of a user-testing proposal as five batches on one stack of six pull requests, each batch planned on its own at light or mid weight. The batches were first run and wording, window placement, tooltips and glossary, snackbar rows and arrivals, and permissions (two arcs: behaviour, then the redrawn window). A design artifact with drawn mocks was the reference, and a changed surface had to look like its drawing.

## Why

- Testers read every word on a 360px popup and a 400px window, so wording, placement and permission honesty mattered more than new features.
- An earlier front-end task had drifted from what was agreed, so parity with the drawing became a gate. Anything a user sees that the drawing did not show was an owner decision, never a reviewer verdict.
- The batch order was forced: first run changes the flow every e2e fixture drives, the snackbar replaces the toast `waitForToast` reads, and permissions needs the dotted term and glossary.
- Off meaning "ask" keeps apps working and never signs silently, so each permission row states what the dispatcher enforces.

## What shipped

- **First run**: no name field, the first profile is "Main", a second is prefilled "Profile 2", accounts start at "Account 1". Fee lines say what is paid, with a spoken form, the lock chip changed, and the privacy strip got glyphs (`apps/extension/src/components/composite/send/PublishStrip.vue`).
- **Windows**: all four dApp windows open at the top-right of the browser window, no taller than it, and a refused position retries with the size only.
- **Tooltips**: `packages/design/src/ui/tooltip-placement.ts` flips and clamps inside the window. `apps/extension/src/components/composite/DottedTerm.vue` takes a glossary key, and Settings renders the entries (`apps/extension/src/popup/pages/settings/glossary.vue`). Warnings are visible text.
- **Snackbar and rows**: success hides after a delay and waits while hovered or focused, errors stay until closed. Each row has one link or button. A receipt's arrival plays once per account, and an elsewhere-snackbar never names a sender.
- **Permissions**: one stored consent per app where Off means ask through the existing confirmation window. "Any contract" and unknown permissions default Off. The window shows four groups with a details table.
- **Copy rule**: no em dash joins two clauses in new text, held by `apps/extension/src/utils/copy-dash-ban.test.ts`.
- **Gates**: both browsers ran lint, types, unit, smoke and network suites at retry 0. The Firefox canaries passed in CI with Presto required.

### Design mocks

The mocks were rebuilt from small generators and are not kept in the tree. Their link colour was `--nulo-secondary`, 6.4:1 on the dark background and 5.3:1 on the light one, which a later follow-up quotes as the contrast to match.

## Lessons

### Firefox new tab

Firefox BiDi announces a tab only through its first browsing context, once it has seen that context's document. A Ctrl-click tab is replaced within about 25 ms and the replacement is filtered, so `targets()` never lists it. `waitForNewTab` on the browser driver diffs the classic handle list on Firefox.

### Loaded page wait

The Send page draws its token trigger before its tokens load, and a click in that window opens the import popup instead of the picker. Wait for what only the loaded page draws (`send-from-type` through `openSend` in `apps/extension/tests/e2e/fixtures/send-page.ts`), never for a control both states draw.

### Vue tests

Only `vue` and `vue-router` auto-import under vitest, so a composable used in a window must be imported explicitly. `@nulo/design`'s `Button` recurses unless stubbed, and a second `mount` strips the first's stubs. Fake timers freeze `Date.now`, so a native event reaches only its first Vue listener unless fired through test-utils' `trigger`, and a `defineModel` write reads back late.

### Stack gate

A `gh stack` runs the plans gate on every arc head, so an arc cannot link a later arc's file. After the squash merge, merging the trunk into a branch on the old head is add/add.
