# Phase 1: capture and frame

`B` = `b53e1d4a` (origin/dev did not move since the plan base), so `store-art-2-a1` branched from the plan commit `59624c49` and step 2's rechecks are moot.

- Agent shell (zsh): `git show $B:apps/...` expanded `$B:a` as zsh's absolute-path modifier and wrote empty files; brace the variable (`${B}:apps/...`). Caught by the hash listing (every file hashed to the empty-input SHA-256).
- Old set copied to `S/pairs/old/` with `git show "${B}:<path>"`; its hashes match the tree.

## Capture run

`{ STORE_CAPTURES=1 NULO_E2E_BROWSER=chrome NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts; echo "exit=$?"; }`, started 19:48Z at load1 146.7, first attempt: `exit=0`, 1 test passed. Wall-clock 344 s (vitest 268.5 s, tests 140.8 s). No change to the spec or its fixtures (I1 held). Fits: `revealCutActivityRow {"scrolled":58}` (31 at #633, 15 at #573), `clearAmountLine {"scrolled":46}` (42 at #573).

`bun --no-install scripts/store-art.ts` (from `apps/extension`): exit 0, six files written. The promo tile rendered byte-identical (`05381c4b…`), so D2 does not apply and 10 files change.

## Checks

- IHDR: five captures 720×1200, five screenshots 1280×800, the tile 440×280.
- Chunks: every PNG holds only `IHDR`, `IDAT`, `IEND` (a scratch reader under `S/scr/`, run as `bun --no-install`).
- No home-directory string in any PNG (`strings -n 8 | grep`).
