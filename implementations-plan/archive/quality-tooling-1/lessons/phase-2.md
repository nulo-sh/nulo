# Phase 2 — commit-to-PR lookup

- 2026-11-03: the lookup pins (`fake-gh.ts` first on `PATH`) ran green, 31 pass, against the verbatim extraction of `realUnstickIO` and `realSyncIO`, before `gh-pulls.ts` existed.
- 2026-11-03: the verbatim extraction alone could not be committed: Biome scores `resolveReleasePrMergeSha` at cognitive complexity 16 once it is a method (code directly inside `if (import.meta.main)` is not scored), and the pre-commit hook refuses it. No suppression: the extraction lands in the same commit as the `gh-pulls.ts` routing, which brings it under 15. Deviation from the plan's "pin, then move" commit order; the pins' green run above is the evidence.
- 2026-11-03: mutation checks: removing open-sync's `.catch(() => null)` reds the sync pin; dropping auto-unstick's `merge_commit_sha` check reds the unstick pin.
- 2026-11-03: `parsePulls` is a generator so each caller parses only up to its match, as the inline loops did.
