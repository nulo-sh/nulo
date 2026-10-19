# Status: capture-hang-1

- 2026-10-19: r1 (instrumented, capture mode, Chrome): the wallet tab is `hidden`; the dark `page.screenshot` pending at 150 s while `evaluate` answers. Reproduces #885.
- 2026-10-19: r2: a hidden tab runs no frame; captures A and B return, C (2 s later, no change) and D (after the flip) hang; after `bringToFront` the page is visible and the capture takes 44 ms. Recon done (1 sonnet explorer).
- 2026-10-19: plan drafted; Codex audit and Opus Plan leg started.
- 2026-10-19: audit r1: Codex conditional approve (6), Opus conditional approve (5), all accepted; plan revised (Firefox capture run, guard first, three unit tests, F6 corrected, chrome.ts comment). Chrome base 14.1 s / 22.6 s.
- 2026-10-19: audit r2 (Codex resume): conditional approve, 2 findings accepted (gate counts, capture D confounded by the screenshot lock); r3: approve. No owner ask.
