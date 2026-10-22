# ui-cosmetics-1: owner asks

## OA-1 — how the wallet's icons paint (#1019 item 2)

**Your question, answered.** The icons do come from the library you chose: every glyph is Tabler Icons 3.49.0, drawn verbatim since #790. Holdings is Tabler's `coins` and Settings is `adjustments-horizontal`.

**What you saw.** Most icons are several strokes, and the wallet paints each stroke on its own. The inactive colour is 56 % opaque. Where two strokes of one icon overlap (a cap on a curve, a knob on its line, one coin's edge on the next), that spot is painted twice. It shows brighter on dark and darker on light, which reads as ink blots, or "a weird opacity on some lines". This holds at every size, both themes, and both normal and Retina screens, measured in Chrome; Firefox follows the same painting rules, and the arc adds a Firefox crop. At 22 px on a normal-density screen the lines also land between pixels and look soft.

**Pictures** (`implementations-plan/ui-cosmetics-1/screenshots/`, each a sheet of Home, Holdings, History and Settings at 14, 16, 18, 22 and 24 px, inactive then active colour, zoomed 4x with each pixel kept square):
- `c0-today-*`: today.
- `c1-one-path-*`: each icon painted once.
- `c2-crisp-edges-*`: C1 with anti-aliasing turned off.
- Each in `dark` and `light`, at `dpr1` (normal screen) and `dpr2` (Retina). `coverage.txt` has the measurements.

**Options.**
- **C0, keep today.** Nothing changes.
- **C1, paint each icon once** (recommended). The blots go away everywhere. The drawing, the stroke weight and every size stay as they are. Compare the inactive column of `c1-one-path-*` with `c0-today-*`.
- **C3, C1 plus the bottom bar's icons at 24 px instead of 22.** Also makes the bar's straight lines sharp on a normal-density screen, where the bar puts each icon on whole pixels (the arc checks it). The four icons grow by 2 px. See the 24 px columns of `c1-one-path-dark-dpr1-x4.png`.
- **C2, C1 plus crisp edges.** No soft pixels, but circles turn into stairs and lines vary between 1 and 2 px. Not recommended.

**What ships now.** The PR opens as a draft with the onboarding titles and the Presto step. The icons stay as they are until you pick; the pick is quoted in the PR body, then built.

**Answer** (decision page 80, 2026-10-21 20:56Z): "P80-01: C", "B, plus the bottom bar's four icons at 24 px instead of 22: their straight lines also land on whole pixels on a normal screen; they grow by 2 px." The page's B is C1 above and its C is C3. Built in the same PR.
