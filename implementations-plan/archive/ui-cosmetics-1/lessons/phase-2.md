# Phase 2: one header geometry on every step after welcome

## Measurements (armed builds, viewport 1280×800, after `document.fonts.ready`, scrolled to top)

`B`, create's back link box, is 22 px on Chrome and on Firefox, so the fixed row `H` is 22 px and create does not move.

| Step | Base title top | Base step row | After title top | After step row |
|---|---|---|---|---|
| terms | 253 | 156 | 261 | 160 |
| create | 261 | 160 | 261 | 160 |
| phrase | 207 | 106 | 261 | 160 |
| import | 245 | 152 | 261 | 160 |
| done | 255 | 106 | 261 | 160 |

Chrome and Firefox read the same numbers, base and after. The step row is 640 px wide on every step, done included.

## Runs

- Control: base plus a scratch patch that only adds the title testid; `legal-acceptance` S1 red on `[253, 261, 207, 255]` and S3 red on `245 ≠ 253`, on both browsers. Not on a missing selector.
- Scenario runtime, same build, base file against the new one: Chrome S1 5.9 → 5.9 s, S3 6.2 → 5.1 s; Firefox S1 9.6 → 9.9 s, S3 8.4 → 8.5 s. The reads cost nothing measurable; the file totals moved with host load (load1 near 200).
- Feedback files, retry 0, green on both browsers: `legal-acceptance`, `onboarding-tab`, `onboarding-import`, `keyboard-guards`, `passkey-retry`, `import-paths`.
- A scratch probe outside the repository (`~/.cache/nulo-backlog/ui-cosmetics-1/probe2/`) took the pictures in `screenshots/arc1/` and the numbers above. The base build carried Phase 1, so the card's base run reverted Phase 1's source for that build: opening Presto left the step unchecked there and checks it here. The card's first picture is the card before Presto is opened, which is also what `dev` shows after opening it.
- An element screenshot of an extension page wrote no file with no error (Chrome, Puppeteer 25); `page.screenshot` with a clip works.

## Fix loop

- Round 1: Codex clean (one comment trim, applied); Opus found two test gaps (Presto marked only from its own row; `align` reaches the title), both added. The guard control reds the phrase-row test.
- Round 2: Codex verified the fixes, clean. Loop converged.
