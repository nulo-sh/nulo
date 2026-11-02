# Phase 3: captures, browser check, og.png

- First after-capture: in `#get`, the store line and the builder line ("Building on Aztec V6? …") are two `small`s in one flex row and ran together into one line in the detected state. Fixed with one rule, `.cta small + small { flex-basis: 100%; }`: the second small starts its own line (ledger D8). Recaptured.
- Chrome 155.0.8059.79 (Puppeteer's), `ALL ASSERTIONS PASSED` over desktop, phone, Chrome, Firefox and Chrome-at-390 user agents, both no-script states: exact Tab orders, the error-state plate inside the 820 px hero and clear of REC and CAM (fallback plate 142.7 to 807.3 px with the error line), both pages' fallback nav landing on `#get` with the heading at 120 px (desktop) and 101 px (phone) under the 65 px bar, no console error on the three pages, no overflow at 390 px. No hero height change was needed (OA-7).
- Firefox 158.0 (the suite's pin, real detection): `ALL ASSERTIONS PASSED` in the detected desktop state. Puppeteer's Firefox has no media emulation, so its frames are not reduced-motion.
- Narrowing after first paint moves the centred plate: its top is 158.5 px in the fallback and 191.2 px when detected, 33 px (Good enough).
- Light and dark captures hash-equal at 1280 and 390 px, top and `#get`, before and after.
- `og.png` recaptured from the 820 px hero at a 1562 px viewport: 1200 × 630, chunks `IHDR`, `IDAT`, `IEND`, 135,980 bytes. The old one still showed the hero of two changes ago ("See what the camera sees", the hero's small print).

## Codex fix loop, round 1 (with the Opus diff review)

- Codex (Sol, high, session over `1e6c5bc1f..HEAD` plus `capture.ts`): `no material findings`. Two lows adopted: the Terms test's `/[.,;]+$/` retries quadratically on a punctuation run (now one character, `/[.,;]$/`); the README's install-dom row omitted `hidden`. A stale comment in the scratch script (the preview CSP allows inline styles) was deleted.
- Opus (`general-purpose`): `no material findings`. Lows adopted: the README placed `#get`'s form under the store buttons; `.signup p.signup__avail` and `.soon` matched nothing and are deleted; the fallback span's attributes are now pinned (a stray `hidden` would have hidden it from the visitors it serves); the `scroll-margin-top` note names the links shared while the nav pointed at `#email-hero`. Noted under OA-4: the no-detection Tab path from "Get Nulo" meets the form before the store row.
- Round 2 (resumed, over `fa14b81a2`): `no material findings`; converged.
- Phase 3 rerun on the final head: Chrome and Firefox `ALL ASSERTIONS PASSED`; `og.png` byte-identical. One desktop dark/light pair differed this run in 21 bytes of one row, at the plate's fractional bottom edge (791.45 px): edge rendering noise between two frames, not a palette difference (earlier runs hashed equal).
