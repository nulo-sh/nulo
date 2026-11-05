# fu2-home-1: phase 1 (arc 1)

- Red first: every new case failed on its assertions against base-behaviour stubs of `settleLatestRun` and `switchAndAnnounce`, then went green.
- A `get-started-label` testid broke three Home cases: `[data-testid^="get-started-"]` enumerates the card's rows, here and in the e2e `getStartedRows`. Dropped; the label dims by class.
- Chrome smoke: the still-pointer snack case went red because Receive's new line now sits where the snack opens (above Close, `vSnackFooter`). Re-aimed at the line, the copy pressed by testid; the card still gets the synthetic hover and closes at 2.16 s.
- A probe on the armed build: after a switch to a network visited before, Home's funds are already read and nothing pends; on a first visit the card mounts greyed within one 50 ms poll and settles once the funds land (about 1.7 s on Chrome).
- Firefox's gate read 483 s once against 442 s at the base, in `stale-network` S1b/S1c (no changed path) under a load average of 113 to 168; the final head measured 403 s.

## Codex fix loop (gpt-6.1-sol, high) and the Opus diff review

- Round 1, reject: a lock mid-create let "Now using <name>" open on the lock screen (fixed: profile and login checked after the commit); the wait could bind to a run the shell replaced. Tracing it found that an unattended reset's `reloadNetwork` re-assigns the same row, so binding to the first run dropped the toast for every never-opened stale network.
- Opus, beside round 1: the same reload case; proving the shell wiring (the e2e waits for the line); five low findings answered in the plan's verdict table.
- Round 2, reject: following replacements while a `live()` check held let B → A → B resurrect the first wait, since a superseded run settles only when its pending read returns. A settle point cannot see a scope that left and came back.
- Fix: the switch handler, which begins every run, counts scope changes (another profile or network, no scope, a supersede); the wait ends once the count moves. The run's complexity crossed 15, so the counter is its own factory.
- Round 3: approve.
