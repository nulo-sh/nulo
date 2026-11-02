---
plan: landing-launch-1
tier: light
status: plan approved (final Codex pass); arc 1 in progress
issues: none (the owner's request of 2026-11-02 in chat)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 1e6c5bc1f; standard: implementations-plan/README.md § Post-implementation standard at 1e6c5bc1f
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit round trip and an Opus Plan leg; final fresh Codex pass
---

# Landing for launch: store buttons first, the signup for updates

The store listings go live in early November. The owner, 2026-11-02: "have a draft PR changing the landing to modify the landing to: subscribe to receive updates (instead of go live action) + change the button (as we used to have it) to 'add to chrome' or 'to mozilla' (we already had that, so it's just 'rolling back' / 'reusing that idea')." Those words sign the change; the exact copy is the owner's to sign on the draft PR, from the table in its body. nulo.sh changes at the next promote, since the landing deploys from `main`.

## Outcome & Quality Bar

- **For whom**: a person who opens nulo.sh on launch day, on desktop or a phone, and wants Nulo in their browser now; second, a person who wants news later.
- **Excellent**: (1) desktop Chrome, Edge, Brave and Opera see one "Add to <browser>" button to the Chrome Web Store, desktop Firefox "Add to Firefox" to Firefox Add-ons, each with an "also on" link to the other store, and Safari, phones and no-script visitors see both store buttons and "Nulo runs on desktop Chrome or Firefox"; (2) no line on the home page, How Aztec works or `/subscribed` says the wallet is not out yet (the website privacy notice still does: OA-8).
- **Good enough**: #49's accepted limits stand: a phone in "desktop site" mode gets one button its store refuses; the fallback shows for a moment on a slow load, and narrowing it after first paint can move the centred hero plate (Phase 3 records by how much); on How Aztec works a detected visitor's nav offers one store, the other two hops away through home (OA-5 would add it).

## UI impact

Every surface below changes; the "ships now" column is the proposal the draft PR carries, with alternatives in `OWNER-ASKS.md`.

| Surface | Today | Ships now |
|---|---|---|
| Nav button, home and How Aztec works | `Notify me` → hero field | #49's: `Get Nulo` → `#get` on home, `/#get` on How Aztec works; detected: `Add to <browser>` → its store |
| Hero action | signup form, ghost button, small line | `Chrome Web Store` and `Firefox Add-ons` (detected: one `Add to <browser>`), ghost button, #49's small line (detected: "free · about 30 seconds · also on Firefox"), then the signup form under them |
| Both signup forms | "Get an email when Nulo is live", `Notify me`, the availability line | "Get updates by email", `Subscribe`, no availability line; `On the list` / `Try again` stay |
| `#get` small print | "One email at launch, then occasional updates. …" | "Occasional updates. Unsubscribe in one click. …" (the rest unchanged) |
| `#get` closing row | `Source on GitHub`, builder line | the store buttons and #49's small line first, then both as today |
| `/subscribed` | "We'll write when Nulo is live." | "We'll send occasional updates." |
| `og.png` | the hero with the signup form | recaptured from the new hero, fallback state (README rule) |

## Assumptions

**Facts**
- F1. `mountInstall` still runs on every page (`apps/landing/src/main.ts:11`) and reads only `data-install="primary|secondary|nav"`, `data-install-other`, `data-install-detected`, `data-install-fallback` (`install-dom.ts:8-21`). Commit `048c7a6b7` removed that markup and also changed tests, the README, `install.ts`'s comment and added `.soon`; the plan restores the markup selectively, not the commit.
- F2. `STORES` (`install.ts:2-5`) holds the two URLs `legal/terms.md` § 1 carries (lines 34-36); no test holds them together (recon.md, search trail).
- F3. The landing has one palette: `:root` in `@nulo/design/base.css` is the dark one and `apps/landing` sets no theme, so a light-scheme capture equals the dark one.
- F4. `page.test.ts:41-43, 80, 83, 99-112, 125-131, 167` and `install.test.ts:113-120` pin the copy and markup that change; `README.md:15` says both pages serve the store URLs, which under D5 holds for `index.html` only.
- F7. `legal/website-privacy.md:12, 80` promise "one email when Nulo is on the stores"; the `#get` print links that notice; the lane changes no legal page.
- F8. `BEFORE-LAUNCH.md:109-112`: the Chrome listing stays unlisted until the release announcement and AMO keeps its "experimental" flag, both unchecked owner steps; any promote after the merge publishes the buttons (OA-9).
- F5. The subscribe Worker (`infra/subscribe`) holds no user-facing copy: it answers a 303 to `/subscribed` or `{ "ok": true }`. The lane leaves it and `apps/landing/src/worker.ts` alone.
- F6. Headless Chrome's user agent says `HeadlessChrome/`, which `detectInstall` reads as no detection (`archive/landing-store-buttons/lessons/phase-3.md`).
- Brief claim that did not hold exactly: it says "Add to Chrome" for every Chromium browser; #49, signed by the owner ("Name the browser"), names Edge, Brave and Opera. The plan keeps #49 and asks (OA-1).

**Inferences**
- I1. The hero plate, one row taller, still clears the REC and CAM labels in the 820 px desktop hero; Phase 3 measures it. If not, the hero grows, as #1242 grew it, and the PR table says so.
- I2. The hero form (`width: 100%`) wraps onto its own line inside `.cta`; Phase 3 shows it.

**Asks** (answered on the draft PR; the arc builds the "ships now" column without waiting): OA-1 to OA-9 in `OWNER-ASKS.md`.

## Architecture & Implementation

- **Shape**: markup and copy only. The install markup returns as #49 served it, read by the unchanged `mountInstall`; the forms keep their markup, ids and script, with new words. No new module, style rule or dependency unless Phase 3's captures show a layout break.
- **One constant**: `STORES` stays the only definition the script uses. The HTML must carry the hrefs for no-script visitors, so a test holds every store link in the HTML to `STORES`, and `STORES` to Terms § 1. Rejected: writing the hrefs at build time from `STORES` (a Vite HTML plugin for two strings; #49 deleted one).
- **Hero order**: inside the hero's `.cta`: the two store links, the ghost link, the small line, then the form, so DOM order is visual order.
- **Change map**: `apps/landing/index.html`, `how-aztec-works.html`, `subscribed.html`; `src/install.ts` (doc comment only); `src/install.test.ts`, `src/page.test.ts`; `README.md` (file map, the signup note, "absent until the store listings open"); `public/og.png`.

## Security & Adversarial Considerations

- **Threat**: a wrong store URL sends a visitor to a lookalike listing. Tests hold every served store link to `STORES`, `STORES` to Terms § 1, and the Chrome id to the release scripts (existing pin).
- **Input**: none new. `mountInstall` writes `href` and `textContent` from a fixed table; no `innerHTML`.
- **CSP and origins**: unchanged; links are navigations, and the built-site test already allows exactly the two store URLs in the JS.
- **Supply chain**: no new dependency; captures use the locked puppeteer from `apps/extension`, from a script outside the repo.
- **Privacy**: no new request; the store sees `nulo.sh` as referrer (`strict-origin-when-cross-origin`, `public/_headers`), as under #49.

## Phases

### Phase 1: before-captures (tree at base) ✓
1. Build at base: `bun run --cwd apps/landing build`. Serve `dist/` with `vite preview --port <p> --strictPort`, `<p>` claimed in `~/.agents/ports.md`, in its own process group.
2. Capture the nav and hero, `#get` and `/subscribed`, at 1280 × 800 and 390 × 844, with reduced motion and the clock hidden, under the dark and light schemes. Compare the two schemes' hashes.
3. Stop the server by its process group. Free the port.
- **Validation gate**: every capture exists; dark and light hashes are equal (else capture both and say so). Layers: none (evidence only).

### Phase 2: markup, copy, tests, docs ✓
1. Write the tests first and run them red on the base markup.
   - `install.test.ts`: every link to a store domain in each page is a `STORES` URL (success control: `index.html` serves both); both `STORES` URLs sit in Terms § 1.
   - `page.test.ts`, the install contract with exact counts and hrefs: per block (hero, `#get`), one `data-install="primary"` to Chrome, one `secondary` to Firefox, one `hidden` `data-install-detected` span holding one `data-install-other` link, one `data-install-fallback` span; per page, one nav `data-install="nav"` link `Get Nulo` to `#get` or `/#get`; nothing else carries `data-install`.
   - `page.test.ts`, the copy and wiring: the new label, button, print and `/subscribed` words; no availability line; every `aria-describedby` token names an element inside the same form (the hero field has none, the `#get` field `print-get`); the hero form comes after the store links.
2. Edit the three pages, `install.ts`'s comment and the README as the UI impact table says. Run the tests green.
- **Validation gate**: `bun run --cwd apps/landing test` (0 failed; the markup and copy cases red before step 2 and green after; the Terms pin passes at base, a drift guard); `bun run --cwd apps/landing typecheck`; `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun test scripts/release/store-copy-run.test.ts`. All exit 0. Layers: lint, typecheck, unit.

### Phase 3: after-captures, browser check, og.png ✓
1. Build the head (`bun run --cwd apps/landing build`). Run `bun ~/.cache/nulo-backlog/landing-launch-1/capture.ts <worktree> after <out> --check --og apps/landing/public/og.png`: it claims a port, serves `vite preview` in its own process group, drives Puppeteer's Chrome, and stops both at exit.
2. It captures Phase 1's views, plus Chrome and Firefox user agents at 1280 px, a Chrome user agent at 390 px and the no-script state at both widths. Then run `bun ~/.cache/nulo-backlog/landing-launch-1/capture.ts <worktree> after-firefox <out> --check --firefox`: the same checks in the e2e suite's pinned Firefox (`E2E_FIREFOX_REVISION`, 158.0 at base), which proves real Firefox detection in the detected desktop state. Record each browser's version.
3. Assert, per state: the visible store links, labels and hrefs per block on both pages; on every desktop state and the 390 px Chrome state, the Tab order on home equals the expected list (nav → store link(s) → ghost → also-on, detected only → field → `Subscribe`), so a hidden button never takes a stop; in every fallback state, the nav link lands on `#get` (home) or `/#get` (How Aztec works) with the heading below the sticky bar; no console or CSP error on the three pages; no horizontal overflow at 390 px; at 1280 px the hero plate stays inside the hero and clear of the REC and CAM labels, also with the form's error line shown (a submit against `vite preview`, which runs no Worker, answers the retry error).
4. The `--og` run recaptures `public/og.png` as #49 did (fallback state, reduced motion, clock hidden, `clip.scale`, `deviceScaleFactor: 2`) and fails unless it reads back as a 1200 × 630 PNG holding only `IHDR`, `IDAT` and `IEND`.
- **Validation gate**: both runs print `ALL ASSERTIONS PASSED` (Chrome alone proves the CSP claim: Firefox's BiDi console may not carry CSP reports); Phase 2's gate reruns green. Layers: browser (scratch), unit.

## Decision ledger

- D1. Restore #49's markup rather than new markup: `mountInstall` and its tests serve unchanged, and the behaviour is owner-signed.
- D2. The PR opens as a draft, as the owner asked, against the implementer brief's "open ready": readying it later reruns CI, which a landing PR keeps short (no e2e lane).
- D3. Captures: one commit adds `apps/landing/pr-screens/`, the next removes it; the PR body links them at that commit (#49's precedent), so the squash carries none.
- D4. No DOM test environment: markup-contract tests plus the Phase 3 browser check, as #49. Rejected: happy-dom for one module (a dependency for one test).
- D5. Footer store links stay out (the brief's "no other change"); OA-5 offers them.
- D6. `install.ts`'s comment returns to #49's final wording (`index.html` carries the same URLs for visitors without JavaScript); `README.md:15` says the same.
- D7. The Firefox listing's id is checked once against AMO's public API (guid `wallet@nulo.sh`) and the result goes in the PR body; no code, as the Chrome id already has its pin.
- D8. Deviation found by the captures: in `#get` the store line and the builder line, two `small`s in one flex row, ran together; one rule in `page.css` (`.cta small + small { flex-basis: 100%; }`) starts the second on its own line. Shown in the PR's captures.
- Rejected: dropping `typecheck:all` and `test:all` from the gate as more than a landing diff needs (Opus); the common brief makes them every phase's layers.
- A11y, decided under the owner's 2026-10-19 delegation: the store actions are links named by the store or "Add to <browser>"; `hidden` takes a narrowed button out of the Tab order and the accessibility tree; the other store stays reachable through the "also on" text link in both blocks; DOM order is the visual order; the 2 px accent ring of `overrides.css:40-44` covers the links; no positive `tabindex`.

## Audit verdicts

- **Codex round 1** (Sol, high): `conditional approve` on ARIA cleanup, page-specific fallback targets, complete browser gates and owner approval of the hero layout. All seven findings adopted (log: `lessons/phase-0.md`): exact-count install test, F1 corrected, measured plate criteria incl. the error state, OA-7, `#get` / `/#get`, `aria-describedby` resolution, a named gate command with a real Firefox pass.
- **Opus Plan leg**: `conditional approve` on narrowing Outcome (2), a website-privacy ask, a merge-timing ask, a checked (not logged) Tab order, and Phase 3 rerun after the last change. Adopted: Outcome (2) narrowed with F7 and OA-8; F8 and OA-9; Tab order compared to an expected list; Phase 3 reruns after the loop (Post-implementation); the Terms pin's gate wording; `README.md:15` and the comment (D6); the AMO id check (D7); "to mozilla" named in OA-1; the plate shift and How Aztec works' single store under Good enough; the phone fold under OA-7. Rejected: trimming the gate (ledger).
- **Final fresh Codex pass** (Sol, high, new session): `conditional approve` on the Firefox pin (the suite pins 158.0 in `firefox-revision.ts`, not 153.0.4) and on Phase 3 claiming more than `capture.ts` asserted; a low finding on `og.png` validation. All adopted (script reads the pin, asserts the no-script Tab order, both pages' fallback landing, three pages' console, the PNG read-back; the plan's claims narrowed to match). Resumed: `approve`.
- **Fix loop** (Sol, high, `1e6c5bc1f..HEAD` plus `capture.ts`), with one Opus `general-purpose` review beside round 1: both `no material findings`; six lows adopted (`lessons/phase-3.md`). Round 2, resumed over `fa14b81a2`: `no material findings`, converged. Phase 3 reran on the final head: both browsers `ALL ASSERTIONS PASSED`, `og.png` byte-identical.
- **Auto-continue**: no ask holds the arc. The lane brief makes the draft PR the place the owner answers OA-1 to OA-9, and the draft cannot merge before the owner's word.

## Delivery

Single arc, single PR from `worktree-landing-launch-1` to `dev`, as a draft: `feat(landing): the store buttons lead the page again, and the signup becomes updates` (84 characters). Body: what and why, the copy table (block, today, proposed), before/after captures, the browser check, the a11y calls, the validation runs; it closes no issue. The plan's close-out lands as the PR's final commits.

## Post-implementation

The standard named in the front matter governs; plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2, once over the whole diff from `1e6c5bc1f` after Phase 3, with `capture.ts` attached to round 1 (it is the gate and sits outside the diff): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`general-purpose`) beside round 1. Hard stop after three rounds. Log rounds in `lessons/phase-3.md` and under Audit verdicts.
- Before step 3: rerun Phase 3 on the final head if the loop changed markup or CSS, then commit the captures under `apps/landing/pr-screens/` and remove them in the next commit (D3).
- Step 3: `gh pr create --draft --base dev`; an owner copy edit on the PR later reruns Phase 3 the same way; then the close-out commits, `bun run check:plans` green after staging; then `gh pr checks <n> --watch` once.
- Step 5: after the merge, `agent-worktree done landing-launch-1 --merged`. This session runs headless and arms no wait; the orchestrator's next session in this worktree runs it.

## Seeds

```
/goal Phases 1-3 of implementations-plan/landing-launch-1/plan.md marked ✓, each gate's output in the transcript; the Codex loop converged (a resumed pass reporting no new material finding, quoted); the draft PR to dev open with the copy table and captures; the close-out committed; bun run --cwd apps/landing test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/landing-launch-1: read plan.md, run the next ✗ phase and its gate, then the Post-implementation steps; never merge; copy questions go to OWNER-ASKS.md and the PR table, never guessed.
```
