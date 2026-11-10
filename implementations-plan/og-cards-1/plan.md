---
plan: og-cards-1
tier: light
status: completed
issues: "#1775"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit plus a fresh final pass
base: origin/dev at 32fd50e60
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-10.
- **Status:** completed. Ships in #1777 (`feat(landing): a committed open graph card per changelog release`), whose merge closes #1775 and this plan; the final code commit is `8c2e86fe1`, and the close-out commits on top merge `origin/dev` at `b557cb159` and touch only `implementations-plan/`. The plan runs 155 lines, over light's 150 by this block; § Audit verdicts holds the review loop.
- **Shipped:** O2. A hand-run Puppeteer renderer (`bun run --cwd apps/landing og:cards`) writes a 1200×630 card per release and one for the index into `apps/landing/content/changelog/`, stamped with its document's SHA-256 in a `tEXt` chunk; `og-card.test.ts` refuses a missing, mis-sized, unstamped or stale card with no browser; every changelog page carries the 13 `og:`/`twitter:` tags naming its own card, which the build copies to a gitignored `public/changelog/`; the release skill's § Release notes and the landing README name the step. The 1.1.0, 1.2.0 and index cards ship as rendered.
- **Owner's sign-off:** decision page 132, signed 2026-11-10 21:09 UTC (`OWNER-ASKS.md`). P132-02 (approve): "Land #1777 as drawn: a committed Open Graph card per changelog release (your O2). The three cards' look and their alt text", so OA1 and OA3 are signed as shown. P132-03 = A: "As built: the word Changelog, then the newest release's version, date, title and tiles. Can run ahead of the page between a promote and the Release PR's merge.", so OA2 is A and nothing re-renders.
- **Gates at the final code commit:** lint, `typecheck:all`, `test:all` (one load-timed extension test outside the diff passed on its retry), the landing's `test` and `build` (13 tags, the cards byte-equal in `dist/`), `check:plans`; every PR check green, the Workers Builds preview included. No e2e path touched.
- **Deviations:** D11 (a declared line budget per box), D12 (the PNG tests in `og-card.test.ts`), the card size constants in `changelog-pages.ts` (`lessons/phase-2.md`).
- **Known limits:** #1779 (D6: the index card can name the next release before production lists it).
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` holds 8192 of its 8192 bytes and no entry is superseded; the `spawnSync` 1 MiB reply cap is guarded where it bit (`cardStamps`) and recorded in `lessons/phase-2.md`.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# og-cards-1: a committed Open Graph card per changelog release

A shared `/changelog/vX.Y.Z/` link previews as the site's generic `og.png`, and the changelog pages lack `og:url`, the image size and alt, and every `twitter:*` tag (#1775). The owner picked O2 on 2026-11-10 ("O2 sounds like the best way"): a hand-run script renders a 1200×630 card per release from its TOML into `apps/landing/content/changelog/`, a test refuses a missing, mis-sized or stale card, and the page names its own card. The pick signs the mechanism; decision page 132 (2026-11-10 21:09 UTC) signed the cards' look, their alt text and the index card's form. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/landing/` unless they say otherwise.

## Outcome & Quality Bar

- **For whom:** a person who meets a Nulo release link in X, iMessage, Slack or Discord; and the release author, who adds one command to the notes PR.
- **Excellent:** (1) the preview names the release it links (version, title, its changes with their icons) in the landing's faces and palette, every word inside the middle 1200×600, so a 2:1 crop cuts nothing; (2) CI refuses a card that no longer matches its inputs, so a card never silently shows an old title; (3) nothing renders at build or request time: Workers Builds only copies files.
- **Good enough:** a previewer's own cache can show an older card for a while after a re-render; the PNG bytes are never compared across machines.

## Assumptions

**Facts**
- F1. Pages: `scripts/changelog-pages.ts` `shell()` emits `og:title`, `og:description` and `og:image` = `${SITE}/og.png` only (lines 206-208); `index.html:16-40` carries the full static set.
- F2. A production build (`WORKERS_CI_BRANCH=main`) leaves out releases above the root `package.json` version (`isDraft`); `build-changelog.ts:34` deletes the landing-root `changelog/` on every run.
- F3. Rollup copies only `public/` verbatim into `dist/` (`vite.config.ts` turns `src/generated/*.json` into HTML entries); `wrangler.jsonc` answers an unknown path with `index.html`, so a missing card would serve 200 HTML.
- F4. `puppeteer` `^25.14.0` (locked 25.14.0, Chrome 155.0.8059.79) is in `apps/extension/package.json:112` only; `apps/extension/scripts/store-art.ts:56-67` is a committed-PNG renderer on it.
- F5. Faces: `packages/design/src/fonts/` (Space Grotesk latin + latin-ext, JetBrains Mono latin), exported through `@nulo/design/base.css`; the dark palette is `--app-bg #0a0908`, `--txt-primary #f5f0e6`, `--nulo-secondary #999187` (`base.css`), lines `rgba(245,240,230,.22)` (`src/styles/page.css:7`); the mark is a 1.5 px ring beside `NULO` (`page.css:206-221`, `public/favicon.svg`).
- F6. `src/page.test.ts` § "the built site" runs a scratch build (`build-changelog.ts` then `vite build`) in the ambient environment, not production: drafts are included. Draft filtering stays proven at the planner layer (`changelog-pages.test.ts` § the version gate).
- F7. `node:zlib` `crc32` exists on Bun 1.4.2 (checked: `crc32("IEND")` = `ae426082`).

**Inferences**
- I1. Adding `puppeteer` `^25.14.0` to the landing's devDependencies adds no package to `bun.lock`: proved when the lock diff touches only the landing workspace's `devDependencies`. The non-frozen `bun install` after the edit re-gates the landing's tree (CLAUDE.md § Dependency policy), so its success is the age-gate proof. Workers Builds' install is configured in the dashboard, outside the repo; Bun installs every workspace from any member directory, and the extension already declares Puppeteer (whose postinstall fetches Chrome), so the landing build's package set and downloads stay as they are (plausible, moderate confidence; the PR's Workers Builds preview build is the check).
- I2. The stamp is written after Chrome encodes the PNG and the test reads the committed file, so nothing downstream needs to keep the chunk.

**Asks** (no owner to ask while building; both answered by page 132)
- A1. The index card shows the word Changelog, the newest TOML's version and title, and its change icons (the lane brief). The window in D6 is the owner's call: `OWNER-ASKS.md` OA2 blocks the merge with OA1. Answered: P132-03 = A, as built.
- A2. Alt text: `Nulo 1.2.0: Read before you sign.` on a release page, `Nulo changelog: Nulo 1.2.0, Read before you sign.` on the index (TOML words only). Answered: signed by P132-02, as shown.

## Architecture & Implementation

**Shape.** One pure module renders a card's HTML document; a hand-run script turns each document into a PNG with Puppeteer and stamps the document's SHA-256 into a `tEXt` chunk; a test recomputes each document's hash and reads it back from the committed PNG. The page module names each page's card; `build-changelog.ts` copies the listed cards next to the pages.

**Data flow.** TOML → `parseEditorial` → `cardDocument(card, fonts)` (escaped text, inline glyph SVG, fonts as `data:` URIs, no script, no other URL) → `sha256(document)` → a card that passes `checkCard` is skipped, so a run on another machine leaves current cards untouched → Puppeteer screenshot at 1200×630, DPR 1 → `withPngText(png, "nulo-og-inputs", hash)` → `content/changelog/X.Y.Z.og.png`. The build: `planChangelogPages` returns `card: "X.Y.Z.og.png" | "index.og.png"` per page → `build-changelog.ts` copies `content/changelog/<card>` to `public/changelog/<page dir>/og.png` (`copyFileSync` throws on a missing card, so the build fails).

**Card layout** (the owner signs the picture): dark ground, a 1 px line frame with the plate's corner ticks; top row the ring mark and `NULO` left, `nulo.sh/changelog` right in mono; an eyebrow `v1.2.0 5 November 2026` in mono caps; the title at about 80 px Space Grotesk 700 after a `NULO 1.2.0` chip, at most two lines; a bottom row of one tile per change (glyph in a bordered square, the change title). The index card: the eyebrow `Changelog`, then the newest release's chip, title and glyph row. Every box sits inside x 64-1136, y 48-582.

**File-level change map**
- Add `scripts/og-card.ts` (pure): `Card` (`{ kind: "release"; editorial }` | `{ kind: "index"; latest }`), `cardDocument`, `planCards(editorials)` (one per TOML plus the index from the newest), `cardHash`, `checkCard(png, hash)` (returns the problem or `undefined`), `readCardFonts()` (resolves the faces through `@nulo/design/base.css`).
- Add `scripts/png.ts`: `pngChunks` (refuses a bad signature, a truncated or out-of-bounds chunk, or a first chunk other than IHDR), `pngSize`, `pngText(png, keyword)`, `withPngText(png, keyword, text)` (inserted after IHDR, CRC from `node:zlib`).
- Add `scripts/render-og-cards.ts` (hand-run): renders each missing or stale card, removes an orphan `*.og.png`, and refuses a card when a text box overflows on either axis (`scrollWidth > clientWidth` or `scrollHeight > clientHeight`), when any box leaves the safe rectangle, or when the page requested a non-`data:` URL (interception set before `setContent`); `package.json` `"og:cards": "bun run scripts/render-og-cards.ts"`, devDependency `puppeteer` `^25.14.0`.
- Add `content/changelog/1.1.0.og.png`, `1.2.0.og.png`, `index.og.png`.
- Modify `scripts/changelog-pages.ts`: export `icon`; `ChangelogPage.card`; `shell()` takes the card URL and alt and emits `og:type` `website`, `og:url`, `og:site_name` `NULO`, `og:image` + `:width` 1200 + `:height` 630 + `:alt`, `twitter:card` `summary_large_image`, `twitter:image`, `twitter:title`, `twitter:description` (the existing description), as `index.html` does minus `og:video`.
- Modify `scripts/build-changelog.ts`: delete then fill `public/changelog/`; `.gitignore` gains `/public/changelog/`.
- Tests: `scripts/png.test.ts`, `scripts/og-card.test.ts`, `scripts/changelog-pages.test.ts` (tag set), `src/page.test.ts` (built cards).
- Docs: `README.md` (file map, § Changelog pages), `.claude/skills/release/SKILL.md` § Release notes (one bullet).

## Decision ledger

| # | Question | Chosen | Rejected and why |
|---|---|---|---|
| D1 | Renderer | Puppeteer, already locked; the card uses the landing's real faces through Chrome's text engine | Satori + resvg: two new dependencies under the age gate and a second text engine |
| D2 | Where the hash lives | a `tEXt` chunk in the card: one file per release, card and hash cannot drift apart | a sidecar per card or one manifest: a second file to commit and keep paired |
| D3 | What the hash covers | SHA-256 of the whole card document, so the TOML fields the card shows, the template, the glyph paths and the font bytes all count, and a TOML comment or `line` edit does not | the TOML bytes plus a hand-bumped template version: a forgotten bump passes a stale card |
| D4 | Share `store-art.ts`'s `render` | copy its twelve lines | a new workspace package for two callers in two apps: a layer for twelve lines |
| D5 | Ship the card in `dist/` | copy into a gitignored `public/changelog/` at `prebuild` | a Vite `emitFile` plugin: more code for the same copy; committing under `public/`: two homes per card |
| D6 | The index card in the promote → release window | the owner's A (P132-03, page 132, signed 2026-11-10 21:09 UTC): "As built: the word Changelog, then the newest release's version, date, title and tiles. Can run ahead of the page between a promote and the Release PR's merge." Production lists the previous release while the committed index card names the new one, until the Release PR merges, which nothing bounds: known limit #1779 | a build-time fallback to the previous card: a recovery branch the owner did not ask for |
| D7 | A title too long for the card | the renderer refuses on either axis or outside the safe rectangle, and names the box | auto-shrink or clamp: hides or distorts the author's words |
| D8 | Nothing outside the document | interception aborts every non-`data:` request and the run fails if one happened (Puppeteer reports `data:` loads as requests it cannot intercept), so the hash covers all that is drawn | trust the template: one stray `url()` makes the hash a lie |
| D9 | What the stamp proves | accidental staleness only: a PR can commit any picture with a matching stamp, as it can any binary; review of the image diff is the control | signing the cards: a key and a lifecycle for a review problem |
| D11 | How the renderer measures a box (implementation) | each `[data-fit]` box declares `data-lines`; the renderer refuses more lines (height ÷ line-height), a box wider than its column, or one outside the safe rectangle; nothing is clipped | `scrollHeight > clientHeight` on fixed boxes: a display face's ink box (1.26 em for Space Grotesk) exceeds a tight line box, so it refused a one-line title |
| D12 | Test files (implementation) | the PNG tests live in `og-card.test.ts`, sharing one minimal-PNG builder | a separate `png.test.ts` with a copy of the builder |
| D10 | Which cards a run writes | only missing or stale ones (`checkCard`), so another machine's font rendering never churns a current card | always all: rewrites history on every release |

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve, eight findings. Accepted: the scratch build is not production (F6 reworded; the build test also asserts no extra card); `twitter:description` added; I1 rewritten around the lock diff and the dashboard-owned install; `data:` loads are requests (D8); overflow on both axes and the safe rectangle (D7); the stamp proves staleness, not authenticity (D9); render only missing or stale cards (D10), and the release step names deletions; OA2 made merge-blocking. Rejected: running the scratch build with `WORKERS_CI_BRANCH=main`, because it flips every built-site test to production while draft filtering is a pure planner fact already pinned, and the copy loop copies exactly the pages' cards.
- **Codex round 2** (resumed): approve; the rejection held. Two editorial fixes applied (the age-gate proof is the non-frozen install; D10 skips on `checkCard`).
- **Codex final pass** (fresh session, full ledger): approve. One low finding applied: Phase 2's `grep -c` could not show the tag set, so the gate prints the tags and names the test as the authority. No Opus leg: tier `light` on Claude Code has one Codex audit.
- **Implementation, Codex round 1** (gpt-6.1-sol, high) with one Opus review: two Codex findings, both accepted. The committed-cards test shipped every document through `in-bun.ts`, whose `spawnSync` caps stdout at 1 MiB, so the 14th release would red CI on a cut reply (demonstrated; fixed with `cardStamps`, which returns only file and hash); three comments overstated or restated their code (reworded). Opus found the same buffer bug plus three accepted local gaps: `in-bun.ts` ignored `run.error` on status 0, a box with a non-px line-height escaped the line budget, and the "runs past the end" PNG guard and change-title escaping had no test; its comment nit (a character the inline faces lack falls back to the machine's font) reworded the module header.
- **Implementation, Codex round 2** (resumed): clean; the loop converged.

## Security & Adversarial Considerations

- **Threat model.** The TOML is committed text written by a maintainer or a PR author; a hostile PR could put markup in a title. Every TOML string enters the card document through `escapeHtml`, the document holds no script and loads nothing (D8), and the renderer runs only by hand on a reviewed tree. The pages' new attributes carry the same escaped text as the existing `og:title`.
- **Least privilege.** No workflow, secret or token changes; CI never runs Chrome for this; Workers Builds copies files.
- **Supply chain.** No new package: the landing declares the version already locked (I1). The non-frozen install after the edit is the 7-day-gate proof; the frozen reinstall proves the lock reproduces.
- **Data in the artifact.** The `tEXt` chunk holds one hex hash; the document holds no path, host or time, so the hash is the same on every machine (the test proves it by recomputing in CI). The stamp detects accidental staleness, not a forged picture (D9).
- **Renderer.** Chrome runs `--no-sandbox`, by hand, on a document built from the reviewed tree with every string escaped; interception is a guard against an outside resource, not a sandbox (D8).
- **Frontend.** The card URL is same-origin (`https://nulo.sh/...`), which the built-site origin test already enforces for every `meta` URL; `img-src 'self'` is unchanged.

## UI impact

- **The link previews of `/changelog/` and `/changelog/vX.Y.Z/`**: before, the site's generic camera-feed image at most as a small card on X; after, the release's own card (layout above), as a large card. Signed by P132-02 ("The three cards' look and their alt text") on the three cards in the PR body (full size, plus 2:1 and 1.91:1 crop overlays). The pages themselves do not change.

## Phase 1: the card, its check and the three renders ✓

1. Add `scripts/png.ts` and `scripts/png.test.ts`: a round trip through `withPngText` and `pngText` on a minimal PNG, `pngSize`, and a refused non-PNG.
2. Add `scripts/og-card.ts` and `scripts/og-card.test.ts`: `checkCard` refuses a missing card, a 1200×600 card, a card without the chunk and a stale hash, with a success control; the real tree: every planned card exists and passes, and no orphan `*.og.png` stays.
3. Add `scripts/render-og-cards.ts`, the `og:cards` script and the devDependency; run `bun install`, then render.
4. Prove the gates locally, then restore: a changed `1.2.0.toml` title reds the test with the re-render command in its message; a rerun of `og:cards` leaves `git status` clean; a scratch over-long title and a scratch unbroken word are refused, as is a scratch `url(https://…)` in the template.

**Validation gate.** `bun install` then `bun install --frozen-lockfile --force` exit 0, and `git diff bun.lock` touches only the landing workspace's `devDependencies`; `bun run --cwd apps/landing og:cards` writes three cards; `bun run --cwd apps/landing typecheck` and `test` exit 0; step 4 shows red then green; `bun run lint` exits 0. Layers: typecheck/lint, unit.

## Phase 2: the tags, the copy and the docs ✓

1. Change `changelog-pages.ts`, `build-changelog.ts` and `.gitignore` as mapped; pin the full tag set for a release page and the index in `changelog-pages.test.ts`, and assert a production plan names no draft's card.
2. In `src/page.test.ts` § "the built site": every changelog page's `og:image` is a file in the build, byte-equal to its card in `content/changelog/`, and the build holds no other changelog card.
3. Update `README.md` and the release skill's § Release notes: the notes PR runs `bun run --cwd apps/landing og:cards` and commits what it adds, changes and deletes (`X.Y.Z.og.png`, the re-rendered `index.og.png`; a rename's old card goes); CI refuses a missing or stale card.
4. Render the crop overlays and capture the three cards for the PR body under `implementations-plan/og-cards-1/screenshots/`.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run --cwd apps/landing build` exit 0; `grep -oE '<meta (property|name)="(og|twitter):[^>]*>' apps/landing/dist/changelog/v1.2.0/index.html` prints thirteen tags (`og:` type, url, title, description, site_name, image, image:width, image:height, image:alt; `twitter:` card, image, title, description), `og:image` and `twitter:image` naming `https://nulo.sh/changelog/v1.2.0/og.png` (the tag-set test is the authority), and `dist/changelog/og.png` and `dist/changelog/v1.{1,2}.0/og.png` exist; `bun run check:plans` passes on the staged plan files. No root `scripts/` or `.github/` change, so `test:ci-gating` and `test:release` do not apply; no e2e path is touched. Layers: typecheck/lint, unit, build.

## Delivery

Single arc, one PR to `dev`, no stack: branch `og-cards-1-a1` off `origin/dev` carrying the plan commit. Title: `feat(landing): a committed open graph card per changelog release` (65 characters). Body: what and why, the gates with outcomes, the three cards at full size with their crop overlays and the sign-off ask, `Closes #1775`. `code_review: off`. Opened ready, without labels, only after the loop below converges. The close-out lands as the PR's final commits. Phases 1 and 2 share `changelog-pages.ts` and the cards, so no lanes.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as of `32fd50e60`. Plan-specific values:

- **Loop placement:** single arc, once over the net diff from `32fd50e60` after Phase 2 is green. Reviewer: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus (`general-purpose`) review alongside round 1. Hard stop at three rounds, then report.
- **Approval boundaries:** the card's look and the alt text are the owner's; a review finding that changes either goes to `OWNER-ASKS.md`. A fix that adds state, a lifecycle, a protocol, a fallback or a contract stops for approval.
- **Close-out:** the Outcome (with `Known limits:` naming D6's issue if the owner signs OA2 A), lessons promotion if one generalizes, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line moved, `bun run check:plans` green.
- **Teardown:** after `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/og-cards-1/plan.md` succeeds, `agent-worktree done og-cards-1 --merged`.

## Seeds (draft; none is run by this lane)

```
/goal All phases of implementations-plan/og-cards-1/plan.md are ✓, each backed by its validation gate passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); PR "feat(landing): a committed open graph card per changelog release" is open to dev with Closes #1775 and the close-out commits; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/og-cards-1 forward: read plan.md and lessons/, take the next unticked step, run its gate, tick it, then the Post-implementation section; never merge.
```
