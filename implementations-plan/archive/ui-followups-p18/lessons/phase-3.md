# Phase 3: the regenerated store set

Base `71f98db4` (origin/dev with #530). The phase 1 grep printed only DetailsTable's two icon lines.

## Capture run

`STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts`, Chrome, first attempt: 1 test passed, 239 s (tests 164 s), load1 ~110-126 (the orchestrator's threshold for this host is 150). I1 held: no fix to the spec or its fixtures. The fits logged `revealCutActivityRow: {"scrolled":15}` and `clearAmountLine: {"scrolled":42}`.

`bun scripts/store-art.ts` (from `apps/extension`): exit 0, six frames written. The promo tile rendered byte-identical to the committed one (`05381c4b…`), so 10 of the 11 files change.

## Checks

- Sizes from each IHDR: five captures 720×1200, five frames 1280×800, the tile 440×280.
- The 11 hashes went to `S/SHA256SUMS` and SA-1; `git restore apps/extension/store` left `git status --short apps/extension/store` empty, and the old hashes verify on the tree again.
- All 11 viewed: no recovery phrase, no path; each PNG has only `IHDR`, `IDAT` and `IEND` chunks.
- Composites: a scratch script under `~/.cache/nulo-backlog/ui-followups-p18/scr/`, run as `bun --no-install`, with Puppeteer resolved from `apps/extension/package.json` through `createRequire`. Dry-run on old against old first.

## What the owner sees besides type and greys

Frame 4 now frames the Lock page (Lock now, strict mode, auto-lock), not the old Security page with its backup row: the spec navigates to `lock`, and Settings split since the old capture. Send gained a "Select asset" label, so the 42 px fit that clears the amount line tucks the From/To labels and the toggles' top edge under the sticky header (the spec's comment allows the labels to pass under it). History's date reads Oct 16. All three are in SA-1.
