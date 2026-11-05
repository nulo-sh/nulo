# store-images-1: owner asks

## OA-1: sign the new store image set (answered 2026-10-30)

- **Surface:** the Chrome Web Store and Firefox Add-ons listings' graphic assets: the five 1280×800 screenshots and the 440×280 promo tile.
- **Why it is yours:** CLAUDE.md § UI changes. The frames show only changes each signed in its own PR, under your unchanged titles, captions and templates, but the public set itself needs your words.
- **Options:**
  - A. Sign the set as produced. Each frame shows the current header (the Lock chip a padlock alone, a roomier TESTNET chip) and the icons as #1027 paints them (the bottom bar's at 24 px). Frame 3, the permission window, reads `https://playground.nulo.sh` (your pick, below; the old set read `localhost`); it still reads SANDBOX on the account row, as in the set you signed on 2026-10-19. Frame 5, History, reads the capture day ("OCT 30, 2026" in the probe) where the old set read Oct 18. Every frame reads TESTNET, the renamed test network, as before; a fresh install opens on Alpha.
  - B. Name the frames to re-capture, and what each should show instead.
- **Recommendation:** A. The PR's before/after table and its SHA-256 list are what you sign.
- **What ships now:** the arc captures, looks at every frame, commits the set and opens the PR. Merge waits for your words, quoted in the PR body.

### The owner's answers (#1377)

"I don't like the "localhost:27493" is there a way we can have "playground" there or something? Even if we edit manually the html before the photo." Then: ""https://playground.nulo.sh" looks good, thanks". Frame 3 now reads `https://playground.nulo.sh` (plan D10).

The set, 2026-10-30, signed before the re-render, conditionally: "#1377: yes, signed if frame 3 reads that way and the rest changes only in those things." The orchestrator checked both conditions on head c3ff40f38: frame 3 reads `https://playground.nulo.sh`, and frames 1, 2, 4 and 5 differ from the previous set only in the test address and the tx-hash slices.
