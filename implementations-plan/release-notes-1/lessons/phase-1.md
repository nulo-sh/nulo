# Phase 1: the notes module, the files and the gates

- `bun run test:release` on this host: 381 of 388 pass. The 7 failures are `zip-read.test.ts` and `zip-reproducible.test.ts` spawning `zip`, which this host lacks (`ENOENT`); neither file nor its subject changed from base, and CI's Ubuntu runner has `zip`.
- First lint run: two format slips and `readInputs` in `publish-firefox-amo-run.ts` over the cognitive-complexity budget once the notes read joined it. Fixed by moving the read into `readReleaseNotes`; no suppression.
- `tag-by-hand-run.test.ts`'s process test drives the real runner over a fake `git` that prints nothing; `git show` of the notes then read as an empty file and refused. The fake now answers `show <sha>:release-notes/…`.
