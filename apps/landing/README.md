# @nulo/landing

Marketing landing page for the wallet (nulo.sh). Standalone Vite app; ships independently of the extension.

## File map

| Path | Purpose |
|---|---|
| `index.html` | The whole page: head/meta, the camera-feed hero, the two-screens section, three promises, the illustrative public record, the preview notice, CTA, footer. All copy lives here, before any script runs. |
| `src/main.ts` | Vite entry: imports the stylesheets in order, narrows the install buttons, and mounts the page. |
| `src/install.ts` | The two store URLs and `detectInstall`, which maps a desktop browser to its store and name, or `null` for a browser that cannot install (Safari, any phone). Pure; unit-tested in `install.test.ts`, which also pins the URLs `index.html` serves. |
| `src/install-dom.ts` | Narrows the served fallback (both stores and a desktop-only note) to one "Add to <browser>" button and an "also on" link. Writes `href` and `textContent` only. |
| `src/feed.ts` | Pure renderer for the character "camera feed": seeded value noise, an optional bright subject, Bayer 4×4 dithering into a five-glyph ramp. DOM-free; unit-tested in `feed.test.ts`. |
| `src/feed-dom.ts` | Wiring: measures the mono cell after fonts load, sizes each `pre[data-feed]` to its host, runs one ~30 fps loop (skips off-screen and hidden-tab, scales the grid up past its cell cap so any screen is covered, honours reduced motion), and drives the clock, tracking box and record stream. |
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
| `bun run test` | Unit tests (renderer, headers parser, legal pages, browser detection). |
| `bun run deploy:dry` | Validate `wrangler.jsonc` against the built `dist/`; needs no credentials. |
| `bun run deploy`, `bun run deploy:preview` | The production (`main`) and other-branch commands to configure when connecting Workers Builds in the Cloudflare dashboard. By hand only to create the Worker. |

## Key notes

- **No framework, no library.** Vanilla DOM + Vite. The feed is text in a `<pre>`, redrawn as a string; no canvas, no WebGL.
- **Tokens and fonts come from `@nulo/design/base.css`** (declared as a workspace dependency), so the site and the wallet share one palette. Vite hashes the package fonts into `/assets/`; only the faces the page uses are fetched. `overrides.css` undoes the popup-specific globals; add page styling to `page.css`, never to the package.
- **Two design rules.** Copy, buttons and panels sit on solid plates; section headings sit on the grain with a dark halo. The grain runs behind every section uninterrupted.
- **Copy rule.** No wallet jargon above the fold; the technical words (nullifier, commitment, log) appear only inside the public-record panel, which is labelled illustrative because its values are generated locally.
- **CSP.** `public/_headers` is the policy; preview applies it too. No inline scripts, no CDN, no remote fonts.
- **Independent ship.** Builds and deploys from `main` without the extension: the `nulo-landing` Worker serves `nulo.sh` and builds from Git pushes only (Workers Builds, no hook). The install buttons link the store listings, never a release, so a release needs nothing from the landing, and the build reaches no network. CI lints, typechecks and unit-tests this package on every PR, and builds it when the PR touches it or `legal/`.

## Legal pages

`/terms`, `/privacy` and a permalink per version (`/terms/v1.0/`) are generated from
[`legal/*.md`](../../legal/README.md) by `scripts/build-legal.ts`, which `predev` and `prebuild` run.
The outputs (`terms.html`, `privacy.html`, `terms/`, `privacy/`, `src/generated/legal-pages.json`)
are gitignored; `vite.config.ts` reads the JSON list as its extra HTML entries. Rendering rules —
raw HTML rejected, `.md` links rewritten, DRAFT banner + `noindex` while a placeholder survives — are
in `scripts/legal-pages.ts` and pinned by `scripts/legal-pages.test.ts`. `quality-status` builds the
landing on every PR that touches it or `legal/`.
