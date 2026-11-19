# Phase 3 and the fix loop

- Codex round 1 (session `01a1d070`): conditional. Two hash navigations in a row only wait for the hash; the router may never leave Home, which then keeps its mirror and never reads a row seeded in storage. Fixed by waiting for `tokens-list` to leave before routing back.
- Opus review beside it: no product bug. Its catches: a class-count assertion passes for any second class (now reads `__cssModules.$style.title`), and two comments. Its re-seed against the reaper's 2-minute limit was rejected (D8).
- Codex round 2: no material finding. Convergence.
- Captures on the head build: the stopped-default capture worked as I1 said (the session key removed before `registerOnListChain`; USDC ended `failed` against the stand-in in about 90 s, USDT still pending). No import row reached a default's slot in that run, so that state has no capture; `TokensView.test.ts` pins it.
