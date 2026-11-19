---
plan: hover-band-1
tier: light
status: implementing
issues: "#1884 (part of it; the owner closes it after the smoke test)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon in-session; one Codex gpt-6.1-sol high pass over the plan and the completed diff
base: origin/dev at 0d5afc774
trunk: dev
post_implementation_hardening: not scheduled
---

# hover-band-1: the row hover runs from edge to edge (H1)

The owner picked H1 on page 193 (P193-01, 2026-11-19): "The same fill colour across the popup's full width with square ends; icon, symbol and figures stay where they are. The ring runs the band's full width and stays whole." The PR is a draft, held for the owner's smoke test, and lands only on the owner's word after 1.3.0 is published.

## Outcome & Quality Bar

- **For whom**: a person moving the pointer or Tab over the rows of Home, Holdings, History and a token's page in the 360 px popup.
- **Excellent**: the hovered or focused row's fill and ring touch both popup edges on every one of those hosts; nothing in the row moves; no host gains sideways scroll at any width; nothing narrower than the band (a sticky header) shows it cut.
- **Good enough**: picker rows (Send's token sheet) and every non-link row keep today's geometry.

## Architecture & Implementation

- **Bleed tied to the gutter.** Each of the four hosts sets `--page-gutter: 24px` on its content column and pads with `var(--page-gutter)`; a row bleeds by `calc(-1 * var(--page-gutter))` and pads by `var(--page-gutter)`. A host that sets nothing keeps the earlier geometry through the fallback (0 for a token row, 8 px for an activity row). The bleed equals the host's gutter only while nothing between the host and the row adds a side inset; the rows' comments say so.
- **Activity rows.** `TransactionCardLayout.vue` takes the inset once, `--row-inset: var(--page-gutter, 8px)` on `.wrapper`, and the actions corner reads it: `padding-right: calc(var(--row-inset) + 28px)` (one action) and `+ 52px` (two), `.actions { right: var(--row-inset) }`, and the narrow reset `padding-right: var(--row-inset)`. The 28 and 52 are today's 36 − 8 and 60 − 8.
- **Token rows.** `TokenCard.vue`'s `.link` gets `margin-inline: calc(-1 * var(--page-gutter, 0px)); padding-inline: var(--page-gutter, 0px)`. `.pick` follows `.link` in the module and sets its own `margin` and `padding`, so a picker row is unchanged.
- **Holdings' sticky search** (`TokenList.vue` `.sticky`) is 312 px wide over rows that now paint 360 px: a hovered row scrolled under it would show two 24 px stubs beside the search field. The sticky box takes the same bleed (`margin-inline` and `padding-inline` from `--page-gutter`, fallback 0), so its opaque background covers the band; the field stays where it is. In the Send sheet no `--page-gutter` is set, so the sheet's sticky is unchanged.
- **Unchanged**: the fill colour, the ring (2 px accent, offset −2 px, on the row's own box), `:active`, and the arrival glow, which animates the row's background and widens with it.
- **Files**: `TokenCard.vue`, `TransactionCardLayout.vue`, `TokenList.vue` (the bleed and a `search-bar` testid), `popup/pages/{general,holdings,activity}.vue`, `popup/pages/tokens/[id].vue`; tests `TransactionCardLayout.test.ts` (stale comment) and `tests/e2e/rows.test.ts`.
- **Alternative not taken**: a global `--page-gutter` on `:root`. Every row anywhere would then bleed 24 px, including rows in a host with no 24 px gutter, which scroll sideways. Host-scoped is the brief's "set where the gutter is set".

## Security & Adversarial Considerations

CSS geometry only: no data, storage, message or permission changes. The one risk is UI integrity: a widened row's hit area covers the gutter, so a press beside a row opens it. That is the band the owner chose. No overlay now sits over a row's gutter on these hosts (History's title bar is full width; Home and the token page pin their hero outside the scroller; Holdings' sticky gets the bleed).

## Assumptions

**Facts**
1. Token rows: `.row { padding: 8px 0 }` and `.link` paints `--nulo-surface-low` on `:hover`/`:focus-visible` with the ring `outline: 2px solid var(--nulo-accent); outline-offset: -2px` (`TokenCard.vue:152-174`). `.pick` sets `margin: 0 -8px; padding: 8px` after `.link` (`:178-185`).
2. Activity rows: `.wrapper { margin: 0 -8px; padding: 6px 8px }`, actions at 36/60 px and `right: 8px`, narrow reset `padding-right: 8px` (`TransactionCardLayout.vue:163-201, 289`).
3. Every link-row host pads 24 px: `general.vue:211`, `holdings.vue:253`, `activity.vue:344`, `tokens/[id].vue:350`.
4. The popup draws no scrollbars (`scrollbar-width: none`, `packages/design/src/base.css:222-228`), so Holdings' `scrollbar-gutter: stable` reserves no width.
5. No window under `src/popup/windows/` renders a token or activity row; the Send sheet's rows are `.pick` buttons (`TokenList.vue:106-109`).
6. History's sticky title bar is a direct child of the scroller, outside `.content` (`activity.vue:228`, `tab-hero.module.css:2-37`), so it already spans 360 px.
7. Holdings' search sits in `.sticky` inside the 312 px content column (`TokenList.vue:117-119, 177-182`).
8. jsdom computes no layout, so only a real browser can read the band's box: the e2e layer is the cheapest that can pin it.

**Inferences**
- I1. Firefox's 1/60 px layout adds no overflow, since the gutter and the bleed are the same whole pixels. Checked by `rows.test.ts` on Firefox.

**Asks** (none open; the owner's smoke test is the sign-off)
- A1. The sticky search's bleed is a geometry change outside the row, invisible at rest. Working assumption: it is part of building the band (the band must not read cut). The PR body names it.

## Decisions

- D1. Host-scoped `--page-gutter` with today's geometry as the fallback (above). 
- D2. The ring stays inset on the row's own box: the box ends at the scroller's padding edge, inside every `overflow` clip, so all four sides stay whole. Accessibility call under the owner's 2026-10-19 delegation.
- D3. The edge pins amend existing e2e scenarios, so no suite wall-clock change: the −8px History spec now reads Home's and History's activity rows; the placeholder-row spec, which already ends on a loaded token row, reads it on Home and Holdings and reads Holdings' sticky search bar; the pinned-hero spec reads the token page's rows. Each box must span 0 to the viewport width. jsdom has no layout, so a browser is the cheapest layer. On the base CSS the pins fail (16 px and 24 px short); on the change they pass.

## Phase 1: build H1 and pin it

1. Add `--page-gutter` to the four hosts and the bleed to the two rows and the sticky search.
2. Fix the stale "36px" comment in `TransactionCardLayout.test.ts`.
3. Rename and amend the e2e specs in `rows.test.ts` as D3 says.

**Validation gate**
- Commands: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run check:plans` (after staging); from `apps/extension`: `bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts tests/e2e/token-list.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: every command exits 0; the amended spec reads 0 and the viewport width on all three rows.
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

## Phase 2: captures and the look-and-feel page (not committed)

1. Capture Home's token rows and Recent activity, History and Holdings, hovered and focused, light and dark, today and H1, at 360 px and 2x, from the real pages in Storybook with a fake background.
2. Serialize the same pages into one self-contained `look.html` (both variants, CSS-only theme switch).

**Validation gate**: 32 frames on disk; `look.html` under 8 MB with no URL but `data:`; opened in Chrome from disk, hover, Tab and the theme switch checked by hand-driven Puppeteer.

## Review verdicts

Codex (`gpt-6.1-sol`, high), one pass over this plan and the diff: no demonstrated regression; host scoping, fallbacks, the actions corner and teleport boundaries sound.
- R1 (accepted): the sticky bleed and the token page had no pin. Added to existing scenarios (D3).
- R2 (accepted): the plan said the fallback makes a later host safe; it only keeps the earlier geometry. Reworded.
- R3 (accepted): the rows' comments now state the constraint (no side inset between host and row) instead of the arithmetic.

## Post-implementation

Cited from `implementations-plan/README.md` § Post-implementation standard at `a763870d4`. Bounded work: one Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and the completed diff with the adversarial ask (a host or width where the band scrolls sideways or is cut, a ring clipped by an edge or an `overflow`, a picker row that changed, the actions corner misplaced) and the two verbatim rules; then targeted verification of each material fix.

## Delivery

One draft PR against `dev` (`gh pr create --draft`), never marked ready, never merged by this session; `Part of #1884`. Frames: pushed in one commit and removed in the next. Close-out (Outcome, archive move) as the PR's final commits.

## Seeds

- `/goal`: Build H1 per implementations-plan/hover-band-1/plan.md; stop at a green draft PR.
- `/loop`: Check the draft PR's required checks; fix a red at its cause; never merge.
