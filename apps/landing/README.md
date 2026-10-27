# @nulo/landing

Marketing landing page for the wallet (nulo.sh). Standalone Vite app; ships independently of the extension.

## File map

| Path | Purpose |
|---|---|
| `index.html` | The whole page: head/meta, the camera-feed hero with the launch-email form, the two-screens section, three promises, the illustrative public record, the early-days notice, the closing section with the form again on a plate, footer. All copy lives here, before any script runs; the two forms are hand-written copies that `src/page.test.ts` pins. |
| `how-aztec-works.html` | The How Aztec works page (`/how-aztec-works`): the two sentences, then three cards (Private balances, Proofs, Fees), each a narrated clip over its short text and the clip's transcript. Same bar, grain, plates and footer as the home page and the same `src/main.ts`, plus `src/clips/index.ts`. Its text and narration follow what Aztec actually hides: never that a payment's recipient, a transaction's shape or a public part is hidden. |
| `subscribed.html` | `/subscribed`, where a form post lands without script (the subscribe Worker's 303). `noindex`, not in the sitemap. |
| `src/main.ts` | Vite entry: imports the stylesheets in order, narrows the install buttons, upgrades the signup forms, and mounts the page. |
| `src/signup.ts` | Upgrades each `form[data-signup]` to post with `fetch` (`Accept: application/json`) and answer in its `role="status"` region; only `200 { "ok": true }` reads as subscribed, a 400 is the address error, anything else the retry error. The button is disabled while a request is in flight. Unit-tested in `signup.test.ts`. |
| `src/worker.ts` | The Worker script. `run_worker_first` sends it `/api/*` only; it forwards `POST /api/subscribe` unchanged to the `SUBSCRIBE` service binding (`nulo-subscribe`, which holds the mailing-list key and checks `Origin`), answers any other method 405 and any other path 404, and 503 when the binding is absent or throws. Its own responses carry `no-store`, `nosniff`, `no-referrer` and `default-src 'none'`, since nothing a Worker returns inherits `_headers`. Unit-tested in `worker.test.ts` against a fake binding. |
| `src/install.ts` | The two store URLs and `detectInstall`, which maps a desktop browser to its store and name, or `null` for a browser that cannot install (Safari, any phone). Pure; unit-tested in `install.test.ts`, which also pins the store URLs both hand-written pages serve. |
| `src/install-dom.ts` | Narrows the served fallback (both stores and a desktop-only note) to one "Add to <browser>" button and an "also on" link. Writes `href` and `textContent` only. Until the store listings open the pages serve no button and it changes nothing; bringing the buttons back is a revert of the change that took them out. |
| `src/feed.ts` | Pure renderer for the character "camera feed": seeded value noise, an optional bright subject, Bayer 4×4 dithering into a five-glyph ramp. DOM-free; unit-tested in `feed.test.ts`. |
| `src/feed-dom.ts` | Wiring: measures the mono cell after fonts load, sizes each `pre[data-feed]` to its host, runs one ~30 fps loop (skips off-screen and hidden-tab, scales the grid up past its cell cap so any screen is covered, honours reduced motion), and drives the clock, tracking box and record stream. |
| `src/clips/` | The page's three clips. `player.ts` wires each `[data-clip]` card (play from a press only, `preload="none"`, seek, a captions line, one clip speaking at a time, paused in a hidden tab); `timeline.ts` is the pure clock (scene at a time, cues, captions, WebVTT); `draw.ts` and `kit.ts` draw plates, mono labels and the wallet's glyphs on a 640×360 SVG stage; `private-balances.ts`, `proofs.ts` and `fees.ts` are the scenes, each a pure function of time cued to spoken words, and each clip ends on `kit.ts`'s `recap`: the stage clears and a plate of the clip's points appears, one row per spoken phrase. `media/` holds each narration (`.mp3`), its word timings (`.timings.json`) and its captions track (`.vtt`, generated from the timings and pinned by `clips.test.ts`, which also pins the cues, the transcripts and the media budget). |
| `src/styles/overrides.css` | The few corrections a web page needs on top of `@nulo/design/base.css` (link colour, focus ring, selectable text, visible scrollbars). |
| `src/styles/page.css` | Page presentation: plates, bar, hero overlay, sections, breakpoints. |
| `scripts/headers.ts` | Parses the site-wide block of `public/_headers` so `vite preview` serves the production CSP. |
| `public/` | `_headers` (CSP and caching, applied by Cloudflare), favicon, robots, sitemap, and `og.png`, the 1200×630 link-preview image: the desktop hero captured with reduced motion and the clock hidden. Recapture it when the hero changes. `og-video.mp4` is the og:video, a silent 10 s teaser at 1280×720 (the feed finds a subject, enhances twice, finds nothing, then the mark; no date, so it outlives the launch). Discord and some other apps play it in a nulo.sh link preview; X ignores og:video and shows `og.png`. |
| `vite.config.ts` | Vite config, including `preview.headers` from `_headers`. |
| `wrangler.jsonc` | The `nulo-landing` Worker: static assets from `dist/`, unknown paths served `index.html` (released wallets deep-link to `/forms/*`), `src/worker.ts` for `/api/*` only, the `SUBSCRIBE` service binding to `nulo-subscribe`, Workers Logs off. No secret and no var. `nulo.sh` is a Custom Domain attached outside the file (the build token has no zone permission); no workers.dev host; previews on for non-production branches. |

## Scripts

| Command | Effect |
|---|---|
| `bun run dev` | Local dev server (`bun run dev:landing` from the repo root → port 5175). |
| `bun run build` | Production build → `dist/`. |
| `bun run preview` | Preview the production build with the production response headers. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run test` | Unit tests (renderer, headers parser and the production policy, legal pages, browser detection, the clips' clock and markup, the signup markup and a scratch build's origins, the signup module, the Worker's routing). |
| `bun run deploy:dry` | Validate `wrangler.jsonc` against the built `dist/`; needs no credentials. |
| `bun run deploy`, `bun run deploy:preview` | The production (`main`) and other-branch commands to configure when connecting Workers Builds in the Cloudflare dashboard. By hand only to create the Worker. |

## Key notes

- **No framework, no library.** Vanilla DOM + Vite. The feed is text in a `<pre>`, redrawn as a string; the clips are SVG whose attributes each frame rewrites; no canvas, no WebGL.
- **Clips.** The narration was made outside the repo with the owner's approval of every word; changing a word means a new narration, its timings and its captions. A clip's scene must draw any second it is asked for, so a seek in either direction is right; motion follows `seg`/`lerp` of the time and never keeps state between frames.
- **Tokens and fonts come from `@nulo/design/base.css`** (declared as a workspace dependency), so the site and the wallet share one palette. Vite hashes the package fonts into `/assets/`; only the faces the page uses are fetched. `overrides.css` undoes the popup-specific globals; add page styling to `page.css`, never to the package.
- **Two design rules.** Copy, buttons and panels sit on solid plates; section headings sit on the grain with a dark halo. The grain runs behind every section uninterrupted.
- **Copy rule (home page).** No wallet jargon above the fold; the technical words (nullifier, commitment, log) appear only inside the public-record panel, which is labelled illustrative because its values are generated locally.
- **CSP.** `public/_headers` is the policy; preview applies it too. No inline scripts, no CDN, no remote fonts. `form-action 'self'` keeps a form post on this origin; `connect-src 'self'` keeps the signup's `fetch` there.
- **The launch-email signup.** The page's primary action: a form in the hero (the nav's Notify me links its field, whose `scroll-margin-top` keeps the label clear of the sticky bar) and the same form on a plate in `#get`, whose small print links `/website-privacy`. Each is a plain `<form method="post" action="/api/subscribe">` with an off-screen honeypot named `website` (`tabindex="-1"`, `aria-hidden`), so it works without script. `vite dev` and `vite preview` run no Worker, so a submission there shows the retry error; `wrangler dev` runs the Worker, and its binding answers 503 until a local `nulo-subscribe` runs too.
- **Deploy order.** The landing's service binding names `nulo-subscribe`, so that Worker must exist before the landing's next deploy. Branch previews of the landing reach the same binding; the subscribe Worker refuses their `Origin`.
- **Independent ship.** Builds and deploys from `main` without the extension: the `nulo-landing` Worker serves `nulo.sh` and builds from Git pushes only (Workers Builds, no hook). The install buttons (absent until the store listings open) link the store listings, never a release, so a release needs nothing from the landing, and the build reaches no network. CI lints, typechecks and unit-tests this package on every PR, and builds it when the PR touches it or `legal/`.

## Legal pages

`/terms`, `/privacy` and a permalink per version (`/terms/v1.0/`) are generated from
[`legal/*.md`](../../legal/README.md) by `scripts/build-legal.ts`, which `predev` and `prebuild` run.
The outputs (`terms.html`, `privacy.html`, `terms/`, `privacy/`, `src/generated/legal-pages.json`)
are gitignored; `vite.config.ts` reads the JSON list as its extra HTML entries. Rendering rules —
raw HTML rejected, `.md` links rewritten, DRAFT banner + `noindex` while a placeholder survives — are
in `scripts/legal-pages.ts` and pinned by `scripts/legal-pages.test.ts`. `quality-status` builds the
landing on every PR that touches it or `legal/`.
