# nightly-smoke-1 status

- 2026-10-29 recon: root cause demonstrated (R1-R5): the artifact run holds the published list, which flags nothing, so S1's flagged wait cannot succeed.
- 2026-10-29 plan drafted: move the flag-on-paste check to token-list.test.ts (D1); audit pending.
- 2026-10-29 phase 1 red reproduced on base 87d04118e, release-shaped build, artifact mode: Chrome 24.9 s, Firefox 29.7 s, both TimeoutError at send-picker-add.test.ts:38.
- 2026-10-29 audit round 1: Codex and Opus both approve with changes; findings folded (D6-D10). Final Codex pass next.
- 2026-10-29 final Codex pass: approve. Auto-continue: no owner ask; arc 1 starts.
- 2026-10-29 phase 2 gate green at 2bfcc8e5a (lint, typecheck:all, test:all, SRC five files both browsers, ART S1 both browsers, ART token-list skipped).
- 2026-10-29 codex loop converged (round 2 clean); final-head gates green at 699567c4b.
- 2026-10-29 merged origin/dev (fa82918a6); full local gates green on the merged head. PR next.
