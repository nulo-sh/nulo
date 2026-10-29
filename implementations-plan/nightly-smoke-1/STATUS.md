# nightly-smoke-1 status

- 2026-10-29 recon: root cause demonstrated (R1-R5): the artifact run holds the published list, which flags nothing, so S1's flagged wait cannot succeed.
- 2026-10-29 plan drafted: move the flag-on-paste check to token-list.test.ts (D1); audit pending.
- 2026-10-29 phase 1 red reproduced on base 87d04118e, release-shaped build, artifact mode: Chrome 24.9 s, Firefox 29.7 s, both TimeoutError at send-picker-add.test.ts:38.
- 2026-10-29 audit round 1: Codex and Opus both approve with changes; findings folded (D6-D10). Final Codex pass next.
- 2026-10-29 final Codex pass: approve. Auto-continue: no owner ask; arc 1 starts.
