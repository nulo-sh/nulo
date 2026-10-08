---
tier: light
driver: claude-code
eli5_mode: artifact
code_review: off
codex_model: sol
explainer: off
trunk: dev
worktree: landing-store-buttons
---

# Landing store buttons

The landing's install buttons send visitors to the store for their browser, the Chrome Web Store or Firefox Add-ons, instead of a GitHub release. The page no longer reads GitHub at build time, so a release needs no landing rebuild. A social preview image and store links in the footer ride along.

## Outcome & Quality Bar

- **For whom**: a person who opens `nulo.sh` from a link, often on a phone, and decides in seconds whether to install. Second: the owner, who cuts releases and should not have to touch the landing after one.
- **Excellent looks like**:
  1. Desktop Chrome, Edge, Brave and Opera show one button that names the browser ("Add to Brave") and opens the Chrome Web Store; desktop Firefox shows "Add to Firefox" and opens Firefox Add-ons. A small text link reaches the other store.
  2. A browser that cannot install Nulo (Safari, any phone, or no JavaScript) sees both store buttons and the line "Nulo runs on desktop Chrome or Firefox." Nobody gets a button that leads to a store page that refuses them without saying why.
  3. A release changes nothing on the landing: no build-time network call, no dashboard re-run, no runbook step.
  4. A shared `nulo.sh` link shows a picture.
- **Good enough**: the label may flash from the fallback to the detected state on a slow load. Arc and Vivaldi read as Chrome. Firefox below 153 gets the store page, which says the add-on needs a newer Firefox. A phone browser in "desktop site" mode sends a desktop user agent, so it reads as desktop Chrome or Firefox and its store page refuses the install; no client-side signal tells it apart. Nulo is tested on Chrome and Firefox only; Edge, Brave and Opera install the same Chrome build untested. The stores serve the newest reviewed version, which can trail a GitHub release by a few days.

## UI impact

Owner answers that set the behaviour (2026-10-08, this session): unsupported browsers get "Both stores + note"; Chromium browsers get "Name the browser"; the other store stays reachable as a "Small text link"; extras: "Social preview image" and "Footer: store links". The approval of this plan is the sign-off on the states below; the social image needs its own screenshot approval before merge.

| Surface | Before | After: Chrome family | After: Firefox | After: fallback (Safari, phone, no JS) |
|---|---|---|---|---|
| Nav button | `Add to Chrome` → GitHub release | `Add to <Browser>` → Chrome Web Store | `Add to Firefox` → Firefox Add-ons | `Get Nulo` → the final section |
| Hero CTA | `Add to Chrome` · `See what the camera sees` · "free · about 30 seconds" | `Add to <Browser>` · `See what…` · "free · about 30 seconds · also on Firefox" | `Add to Firefox` · `See what…` · "… · also on Chrome" | `Chrome Web Store` · `Firefox Add-ons` · `See what…` · "free · Nulo runs on desktop Chrome or Firefox" |
| Final CTA | `Add to Chrome` · `Source on GitHub` · "free · about 30 seconds · chrome & firefox" | as hero, `Source on GitHub` kept | as hero | as hero |
| Footer | github · releases (latest release page) · privacy · terms | github · chrome · firefox · releases (all releases) · privacy · terms | same | same |
| Link previews | no image | 1200×630 `og.png`, a capture of the hero | same | same |

`<Browser>` is Edge, Brave or Opera when the browser identifies itself, otherwise Chrome.

Found during implementation, put to the owner on the PR (not covered by the approval above):

| Surface | Before | After |
|---|---|---|
| Phone hero (≤ 900 px) | fixed 640 px; the plate covers the REC label, and a third button would clip the headline | grows with the plate; REC stays visible above it |
| Record panel on phones | the ledger widens the page to 494 px at 375 px, so the page scrolls sideways | the ledger clips at the panel edge; no sideways scroll |

## Architecture & Implementation

- **Location**: two new modules in `apps/landing/src/`. `install.ts` holds the store table and a pure `detectInstall(nav)`; `install-dom.ts` applies the result to the page. `main.ts` calls it before `mountPage()`. Recon found nothing reusable (`recon.md`).
- **Interface** (internal to the landing):
  ```ts
  export const STORES = {
    chrome: { url: "https://chromewebstore.google.com/detail/jlmiaokmjoicmclelpiiocdhncddkdmc", name: "Chrome" },
    firefox: { url: "https://addons.mozilla.org/firefox/addon/3077967/", name: "Firefox" },
  } as const
  export type StoreId = keyof typeof STORES
  export type Install = { store: StoreId; browser: "Chrome" | "Edge" | "Brave" | "Opera" | "Firefox" }
  export function detectInstall(nav: { userAgent: string; brave?: unknown }): Install | null
  ```
- **Detection order**: (1) a phone or tablet UA (`Android`, `iPhone`, `iPad`, `iPod`, `Mobile`) or `userAgentData.mobile === true` → `null`; (2) `Firefox/` → Firefox; (3) `Edg/` → Edge, `OPR/` → Opera, `brave` present on `navigator` → Brave, else `Chrome/` or `Chromium/` → Chrome; (4) anything else (Safari, unknown) → `null`. The label comes from this fixed set, never from the UA text. Brave's `navigator.brave` is a naming heuristic only: if Brave hides it, the label falls back to Chrome, which still installs. Touch support is not a mobile signal (touchscreen laptops install fine).
- **Markup**: the static HTML is the fallback state. Each CTA holds `a[data-install="primary"]` (Chrome Web Store), `a[data-install="secondary"]` (Firefox Add-ons), a `[data-install-fallback]` note, and a `hidden` `[data-install-detected]` note with `a[data-install-other]`. The nav holds `a[data-install="nav"]` (`#get`, the final section's new id). With a detection, the script sets `href` and `textContent` on the primary and nav links, hides the secondary link and the fallback note, shows the detected note, and points `data-install-other` at the other store. It writes `textContent` only. `page.css` gains `[hidden] { display: none !important; }`, because `.btn`'s `display: inline-flex` outranks the browser's own `hidden` rule; a hidden link then leaves the tab order too.
- **Deletions**: the four release scripts and modules, their test, the Vite plugin, the `package.json` hooks, the `.gitignore` line, and the CI stub step; the footer `releases` link becomes the static `https://github.com/nulo-sh/nulo/releases`.
- **Social image**: `public/og.png`, 1200×630, captured from the built page's hero with a headless browser from a scratch script (no new dependency); `og:image`, `og:image:width`, `og:image:height`, `og:image:alt` and `twitter:image` in `index.html`, absolute `https://nulo.sh/og.png`.
- **File map**: add `src/install.ts`, `src/install.test.ts`, `src/install-dom.ts`, `public/og.png`; modify `index.html`, `src/main.ts`, `src/styles/page.css`, `package.json`, `vite.config.ts`, `.gitignore`, `README.md`, `.github/workflows/pr-quick.yml`, `CLAUDE.md`, `CI.md`, `.claude/skills/aztec-update/SKILL.md`; delete the six release files.
- **Alternative not taken**: detect in the Worker from the `User-Agent` header and rewrite the HTML. It removes the label flash, but it turns a static-assets Worker into a script Worker that runs on every request, and it adds a cache that must vary on the user agent. A label flash on a slow load costs less.

## Security & Adversarial Considerations

- **Threat model**: a static marketing page with no input, no session and no secret. The attack surface is the HTML and the links it points to.
- **Link integrity**: the two store URLs are constants in reviewed source, named by item id. A spoofed user agent only changes which of the two links shows.
- **Injection**: the script writes `textContent` and `href` from the fixed table only. The removed build step substituted the GitHub API's `html_url` into `href` attributes without escaping; deleting it removes that build-time input.
- **CSP**: unchanged. `script-src 'self'` holds because detection ships in the bundled module; no inline script. No `target="_blank"`, so no reverse tabnabbing. `Referrer-Policy: strict-origin-when-cross-origin` sends the stores only `https://nulo.sh/`.
- **What stays trusted**: reviewed source, the locked build dependencies, Workers Builds' access to `main`, and ownership of the two store accounts. CSP cannot stop malicious bundled code or a swapped store URL; review of this diff and of later edits to `install.ts` is the control.
- **Supply chain**: no new dependency. The headless browser for checks and the image capture is the repo's locked `puppeteer` (the e2e stack, `apps/extension`), run from a scratch script outside the landing's manifest. The build loses its only network call.
- **Asset routing**: `wrangler.jsonc` serves `index.html` with a 200 for any unknown path, so a missing `og.png` would hand crawlers HTML. The gate checks that `/og.png` from `vite preview` is `image/png` and decodes at 1200×630.
- **Privacy**: detection runs in the page and sends nothing. The Privacy Policy describes no landing analytics, and none is added.

## Assumptions

**Facts**
1. `index.html` uses `{{release_url}}` four times (lines 44, 70, 199, 212); `release-html-plugin.ts` substitutes it from `src/generated/release.json`, which `prebuild` fetches from `api.github.com`.
2. Both listings are public: the Chrome URL redirects (301) to the `nulo-v6` slug; AMO answers 200 and its API reports `public`, Firefox 153 or newer, desktop only. `manifest.firefox.config.ts` declares no `gecko_android`.
3. `public/_headers` sets `script-src 'self'`, so page logic must ship in the bundle.
4. The landing's tests run in `environment: "node"`, and the landing declares no DOM library.
5. At widths of 900 px or less, `.bar nav a:not(.btn)` is hidden, so the nav button is the only nav item on a phone.
6. `cliff.toml:31-32` and `legal/terms.md:33-34` carry the same two store URLs as text.
7. The only CI consumer of the release stub is `pr-quick.yml`'s `build-landing` step; no `scripts/ci-cd/**` test pins it.

8. `page.css:121` gives `.btn` `display: inline-flex`, and no stylesheet in the landing or `@nulo/design/base.css` has a `[hidden]` rule.
9. Store uploads are opt-in `workflow_dispatch` inputs (`release.yml`), and `cliff.toml:34` already tells readers the stores can trail a release by a few days.

**Inferences**
1. Edge's UA carries `Edg/` and Opera's `OPR/` (high). Brave usually defines `navigator.brave`, but Brave can hide it, so it is a naming heuristic (high).
2. Edge, Brave and Opera install from the Chrome Web Store; Edge first asks to allow other stores (moderate). Whether the wallet runs well there is untested.
3. A module script can run after first paint, so a slow load can show the fallback for a moment (high).
4. Link-preview crawlers read an absolute `og:image` and do not run the script (high).
5. A phone in "desktop site" mode sends a desktop UA and `userAgentData.mobile: false`, so no client-side check catches it (high, per Chrome's own docs).

**Asks** (surfaced at the approval gate, not assumed)
1. Accept that the named-browser label promises an install, not a tested wallet, on Edge, Brave and Opera.
2. Accept that visitors now get the store's reviewed version, which can trail a GitHub release by days.
3. The social image's look is approved by screenshot before merge.

## Phases

### Phase 1: Store buttons ✓

1. Add `src/install.ts` with the store table and `detectInstall`.
2. Add `src/install.test.ts`: one table test over real UA strings. Detected: Chrome (Windows, macOS, Linux, ChromeOS), Chromium, Edge, Opera, Opera GX, Yandex (as Chrome), Brave (with the navigator flag), Firefox, Firefox ESR, Tor Browser and LibreWolf (as Firefox). Fallback: macOS Safari, iPadOS Safari with its desktop UA, iPhone Safari, Chrome on Android, Edge on Android, Samsung Internet, Firefox on Android, Firefox on iOS, an empty UA, and a desktop UA with `userAgentData.mobile: true`.
3. Add `src/install-dom.ts` and call it from `main.ts`.
4. Rewrite the nav, hero and final CTAs in `index.html` to the fallback markup; give the final section `id="get"`.
5. Add `[hidden] { display: none !important; }` and a link style inside `.cta small` to `page.css`.

**Validation gate**
- Commands: `bun run --cwd apps/landing test`; `bun run --cwd apps/landing typecheck`; `bun run lint`; `bun run --cwd apps/landing build`.
- Pass criteria: each exits 0; `install.test.ts` is green. Then a scratch Puppeteer script against `bun run --cwd apps/landing preview` loads the page as Chrome, Edge, Brave (navigator flag injected), Firefox UA, iPhone Safari, and with JavaScript off. For each CTA it asserts: the number of visible store links (1 detected, 2 fallback), each visible link's text and `href`, the other-store link's `href`, that no hidden link is focusable by Tab, and no console error or CSP violation. All assertions pass; the output is pasted into `lessons/phase-1.md`.
- Layers: typecheck/lint, unit, build, browser check.

### Phase 2: Delete the release coupling

1. Delete the six release files and the Vite plugin use.
2. Remove the release scripts from `package.json` hooks; keep `build-legal.ts` in `predev` and `prebuild`.
3. Remove `src/generated/release.json` from `.gitignore`.
4. Point the footer `releases` link at the static releases page.
5. Change `pr-quick.yml`'s `build-landing` step to generate the legal pages only, and fix its comment.
6. Update `apps/landing/README.md` (file map, the test row, the "Independent ship" note), `CLAUDE.md` (release summary, the division-of-labor row, Stable step 7 removed and steps 8–9 renumbered, prerelease step 7 removed and step 8 renumbered, the troubleshooting row), `CI.md:32,107`, and the `aztec-update` skill's tokenless-call note. Keep every store-submission instruction as it is.

**Validation gate**
- Commands: `bun run --cwd apps/landing build`; `bun run --cwd apps/landing typecheck`; `bun run --cwd apps/landing test`; `bun run test:ci-gating`; `bun run lint:actions`; `bun run lint`; `! git grep -nE 'fetch-latest-release|ensure-release-json|release-html-plugin|release-resolver|release_url|chrome_zip_url|shasums_url|\{\{version\}\}|src/generated/release' -- . ':!implementations-plan'`.
- Pass criteria: every command exits 0 (the negated `git grep` exits 0 only when it finds nothing); `grep -c '{{' apps/landing/dist/index.html` prints 0; the build log shows no GitHub request.
- Layers: typecheck/lint, unit, CI-gating, build.

### Phase 3: Social image and footer store links

1. Capture `public/og.png` from the built hero at 1200×630; keep it under 300 KB.
2. Add the `og:image` set and `twitter:image` to `index.html`.
3. Add `chrome` and `firefox` store links to the footer; make the footer row wrap on a phone if it overflows.
4. Take screenshots of desktop Chrome, desktop Firefox and phone fallback for the PR and the owner.

**Validation gate**
- Commands: `bun run --cwd apps/landing build`; `bun run lint`.
- Pass criteria: exit 0; `dist/index.html` carries `og:image` as `https://nulo.sh/og.png`; under `vite preview`, `/og.png` answers `content-type: image/png` and decodes at 1200×630; at 375 px, `document.documentElement.scrollWidth` equals the viewport width in every state.
- Layers: build, browser check.

## Delivery

Single arc, one PR into `dev`: `feat(landing): send install buttons to the browser's store`. `code_review: off`. The close-out lands as the PR's final commits. `nulo.sh` changes only when `dev` is promoted to `main`, which is the owner's call.

## Post-implementation

Run from this plan after Phase 3 is green.

1. **No `/code-review`**: `code_review` is `off`.
2. **Codex audit**: `/codex high` on `gpt-6.1-sol` (`run-codex.sh` fifth argument), with the net diff from the plan base, this plan, the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't?"), and both rules below verbatim.
3. **Fix loop**: verify each finding against the repo, apply the accepted ones, commit, log the round in `lessons/phase-3.md`, then resume the same Codex session with the fix diff. Stop when a round has no new material finding. Still material after 3 rounds: stop and report to the owner.
4. **Delivery**: `gh pr create --base dev` only now, with the owner's quoted answers, the screenshots and the social image in the body. Then `gh pr checks --watch`.
5. **Close-out**, as the PR's final commits: an `## Outcome` block after the front matter (date, status, shipped with the PR number, dropped items, a line retiring the seeds); promote generalizable gotchas to `implementations-plan/lessons.md` (one line each, dedup, keep it under 8 KiB) and `memo note` them; move open items to `implementations-plan/follow-ups.md`; `git mv implementations-plan/landing-store-buttons implementations-plan/archive/landing-store-buttons` in its own commit, repair links; move the index line to `archive/index.md`. Then report and wait: merging is the owner's call.
6. **Teardown after the merge**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/landing-store-buttons/plan.md` succeeds, run `ExitWorktree` with `keep` (this session entered through `EnterWorktree`), then `agent-worktree done landing-store-buttons --merged`. Do not ask first. On a refusal, relay its output and stop. A session with no `/loop` arms one background wait after its wrap-up: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/landing-store-buttons/plan.md; do sleep 300; done`.

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

## Audit

**Codex plan audit** (GPT-6.1 Sol, `high`, 2026-10-08): `conditional approve (with conditions: fix hidden-state styling, correct validation gates, and acknowledge detection and store-availability limits)`. Every finding was checked against the repo before it was taken.

| # | Finding | Resolution |
|---|---|---|
| 1 | high: `.btn { display: inline-flex }` beats the browser's `[hidden]` rule, so a hidden store link would stay visible | Adopted: `[hidden] { display: none !important; }` in `page.css`; the browser check asserts visible count and tab order. Verified: no `[hidden]` rule exists. |
| 2 | medium: Phase 2's `git grep` exits 1 on success; other removed tokens unsearched | Adopted: negated grep; `chrome_zip_url`, `shasums_url`, `{{version}}` added. |
| 3 | medium: Android "desktop site" mode defeats UA-based phone detection | Adopted as a stated limit (Good enough, Inference 5); `userAgentData.mobile` added as positive evidence; touch is not used. |
| 4 | low: Brave's flag is a heuristic; Opera installs from the store directly | Adopted: wording narrowed; Chrome stays the fallback label. |
| 5 | medium: named labels promise an install on untested browsers; the stores trail releases | Adopted: surfaced as Asks 1–2 at the approval gate; store-submission steps kept untouched. |
| 6 | medium: printing labels is not validation; more UA fixtures needed | Adopted: assertions on visible count, destinations, tab order and console/CSP errors; fixtures for desktop-UA iPadOS, Samsung Internet, mobile Edge, Opera GX, Chromium, Yandex, Tor and LibreWolf. |
| 7 | low: name the remaining trust boundary; use locked tooling; check `og.png` is really served | Adopted: trust boundary and asset-routing bullets; `/og.png` content type checked. Rejected in part: the "Playwright-only" instruction is the owner's global default, while this repo's e2e stack and lockfile carry Puppeteer, so the locked Puppeteer is the right tool. |
| 8 | low: README test row; Stable step 9 and prerelease step 8 need renumbering | Adopted. |

## Seeds

ELI5 (Claude Artifact, private): https://claude.ai/artifact/EioDWhwHDrpBfhRyvHuZLs, published from `implementations-plan/landing-store-buttons/eli5.html` (local only).

**Approval** (2026-10-08): the owner set the recommended `/goal` seed below without conditions, which approves the plan and its UI impact table and accepts Asks 1 and 2. Ask 3 (the social image) stays open until the owner sees its screenshot on the PR.

`/goal` (active in the implementing session):

```
/goal All three phases marked ✓ in implementations-plan/landing-store-buttons/plan.md (the file, not the chat), each ✓ backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/landing-store-buttons/lessons/phase-N.md printed for each phase; /code-review NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol converged over the net diff, shown by a resumed Codex pass quoted in the transcript reporting no new material findings; one PR into dev opened only after that (gh pr view output in the transcript), carrying the close-out commits that archive the plan (git show --stat of the archive-move commit in the transcript) and the screenshots plus social image for the owner; bun run lint, bun run --cwd apps/landing test, bun run --cwd apps/landing typecheck and bun run test:ci-gating each report exit 0 in the transcript.
```

The `/loop 15m` alternative is in the ELI5; it is not in use.
