# boot-profile-1: phase 2 (boot resume)

- Tests first, on one setup (worker 1: A pending, B restored under `abc12345`; worker 2: B's deletion held, then the resume). At `51ea220b1`: T1a red (B's restored row erased), T1b red ("resume purged B"), T2 red (the planted row erased), T3 green (the base re-reads storage).
- Fix: `init` keeps its `validPayloads()` read as `inheritedTombstones`; the resume takes it before its first await and checks a row's `pxeGeneration` before deleting it. T3 red with the take removed (`[A, A]`), green with it.
- T1b races the resume's end against a second `runFor(B)` call, both event-driven, so the red case ends without a timer.
- `bun run test:all` reds on the chaos model's citation test when a cited file's lines move: `model.ts` cites `profile/service.ts` by line and fragment. Renumbered all 29 through `git diff -U0` hunks, fragment re-checked per line; Codex fix R2 verified the model identical modulo the numbers.
- Fix loop: Codex fix R1 approve (one helper doc misplaced by the extraction), Opus fix R1 approve (the same doc, plus `invoke`'s doc wording), Codex fix R2 approve, no findings.
