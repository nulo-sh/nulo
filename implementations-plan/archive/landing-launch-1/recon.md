# Recon: landing-launch-1

Base: `origin/dev` at `1e6c5bc1f`. One Explore sweep (sonnet) plus the planner's own reads.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Store URLs | `apps/landing/src/install.ts:2-5` (`STORES`); the same two URLs in `legal/terms.md` § 1 (lines 34-36), `cliff.toml:36-37`; the Chrome id in `scripts/release/store-copy-run.ts:19`, pinned to `install.ts` by `store-copy-run.test.ts:366-369` | reuse `STORES` as the one constant; add a test holding it to Terms § 1 (none exists: grepped both ids and `terms.md` over `*.test.ts`, outside `archive/` and `node_modules`) |
| Browser detection | `install.ts:24-34` `detectInstall`, a 22-row table in `install.test.ts` | reuse as is |
| Narrowing to one button | `install-dom.ts:4-22` `mountInstall`, still called at `src/main.ts:11`; reads `data-install="primary|secondary|nav"`, `data-install-other`, `data-install-detected` (served `hidden`), `data-install-fallback` | reuse as is; only the markup left (commit `048c7a6b7`) |
| Install markup | `git show 0fa075c36:apps/landing/index.html` lines 52, 78-81, 208-211; `how-aztec-works.html` nav | adapt: restore beside the signup forms |
| Button styles | `page.css` `.btn` 120-137 (`.btn[hidden]` included), `.btn.ghost` 143-150, `.cta` 178-197, `.bar .btn` 250; focus ring `overrides.css:40-44` | reuse; `.soon` (153-163) is already unused |
| Signup forms | `index.html:83-106, 235-262`, `src/signup.ts`, styles `page.css:414-615` | reuse; copy only |
| DOM test environment | none: `apps/landing/vitest.config.ts` runs `node`; no jsdom or happy-dom in `apps/landing/package.json`; `signup.test.ts` uses hand-made fakes | build new: markup-contract tests in `page.test.ts`, browser behaviour by a scratch Puppeteer check (precedent: `archive/landing-store-buttons/lessons/phase-3.md`) |
| Captures | no script in the repo; puppeteer `^25.14.0` locked in `apps/extension/package.json`; port helper `apps/extension/tests/e2e/port-registry.ts` | build new, as a scratch script outside the repo |
| Light and dark | `packages/design/src/base.css:62-66` (`:root` is the dark palette), no `prefers-color-scheme` or `theme` in `apps/landing` | none to build: the landing has one palette |

## Copy that says "not live yet" (all in `apps/landing`)

- `index.html:57` and `how-aztec-works.html:50`: the nav's `Notify me` (`#email-hero`, `/#email-hero`).
- `index.html:84, 236`: "Get an email when Nulo is live"; `:99, 251`: `Notify me`.
- `index.html:105, 257`: "Available early November · Chrome and Firefox stores".
- `index.html:259`: "One email at launch, then occasional updates. …".
- `subscribed.html:30`: "We'll write when Nulo is live."
- None in `src/signup.ts` (its live-region texts), the meta tags, `public/sitemap.xml`, or `infra/subscribe` (a 303 to `/subscribed` or `{ "ok": true }`; no template). The "Launch list" names in `infra/subscribe/README.md` are Resend resource names and stay.

## Tests that pin what changes

- `src/page.test.ts:41-43` (availability and print constants), `:80` (label), `:83` (button), `:99-112` (availability ids, `aria-describedby`), `:125-131` (nav button exact attributes and text), `:167` (`/subscribed` text).
- `src/install.test.ts:113-120` refuses any store link or `data-install` in both pages: it inverts.
- `signup.test.ts:20, 89` use "Notify me" as a fake button's label only; no markup pin.

## CI for a landing-only PR

`pr-quick.yml`'s `landing` filter (`apps/landing/**`, `legal/**`, `packages/legal/…`, `packages/design/…`) runs `build-landing`; unit tests run in `_unit-tests.yml`. No extension e2e lane matches `apps/landing/**`.

## Collisions

- No open issue names the landing (`gh issue list --search "landing in:title"`). Closed known limits in the area: #1237, #1239, #1243 (signup); none touches the buttons.
- `og.png` is "the desktop hero"; the README says to recapture it when the hero changes.
