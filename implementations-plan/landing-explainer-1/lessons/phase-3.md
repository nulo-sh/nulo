# Phase 3: the clips

## Production (2026-10-18)

Narration through the `explainer` skill's launcher only, one request per clip, no retake: 814 + 770 + 595 = 2,179 of the 15,000-character cap. The approved script rows were checked word for word against `OWNER-ASKS.md` by a script before anything was sent. No emotion tags (D14). Every alignment came back exact (`approx: false`), so every cue is a spoken word.

The review renders seek the page's own player frame by frame (24 fps) and capture the stage and captions line, then mux the narration: what the owner watches is what the page draws.

## Gate

- `vite build`: the first build inlined the three caption tracks (1.2 to 1.7 KB) as `data:` URLs, which `default-src 'self'` refuses for media. `build.assetsInlineLimit: 0` (D11); the other assets kept their hashes, so nothing else had been inlined.
- Browser QA (scratch script, registry-claimed port, `vite preview` in its own process group, real clicks, no autoplay flag), Chrome and Firefox: the page's title, `h1` and eyebrow; three players; no audio fetched before a press; each clip plays from a click, shows a caption and one scene, loads its captions track, seeks to 30 s and back to 2 s; starting one clip pauses another; pausing from the same button; media only from the page's origin under `/assets/`; no console error, no CSP violation, no horizontal scroll at 390 px.
- One QA failure was the script's: it read `paused` before the `pause` event had run the render. It now waits for the rendered state.
- Firefox at 390 px scrolled sideways by 22 px: the card's grid column took the player bar's minimum width, set by Firefox's range input (hiding the bar removed it; hiding the SVG did not). `min-width: 0` on the card, as `.rec-pan` already does.
- Tests proved red by mutation: a cue word moved to an occurrence the scene lacks, `autoplay` added, a caption track edited, a transcript word changed.
