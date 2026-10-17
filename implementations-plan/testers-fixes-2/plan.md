---
plan: testers-fixes-2
tier: light
status: implementing (orchestrator approved 2026-10-16)
issues: "#583 #592 (the one arc closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at 493ff497
trunk: dev
post_implementation_hardening: not scheduled
---

# testers-fixes-2: activity rows, the App row, Home's fixed hero

One arc, one PR against `dev`, `Closes #583 #592`. It ships the three signed picks: P31-01 A' (activity rows), P29-02 A confirmed as P31-02 A (the details App row), P29-03 A (Home's layout). Two cases the mockups never drew are owner asks, each with a "what ships now" form (OA-1, OA-2). Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Claims that did not hold

- Lane brief, "the empty states keep their vertical centring": neither is centred today. Home shows no activity empty state (the block hides, `RecentActivityView.vue:840`); the holdings card sits in flow (`TokensView.vue:418`). Both stay where they are, inside the scrolling middle.
- Lane brief, "the hero's containers get `min-width: 0` or a cap": no hero overflow path exists. The Fee Juice grid overflows only above the token's whole supply (recon § Measurement). The hero is not changed.
- #583 holds: the terminal and awaiting chip never shrinks (`activity-card.module.css:12-13`), so the tester's host widens Home by 89 px. The settled chip breaks inside itself instead, but an unbreakable name still widens it. The details App value is already right-aligned; it has no gap and breaks only at hyphens, so a long host fills the line against "App".

## Outcome & Quality Bar

For a person who uses dApps with long names and function names, on Home, History and a token page. Excellent: (1) Home and History never scroll sideways, whatever a dApp names itself or its function; (2) a dApp row reads as the mockup draws it (one line, the name cut at its end, a short app name whole); a send or receive row is pixel-identical to today. Good enough: the two-chip row (OA-1) stays inside the page with its symbol whole; the journal page (OA-2) is as today.

## Architecture & Implementation

- **Rows (#583).** `TransactionCardLayout.vue` gains one Boolean prop, `oneLineTitle` (default false: today's title). When true, the title (`:107`) adds `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. `activity-card.module.css` gains `.app_chip`: it composes `.chip` (nowrap, `flex-shrink: 0`) and adds `max-width: 96px; overflow: hidden; text-overflow: ellipsis`. The terminal and awaiting cards bind `app_chip` when the chip shows the origin and `chip` when it shows the direction. `TransactionCard.vue` puts the origin in `app_chip` and keeps its own direction-chip rule. When it shows both chips, they sit in a `.chips` span (`display: inline-flex; flex-wrap: wrap; gap: 4px 6px`), so the app chip can drop below the direction chip (OA-1). Each card sets `oneLineTitle` to "has an origin label and no direction label". Each app chip carries `data-testid="activity-app-chip"`. `TransactionIncomingCard.vue` does not change.
- **App row (#583).** `tx/[id].vue:291-294`: the row aligns to the start with a 16 px gap. The key (`data-testid="tx-detail-app-label"`) keeps its width (`flex-shrink: 0; padding-top: 2px`). The value (`data-testid="tx-detail-app"`) composes `detail_value_mono` and adds `min-width: 0; text-align: right; word-break: break-all; line-height: 1.4`, the rule of `o-txdetail-app`. Line height is no role property.
- **Layout (#592).** `general.vue` only, since `BalanceView` is also the token page's hero:
  - The wrapper becomes a non-scrolling column (`flex: 1; min-height: 0`).
  - A hero region (`flex: none; position: relative; z-index: 1`, testid `home-hero`) holds `BalanceView` and a shadow. The shadow is `position: absolute; bottom: -12px; height: 12px; pointer-events: none; aria-hidden`, testid `home-scroll-shadow`. Its gradient is `o-layout-a`'s: 0.45 black in dark, 0.12 in light under `:global([theme="light"])`.
  - A middle (`flex: 1; min-height: 0; overflow-y: auto; isolation: isolate`, testid `home-scroller`) holds the banners, holdings and activity. It is padded `16px 24px var(--nav-clearance)`. `isolation` keeps the rows' own `z-index: 1` actions under the shadow.
  - `@scroll.passive` sets `scrolled = scrollTop > 0`. The shadow shows at opacity 1 only then, with the tab title bar's `opacity 0.18s` fade, which is removed under `prefers-reduced-motion: reduce` and by `.noanimations`.
  - At rest, Send and Receive sit 40 px above the holdings label (24 + 16, as `o-layout-a`; today 24).
- **Decision ledger.**
  - D1, cut only titles that are a dApp's function name: rows that name an app and show no direction chip. Rejected, cutting every title (the mockup's rule as written, and the first draft's wrap): both cut a send's symbol ("USD…") at a nine-digit amount (recon table), which the owner excluded. Codex and Opus both found it. The title keeps `flex: 0 1 auto`: with `1 1 auto` a short title would grow and push its chip right whenever the line under it is wider.
  - D2, cap the app chip only. The direction chip is 113 px; a 96 px cap would cut send rows.
  - D3, the settled card keeps its direction-chip rule. Merging it into the shared chip (the first draft) changes how send rows break.
  - D4, the layout lives in `general.vue` (see Layout). D5, a template scroll listener. A scroll-driven animation is not in Firefox. `background-attachment: local` draws the shadow under the rows, unlike the mockup. An IntersectionObserver is more code.
  - D6, no `tabindex` on the middle (Codex asked for one; rejected on measurement). Both browsers keep today's Tab and PageDown behaviour inside the scrolling content, and `tabindex` restores none of the cases lost over the hero (recon § Keyboard). Its only effect is a new Chrome Tab stop nobody signed. PageDown and the wheel with focus or the pointer over the fixed hero no longer scroll: that follows from the signed layout (OWNER-ASKS N-1).
  - D7, a prop over a `:has()` selector: the cards already hold the two labels that decide it, and a selector cannot name a class from another CSS module.
  - D8 (implementation): Phase 1's "NEMI" row is a settled dApp call, seeded through `seedTransaction`'s `method`, which records no transfer for a non-transfer name; the browser test so covers both the terminal and the settled card's one-line path ([lessons/phase-1.md](lessons/phase-1.md)).
  - D9 (implementation): `snack-placement`'s Home case reads the Cancel at the top of the middle instead of at its scroll's end, where the fixed hero now clips the row out of view; its closing check states the snack's rule at each position, since a centred row now sits in the snack's resting band and correctly lifts it. The PageDown check focuses an activity row: a holding row needs a balance row only a background restart loads ([lessons/phase-2.md](lessons/phase-2.md)).

## Security & Adversarial Considerations

- **Threat:** a dApp controls its name (`op.subtitle`, `tx.origin.name`; 64 code points plus an ellipsis on the session path) and its function names. Its capability here is layout. Text renders through Vue interpolation, with no `v-html`, and the sanitizers do not change.
- **Cut names:** an end ellipsis hides a host's tail (`app.uniswap.org.evil.example` reads `APP.UNISWAP.OR…`). The name is the dApp's own claim, not a verified origin, in the row and on the details page alike; the dApp could claim "Uniswap" outright. Approval windows are untouched.
- **Clickjacking:** the shadow covers the middle's top 12 px with `pointer-events: none`; Phase 2 proves a click there opens the row under it. The middle clips its own rows, so nothing reaches under the hero.
- Least privilege, cryptography, supply chain: no change (no dependency, no permission, no crypto).

## Assumptions

- **Facts:** `recon.md` § Facts and § Measurement (chip rules, the scroller, empty states, title derivation, the name caps, the sweep's clip rule, the awaiting pin, the two network specs, the keyboard and hero measurements).
- **Inferences:** I1, Firefox lays out the cut title, the capped chip and the chip group as Chrome does (Phase 1's Firefox run proves it). I2, Firefox still sizes the action popup at 600 px with the middle at `min-height: 0`; `#app` is `100vh` with a 600 px minimum (`index.scss`). The Firefox-only toolbar-panel test (`type-roles.test.ts:551`, a real action popup) proves it; Chrome's side panel is covered only by Phase 2's tall viewports. I3, #582 restores the window's scroll, not Home's element; Phase 3 verifies it once testers-fixes-1 lands.
- **Asks:** OA-1 (the two-chip row) and OA-2 (the journal App row) in `OWNER-ASKS.md`; each ships its "what ships now" form. N-1 is a note, not an ask.

## UI impact

- Activity rows on Home, History and a token page, P31-01 A': "one line, the function name cut at its end (Transfer From Public To Privat…), the app chip capped at 96 px and cut at its end; the chip never shrinks below its cap, so a short app name (NEMI) always shows in full." Send, receive and receipt rows unchanged. The two-chip row: OA-1.
- The details App row, P29-02 A / P31-02 A: "The label stays left and the value is right-aligned in the mono role, breaking at any character onto a second line, the row growing (as drawn)."
- Home, P29-03 A: "The full hero (the balance, both Fee Juice figures, Send and Receive) stays fixed under the account header with a scroll shadow beneath it; only holdings and activity scroll; the nav stays fixed." The 16 px top padding of the middle is `o-layout-a`'s.

## Phases

### Phase 1: dApp rows on one line, nothing scrolls sideways, the App row (#583) ✓

Files: as Architecture (rows and App row), and `tests/e2e/helpers/activity-seeds.ts` (`seedJournalRecord` gains a `dapp_execute` form with `title` and `subtitle`; `seedTransaction` gains an optional `method`).

Tests:
- Component tests in the three card tests, with the wire forms `swap_exact_tokens_for_tokens_supporting_fee_on_transfer_tokens` (62 characters) and `staging-nemi-interface.nemi-e65.workers.dev`. A row with an origin and no direction cuts its title and shows the origin in `activity-app-chip`. A transfer row never cuts its title or uses the app chip (the success control). The settled two-chip row groups both chips and cuts nothing. These replace the awaiting pin at `:126-128`.
- One new smoke test in `rows.test.ts`. Seed three rows: a terminal dApp record with both long names, one with "NEMI", and a settled dApp transfer with the long host. Then, on Home and on History:
  - the `:520` walk (from `tx-terminal-card` and `tx-card`) finds no ancestor or document wider than its box;
  - the long `activity-title` is cut on one line;
  - the long app chip is at most 96 px wide, and the "NEMI" chip is uncut.

  Then open the settled row's details and check `tx-detail-app` against the label (`tx-detail-app-label`, new): its right edge is at the box's inner edge (±0.5 px), it starts at least 16 px after the label, and it spans two lines. Failure mode: a row or the App value widening its page; jsdom has no layout. Estimate: 20 s per browser; record the measured time.
- In `:654`'s existing loop, assert that the send and receipt `activity-title` is uncut. This adds no scenario.
- Red proof: run the new test on the base first. Its core reads use testids the base already has.

Validation gate: `bun run lint`, `bun run typecheck:all` and `bun run test` exit 0. Then, after the armed Chrome build (recon § Facts), `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0` passes; after the armed Firefox build, the same with `NULO_E2E_BROWSER=firefox`.

### Phase 2: Home's fixed hero over a scrolling middle (#592) ✓

Files: as Architecture (layout). `network/store-captures.test.ts:276-280` finds the scroller by `home-scroller` and drops its "balance stays whole" bound.

Test: one new smoke test in `rows.test.ts`, on a seeded Home whose middle overflows, with no media emulation (Firefox has none).
- The shadow's polled computed opacity reads 0 at rest. After `home-scroller` scrolls 200 px, `balance-amount`'s top has not moved and the opacity reads 1.
- With a `tx-card` scrolled under the shadow's band, `elementFromPoint` in the band lands inside that row, and a real click there opens its details route.
- At a 360 x 900 and a 480 x 900 viewport (the Chrome side panel's tall shape; no e2e opens the panel itself), the hero stays put while the middle scrolls and `bottom-nav` sits at the viewport's bottom.
- With focus on a holding row, PageDown raises the middle's `scrollTop` (polled).

Failure mode: a hero that scrolls away, a shadow shown at rest, or a shadow that catches a press. Only a browser lays out and scrolls. Estimate: 20 s per browser. Red proof on the base.

Validation gate:
1. Phase 1's gate, with `navigation.test.ts` and `snackbar.test.ts` added to both browsers' runs.
2. With load1 < 150: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/snack-placement.test.ts` passes, then the same with `NULO_E2E_BROWSER=firefox`.
3. `STORE_CAPTURES=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts` (Chrome) fits Home. Then restore the PNGs it wrote with `git checkout -- apps/extension/store/captures`: new store images are the owner's call (open item).

### Phase 3: rebase, evidence, full gates

1. `git fetch origin dev`. If testers-fixes-1 has landed, rebase the unpushed branch (merge if pushed). If its #582 restores Home's scroll by element, point it at `home-scroller` and run its test.
2. Run Phase 1 and 2's tests with `NULO_E2E_SHOT_DIR` for both themes: Home at rest and scrolled with a priced row in the shadow band, the long-name rows, the two-chip row, the App row (`shotSend`).
3. Gate: first `bun run audit:vue`, `bun run test:all` and `bun run --cwd apps/extension build-storybook` exit 0 (`audit:vue` writes an unarmed dist). Then rebuild armed and run the full smoke suite at `--retry=0` on Chrome and Firefox while load1 < 150, recording each wall-clock; otherwise record why and rely on the PR's CI.

## Delivery

One arc on the branch `worktree-testers-fixes-2`, with no stack. Create the PR with `gh pr create --base dev --title "fix(home): one-line activity rows, a fixed hero over a scrolling middle, a wrapping app row"` (91 characters).

The body states what changed and why, quotes the three signed picks with light and dark screenshots, names OA-1, OA-2 and N-1 as shipped, lists the validation runs and each browser's smoke wall-clock (dev's last CI run, this PR's run), and ends with `Closes #583` and `Closes #592`.

Open it with no label: the smoke and network path filters cover `apps/extension/**`. The close-out lands as the PR's final commits.

## Post-implementation

Standard: `implementations-plan/README.md` § Post-implementation standard at 493ff497. Plan-specific values:

- Loop: single-arc, over the net diff from 493ff497, after Phase 3. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then resume with `resume-codex.sh`. Stop after three rounds with material findings. `code_review: off`.
- Every Codex prompt carries the README's two verbatim rules and the adversarial ask. It adds: "a change to what a person sees outside the three quoted picks is out of scope; report it, do not fix it".
- Close-out: the Outcome; lessons promoted only if general; `STATUS.md` deleted; the archive move in its own commit; `bun run check:plans` green. File, deduplicated first:
  - open issues: Send and Receive are not keyboard-operable (`ActionButtonsView.vue:42,46`); the store captures show the old Home.
  - closed `known-limit` issues: a listed row hidden under the hero still lifts the snack (`snackInset.ts:89-118`; needs two or more awaiting rows scrolled away and an error snack); a dApp token's symbol (up to 32 characters) is never cut in a send row, so it can widen the page.
- Teardown after the merge: `agent-worktree done testers-fixes-2 --merged`.

## Panel verdicts

| Round | Codex (gpt-6.1-sol) | Opus Plan leg |
|---|---|---|
| 1 | reject, 8 findings | conditional approve, 8 findings |
| 2 (resume) | conditional approve, 4 conditions, all accepted | — |
| 3 (resume) | **approve**: the four conditions verified, no regression | — |

Round 1 accepted: send rows changed (Codex 1-2, Opus 1): D1 and D3 rewritten, an `:654` assertion added. No Firefox media emulation (Codex 5, Opus 2): opacity polled. Popup sizing (Codex 5): I2 with its evidence, the full smoke on both browsers. Network specs (Opus 3): `snack-placement` gated, `store-captures` updated. z-index tie (Opus 4): `isolation`. Gate hygiene (Opus 7): armed builds, estimates, red reads on existing testids, geometry instead of the App row's unit test. Wording (Codex 7-8, Opus 8). Keyboard and wheel over the hero (Opus 5): N-1. Snack under the hero (Opus 6): a known limit.

Round 1 rejected: `tabindex` (Codex 3), measured, see D6. A hero known limit (Codex 6), measured: no path. OA-1 pending until answered (Codex 1): the cap is signed and the row cannot stay as today (an unbreakable name widens it); only the chip's line is unsigned (OWNER-ASKS OA-1). Codex withdrew it in round 2.

Round 2 accepted: the App row moves into Phase 1, whose test reads it (C1); the toolbar panel is not the side panel, so Phase 2 adds tall viewports (C2); the click-through proof clicks a real row under the band (C3); the App label gets a testid (C4).

Size: 154 lines against the 150 target; the overrun is the record of panel rounds 2 and 3.

## Audit verdicts (implementation)

Net diff against `origin/dev` after Phase 3's merge; Codex gpt-6.1-sol at high, session 01a1476b; one Opus review alongside round 1.

| Round | Codex | Opus | Accepted and fixed |
|---|---|---|---|
| 1 | approve with changes, 2 low | approve with changes, 1 medium, 3 low, nits | all; see below |
| 2 | approve: "accepted fixes verified; no new material findings", 1 low | — | the low |

Round 1: the scroller's `isolation` (and the hero's `z-index`) scoped a popup's scrim drawn in the middle under the hero and the nav (Opus, demonstrated red in a browser probe: `{ hero: false, nav: false }`); neither is a stacking context now and the shadow carries `z-index: 2`, pinned by a scrim probe in the Home scenario. A dApp whose name sanitizes to `""` got no chip and so no cut, and an unbreakable function name still widened Home (Opus, traced through `discoveryDappMetadata` and `sanitizeJournalSubtitle`); the journal cards now cut by the op's kind (`buildJournalTerminalCardProps`, the awaiting card's parent), pinned in `journal-state.test.ts` and by a nameless row in the rows scenario. Tests: the chip checked at 96 px and the two-chip row's app chip below its direction (Codex 1); the App value's first line filled to within a glyph, which only break-anywhere does (Opus 4); Home read where the reload lands, since a hash set before the start-up navigation settles is overridden (Opus 3, the probe showed it). Comments trimmed or made exact (Codex 2, Opus 5).

Round 2: the shadow's comment promised a scrim drawn in the hero covers the frame, but the positioned hero bounds it (no hero child mounts a popup); scoped to the middle. The loop converged.

## Seeds

```
/goal Phases 1-3 of implementations-plan/testers-fixes-2/plan.md are marked ✓, each backed by its validation gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass reporting no new material findings, quoted; the PR to dev exists, created after convergence, with Closes #583 and #592 and the close-out commits (git show --stat of the archive move in the transcript); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/testers-fixes-2 forward per its plan.md and the README § Post-implementation standard at 493ff497. Each firing: read plan.md and lessons/; if the plan is archived on origin/dev, run agent-worktree done testers-fixes-2 --merged and stop. Otherwise take the next unchecked step, run its gate, mark ✓ only on a green gate, log consults in lessons/. Change nothing a person sees beyond the three quoted picks; an open question goes to Codex, a visual one to OWNER-ASKS.md. Never merge.
```
