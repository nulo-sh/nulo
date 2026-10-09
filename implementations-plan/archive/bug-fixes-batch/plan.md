# Bug-fixes batch

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the toast timer fix in `packages/design/src/composables/toast.ts`, the fee-estimation failure toast in `apps/extension/src/popup/pages/send.vue` and `apps/extension/src/popup/windows/execute/index.vue`, the header network chip routing in `apps/extension/src/components/Header.vue` with "Set as active network" in `apps/extension/src/popup/pages/settings/networks/[id].vue`, and the circle-outline icon in `apps/extension/src/assets/logo.svg` and `apps/extension/public/logo.svg`.
- **Open items**: none. Commitlint accepting a subject that `CLAUDE.md` forbids was closed by supply-chain-release (#63). The document says subjects are lower-case, but the commitlint config extends the conventional preset, whose subject-case rule rejects only sentence, start, pascal and upper case.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Five user-reported issues went out as one change, sequenced smallest-risk first so a regression is easy to localize:

- Remove two decorative footer lines from the landing page.
- Replace the landing wordmark's drawn circle with plain text.
- Align the extension icon with the landing favicon, a circle outline.
- Show a toast when fee estimation fails, and fix the toast timer race found on the way.
- Make the header network chip open Manage Networks, and delete the separate networks popup.

For the chip, the choice was between switching networks on a row tap with a separate manage button, and keeping a row tap as drill-in with a "Set as active network" row on the detail page. The detail-page option won.

## Why

Fee-estimation errors were only logged, so a person saw an estimate that never arrived. The toast composable also scheduled a new close timer without clearing the old one, so rapid successive toasts cancelled each other's display. Both are fixed together, with one regression case in the existing toast manager test rather than a new file.

The detail-page option has the smaller diff and leaves the e2e helpers that open, delete and switch networks untouched. Switching is the rarer operation, so its extra tap is the cheaper cost.

The icon is also the wallet's icon shown to dApps through wallet discovery, so changing it is visible outside the popup. The stroke is thicker than the favicon's because the same relative weight would not read as a line in the 16 px toolbar raster. The landing page has since been rebuilt, so none of the landing edits is claimed here as live.

## What shipped

- The toast composable clears the previous timer before it schedules the next.
- The fee-estimation failure toast uses one line of copy on both the send page and the execute window, which still logs the underlying error.
- The header chip pushes to the networks settings page when the wallet is logged in. The popup component and its mount are removed, and the e2e network-switch helper navigates through settings.
- The circle icon, regenerated as a PNG for the manifest and for dApp discovery.
- The review caught two real e2e flow bugs after implementation, both fixed: the switch helper must return to the general page, and the click must be dispatched as an event on the row.
