# unicode-1, phase 2: the review loop

## Round 1

- **Codex** (gpt-6.1-sol, high, session `01a18f1d`): findings. (1) After a strip mid-text the field's value is rewritten and the caret jumps to the end (demonstrated in jsdom); the same holds at Send and Settings search through `Input`'s `normalize`. (2) The new `AddressInput` comment said only a caller's `normalize` rewrites the value, but `sanitize` does too.
- **Opus 5.5** (general-purpose): no functional bug. The same caret point (an RLM key on a Persian or Hebrew layout reaches it mid-word), the same comment, an overclaim in `stripBidiAndZeroWidth`'s TSDoc, and test hygiene (a `hint` helper defined twice; one test running two scenarios).
- **Accepted:** the alias restores the caret after a strip (local, its own handler; a test red without it, with a visible-character control); `AddressInput`'s comment now says the pinning changes `scrollLeft`, never the value; the TSDoc says none of these characters hides in what a field keeps; `hint` at file scope; the press and Tab cases split.
- **Not fixed here:** the caret at Send and Settings search. The fix belongs in `@nulo/design`'s `Input` (`handleInput` would restore the caret as its capped-paste path already does), which the plan's approval boundary excludes; the contact name field has the same behaviour today. Filed at close-out as a closed `known-limit` issue.
