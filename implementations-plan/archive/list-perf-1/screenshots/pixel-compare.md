# list-perf-1: pixel compare, base `de500244a` against head `4bc435184`

Each pair is one screen captured from a `git archive` export of each arm with the same scratch smoke probe: the fixed recovery phrase `CANONICAL_SEED_24` imported (both arms derive account `0x1694…3d07`, so nothing is masked), five fixed contacts, one unnamed sponsor FPC; viewport 360 × 600; animations and transitions off through a constructed stylesheet; the pointer at (0, 0); the theme set on `html`. The FPC copy icon is hovered after its caller's `icon_btn` class is stripped, so `Icon`'s own `.hovered:hover` rule paints. Pairs are compared as decoded RGBA.

Result: **40 pairs, 0 differing pixels in every pair.** Controls: the same screen light against dark differs in 215,964 pixels; Chrome against Firefox on Contacts differs in 9,442. The hovered icon's computed `color` equals `--txt-primary` in all 16 captures (both arms, both browsers, both themes, DPR 1 and 2): `rgba(0, 0, 0, 0.88)` light, `rgb(245, 240, 230)` dark.

The head's Chrome DPR 2 dark captures sit beside this file (`chrome-*-dark-dpr2.png`).

| Browser | Screen | Size (px) | Differing pixels |
|---|---|---|---|
| chrome | bottom-bar-dark-dpr1 | 360x64 | 0 |
| chrome | bottom-bar-dark-dpr2 | 720x128 | 0 |
| chrome | bottom-bar-light-dpr1 | 360x64 | 0 |
| chrome | bottom-bar-light-dpr2 | 720x128 | 0 |
| chrome | contacts-dark-dpr1 | 360x600 | 0 |
| chrome | contacts-dark-dpr2 | 720x1200 | 0 |
| chrome | contacts-light-dpr1 | 360x600 | 0 |
| chrome | contacts-light-dpr2 | 720x1200 | 0 |
| chrome | fpc-copy-hover-dark-dpr1 | 318x80 | 0 |
| chrome | fpc-copy-hover-dark-dpr2 | 636x160 | 0 |
| chrome | fpc-copy-hover-light-dpr1 | 318x80 | 0 |
| chrome | fpc-copy-hover-light-dpr2 | 636x160 | 0 |
| chrome | holdings-dark-dpr1 | 360x600 | 0 |
| chrome | holdings-dark-dpr2 | 720x1200 | 0 |
| chrome | holdings-light-dpr1 | 360x600 | 0 |
| chrome | holdings-light-dpr2 | 720x1200 | 0 |
| chrome | home-dark-dpr1 | 360x600 | 0 |
| chrome | home-dark-dpr2 | 720x1200 | 0 |
| chrome | home-light-dpr1 | 360x600 | 0 |
| chrome | home-light-dpr2 | 720x1200 | 0 |
| firefox | bottom-bar-dark-dpr1 | 360x64 | 0 |
| firefox | bottom-bar-dark-dpr2 | 720x128 | 0 |
| firefox | bottom-bar-light-dpr1 | 360x64 | 0 |
| firefox | bottom-bar-light-dpr2 | 720x128 | 0 |
| firefox | contacts-dark-dpr1 | 360x600 | 0 |
| firefox | contacts-dark-dpr2 | 720x1200 | 0 |
| firefox | contacts-light-dpr1 | 360x600 | 0 |
| firefox | contacts-light-dpr2 | 720x1200 | 0 |
| firefox | fpc-copy-hover-dark-dpr1 | 318x80 | 0 |
| firefox | fpc-copy-hover-dark-dpr2 | 636x160 | 0 |
| firefox | fpc-copy-hover-light-dpr1 | 318x80 | 0 |
| firefox | fpc-copy-hover-light-dpr2 | 636x160 | 0 |
| firefox | holdings-dark-dpr1 | 360x600 | 0 |
| firefox | holdings-dark-dpr2 | 720x1200 | 0 |
| firefox | holdings-light-dpr1 | 360x600 | 0 |
| firefox | holdings-light-dpr2 | 720x1200 | 0 |
| firefox | home-dark-dpr1 | 360x600 | 0 |
| firefox | home-dark-dpr2 | 720x1200 | 0 |
| firefox | home-light-dpr1 | 360x600 | 0 |
| firefox | home-light-dpr2 | 720x1200 | 0 |
