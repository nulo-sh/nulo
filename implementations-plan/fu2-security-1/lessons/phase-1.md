# Phase 1-2 (arc 1): the backup screens

## Build

- T1-T5 and the pins test's ports went red on the base code (105 cases), then green after D2-D7.
- `profile-chaos-model.test.ts` pins three line numbers in `useFullBackupExport.ts` (`tests/e2e/helpers/profile-chaos/model.ts`, `cite(EXPORT, …)`); any edit above them reds `audit:vue` until the citations move. They moved twice in this arc.
- A stub component that declares its props as an array receives a bare boolean attribute as `""`; declare `{ flag: Boolean }` to read it as `true`.
- The download capture (`tests/e2e/helpers/download-capture.ts`) times out from its arming. With one press sealing before it saves, the full-backup helpers arm it with `withinMs: 90_000`, the old flow's 60 s seal wait plus its 30 s capture.

## Review, round 1

- **Codex, gpt-6.1-sol, high, read-only** (session `01a19d82-39ff-7db1-ac24-a5818ea0f50a`): **approve**. Traced the fence through every reset path; confirmed `useFullBackupExport.test.ts`'s stale-press case reds without the outer check. Three comment findings (a stale "Protect with Password", a stale plaintext-download line in `runEncrypt`, two narrating comments), all applied.
- **Opus 5.5, general-purpose**: conditional approve. Applied: a per-warning case for the "Backup" label rule (mutation-checked: dropping one term of `showsBackupBanner` reds its row), a corrected comment on what stops a second same-tick press, the file-accept example name. Rejected: an owner ask for the password profile's ready state with no warning (reading R1, settled by the panel; the PR shows and names its picture); collapsing the bottom slot's one-child `Flex` (no visible effect, churn on a signed surface); a narrow-fit e2e for the retry state (its banner and button label are narrow-checked in the finished and saved states; the PR adds its picture).
