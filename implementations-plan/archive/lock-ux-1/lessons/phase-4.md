# Phase 4: arc 1207 (account file saved state)

- A button that a failed action re-enables keeps receiving a held Enter's repeats; give it `refuseRepeatEnter` as Full Backup's does, not only the control that replaces it on success.
- A late-settle test on a page that re-applies a deep-linked selection after a reset lands on the agree step, not the picker: the `accounts` watcher fires on `heldAccounts` getting a new array.
- Codex round 1: two findings, one accepted (watcher placement), one rejected (the template's stage marker). Opus diff review: three, two accepted (Download's repeat Enter; watcher placement), one rejected on proportion (clearing the sealed payload). Round 2: `clean`.
- Gates at `5b5c07bc1`: `bun run audit:vue` green (944 files, 15977 tests); armed Chrome and Firefox builds; `account-import-export.test.ts` 4/4 on both.
