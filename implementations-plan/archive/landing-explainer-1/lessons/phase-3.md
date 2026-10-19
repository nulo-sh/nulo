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

## Review loop

- **Codex round 1** (gpt-6.1-sol, high, read-only): conditional approve, 3 findings, all accepted. The position slider had no focus ring (the design reset's `input { outline: none }`; the landing restored links and buttons only), now in the shared `:focus-visible` rule; the drawing kit's header became one contract beside `Frame`; comments that restated their code went.
- **Opus review**, in parallel: conditional approve, 7 findings; 6 accepted, 1 rejected.
  - A source that fails to load left the clip "playing": the spec's failure steps set only `networkState`, so `paused` stays false. The first fix read `audio.error`, and Firefox QA went red: headless Firefox sets error code 3 when its audio output fails and keeps playing. The player now reads `networkState === NETWORK_NO_SOURCE` and calls `load()` on the next press; QA answers the MP3 with a 404 in both browsers and expects a paused clip.
  - Accepted too: the focus ring (as Codex), the captions line cleared at the end, the one-voice swap moved to the `play` event (media keys and the browser's own controls start playback too), `seg` finite on an empty or reversed interval, and a sweep test (`scenes.test.ts`) that draws every scene at 0.1 s steps forward and backward against a fake DOM and expects the same picture and no `NaN`.
  - Rejected: re-announcing `aria-valuetext` on a focused slider while it plays. Unverified with a screen reader, Video.js and Plyr do the same, and freezing the thumb would hide the position from sighted keyboard users.
- **Codex round 2** (resume): approve, no findings.
- **Cross-arc pass** (a fresh Codex session over the net diff from the plan's base): approve, 2 low findings, both accepted: the plan's architecture and security lines still said "no new TypeScript" and "no new script" (now scoped to arc 1), and `kit.ts`'s header listed its exports.

## Rebase onto dev

Arc 1 (#723) merged while arc 2 was in review, so the branch moved onto `origin/dev`, as the orchestrator's brief says. One conflict: the landing README's `index.html` row, where dev renamed the preview notice to the early-days notice (#791). dev's #790 also redrew the wallet's glyphs from Tabler Icons: stroke 2, round caps and joins, the nonzero fill rule, the public mark a dashed square. The clips' glyph rules follow, and the proofs clip's check moved above the packet it had overlapped (Tabler's check sits lower in its box). Stills, review videos and the before/after pictures were made again; gates and QA in both browsers were run again on the rebased branch.

## Retake (2026-10-19)

The owner's note (P53-04 = B): 1.15x, "one point five", the new marks, USDC off its border, $AZTEC in Fees.

- **Pace in the render.** `atempo=1.15` on the decoded narration, then one MP3 encode; every word and scene time divided by 1.15 and rounded to the millisecond. Each scene's words still equal its text, and the page's own `toVtt(captions())` rebuilt the tracks (the v1 track it rebuilds matched the repo byte for byte first).
- **Splicing a re-narrated scene.** The first cut at the alignment's scene edges landed in speech (-25 and -13 dBFS): the alignment stretches a scene's last word, with its full stop and paragraph break, over the pause that follows, ending it up to 0.6 s late. The cuts now go at the middle of the longest run of 10 ms windows under -60 dBFS around each edge (-84 to -89 dBFS), the new take is trimmed to its own speech and padded so both pauses keep their v1 length, its level matched by RMS (-0.44 dB and +0.05 dB), with 10 ms fades. An audio check confirmed the onsets: "Say" at 25.887 s in the timings, speech from 25.86 s.
- **"1.50" read digit by digit.** The alignment cannot say what was spoken, but durations can: v1's "1.50" took 0.96 s, the new "1.5" 0.64 s, and each "3.50" about 1.0 s, so "3.50" likely still reads "three point five zero" (OA-11).
- **The shield covers less than the square.** Proofs scene 3 closed the cell grid under the private mark; the shield left the grid's corners showing, so the cells now fade as the mark closes.
- **Fees scene 2 holds the chip longer.** The new line keeps FEE JUICE on the Aztec plate for a whole sentence, where v1's sat there about a second, so it covered the fee meter. The plates grew and the chip rides centred on the bridge.
- **USDC.** The note was 168 wide for a 170-unit label. Widened to 184 at the call site; the measured right margin is 14.2 against the 14.0 left inset. A note that sizes itself would also have moved clip 01's coin, so it stays an ask (OA-10) with three other tight labels the browser measured.
- **Gates:** landing tests 79/79 (the overrun test red on 168), lint, typecheck, build (media 2.18 MB), browser QA in Chrome and Firefox. Codex round 1 approved with no findings.

## Retake pass 2 (2026-10-19)

- **"3.50" → "3.5":** the take's figures shortened as "1.5" had ("3.5 from" 1.6 s against 2.0 s, "3.5 for" 0.96 s against 1.2 s), consistent with "three point five". Spliced into the v1 audio, not the v2 one, so the clip is still one tempo pass and one encode from the original. The seek bar's static `max` moved (52 to 51), and its pin caught it.
- **Insets:** a browser probe measured every text element against its innermost plate, note or chip (the stage when none), at nine moments per scene. Exactly the four labels OA-10 named fell under 14; everything else already cleared it. The scene test now walks nested groups through their `place()` transforms after each scene's last frame; reverting each width, or moving the record entries' labels to x 6, turns it red.
