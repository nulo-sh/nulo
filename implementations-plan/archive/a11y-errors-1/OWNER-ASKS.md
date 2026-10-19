# Owner asks: a11y-errors-1

Two asks, both outside the #874 decision and outside every surface arc 1 touches. The arc ships without them.

## OA-1: the "Remove token" label while hovered

- **Surface**: a token's page (`apps/extension/src/popup/pages/tokens/[id].vue:279`), the "Remove token" row. On hover its icon and label turn `--red` (`:361-362`).
- **Why ask**: the label is text in `--red`, under 4.5:1 on the light theme, but it is a destructive action's hover colour, not an error, so the decision on #874 does not cover it.
- **Options**: (a) the label turns `--txt-danger` on hover (#b3261e light, #ff534b dark), the icon stays `--red`; (b) both turn `--txt-danger`; (c) as today.
- **Recommendation**: (a): the text reads AA, and the icon keeps the colour every red glyph has.
- **What ships now**: (c). The guard lists the label as a reviewed entry naming this ask; the change that answers it deletes the entry.
- **Answer**: (a), the orchestrator on #874 under the owner's accessibility delegation; shipped in #878, entry deleted.

## OA-2: the log viewer's error lines

- **Surface**: the logs window (`apps/extension/src/popup/windows/logger/index.vue`), each ERROR line (`apps/extension/src/components/JsonViewer/creator.js:288`, `--log-error-color`).
- **Why ask**: these lines are error text under AA in both themes (3.70:1 light, 3.22:1 dark on their own background, `--log-error-background`), but they use their own token, not `--red`, so #874 does not cover them.
- **Options**: (a) `--log-error-color` takes the `--txt-danger` values, measured on the line's tinted background first; (b) as today.
- **Recommendation**: (a), as its own small change with the same browser reading.
- **What ships now**: (b), untouched by this arc.
- **Answer**: (a), the orchestrator on #874 under the owner's accessibility delegation; shipped in #878 unadjusted (5.72:1 light, 4.73:1 dark on the tint).
