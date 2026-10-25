# Phase 3: the icon pick

- **Pick.** Decision page 80, signed 2026-10-21 20:56Z: "P80-01: C", "B, plus the bottom bar's four icons at 24 px instead of 22: their straight lines also land on whole pixels on a normal screen; they grow by 2 px." The page's C is this plan's C3 (C1 plus the bar at 24 px).
- **Change.** `Icon.vue` strokes every path of a glyph through one `<path fill="none">` whose `d` joins `glyph.s`; fills stay one element per path. `readPaths` refuses a path that does not open with an absolute `M`. `Navigation.vue` draws its icons at 24. `glyphs.ts` is untouched.
- **Controls** (uncommitted): the old per-path `v-for` reds three `Icon.test.ts` rows; dropping the `M` refusal reds its `render-glyphs.test.ts` row.
- **Codex round 3** (resume of 01a1606b, high, gpt-6.1-sol, over b4f949e11): clean, high confidence; prompt `~/.cache/nulo-backlog/ui-cosmetics-1/codex-loop-3.md`.

## The whole-pixel check

A scratch probe outside the repository (`~/.cache/nulo-backlog/ui-cosmetics-1/probe3/`) opened Home at 360 px, read each bar icon's box, cropped the bar, and scored each icon's pixels as the planning probe did: coverage = (pixel − background) / (opaque colour − background); partial is 0.05 to 0.5, solid 0.5 or more. As a reference it drew the same `<svg>` alone on the bar's background at a whole-pixel offset and at a half-pixel offset, in the same browser.

- The bar's boxes sit on fractions (Chrome x = 37.45, 116.28, 202.52, 287.67; Firefox 37.43, 116.27, 202.52, 287.68; y = 552.5 in both), yet at ratio 1 every icon's partial/solid count equals its whole-pixel reference, in both browsers and both themes. Both browsers snap an `<svg>` box to whole device pixels: the half-pixel reference paints the same as the whole one. So the bar's icons land on whole pixels at any position, and 24 px is what puts Tabler's integer lines on them.
- Ratio 1, dark, partial/solid, before (22 px, per-path) → after (24 px, one path). Chrome: Home 68/131 → 38/160; Holdings 128/95 → 100/122; History 95/77 → 91/95; Settings 87/88 → 57/120. Firefox: 69/131 → 38/160; 130/94 → 100/122; 89/76 → 93/92; 87/88 → 57/120. Settings and Holdings after equal the planning probe's 24 px one-path numbers.
- Double paint, maximum coverage: before, Holdings and Settings reach 0.805 dark and 0.807 light (two paints of the 56 % colour), and the active Home icon 0.988 on light (two paints of 88 %). After, every icon's maximum equals its colour's alpha (0.558/0.559, 0.878, 1) in both browsers, both themes and both ratios.
- Side effect, seen in the pictures: the tab grows 2 px inside a bar that centres it, so each icon's top moves up 1 px, each label down 1 px, and the active tab's accent line up 1 px.
- Not made a permanent test: both browsers snap any position, so a layout assertion would only restate the size, and a pixel assertion would pin font and anti-aliasing output. The numbers above are the check.
- Probe snags: a page left in a background tab stalls `requestAnimationFrame` and screenshots (bring it to front); cloning an element whose `style` attribute Vue set records a `style-src-attr` CSP violation on the extension page; Firefox clips a page screenshot to the document's height, so an element screenshot is used.

## Pictures

`screenshots/arc1/bottom-bar-{before,after}-{dark,light}-dpr{1,2}.png` (as the bar paints) and `-x4.png` (four times, each pixel kept square), Chrome; `bottom-bar-firefox-{before,after}-dark-dpr1-x4.png`.

## Gate

At b4f949e11: lint, typecheck:all, test:all (14970 extension tests), build-storybook exit 0. Full smoke at `--retry=0` on fresh armed builds: Chrome 61 files passed, 8 skipped, 271 tests, 2103 s; Firefox 65 files passed, 4 skipped, 275 tests, 2563 s.
