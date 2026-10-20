# Status: capture-hang-1

- 2026-10-19: r1 (instrumented, capture mode, Chrome): the wallet tab is `hidden`; the dark `page.screenshot` pending at 150 s while `evaluate` answers. Reproduces #885.
- 2026-10-19: r2: a hidden tab runs no frame; captures A and B return, C (2 s later, no change) and D (after the flip) hang; after `bringToFront` the page is visible and the capture takes 44 ms. Recon done (1 sonnet explorer).
- 2026-10-19: plan drafted; Codex audit and Opus Plan leg started.
- 2026-10-19: audit r1: Codex conditional approve (6), Opus conditional approve (5), all accepted; plan revised (Firefox capture run, guard first, three unit tests, F6 corrected, chrome.ts comment). Chrome base 14.1 s / 22.6 s.
- 2026-10-19: audit r2 (Codex resume): conditional approve, 2 findings accepted (gate counts, capture D confounded by the screenshot lock); r3: approve. No owner ask.
- 2026-10-19: arc 1 on capture-hang-1-a1 (off origin/dev 656ac563): implemented (2291972b); lint, typecheck:all, test:all exit 0 (after D6's leaf move); unit test 3 passed; negative control red at once with the guard's message (9.8 s).
- 2026-10-19: Codex r1 conditional approve (2 comment findings), Opus approve (2 nits), applied (7a68e198); Codex r2 approve, loop converged.
- 2026-10-20: gate e2e: Chrome capture 3/3 (case 2: 25.1, 13.5, 13.6 s; six PNGs each), Firefox capture 1/1 (24.9 / 24.0 s), plain Chrome 17.3 / 13.6 s, Firefox 21.2 / 20.8 s; network capture sweep 18 files, 64 tests passed, 98 PNGs, no refusal.
- 2026-10-20: smoke capture sweep 21 files (105 passed, 1 skipped, 120 PNGs), no refusal. Phase 1 gate green.
- 2026-10-20: merged origin/dev (92408468); final head: install, lint, typecheck:all, test:all, test:ci-gating, check:plans exit 0; spec Chrome capture 18.8 / 16.6 s (six PNGs), plain Chrome 16.6 / 19.0 s, plain Firefox 24.6 / 22.0 s.
