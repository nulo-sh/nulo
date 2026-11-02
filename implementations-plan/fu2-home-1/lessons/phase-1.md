# fu2-home-1: phase 1 (arc 1)

- Red first: every new case failed on its assertions against base-behaviour stubs of `settleLatestRun` and `switchAndAnnounce`, then went green.
- A `get-started-label` testid broke three Home cases: `[data-testid^="get-started-"]` enumerates the card's rows, here and in the e2e `getStartedRows`. Dropped; the label dims by class.
- Chrome smoke: the still-pointer snack case went red because Receive's new line now sits where the snack opens (above Close, `vSnackFooter`). Re-aimed at the line, the copy pressed by testid; the card still gets the synthetic hover and closes at 2.16 s.
- A probe on the armed build: after a switch to a network visited before, Home's funds are already read and nothing pends; on a first visit the card mounts greyed within one 50 ms poll and settles once the funds land (about 1.7 s on Chrome).
- Firefox's gate rose 442 → 483 s, in `stale-network` S1b/S1c (no changed path) under a load average of 113 to 168; re-measured on the final head.
