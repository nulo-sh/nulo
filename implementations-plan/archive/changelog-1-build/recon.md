# Recon: changelog-1-build

Base: `253ff8833` (origin/dev). One Sonnet reuse sweep over this tree, plus the driver's read of the prototype branch `worktree-changelog-1` (throwaway, never pushed; base `002b76fc7`, an ancestor of this base).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Markdown to HTML | `Bun.markdown.html`, wrapped by `renderMarkdown` in `apps/landing/scripts/legal-pages.ts` (Bun ≥ 1.4; the repo pins 1.4.2) | adapt: move into a shared module |
| Rendered-HTML allowlist check | `assertOnlyAllowedHtml` / `assertAllowedTag` / `isSafeHref` / `escapeHtml` in `legal-pages.ts`, private, error text says "legal documents" | adapt: move, take the allowlist as a parameter |
| Page generation and Vite wiring | `scripts/build-legal.ts` writes pages into the landing root and `src/generated/legal-pages.json`; `vite.config.ts` reads that list into `rollupOptions.input` | adapt: a second generator and list, same shape |
| Tests that need `Bun.markdown` | `legal-pages.test.ts` spawns `bun -e` per call (`inBun` bridge) | adapt: lift the bridge into a shared test helper |
| Built-site scan | `src/page.test.ts` "the built site": runs `build-legal.ts` then `vite build`, scans every built HTML/CSS/JS for cross-origin resources | adapt: run `build-changelog.ts` too, list the new pages |
| TOML | none in code (searched `Bun.TOML`, `smol-toml`, `\.toml` imports); `Bun.TOML.parse` is built in | build new, no dependency |
| Wallet glyphs | `packages/design/src/core/glyphs.ts`: `glyphs` (`{ s?: string[]; f?: string[] }` per name), `GlyphName`; the landing's DOM helper `src/clips/draw.ts` builds SVG nodes, not strings | build new: a string helper (the prototype's `icon()`) |
| Page shell (bar, grain, plates, fonts, tokens) | `index.html`, `src/main.ts`, `src/styles/{overrides,page}.css`, `src/feed-dom.ts` (`mountPage`) | reuse as is |
| Light palette | `packages/design/src/base.css` `[theme="light"]`; the landing is dark only | adapt: the prototype's small copy of the tokens these pages read, under `prefers-color-scheme: light` |
| Version input | root `package.json` `version` (1.2.0 on both `dev` and `main`) | reuse |
| Branch input | none in the repo; Workers Builds injects `WORKERS_CI_BRANCH` (Cloudflare docs, Workers Builds configuration, "default variables") | build new: one env read |
| Release-notes rules | `scripts/release/release-notes.ts` `notesProblems`: not empty, at most 3,000 characters, no line opening with `#`, no `=`/`-` rule line, no em dash, no `@SOURCE_COMMIT@`. The lead line and `- ` bullets are the release skill's convention, not a check | reuse indirectly: CI runs it on every committed file; the landing adds its tag allowlist, the em dash and a first-block-is-a-paragraph rule |
| CI | `pr-quick.yml` `landing` filter (no `release-notes/**`), `build-landing` "Verify the pages shipped" list; pinned by `scripts/ci-cd/behavior-gating.test.ts` (`quick.landing` contains `legal/**`) | adapt |
| Sitemap | `apps/landing/public/sitemap.xml`, hand-written | adapt: one line |

## Prototype (read only)

Keep: `scripts/build-changelog.ts`, `scripts/changelog/{model,shell,d2}.ts`, `src/changelog/{common,d2}.ts`, `src/styles/changelog.css` + `changelog-d2.css`, `content/changelog/{1.1.0,1.2.0}.toml`. Drop: `d1`, `d3`, `d3-still`, `d4`, `scene*`, their CSS, `three` and `@types/three` (and their `bun.lock` lines), `plan.ts`'s direction fan-out, `scripts/preview/capture-changelog.ts` (reaches into `apps/extension`; the PR captures use a scratch copy), the `figure` and `[scene]` keys, the footer's "preview d2 · cards" label, the blanket `noindex`.

## Collisions and facts that bind

- `#1691` (open, `enhancement`, `owner-decision`) asks for exactly this page; its "where it is linked" part is open (OWNER-ASKS A1). The `whats-new-1` lane links the wallet to `https://nulo.sh/changelog/vX.Y.Z/` (three-part version), so that URL shape is a contract.
- `behavior-gating.test.ts`'s one-build-surface rule reads only the filters that start the extension build; `landing` is not one, so `release-notes/**` there needs no surface exception (verify with `test:ci-gating`).
- `src/page.test.ts`'s resource scan reads `src`, `<link href>`, form actions and meta URLs, not `<a href>`: the GitHub links on the pages pass it. (The sweep claimed otherwise; the test's code does not hold that claim.)
- `wrangler.jsonc`: `not_found_handling: single-page-application`, so an unknown `/changelog/vX/` serves the home page; `/changelog/v1.2.0/index.html` serves at `/changelog/v1.2.0/` as `terms/v1.0/index.html` does.
- `_headers` CSP: `style-src 'self' 'unsafe-inline'` admits the cards' `style="--i:N"`; `script-src 'self'` needs one external module script, which Vite emits.
- `lessons.md` holds about 8.1 of its 8 KiB.
