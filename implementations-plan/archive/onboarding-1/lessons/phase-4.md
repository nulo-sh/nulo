# onboarding-1, arc 2: Ready's unsaved-phrase line

## Base runs, 2026-11-01

Armed builds of `dev` at `51ea220b1`, then `onboarding-tab.test.ts` at retry 0: Chrome 8/8 in 53.96 s (load average 137), Firefox 8/8 in 75.94 s. A scratch spec outside the repo drove Create with a password to the phrase step, then either reloaded or pressed "I saved it", and captured Ready in light theme at 720×900. The base draws the same page both ways.

## Head runs, 2026-11-01

- `done.test.ts`: all seven new cases red against the base `done.vue` (no settled attribute, no line). Removing each of the line's three conditions reds exactly one case.
- First capture: the line under the subhead's 380 px cap wrapped and left "Home." alone on a second line. Dropping the cap draws one line (D7); rebuilt and recaptured.
- `onboarding-tab.test.ts` at retry 0: Chrome 8/8 in 69.97 s, Firefox 8/8 in 96.23 s (load average 62-93). The untouched scenarios moved as much as the two touched ones (Chrome's "Open wallet keeps a tab" 5.5 s → 16.7 s), so the delta is host load; no scenario was added.

## Review loop, 2026-11-01

- Codex r1 (gpt-6.1-sol, high): approve. Low: the line's comment claimed the two never disagree, while an Import entry with unreadable flags shows no line where Home shows the step; accepted, the comment states the divergence. The e2e helper's doc comment narrated; cut.
- Opus (general-purpose): approve. Accepted: the same comment also names a lost `imported` write (the service swallows it); the no-path comment was stale since arc 1 (every route into Ready goes through `doneRoute`); `:data-phrase-unsaved="phraseUnsaved"` binds the same DOM. Rejected: dropping the Import-entry case, kept as the realistic import control.
- Codex r2 (resumed): approve, no new finding. Converged.
