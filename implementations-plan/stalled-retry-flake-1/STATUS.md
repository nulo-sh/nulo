# stalled-retry-flake-1: status

- 2026-10-20: recon done; cause demonstrated (the browsers re-send a reset held call; Firefox all, Chrome on reused connections); forced red on Firefox, green with a terminal 400 on both browsers.
- 2026-10-20: plan drafted (light). Codex round 1 and Opus: approve with changes; D3 decided for A (refuse held calls only).
- 2026-10-20: Codex rounds 2 and 3: approve. Arc 1 starts under auto-continue.
- 2026-10-20: arc 1 gate green (lint, typecheck:all, test:all, smoke on both browsers, the stalled spec 10/10 Firefox and 5/5 Chrome, forced red on base and green on the fix); review loop converged in two rounds.
