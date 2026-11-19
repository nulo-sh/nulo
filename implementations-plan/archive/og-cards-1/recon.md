# og-cards-1: recon

Base: `origin/dev` at `32fd50e60`. One Explore sweep (sonnet) plus the planner's own reads; every claim below was re-checked against the tree.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Render HTML to PNG with a headless browser | `apps/extension/scripts/store-art.ts:56-67` (`render`: `puppeteer.launch`, `setViewport` at DPR 1, `setContent`, `document.fonts.ready`, `screenshot({ clip })`); a hand-run script whose PNGs are committed | adapt: the same twelve lines in the landing's renderer (decision D3) |
| Puppeteer and its Chrome | `puppeteer` `^25.14.0` in `apps/extension/package.json:112`, locked at 25.14.0, which pins Chrome 155.0.8059.79 (cached under `~/.cache/puppeteer/chrome/` on this host; CI caches the same dir in `.github/actions/setup-puppeteer/action.yml`) | reuse-as-is: the landing declares the same spec as a devDependency (isolated linker), no new package in `bun.lock` |
| Fonts inlined as data URIs | `store-art.ts:16,69-70` (`dataUri`); faces in `packages/design/src/fonts/` (Space Grotesk latin + latin-ext, JetBrains Mono latin), declared in `packages/design/src/base.css:12-37` | adapt: resolve through the package (`import.meta.resolve("@nulo/design/base.css")`), never a hand-walked path |
| Glyph to inline SVG | `apps/landing/scripts/changelog-pages.ts` `icon()` (not exported) over `@nulo/design/core/glyphs.ts` | reuse-as-is: export `icon` |
| TOML parse, date label, escaping | `parseEditorial`, `byVersionDesc` (`changelog-pages.ts`), `escapeHtml` (`markdown.ts`) | reuse-as-is |
| PNG size check | `apps/extension/scripts/store-icons.test.ts:10-14` (`pngSize`, IHDR at offsets 16/20, file-local) | build new in the landing (another app's test file cannot be imported); a chunk walker serves size and text |
| PNG text chunk read/write, CRC32 | none in code (searched `IHDR\|tEXt\|iTXt\|crc32\|\x89PNG` outside `node_modules`); `node:zlib` `crc32` and `Bun.hash.crc32` both exist on Bun 1.4.2 (checked) | build new, ~30 lines (decision D2) |
| SHA-256 | `scripts/release/store-copy-run.ts:39` (`Bun.CryptoHasher`), `scripts/ci-cd/test-soak/lib.ts:180` (`node:crypto`) | reuse the idiom (`node:crypto` `createHash`) |
| Bun-only calls from a vitest test | `apps/landing/scripts/in-bun.ts` (`bunCaller`), used by `changelog-pages.test.ts` | reuse-as-is |
| Ship a generated non-HTML file in `dist/` | none: `vite.config.ts` turns `src/generated/*.json` into HTML entries only; Rollup copies only `public/` | build new: `build-changelog.ts` copies the cards into a gitignored `public/changelog/` |
| A built-dist assertion | `apps/landing/src/page.test.ts` § "the built site" (a scratch build in the ambient environment, drafts included) | adapt: one test that each page's `og:image` file shipped |
| Static OG tag set to mirror | `apps/landing/index.html:16-40` | reuse as the model; the static pages stay untouched |

## Conventions to match

- `apps/landing/scripts/`: a pure module tested by a sibling `*.test.ts`, a thin `build-*.ts` doing the IO; tabs, no semicolons, double quotes; log lines prefixed `[name]`.
- `store-art.ts` runs with `--no-sandbox`; Puppeteer's bundled Chrome, no `executablePath`.

## Collision and dedup risks

- `build-changelog.ts:34` deletes the landing-root `changelog/`, so the cards cannot be copied there.
- `public/og.png` stays the site card; `public/_headers` pins `/*`, `/*.html`, `/assets/*`, `/email/*` only, so a card gets Cloudflare's default caching and no header test changes.
- `wrangler.jsonc` serves `index.html` for an unknown path, so a missing card would answer 200 HTML: the build must fail on a missing card, never ship the page without it.
- The landing CI filter (`pr-quick.yml:110-132`) covers `apps/landing/**`; `.claude/skills/release/SKILL.md` is outside it.
- No open issue collides (searched `og:image`, `open graph`, `og.png`, `changelog`); no closed `known-limit` on the landing changelog.

## Issue #1775 claims checked

- Per-page `og:title` and `og:description`, shared `og:image` = `${SITE}/og.png`, no `og:url`, `og:image:width/height/alt`, `twitter:*`: holds (`changelog-pages.ts:206-208`).
- The static `index.html` carries the full set: holds (lines 16-40; it also carries `og:video`, which the cards do not need).
- `public/og.png` is 1200×630: holds (README § file map).
