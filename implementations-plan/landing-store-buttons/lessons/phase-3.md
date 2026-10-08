# Phase 3: social image and footer store links

## Gate

- `bun run --cwd apps/landing build`: exit 0; `dist/index.html` carries `<meta property="og:image" content="https://nulo.sh/og.png" />`.
- `bun run lint`: exit 0 (27 warnings, as on the base). `bun run --cwd apps/landing test`: 4 files, 60 tests passed.
- Puppeteer check against `vite preview`: `/og.png: 200 image/png 1200x630`, every install-button state as in Phase 1, and no horizontal overflow at 375 px in any state. Result: `ALL ASSERTIONS PASSED`.

## Notes

- **The image.** `public/og.png` is the desktop hero captured with reduced motion (a deterministic frame with the "SUBJECT · NOTHING TO SEE" box) and the clock hidden, so the card does not carry a date. The viewport is 1371 px wide so the whole 720 px hero scales to exactly 1200×630 (`clip.scale`, rendered at `deviceScaleFactor: 2`). 130 KB, PNG chunks `IHDR`, `IDAT`, `IEND` only. A headless browser's user agent says `HeadlessChrome/`, which `detectInstall` does not read as Chrome, so the capture shows the fallback's two store buttons, which suits a link preview.
- **Footer.** With six links the phone footer squeezed into three columns; `flex-wrap: wrap` at ≤ 900 px stacks the three groups instead.
- **Captures went to a scratch script**, never a landing dependency: the locked `puppeteer` from `apps/extension`.

## Codex fix loop

Pending.
