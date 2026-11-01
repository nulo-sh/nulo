# boot-profile-1: phase 2 (boot resume)

- Tests first, on one setup (worker 1: A pending, B restored under `abc12345`; worker 2: B's deletion held, then the resume). At `51ea220b1`: T1a red (B's restored row erased), T1b red ("resume purged B"), T2 red (the planted row erased), T3 green (the base re-reads storage).
- Fix: `init` keeps its `validPayloads()` read as `inheritedTombstones`; the resume takes it before its first await and checks a row's `pxeGeneration` before deleting it. T3 red with the take removed (`[A, A]`), green with it.
- T1b races the resume's end against a second `runFor(B)` call, both event-driven, so the red case ends without a timer.
