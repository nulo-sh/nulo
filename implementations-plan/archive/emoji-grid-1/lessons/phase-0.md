# emoji-grid-1 phase 0: planning

- **Probe page** (scratch, outside the repo): the SDK alphabet in six stacks, shot in Chrome 155, Firefox 158 and Firefox 153. Results in plan F1–F3 and `recon.md`. `font-variant-emoji` and `Intl.Segmenter` are supported in all three.
- **cmap check** (fontTools over the bundled woff2): InterVariable has U+2B1C and U+25A0/U+25A1, not U+2B1B; Space Grotesk and JetBrains Mono have none of them.
- **Codex design consult** (gpt-6.1-sol, high, read-only), 2026-11-19. Asked: the selector's scope, (a) the two squares, (b) every single-code-point pictograph, (c) `font-variant-emoji` in the role; fixed vs site-sized role. Verdict: a narrowed (b), text-default pictographs plus the two squares; fixed 24; (c) clean but unnecessary for one caller. It confirmed the alphabet's counts and the 65,536 pair segmentations independently, and flagged that comparing the e2e against the same helper confirms only wiring. All accepted (plan D1, D2, D5).
- **No plan audit round**: the lane's proportion thins the tier to one Codex pass over plan and diff after the build.
