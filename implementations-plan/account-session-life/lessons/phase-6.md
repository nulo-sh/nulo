# Phase 3.4 and the close-out: lessons

## Start (2026-10-15)

- Base: `origin/dev` at `0266d1b2` (backup-import-export arc 3 merged as #454), branch `account-session-life-closeout`; `bun install --frozen-lockfile` first.

## Where § Phase 3.4 and the tree disagreed

1. **The fields the plan names survive #454.** `ImportFullBackupForm.vue`'s decrypt field (`import-full-backup-decrypt-password-input`) and `export/full.vue`'s encrypt pair (`backup-encrypt-password-input`, `backup-encrypt-password-confirm-input`, shown to passkey profiles only) are where the plan puts them; no mapping was needed.
2. **A test pinned the old state.** `ImportFullBackupForm.test.ts`'s real-`Input` case asserted `autocomplete: null` on the decrypt field; it now asserts `current-password`. The export pair had no assertion; `full-passkey.pins.test.ts` gains one case (the pair renders only on the passkey path).
3. **Another credential field has none.** The account-file import's "File password" (`popup/pages/settings/accounts/import.vue`, `import-account-password-input`) carries no `autocomplete`. P7-04 names only the two backup fields, so it is left as it is and filed (close-out).

## Gates

- 3.4: lint 0; typecheck:all 0; `bun --bun vitest run src/components/composite/import/ src/popup/pages/settings/security/export/` 100/100; both assertions red on the base markup.
