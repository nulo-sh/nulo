# @nulo/landing

Marketing landing page for the wallet (nulo.sh). Standalone Vite app; ships independently of the extension.

## File map

| Path | Purpose |
|---|---|
| `index.html` | The whole page: head/meta, the camera-feed hero, the two-screens section, three promises, the illustrative public record, the early-days notice, CTA, footer. All copy lives here, before any script runs. |
| `how-aztec-works.html` | The How Aztec works page (`/how-aztec-works`): the two sentences, then three cards (Private balances, Proofs, Fees), each a narrated clip over its short text and the clip's transcript. Same bar, grain, plates and footer as the home page and the same `src/main.ts`, plus `src/clips/index.ts`. Its text and narration follow what Aztec actually hides: never that a payment's recipient, a transaction's shape or a public part is hidden. |
| `src/main.ts` | Vite entry: imports the stylesheets in order, narrows the install buttons, and mounts the page. |
| `src/install.ts` | The two store URLs and `detectInstall`, which maps a desktop browser to its store and name, or `null` for a browser that cannot install (Safari, any phone). Pure; unit-tested in `install.test.ts`, which also pins the store URLs both hand-written pages serve. |
| `src/install-dom.ts` | Narrows the served fallback (both stores and a desktop-only note) to one "Add to <browser>" button and an "also on" link. Writes `href` and `textContent` only. Until the listings open on 3 Nov 2026 the pages serve no button and it changes nothing; bringing the buttons back is a revert of the change that took them out. |
| `src/feed.ts` | Pure renderer for the character "camera feed": seeded value noise, an optional bright subject, Bayer 4×4 dithering into a five-glyph ramp. DOM-free; unit-tested in `feed.test.ts`. |
| `src/feed-dom.ts` | Wiring: measures the mono cell after fonts load, sizes each `pre[data-feed]` to its host, runs one ~30 fps loop (skips off-screen and hidden-tab, scales the grid up past its cell cap so any screen is covered, honours reduced motion), and drives the clock, tracking box and record stream. |
| `src/clips/` | The page's three clips. `player.ts` wires each `[data-clip]` card (play from a press only, `preload="none"`, seek, a captions line, one clip speaking at a time, paused in a hidden tab); `timeline.ts` is the pure clock (scene at a time, cues, captions, WebVTT); `draw.ts` and `kit.ts` draw plates, mono labels and the wallet's glyphs on a 640×360 SVG stage; `private-balances.ts`, `proofs.ts` and `fees.ts` are the scenes, each a pure function of time cued to spoken words, and each clip ends on `kit.ts`'s `recap`: the stage clears and a plate of the clip's points appears, one row per spoken phrase. `media/` holds each narration (`.mp3`), its word timings (`.timings.json`) and its captions track (`.vtt`, generated from the timings and pinned by `clips.test.ts`, which also pins the cues, the transcripts and the media budget). |
| `src/styles/overrides.css` | The few corrections a web page needs on top of `@nulo/design/base.css` (link colour, focus ring, selectable text, visible scrollbars). |
| `src/styles/page.css` | Page presentation: plates, bar, hero overlay, sections, breakpoints. |
| `scripts/headers.ts` | Parses the site-wide block of `public/_headers` so `vite preview` serves the production CSP. |
| `public/` | `_headers` (CSP and caching, applied by Cloudflare), favicon, robots, sitemap, and `og.png`, the 1200×630 link-preview image: the desktop hero captured with reduced motion and the clock hidden. Recapture it when the hero changes. |
| `vite.config.ts` | Vite config, including `preview.headers` from `_headers`. |
| `wrangler.jsonc` | The `nulo-landing` Worker: static assets from `dist/`, unknown paths served `index.html` (released wallets deep-link to `/forms/*`), Workers Logs off. `nulo.sh` is a Custom Domain attached outside the file (the build token has no zone permission); no workers.dev host; previews on for non-production branches. |

## Scripts

| Command | Effect |
|---|---|
| `bun run dev` | Local dev server (`bun run dev:landing` from the repo root → port 5175). |
| `bun run build` | Production build → `dist/`. |
| `bun run preview` | Preview the production build with the production response headers. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run test` | Unit tests (renderer, headers parser, legal pages, browser detection, the clips' clock and markup). |
| `bun run deploy:dry` | Validate `wrangler.jsonc` against the built `dist/`; needs no credentials. |
| `bun run deploy`, `bun run deploy:preview` | The production (`main`) and other-branch commands to configure when connecting Workers Builds in the Cloudflare dashboard. By hand only to create the Worker. |

## Key notes

- **No framework, no library.** Vanilla DOM + Vite. The feed is text in a `<pre>`, redrawn as a string; the clips are SVG whose attributes each frame rewrites; no canvas, no WebGL.
- **Clips.** The narration was made outside the repo with the owner's approval of every word; changing a word means a new narration, its timings and its captions. A clip's scene must draw any second it is asked for, so a seek in either direction is right; motion follows `seg`/`lerp` of the time and never keeps state between frames.
- **Tokens and fonts come from `@nulo/design/base.css`** (declared as a workspace dependency), so the site and the wallet share one palette. Vite hashes the package fonts into `/assets/`; only the faces the page uses are fetched. `overrides.css` undoes the popup-specific globals; add page styling to `page.css`, never to the package.
- **Two design rules.** Copy, buttons and panels sit on solid plates; section headings sit on the grain with a dark halo. The grain runs behind every section uninterrupted.
- **Copy rule (home page).** No wallet jargon above the fold; the technical words (nullifier, commitment, log) appear only inside the public-record panel, which is labelled illustrative because its values are generated locally.
- **CSP.** `public/_headers` is the policy; preview applies it too. No inline scripts, no CDN, no remote fonts.
- **Independent ship.** Builds and deploys from `main` without the extension: the `nulo-landing` Worker serves `nulo.sh` and builds from Git pushes only (Workers Builds, no hook). The install buttons (absent until the listings open on 3 Nov 2026) link the store listings, never a release, so a release needs nothing from the landing, and the build reaches no network. CI lints, typechecks and unit-tests this package on every PR, and builds it when the PR touches it or `legal/`.

## Legal pages

`/terms`, `/privacy` and a permalink per version (`/terms/v1.0/`) are generated from
[`legal/*.md`](../../legal/README.md) by `scripts/build-legal.ts`, which `predev` and `prebuild` run.
The outputs (`terms.html`, `privacy.html`, `terms/`, `privacy/`, `src/generated/legal-pages.json`)
are gitignored; `vite.config.ts` reads the JSON list as its extra HTML entries. Rendering rules —
raw HTML rejected, `.md` links rewritten, DRAFT banner + `noindex` while a placeholder survives — are
in `scripts/legal-pages.ts` and pinned by `scripts/legal-pages.test.ts`. `quality-status` builds the
landing on every PR that touches it or `legal/`.
