# Arc 2 (phases 3 and 4): implementation log

- Branch `hygiene-3-a2` off `origin/dev` `93e6eebc` (#817 merged).
- #797, the red proof: with `Date.now` pinned in the `keys` describe and the raw-dispatch helper, 6 of the 9 key cases are red; the 3 green ones assert "not cancelled", which a skipped root listener also yields, so under the old helper they could not fail. With the `trigger` helper the file passed 30 of 30 runs; deleting the component's repeat-Escape cancel reds the held-Escape case alone.
- #517, the new case is red on the base component (no `ButtonBase` mounts).
- Pixel proof, scratch spec outside the repo (copied into `tests/e2e/` only for each run): `registeredExtension`, viewport 400x600 at DPR 1, `Date.now` pinned on the open popup 60 s ahead before `revealSeedPhrase`, the bar's animation paused at 60 s and transitions finished, each capture clipped to the Close's box plus 4 px, with its box and computed background, colour, border, outline and transition recorded.
  - Puppeteer's BiDi keyboard refuses `"Space"`; `" "` works on both engines. Firefox's BiDi Space sets no `:active` on the button, so the press without hover is also driven by a mouse press moved off the button, which holds `:active` in both engines.
  - Chrome: base vs base 14/14, base vs head 14/14. Firefox: base vs base 14/14, base vs head 14/14. Rest against focus differs on every build. The option-B build (override rule deleted) differs from base on exactly the dotted ring, the filled press and the eased transition.
- OA-1 fact found by the pictures: under A, a held Space on the Close turns the label the page colour over the countdown bar, so the words nearly vanish while held (light theme most).
