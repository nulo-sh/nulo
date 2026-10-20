# launch-prep-1: phase 2 and 3 (A2)

- 2026-10-19 decision page 68 signed: OA-1 a B, OA-1 b A, OA-2 A plus the preview-build bullet,
  OA-3 B, OA-4 A. The owner's note on B ("Reads very weirdly.") got two drawn rewordings for the
  last look; A2 ships B and stays a draft until then.
- 2026-10-19 Phase 2 gate green: legal 60 and landing 80 tests, extension `bun run test`, landing
  build (`/terms/v1.0/` carries the draft and superseded banners, `terms.html` lists "never in
  effect" and "not yet effective"), `launchBlanks("1.0.0")` lists `terms.md:3` and `:579` only,
  legal-acceptance e2e 14/14 at retry 0 on the armed Chrome build (160 s).
- 2026-10-19 the archive copy is the pre-edit `legal/terms.md`, byte-exact (`cmp`), so its header
  equals the 1.0 manifest entry and keeps its draft banner.
- 2026-10-19 Codex r1 (gpt-6.1-sol, high, session `01a15635`): one P2, the #385 condition kept in
  plan, asks and recon "violates the disclosure boundary" and D5's "no other file names it" is false.
  Accepted the false sentence (D5 and the asks now say what is true: no launch document,
  `SECURITY.md`, README or release note repeats it). Rejected the removal: #385 is a public, closed
  known-limit issue, not an advisory, the row was on `dev` before the owner's note, and its
  disposition is still to be posted from it.
- 2026-10-19 Opus review: four P3. `legal/README.md` blocker 3 omitted the token-list gate (fixed);
  `nulo.sh/how-aztec-works`'s footer still read "preview build" after #791 retired it on
  `index.html`, since #723 landed 46 minutes later from the old footer (now "early days", per #767);
  the banner tick cited a signature the bullet's words do not yet have (reworded to "the owner's
  picks"); D5 as above.
- 2026-10-19 Codex r2 (resumed `01a15635`): one P3, "is posted on #385" while #385 has no comment
  yet; now "goes on #385 (the orchestrator posts it)". Other fixes verified, no regression.
- 2026-10-19 Codex r3 (resumed `01a15635`): clean. `origin/dev` merged at `24399338`; lint,
  `typecheck:all`, `test:all`, `test:ci-gating`, `check:plans` exit 0 (run once load1 fell
  below 150).
- 2026-10-20 decision page 69 signed: P69-02 C replaces line B; P69-03 A ships the banner as drawn.
  `origin/dev` merged (the plan index conflicted, as expected: dev still listed this plan as
  active). Legal 60 and landing 80 tests, armed Chrome build, legal-acceptance 14/14 at retry 0
  (208 s); the sheet shot with C in both themes lists that one line only.
