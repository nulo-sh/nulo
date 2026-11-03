# quality-popup-2 owner asks

Arc 1 and arc 2's phase 4 change nothing a person sees (`UI impact: none`) and wait on no answer. One ask, for arc 2's phase 5 only.

## OA-1: Home's balance hero and Holdings read their settings the way nine other screens do

- **Surfaces:** the balance hero on Home and on a token page, which shows or hides dollar values by "Show fiat values"; and Holdings, which uses the same setting and the dust threshold (the value under which a token folds into the hidden group and the fold's "under $N" line).
- **Today, the balance hero:** it reads the setting once when it opens, then follows each change it hears. When the browser restarts the wallet's worker while the hero is open, a change made in that moment (in another window) is never heard, and the hero keeps the old choice until it is opened again.
- **Today, Holdings:** it reads both settings again after every restart, so it hears no change late. But a read that started before a change can land after it and put the old value back: for a moment the dollar values or the dust fold follow the old setting, until the page is opened again or the setting changes again.
- **Option A (recommended):** both pages read through `useConfigRead`: after a restart they read again, and an older read never overrides a newer change, for the fiat setting and for the dust threshold. A person sees the pages follow the settings in those rare moments too. Nothing else on either page changes.
- **Option B:** keep both pages as they are; issue #1473 stays open with a comment saying why.
- **What ships now:** arc 1 and phase 4 in full. Phase 5 is built only on Option A; without an answer, arc 2's PR leaves it out and does not close #1473.
