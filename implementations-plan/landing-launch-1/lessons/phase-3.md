# Phase 3: captures, browser check, og.png

- First after-capture: in `#get`, the store line and the builder line ("Building on Aztec V6? …") are two `small`s in one flex row and ran together into one line in the detected state. Fixed with one rule, `.cta small + small { flex-basis: 100%; }`: the second small starts its own line (ledger D8). Recaptured.
- Chrome 155.0.8059.79 (Puppeteer's), `ALL ASSERTIONS PASSED` over desktop, phone, Chrome, Firefox and Chrome-at-390 user agents, both no-script states: exact Tab orders, the error-state plate inside the 820 px hero and clear of REC and CAM (fallback plate 142.7 to 807.3 px with the error line), both pages' fallback nav landing on `#get` with the heading at 120 px (desktop) and 101 px (phone) under the 65 px bar, no console error on the three pages, no overflow at 390 px. No hero height change was needed (OA-7).
- Firefox 158.0 (the suite's pin, real detection): `ALL ASSERTIONS PASSED` in the detected desktop state. Puppeteer's Firefox has no media emulation, so its frames are not reduced-motion.
- Narrowing after first paint moves the centred plate: its top is 158.5 px in the fallback and 191.2 px when detected, 33 px (Good enough).
- Light and dark captures hash-equal at 1280 and 390 px, top and `#get`, before and after.
- `og.png` recaptured from the 820 px hero at a 1562 px viewport: 1200 × 630, chunks `IHDR`, `IDAT`, `IEND`, 135,980 bytes. The old one still showed the hero of two changes ago ("See what the camera sees", the hero's small print).
