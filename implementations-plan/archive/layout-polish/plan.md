# Layout polish

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Spacing, title and copy changes on Home, History and Settings, and a held price skeleton on Home's hero: `apps/extension/src/popup/pages/tab-hero.module.css`, `apps/extension/src/composables/usePrices.ts` and the activity components under `apps/extension/src/popup/components/modules/general/`, with e2e seeders in `apps/extension/tests/e2e/helpers/activity-seeds.ts`.
- **Open items**: a failed first price fetch ending Home's hero in "$0.00", the two Home view links being mouse-only and low in contrast, History not filtering to a token, a doubled title for screen readers, Home's header spacing against the drawing, and routing retired e2e gotchas into the `e2e-testing` skill, each tracked in #116, #129, #130, #131, #132 and #185.
- **Seeds retired**: the plan's goal and loop seeds are spent; nothing to resume.

## Decision

Build to the drawings wherever the drawing was already the chosen design, and decide every remaining difference from pictures, not prose. Seven differences between the built popup and the drawings had accumulated: row spacing, the History and Settings title height, two Home strings, the row's third dollar line, Settings' account header, History's date heading, and Home's hero reading "$0.00" before prices arrive. The first two were built outright. The rest went to a decision page that set each surface beside its drawing and each option at the popup's real size. The outcomes: "Recent activity" and "View history" replace the old strings, the third dollar line, the account header and the date heading stay as they were, and the hero holds its skeleton until the first price answer when the wallet holds a priced token.

## Why

The layout had drifted from the drawings before the wider UX program started, and user-visible changes need an explicit decision recorded against the surface. Where the built version differed deliberately, such as the dollar line under each row, the drawing lost. A total the wallet does not yet know should not be shown as zero, so a wallet with priced holdings shows the skeleton, under the existing 12 second cap, and an empty wallet still shows its true "$0.00". Tests read the numbers a person sees: each row's text stays inside its row, the title never overlaps the amount column, and an amount is never clipped, in both themes and on both browsers.

## What shipped

- Activity rows sit 10px apart on Home, a token's page and History, and History's date heading keeps its 12px to its first row.
- History's and Settings' titles take the drawn height from one shared stylesheet module; the compact bar takes no flow and paints, hides and takes clicks as before, and a click just under it now reaches the row there.
- The new strings, and the hero's held skeleton through the price store's `settled` flag.
- Unit cases for the header, `settled` and the hero's wait; smoke cases on both browsers for the row gaps, the date heading, row containment in both themes, the titles, the bar's box and hits, and Settings' Tab order, red first on the unfixed build.
- Not done, by decision: the unpicked pictured options were never built.

## Lessons

### Hash navigation

`navigateByHash` in the e2e helpers returns when the hash changes, but the router swaps the page later, after its guards. A helper that counts rows on screen therefore accepts the old page's rows once they hold still for two polls, which a throttled CPU made visible: the old rows lingered for up to about a second. A case that reads the new page opens it through a helper that waits for the new page's own rows, not for the hash.
