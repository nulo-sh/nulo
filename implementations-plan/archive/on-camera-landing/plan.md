# On Camera landing

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The landing is rebuilt as the "On Camera" feed page in `apps/landing`: a character-rendered renderer in `apps/landing/src/feed.ts`, its DOM wiring in `apps/landing/src/feed-dom.ts`, and the page styles in `apps/landing/src/styles/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace the landing with a full-bleed CCTV-style feed drawn in characters, with every readable element on a solid plate, plain-language copy about the user's control, the private and public split shown as two screens, three promises, an illustrative public record, a preview notice and the call to action. Vanilla Vite and TypeScript, no framework, no library and no WebGL. Tokens and fonts come from the shared design package's base stylesheet, so the palette cannot drift from the wallet.

- The renderer is pure and DOM-free: seeded value noise, an optional brighter subject blob, a gain curve and ordered dithering into a five-glyph ramp.
- The DOM layer runs one animation loop capped near 30 fps that skips off-screen hosts and hidden tabs, and renders one still frame under reduced motion.
- A canvas renderer would be faster per frame but loses text semantics and complicates font timing, so the page keeps text feeds.

## Why

A design study picked this layout over the alternatives, and the page needs to say honestly what Nulo is. Two claims in the prototype were wrong for real installs and were corrected before shipping:

- The wallet is not limited to a test network, so the page must never say "testnet only"; the preview notice says Nulo is a preview that has not been audited, to use small amounts, and to report what breaks.
- Only tokens that support both modes let a person choose between private and public, so the promise reads "Private by default. Public when you say so", and the per-token nuance sits in the caption under the two screens.

## What shipped

- **Static first.** All copy, links, the preview notice and a representative eight-row public record are in the HTML, and the script only enhances. The feeds and the streaming record are `aria-hidden`, and a visually hidden sentence describes the record so assistive technology is not fed changing hashes. The record is labelled illustrative.
- **Safe DOM.** Runtime nodes are built with `createElement` and `textContent` only. The CSP is unchanged, and `vite.config.ts` now applies the `public/_headers` policy to `vite preview` through `apps/landing/scripts/headers.ts`, so browser checks run under the production policy.
- **Cost bounds.** Grids are capped at 400 columns by 120 rows per feed, with the glyph scale growing past that cap, the record keeps at most sixteen rows, and cell width is measured once fonts are ready and on resize, never per frame.
- **Cleanup.** The landing's own tokens, reveal script and bundled fonts were deleted in favour of the design package's. The package's heavier Inter variable font was an accepted cost of sharing the palette.
