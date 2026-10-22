# list-perf-1, post-implementation: the review loop

Diff under review: `git diff de500244a...HEAD -- packages apps` (base: origin/dev with #1027). Codex gpt-6.1-sol at high, read-only, session `01a164bf`; one Opus diff review beside round 1. Each prompt carried the plan, its ledger, the adversarial ask and the standard's two rules verbatim.

## Round 1

- **Codex**: *approve*. One non-blocking limit: a future `.vue` outside `SCAN_ROOTS` is not scanned (demonstrated as a scope fact; no such file exists). Verified independently: `parseCssVars` strips CSS comments; a `<style src>` yields no `cssVars` and no injection; the 40 pixel pairs re-decoded to 0; the hover records and the A/B/A raw records. Corrected one inference: a caller's explicit `--icon-hover` in its own `style` would override the icon's (intended: a caller's explicit style wins; no caller sets it).
- **Opus** (general-purpose, opus): *conditional approve*.
  1. The Icon test did not tie the inline property to the rule that reads it (a rename on one side passed). Accepted: the test asserts the source carries `color: var(--icon-hover);` (`?raw`, as `Button.test.ts` does).
  2. `review()`'s main path was untested (a `review` returning `open: []` always passed; the gap is copied from `red-text-ban.test.ts`). Accepted: an unmatched finding is asserted open.
  3. "As a multiset" was inexact (the compiler dedupes per file). Accepted: reworded.
  4. A hand-written `useCssVars` (auto-imported in the app) costs the same and the compiler's `cssVars` cannot see it. Accepted as a local test change: the ban also reads `.ts`/`.js` and SFC scripts for calls. SFCs outside `SCAN_ROOTS`: rejected with Codex's twin point (below).
- Commit `323f6a3a9`.

## Round 2 (resumed)

- **Codex**: *conditional approve*. Demonstrated by running `scan()`: the regex hand-call check refused a comment and a string naming the helper and missed `useCssVars /* c */ (…)`. Accepted: the check uses the shared AST call scanner (`callsTo`, `scripts/type-roles/source-code.ts`), with a negative row (comment and string) and the intervening-comment positive row. Commit `431378069`.

## Round 3 (resumed)

- **Codex**: *approve*, no new material finding: "Scanning all 820 eligible current files produced no findings or parse failures. Alias and computed-callee resolution remain limits of name-based matching, not regressions introduced by this fix. No further changes requested."

## Dispositions

- SFCs outside `SCAN_ROOTS` (both legs): every source guard in the repo reads the same roots, and all 248 tracked SFCs are under them; a new Vue workspace widens `SCAN_ROOTS` for every guard at once. No change.
- An aliased or computed `useCssVars` callee (Codex r3): a limit of name-based matching shared by every `callsTo` guard; no such call exists. No change.
