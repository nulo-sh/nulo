---
plan: landing-explainer-1
tier: light
status: approved 2026-10-17; arc 1 open as draft (#723); arc 2 implemented 2026-10-18, a draft until the owner approves the clips (OA-8)
issues: "#588 (Refs only: onboarding-3 closes it; no arc here closes an issue)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off (the plan's own explainer; the page's clips are arc 2)
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol, high); one Opus Plan leg
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# landing-explainer-1: the How Aztec works page on nulo.sh

Two arcs, each one PR against `dev`, no stack (D-orch-1). Arc 1 ships the page at the fixed address `https://nulo.sh/how-aztec-works` (P33-03 A, P39-11), each card carrying its text version. Its PR stays a draft until the owner answers OA-1 to OA-3 and a Cloudflare preview of it exists (OA-6). Arc 2 adds the three clips after OA-4, the owner's own go-ahead and a spending cap. Approved by the orchestrator on 2026-10-17, which settled OA-5 = A (unlinked), OA-6 = A (manual preview, no branch builds) and OA-7 = A (ships now, quoted in the PR), kept OA-1 to OA-4 with the owner, and reversed D9. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Brief claims that did not hold

- **"Light and dark" screenshots:** the landing has one theme, dark (`@nulo/design/base.css` gives an unthemed root the dark palette). The PR shows desktop and phone, dark.
- **"Watch it through the Cloudflare preview":** no `nulo-landing` branch build has been observed: its Workers Builds check appears on `main` commits and on no `dev` commit or PR touching `apps/landing` (recon). The PR cannot get a preview by itself: OA-6.
- **P39-11 C, "shows not found until it ships":** the address answers 200 with the home page (SPA fallback, live check 2026-10-17). A page missing from the build fails silently, so arc 1 adds a CI check (D4).
- **"Aztec docs at 6.0.0-rc.3":** the docs left `aztec-packages`; they were read at `aztec-labs-eng/aztec-node` tag `v6.0.0-rc.3`. Their claim that side-effect counts are padded is false in rc.3 code, so no script makes it.

## Outcome & Quality Bar

For a new Nulo user who taps "How Aztec works" on Home and lands in a tab, and for a visitor from search. Excellent: (1) every sentence on the page is true at rc.3 and traceable to recon's sources, in the wallet's own words, and says no more than the record hides; (2) the page is the landing, unchanged in its rules: same header, grain, plates, footer and CSP, no third-party request, no horizontal scroll at 375 px. Good enough: no clips until the owner approves; the text versions carry the page.

## Architecture & Implementation

- **Shape.** A hand-written static entry `apps/landing/how-aztec-works.html`, a second Vite input that Cloudflare serves at `/how-aztec-works` as it serves `terms.html` at `/terms`. It loads `/src/main.ts` unchanged: `mountPage` draws the grain and `mountInstall` narrows "Get Nulo" (both page-agnostic, recon). No new TypeScript.
- **Markup, as the drawing `p33-aztec-a`.** Head per OA-7. Body: skip link; `pre.grain`; the bar (brand → `/`; "How it works" → `/#see`; "How Aztec works" with `aria-current="page"`; "Get Nulo" `data-install="nav"` → `/#get`); `main` holding one `section.s > .wrap` with an `h1` "How Aztec works.", the two sentences as `.lead` on the grain (as `index.html:164` does), and a `.three` row of three `article.plate` cards (`id` `private-balances`, `proofs`, `fees`), each a mono number 01 to 03, an `h2` title styled as the home's `.three h3`, and its text version; the home's footer.
- **Styles.** A short block in `src/styles/page.css`: the page `h1` at the hero `h1`'s size (54 px, 40 px at 900 px and narrower) with the `.h2` halo; the card number; the current-page nav state. Existing tokens only.
- **File map, arc 1.** New `how-aztec-works.html`. Changed: `vite.config.ts` (input), `public/sitemap.xml`, `src/styles/page.css`, `src/install.test.ts` (D3), `.github/workflows/pr-quick.yml` and `CI.md:33`, which describes its step (D4), `README.md` (file map, the page).
- **Arc 2, fixed now.** Media is self-hosted from the build: hashed under `/assets/` where Vite rewrites the attribute (it does for `video`, `source` and `track`), else `public/clips/`. No autoplay, `preload="none"`, captions always available, the text version stays under the clip, total media at most 20 MB. The CSP changes only with a reason written here first. With OA-4 A, the player and scenes are bundled modules (the CSP refuses inline scripts), with one root and one timings file per card; this is a page-level player the arc 2 loop reviews like any code.

**Decision ledger.**

| # | Decision | Alternative rejected, and why |
|---|---|---|
| D1 | Cards carry text versions now | The drawn tiles with a feed still and a play glyph: a glyph with no clip is a placeholder, and a feed without a topic says nothing |
| D2 | Reuse `src/main.ts` | A page entry would repeat its two calls |
| D3 | Hand-written HTML; header and footer copied; the store-URL test reads every landing page | A generator like the legal pages' (they exist because they come from Markdown), or a partials plugin: a mechanism for two static pages. The copy that must not drift (store URLs) is pinned |
| D4 | CI requires `dist/how-aztec-works.html` beside the legal pages | A unit test of the Vite input: only a build proves the file ships, and CI already builds the landing |
| D5 | Clips are arc 2, a separate PR off `dev` after arc 1 merges | Clips in arc 1's draft: production waits on OA-4, which may come after the release the wallet link needs |
| D6 | Clips are produced outside the lane, in a session the owner authorizes; arc 2 integrates approved files | Both skills require the owner's own words and spend money; a relayed brief may start neither |
| D7 | Text versions start from the wallet's signed glossary, narrowed where it says more than the record hides | New wording: more to approve, and a second voice |
| D8 | The drawing's "3 clips" eyebrow waits for arc 2 | Shipping it now: false until clips exist |
| D9 | Reversed by the orchestrator (D-orch, 2026-10-17): arc 2 stays in this lane, held until the owner answers OA-1 to OA-4, and the close-out ships with arc 2, never with arc 1 | The planner's version (close out with arc 1 and file the clips as an issue): the lane brief makes the clips this lane's arc 2 |
| D10 | Each clip is an SVG stage whose scenes are pure functions of time, cued to words of the narration's alignment, in a page-only entry `src/clips/index.ts` | Canvas: text the page's fonts cannot style and no DOM to test; one shared entry: the home page would load the clips |
| D11 | Media under `src/clips/media/`, hashed into `/assets/` (Vite rewrites `audio` and `track` `src`), and `build.assetsInlineLimit: 0` | Vite inlined the 1 to 2 KB caption tracks as `data:` URLs, which the CSP refuses for media; `public/clips/` would lose the immutable cache. No other asset was small enough to inline, so the build output is otherwise unchanged |
| D12 | Captions: one line under the stage from `captions(timings)`, and the same lines as a WebVTT `<track kind="captions" default>` on each `audio`, pinned equal by a test | Browsers draw no captions for audio, so the track alone shows nothing; the line alone leaves the audio without a captions file (Biome's `useMediaCaption`) |
| D13 | The transcript under the card's text, collapsed; no chapters | Chapters need a title per scene, words the owner has not seen (OA-9). OA-4 A named both |
| D14 | Narration as written: `eleven_v4`, the key file's voice, no emotion tags; the skill's script review and four-look board skipped | P42-01 to -03 A approved the words, and tags would change what is sent; P42-04 A picked the landing's look |
| D15 | One clip speaks at a time; a hidden tab pauses; the big play square shows only before the start and after the end | A square on a paused clip would hide the picture being looked at |

## Phase 1 (arc 1): the page ✓

Assumptions: F1 to F10, I1. Steps:

1. Add `how-aztec-works.html` as above, with the text versions and head copy from OWNER-ASKS. Keep every copy string free of an em dash joining clauses.
2. Add `"how-aztec-works.html"` to `input` in `vite.config.ts`.
3. Add the address to `public/sitemap.xml`.
4. In `src/install.test.ts`, run the store-URL pin over `index.html` and `how-aztec-works.html`.
5. In `pr-quick.yml`, rename the step "Verify the pages shipped" and add `how-aztec-works.html` to its list. Say "the pages" in `CI.md:33`.
6. Add the page to `README.md`'s file map. Note that its copy rule covers the home page.

**Tests.** The extended store-URL pin (a changed store link on either page fails; `index.html` is the success control) and the CI dist check. No e2e scenario: the landing has no suite, and the browser check below is a gate, not a committed test.

**Validation gate.**
- `bun run lint && bun run typecheck:all && bun run test:all`: exit 0.
- `bun run --cwd apps/landing build`: exit 0. Then the CI step's loop: exit 0, and `dist/how-aztec-works.html` names a hashed `/assets/*.js`.
- The same loop with a file name that does not exist: exit 1 (the failing control).
- `bun run --cwd apps/landing deploy:dry`: exit 0.
- `bun run test:ci-gating && bun run test:release && bun run lint:actions`: exit 0.
- Browser check, from a scratch script under `~/.cache/nulo-backlog/landing-explainer-1/` that imports Puppeteer and `apps/extension/tests/e2e/port-registry.ts` by absolute path:
  - Pick a free port and record it with `claimPorts` (retry on `PortClaimConflict`).
  - Spawn `node_modules/.bin/vite preview --strictPort --port <port>` with `cwd` set to `apps/landing`, detached, in its own process group (production CSP).
  - At 1440×900 with a desktop Chrome user agent: the title is "How Aztec works | NULO", the `h1` reads "How Aztec works.", the nav link has `aria-current="page"`, and "Get Nulo" reads "Add to Chrome".
  - At 375×812 with a phone user agent: the same title and `h1`; `scrollWidth` ≤ 375; the button reads "Get Nulo".
  - At both widths: no console error, no CSP violation, and `pre.grain` holds text after one second. Save both PNGs for the PR.
  - In `finally`, kill the process group, then call `releasePorts(runId)`.

## Phase 2 (arc 1): the owner's answers

1. Apply the answers to OA-1 to OA-3 and OA-7 to the page.
2. On OA-5 B or C, add the home link; check it at 1440 px and at 375 px.
3. Run the Phase 1 gate. Resume the Codex session once on the change.
4. When the owner has run OA-6 A's command on the PR's latest commit, load `/how-aztec-works` on that preview; expect the page's title. Put the link in the PR body.
5. Mark the PR ready only when the orchestrator says so.

## Phase 3 (arc 2): the clips ✓

Owner picks (2026-10-17/18, quoted by id): P42-01, P42-02, P42-03 = A, "Approve the script and the card's text as written"; P42-04 = A, "The explainer skill: drawn scenes in the landing's look; your yes, your cap and voice or captions in the note", and in chat: "regarding voice: just use the voice we have set on our eleven labs file". Cap, set by the orchestrator under that yes: 15,000 ElevenLabs characters.

Done: narration outside the repo (D6), 2,179 characters in one take per clip (Private balances 58.9 s, Proofs 50.7 s, Fees 40.6 s); the player and scenes (D10 to D15); each clip at the top of its card over the text version; the "3 clips" eyebrow; `README.md`. Media 2.4 MB in all. Tests: `timeline.test.ts` (cue lookup per scene, caption lines) and `clips.test.ts` (one player per clip, every cue spoken, preload none and no autoplay, the track equals the captions, the transcript equals the narration, media within 20 MB); each was proved red by a mutation. Gate results: `lessons/phase-3.md`. The clips go to the owner as OA-8.

## Security & Adversarial Considerations

- **Surface.** A static page: no input, no form, no new script, no third-party request, CSP and `frame-ancestors 'none'` unchanged, Workers Logs off. The realistic harm is a false privacy claim on a public page. Each claim cites rc.3 docs or research, and no script says the record hides who was paid, the transaction's shape, or a public part (recon; audit round 1).
- **Supply chain.** No dependency change; frozen lockfile and the 7-day age gate stand.
- **OA-6 B (branch builds).** A branch build runs that branch's own `deploy:preview` script with the Workers Builds token, which can deploy nulo.sh. Any pushed branch, an agent's included, would hold that power; whether fork PRs build is unverified. The plan recommends A (a manual preview); B is the owner's security call. The lane changes no Cloudflare setting.
- **Arc 2.** What left: the three approved scripts, 2,179 characters, to ElevenLabs, through the `explainer` skill's launcher, which alone reads the key. No Higgsfield job. The page fetches its audio and captions from its own origin only after a press; no new header, no new script source.

## Assumptions

- **F1** Cloudflare serves `/terms` from `terms.html` (live: 200, "Terms of Use | NULO").
- **F2** An unknown path answers 200 with the home page (live; `wrangler.jsonc` `not_found_handling`). `vite preview` falls back to `index.html` the same way, so the browser check asserts the page's own title and `h1`.
- **F3** `mountPage` and `mountInstall` guard every query (`feed-dom.ts:183-209`, `install-dom.ts:4-22`).
- **F4** The CSP has `default-src 'self'` and no `media-src` (`public/_headers:3`).
- **F5** No `nulo-landing` branch build observed (check runs, recon).
- **F6** The landing has one theme (`packages/design/src/base.css:64-66`).
- **F7** Root `bun run test` runs only `apps/extension`; `test:all` includes the landing (`lessons.md`, root `package.json`).
- **F8** CI builds the landing when `apps/landing/**` changes (`pr-quick.yml:110-118,324-343`).
- **F9** No test pins the dist step's name; only `CI.md:33` describes it.
- **F10** At 900 px and narrower the header hides every link but the button (`page.css:692-694`); headless Chrome's `HeadlessChrome/` user agent fails `install.ts:28`, hence the set user agents.
- **I1** Vite emits a root-level HTML input at the root of `dist/`, as for `terms.html`. Phase 1's gate proves it.
- **Asks:** OA-1 to OA-7, each with what ships now. None blocks arc 1's build.

## UI impact

- **New page `nulo.sh/how-aztec-works`:** the signed drawing `p33-aztec-a` (P33-03 A), with each player replaced by its card's text version until arc 2 (the lane brief's no-ask record: "Until approved, each section carries its illustrated still or a short text version, never a placeholder box"), and the "3 clips" eyebrow held (D8). Search and share text per OA-7. Screenshots in the PR body.
- **Home page:** unchanged (OA-5, what ships now A).
- **Arc 2:** each card gains its player at the top (the stage, a captions line, play, position and time) and a collapsed transcript under its text; "3 clips" above the heading. Before and after at 1440 and 390 px in the PR. The clips themselves: OA-8.

## Delivery

- **Arc 1:** branch `worktree-landing-explainer-1`, `gh pr create --draft --base dev` after Phase 1's gate and the Codex loop. Title: `feat(landing): the how aztec works page at nulo.sh/how-aztec-works` (66 characters). Body: what and why; the picks P33-03 = A and P39-11 = A with the owner's note verbatim; the final URL `https://nulo.sh/how-aztec-works`, stated once; the validation runs; dark screenshots at desktop and phone width; OA-6 A's command, with the note that the preview appears after the owner runs it; OA-7's head copy, quoted for the owner to flip; `Refs #588`; "Draft until the owner approves the explainers (OA-1 to OA-3)". No labels: no extension e2e lane applies. onboarding-3's landing issue, #722, asks for the page with its clips and the wallet repoint, so arc 1 says `Refs #722`. Ready after Phase 2.
- **Arc 2:** arc 1 had not merged, so (orchestrator, 2026-10-18) branch `landing-explainer-1-a2` off `worktree-landing-explainer-1`, a draft PR with that base, retargeted to `dev` once #723 merges; title `feat(landing): the three how aztec works clips`; `Refs #588`; `Closes #722` once the wallet repoint has landed, `Refs #722` until then. A draft until the owner approves the clips (OA-8).
- **Release order:** the wallet item points at this address, so arc 1 must reach `main` with or before the release that ships onboarding-3's item; until then the link shows the home page.
- **Close-out** ships with arc 2 (D9 as reversed); arc 1's PR carries no archive move. No parallel lanes: one phase per arc.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at `2c0df3b9`, single-arc placement for each arc, plus Phase 3's cross-arc pass. `code_review: off`. Loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, at most three rounds, logged in `lessons/phase-1.md` (arc 2: `phase-3.md`). A fix that grows the design stops for the orchestrator. Teardown after the close-out merges: `agent-worktree done landing-explainer-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a14bca): reject, 9 findings, all accepted. #1 OA-2 claimed the whole transaction runs and stays local (scoped to the private part; a public-part beat added); #2 OA-3 promised a hidden address (now: the record names a shared payer); #3 OA-1's note split read as universal and its contrast overreached (now an example, scoped to private payments); #4 branch builds widen who can deploy nulo.sh (OA-6 recommends the manual preview); #5 option A's player needs bundled modules under the CSP (Arc 2, fixed now); #6 OA-6's watch paths omitted build inputs (dropped); #7 a preview is required before ready (Phase 2); #8 OA-4's Higgsfield clips run whole minutes and may upload a style picture, and the owner sets a cap; #9 a cross-arc pass before arc 2 (Phase 3).

**Round 1, Opus Plan:** conditional approve, 11 findings, all accepted. #1, #2 the same overstatements, plus the published sealed copy of each note (OA-1); #3 the header hides its links at 900 px and narrower (OA-5's trade-off); #4 a branch can redefine `deploy:preview` (Security); #5 the browser check could pass on the home page fallback, under a headless user agent, on a moved port (Phase 1 gate); #6 arc 2 waits on an open decision (D9) and the CSP wording; #7 the `h1`, the wrap and the heading order (Architecture); #8 the head copy (OA-7); #9 recon line numbers; #10 a failing control for the dist check; #11 public Fee Juice links every fee it pays (OA-3). The PrivateFPC salt question in its #11 is wallet scope, held by the orchestrator's privacy research.

**Round 2, Codex** (resume): conditional approve, 2 findings, both accepted: the preview server's working directory (now `cwd` `apps/landing`); recon still asserted the dashboard setting (now "not inspected; no branch build observed"). All round 1 resolutions verified.

**Round 3, Codex** (resume, confirmation): **approve**. No regression; owner approval of the visible content remains required.

**Arc 1 implementation, Codex** (gpt-6.1-sol, session 01a14be2): round 1 approve, 1 low finding, accepted: two head comments restated their tags (removed). Round 2 (resume, xhigh): **approve**, no findings; every fix below verified, including the headings' accessible names.

**Arc 1 implementation, Opus diff review:** approve, 3 low findings, all accepted: the README named a wallet item that has not shipped (clause dropped; onboarding-3 adds it with its item); the README and the `STORES` TSDoc overstated which pages the store pin reads (now the two hand-written pages); each heading's text ran its number into its title, "01Private" for indexers and copy (a space inside the hidden number, its margin cut 14 px to 5 px; the title moved 0.16 px).

## Seeds

`/goal Arc 1 of implementations-plan/landing-explainer-1/plan.md: Phase 1 marked ✓ with its validation gate passing in the transcript, LESSONS_FILE=implementations-plan/landing-explainer-1/lessons/phase-1.md printed, the Codex loop converged, and a draft PR against dev open with the screenshots and Refs #588.`

`/loop 15m Drive implementations-plan/landing-explainer-1 forward: read plan.md and lessons/, take the next open step of the current arc, run its gate, commit; decide stuck points with Codex (gpt-6.1-sol, high); never merge, never change a Cloudflare setting, never start a paid clip job.`
