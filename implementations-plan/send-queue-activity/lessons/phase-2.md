# Arc 2 — lessons

## What the fit measures (2026-10-13)

- **The derived line's room is what the balance and Max leave.** In USD mode the meta line fills the row (`flex: 1; min-width: 0`), so its width is the room, independent of its own text. With a 12,345,679,901.12 TST balance (18 decimals) the line drew at 4.6 px for Max and 6 px for a typed $1,234.56, on both browsers; before, it wrapped to three lines and pushed Max 28 px past the card. Signed as option A with no floor; the legibility question went to the owner (OA-15).
- **The USD field had no blur handler.** `isFocused` was set on its focus and never cleared, so nothing refitted when it lost the focus. It now clears on blur, as the token field's does; the fit keeps its `document.activeElement` check for a field swapped out while focused.

## Shots

- **Before/after on one test file.** A throwaway network spec (never committed) drove both: the arc's four source files were written back from `origin/dev` with `git show`, the spec ran, and `git checkout --` restored them. `agent.sh` builds from the worktree on every run, so the swap is all it takes. In zsh, a file list in one variable does not word-split: keep the swap in a bash script with an array.
- **Aging the fiat snapshot without aging the quote.** `usePrices` re-reads freshness on the shared 30 s ticker, so shifting `Date.now` forward ages the quote with the snapshot and USD mode exits. Shifting it back 16 minutes for exactly one synchronous `click()` on the unit switch freezes the snapshot in the past while the quote stays fresh; the next tick shows the notice.
- **A wrapped review line needs a billion-plus balance.** At 1.2M the line fits at 60% or more; at 12,345,679,901.12 TST it wraps at 18 px (two lines, 36 px).

## Gates

- **Unit timeouts under host load.** With the load average near 190 on 188 cores, `test:all` failed one hook timeout (`presto/client.test.ts`) and a rerun of `bun run test` three others (`transfer-estimate-reuse.pins`, `operation-estimate-reuse.pins`, `content-message-relay`), each a first-test import timeout in a file this arc does not touch; each passed alone.
- **The e2e step fails first.** The head's `send-amount-exact.test.ts` against the base sources on Firefox: `hidden 40, lines 3, spill 28.6`, three soft failures; green on the head on both browsers.
