# Phase 1: the helper, the card and their tests

- **Red first, on the base card and helper.** `humanize.test.ts`: the three `safeWireOrDash` cases failed (`safeWireOrDash is not a function`). `OperationCard.test.ts`: the new case failed with `expected [ '', '', '18' ] to deeply equal [ '—', '—', '18' ]`, the blank rows #897 describes.
- **Green.** After the helper and the two template expressions: the three files 37 of 37; `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (873 files passed, 3 skipped).
- **Authoring note.** Non-ASCII test inputs are built with `String.fromCodePoint`, so no invisible character sits in the source.
