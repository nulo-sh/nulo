# scroll-cue-build-1: owner asks

The arc ships P155-01 = B as signed. Both asks concern a placement the page drew and the build measured further; neither blocks the PR.

## A1. Execute window: the left button can clip a section label at first paint

- **Surface.** The approval window (`execute/index.vue`), the button at the bottom left (16, 12), as signed.
- **What the build measured.** With the steps shut, which is how the window opens, the `batch` request at 400 × 800 puts the fold on "Leaves your account". The button's bottom 5 px overlaps the top of its first letters (x 29–52, y 710–715). It meets no control or glyph, and any scroll or press clears it. With the steps open (the state the page measured) nothing sits under it. Frame: `scb1-args-shut-left`.
- **Options.**
  - (a) Keep the left corner. It can clip a label or row text that starts at the card's left edge when that text lands at the fold.
  - (b) The right corner, which the page rejected because it sits on the right-aligned values a person checks.
  - (c) Move the window's content to clear the corner, for example a wider left gutter. That changes the layout of every request.
- **Recommendation: (a).** Every fixed corner covers whatever lands at the fold. On the left that is a heading's first letters or the step rail, never the figures. The e2e pins the part that matters: no control or glyph under the button at first paint, and nothing at all with the steps open.
- **What ships now:** (a).

## A2. Onboarding: in a narrow window the corner meets the column

- **Surface.** The onboarding shell (`onboarding/app.vue`), the button at the window's bottom-right corner, as signed ("268 px right of the column" at 1280 wide).
- **What the build measured.** At 1280 × 720 nothing sits under it at first paint on any page (the Terms gate, Import profile, Create, the phrase step, Ready). In a 720 px wide window the 640 px column reaches x 680 and the button spans x 668–704. On the recovery-phrase step at 720 × 900 it covers the bottom-right corner of I saved it, about 12 × 27 px, until the first scroll or press. A press on that sliver scrolls instead of confirming; the rest of the 314 px button confirms. Frame: `scb1-onb-phrase-narrow`.
- **Options.**
  - (a) The window's corner as signed.
  - (b) The column's edge, the page's Note alternative. It sits beside the column while the window leaves room. Below about 750 px there is none, so it overlaps just the same.
  - (c) Inset the button over the column's padding at narrow widths. That is a new placement rule.
- **Recommendation: (a).** No placement avoids the column once the window is narrower than the column plus the button, and the overlap is a sliver that one scroll clears.
- **What ships now:** (a).
