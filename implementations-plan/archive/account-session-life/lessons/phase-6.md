# Phase 3.4 and the close-out: lessons

## Start (2026-10-15)

- Base: `origin/dev` at `0266d1b2` (backup-import-export arc 3 merged as #454), branch `account-session-life-closeout`; `bun install --frozen-lockfile` first.

## Where § Phase 3.4 and the tree disagreed

1. **The fields the plan names survive #454.** `ImportFullBackupForm.vue`'s decrypt field (`import-full-backup-decrypt-password-input`) and `export/full.vue`'s encrypt pair (`backup-encrypt-password-input`, `backup-encrypt-password-confirm-input`, shown to passkey profiles only) are where the plan puts them; no mapping was needed.
2. **A test pinned the old state.** `ImportFullBackupForm.test.ts`'s real-`Input` case asserted `autocomplete: null` on the decrypt field; it now asserts `current-password`. The export pair had no assertion; `full-passkey.pins.test.ts` gains one case (the pair renders only on the passkey path).
3. **Another credential field has none.** The account-file import's "File password" (`popup/pages/settings/accounts/import.vue`, `import-account-password-input`) carries no `autocomplete`. P7-04 names only the two backup fields, so it is left as it is and filed (close-out).

## Gates

- 3.4: lint 0; typecheck:all 0; `bun --bun vitest run src/components/composite/import/ src/popup/pages/settings/security/export/` 100/100; both assertions red on the base markup.

## Final cross-arc pass (2026-10-15)

- Scope: the six lane commits from `643c0c9` (`fd474075`, `45075a31`, `15881c7d`, `1a8b2b6d`, `2aecbbbf`, `a9a4a1dc`) as one patch, files read at HEAD, since #454 edited `account/service.ts`, `spec.ts`, `profile/service.ts`, `profile/client.ts` and both 3.4 files after the arcs.
- Codex `gpt-6.1-sol` high, session `01a13d90-f36f-7ce2-8ac9-91f4364c1e8f`, read-only. Round 1 `CHANGES` (one Medium, two Comments); the Opus agent alongside `CHANGES` (one Medium, two Comments). All fixed (plan § Audit verdicts, X1 to X5). Round 2 `APPROVE`.
- The seam both Mediums sit on: arc 4 renders the unlock frame before the service answers, so everything that frame offers (the pill's profile list, New profile, Import, Delete profile) and everything it starts (its own last-active lookup) now runs while the mount's boot run is still deciding. Fixing one writer (X1) unmasked the other (X2): the late lookup had been selecting a profile just before the boot run decided, which made it settle.
- `typecheck:all` caught a test whose `as never` assignment narrowed `appStore.profile` to `never`; type the fixtures instead.
- #454 kept arc 1's schema rule: `satisfies Record<keyof Methods, …>` forced its new account method into `AccountMethodSchemas`.

## Close-out (2026-10-15)

- Filed: known limits #458 to #463, closed as not planned; open #464 (`confirmProfileOperation`), #465 (account-file autocomplete), #466 (OA-9, `owner-decision`). Dedupe searches found no twin. #137 commented for OA-9.
- `lessons.md` sat at 8,135 of 8,192 bytes: the Ready fact joins the 60 s popup-call entry and absorbs the dropped-port entry, ending at 8,183 bytes.
