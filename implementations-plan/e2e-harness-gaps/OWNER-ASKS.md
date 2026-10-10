# Owner asks: e2e-harness-gaps

One ask; arc 3's merge waits on it. Nothing else here needs a decision: no wallet screen, copy, row or format changes.

## Ask 1: do the playground's new controls need your sign-off?

Arc 3 adds a transfer-function select (defaulting to today's call) and a "NO_FROM (sponsored)" button to `apps/playground`, the generic test dApp the e2e suite drives. It is never shipped to anyone. The lane brief treats this as test-dApp behaviour, so no sign-off is planned. One auditor reads CLAUDE.md § "UI changes need explicit owner sign-off" ("any change to what a user sees") as covering the playground too.

- **What ships now:** everything except arc 3's merge. Arc 3 is built, reviewed and opened as a PR with a screenshot of the playground's transactions section, but it stays unmerged until you either sign off on the two controls or exempt the playground from the rule; the PR body quotes whichever message you send. Unanswered means pending, never approved.
- **Why it is asked rather than assumed:** CLAUDE.md requires a sign-off that "is explicit and recorded", and the planner cannot rule on whether the test dApp is in that rule's scope.

## For information only (no decision asked)

- **Settings → Lock after a worker restart (#162, arc 1b).** Today the page can sit on "FETCHING SETTINGS" after the background worker restarts, because its two config reads never answer. The fix makes the page read again when its connection comes back, so it shows the same toggles it shows on any other open. What ships now: the fix, with no change to the page's layout or copy. If the investigation finds the cause somewhere larger, the fix is held and the issue stays open; nothing visible changes either way.
