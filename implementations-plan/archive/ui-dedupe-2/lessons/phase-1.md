# Phase 1: #840, the open-run hop

- One check after `await openRun(...)`; no await added, so the source pin keeps 12.
- Proof (base `993b3efc` copies, swapped in and out by a scratch script): the new case "a discard in the open-run hop stops the run before it builds clients or requests its keys" is red over the base composable; the base pin "…reaches the key export once…" is red over the new one; the suite is 31/31 green, the export pages' suites 64/64.
