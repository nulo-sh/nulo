# quality-popup-1 recon

Base: `origin/dev` at `cf9ed1e40`. Three Sonnet explorers plus the planner's own reading. Paths are under `apps/extension/src` unless they start with `tests/`, `scripts/` or `packages/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Backup trust gate (checksum, compat-epoch, schema range, migrate, profile shape, earlier-passkey body) | `composables/useFullBackupImport.ts:65-230`; its only non-UI deps are `@nulo/wallet-crypto`, `wallet/services/backup/{backup-migration-registry,backup-migrator}.ts`, `INTEGRITY_FAILED` and the `RestoreData`/`BackupProfile` types in `composables/full-backup-restore.ts:188,295-303` | adapt: move verbatim to `wallet/services/backup/` |
| Read and classify a picked file | `utils/full-backup-helpers.ts` (`readBackupFile`, `openSelection`, `unreadableSelection`; pure, "safe to import anywhere"); classification copied in `useFullBackupImport.ts:589-607` and `useRestoreAgain.ts:156-167,185-187` | build new: one pure module beside it (the helpers file is 584 lines and owns file formats, not refusals) |
| Open a sealed selection and classify | `openSelection` plus copies at `useFullBackupImport.ts:625-658`, `useRestoreAgain.ts:195-218` | same new module |
| Restore error log writers | `useFullBackupImport.ts:776-822` (`hasRowsBeyondRetry`, `errorLogWriters`); `full-backup-restore.ts` is Vue-free by its header, these use `Ref`/`toRaw` | adapt: own module in `composables/` |
| Networks a Retry replays | three `new Set(…retryable.map((item) => item.networkId))` sites: `useFullBackupImport.ts:771`, `useRestoreAgain.ts:334`, `full-backup-restore.ts:887` | adapt: one helper in `full-backup-restore.ts` |
| CTA predicates | `utils/full-backup-ctas.ts` (5 predicates; importers: both import pages, restore again, `import-helpers.ts`, `ImportFullBackupForm`) | reuse as is |
| Shared action-stack component | none: searched `components/composite`, `popup/components/modules` for `*Actions*`, `*Cta*`, `*ButtonStack*`, `*Footer*`; nearest are `DappApprovalFooter.vue` (fixed two buttons) and `TakeoverLayout.vue` (takeover layout) | not built (D7) |
| Password reveal toggle | `components/composite/PasswordVisibilityToggle.vue` (`tabindex="-1"`, host owns the flag), 9 users | reuse as is |
| Password field with reveal | none in `packages/design/src` (grep `password|visibility|reveal|eye`: only `Input` accepting `type="password"`); `Input` `#suffix`/`#bottom` slots | reuse `Input`; build the pair and the current field in L3 |
| New-password pair | `FilePasswordSection.vue` (L3, testid prefix scheme), `NewProfileCredentials.vue` (L4, unreachable from onboarding by `biome.json:491-526`) | adapt `FilePasswordSection`'s inner column into the shared pair |
| Current-password field | `SecretUnlockSection.vue` (no eye; 3 export users) | adapt |
| 128 cap | 10 declarations, no shared constant; `utils/password.ts` holds the other password rules | adapt: add the constant there |

## Facts the plan rests on

- Layering: no `biome.json` override restricts `src/wallet/**` or `src/composables/**`; the only production `@/composables` import under `src/wallet` is `wallet/storage/stored-shapes/backups.ts:1`. L3 (`src/components/composite/**`) may not import stores, `@/utils/core`, or service clients/services (`biome.json:408-455`); it may import `@/utils/*`.
- Auto-import: `vite.config.ts:113` auto-imports every export of `src/composables/`, `src/stores/`, `src/utils/`; the generated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` are tracked and regenerate on build. No SFC relies on an auto-import of the moved symbols (grep).
- Line citations: `tests/e2e/helpers/profile-chaos/model.ts:304-413` cites `useFullBackupImport.ts` lines 122, 134, 173, 445, 508, 596, 601, 641, 656 and `full-backup-restore.ts` 967; `checkers.ts:613` cites `full-backup-restore.ts:1000`, also a literal in `scripts/e2e/profile-chaos-model.test.ts:1532`; `model.ts` cites `ImportFullBackupForm.vue:140` and `useProfileImportFlow.ts:195`. That test runs in `bun run test` (`vitest.config.ts` includes `scripts/**/*.test.ts`).
- Pick flows differ beyond prefill: admission (`restoring` vs `progress || retrying || ended`), reset timing (the import clears status and passwords only after a readable pick; restore again clears them before reading), the reset itself (`dropAccountStateRetry` vs `dropRun`), and the catch's log line.
- Decrypt flows are the same apart from the import's name prefill (`useFullBackupImport.ts:647`).
- Retry runs share only the claim/`live()`/release frame around `retryAccountStateStage`; the import completes when no row is left, restore again re-checks the fence and narrows the page.
- `errorLogWriters.recordRestoreErrors` appends only when non-empty; both `RestoreIo.appendErrors` closures append unconditionally (a key alone counts as an error).
- Action stacks (`popup/pages/import.vue:264-368`, `onboarding/pages/import.vue:215-312`, `popup/pages/restore-again.vue:152-213`): labels differ in case and ellipsis (`…` vs `...`), testids differ (`import-full-backup-*`, `onboarding-submit-import` ×3, `restore-again-*`), onboarding is `size="large"` with `:loading` on Restore, Retry and seed, only the popup has the Finishing button, Back reads "Back" / "Back to methods" / absent, the passkey-reuse links differ in `compact` and testid. Restore again has no `fullBackupCta` (a three-field `cta`), no seed and no Back.
- Enter: the popup and restore again have page-root shortcuts naming Decrypt/Restore/Continue (popup) and Decrypt (restore again); onboarding import has none, pinned by `onboarding/pages/import.test.ts:302`. `refuseRepeatEnter` sits on popup and restore-again Decrypt, Restore, Continue, on no onboarding button.
- The popup page test mocks `useProfileImportFlow` wholesale (`popup/pages/import.test.ts:17`) and pins the exact read order of the page's `fullBackupCta` view (`:911`; onboarding `:578`).
- Since the squashed base (2026-10-06) 10 commits touched both import pages; 2 changed both stacks (`bd4e666b9` passkey-reuse links, `0266d1b24` retry result), each adding a shell-specific variant.
- Password pair sites: `FilePasswordSection.vue:26-59`, `NewProfileCredentials.vue:24-54`, `ImportSecretForm.vue:83-116`, `ImportFullBackupForm.vue:146-182`, `change-password.vue:177-212`, `unlock-method.vue:306-341`; `onboarding/pages/create.vue:233-259` has no toggle and no lock row. Five fit the `${testid}-input`/`-confirm-input`/`-input-visibility-toggle` scheme; change-password's repeat is `new-password-repeat-input`. Only `FilePasswordSection` puts a testid (`${testid}-hint`) on the hint. Every site with a pair already wraps it in `<Flex direction="column" gap="12">` (`NewProfileCredentials.vue:23` included). Each host owns its visibility ref, and in `ImportSecretForm`, `ImportFullBackupForm`, `change-password.vue` and `unlock-method.vue` that ref outlives the pair: `UnlockMethodChoice.vue:29` unmounts its password slot on a method switch, `ImportFullBackupForm.vue:140` and the pages' step `v-if`s remove it.
- `NewProfileCredentials`' `strengthHint` comes from `useProfileCreateFlow.ts:106-107`: `newPasswordHint(password, repeated)` for a password profile, `""` for a passkey one; `new.vue` renders the component only for a password profile.
- Current-password sites: `SecretUnlockSection.vue:25-53` (no eye, label "Password", clears on input and click), `unlock-method.vue:277-304`, `change-password.vue:141-174` (both with an eye, clear on input), `auth.vue:398-432` (programmatic focus, `autocapitalize`/`autocorrect`, `margin-top: -8px` alert, a second alert). Each puts the shake wrapper and the alert as two siblings of a 12 px column.
- No existing test pins restore again's parse-error, unrecognized-body or read-failure refusals at the pick (`composables/useRestoreAgain.test.ts:219-436`); its overtaken pick, on a read that resolves and one that rejects, is pinned at `:290-307`.
- Generated and tracked under `src/types/`: `auto-imports.d.ts`, `.eslintrc-auto-import.json`, `components.d.ts` (`vite.config.ts:113,125-128`); CI fails on a stale one (`.github/workflows/_build-extension.yml:114-121`).

## Other lanes on the same files

- quality-sdk-1: `full-backup-restore.ts:678-690`; both lanes shift the chaos citations into that file.
- quality-popup-2: `unlock-method.vue:137-142,256-258`, `auth.vue`. fu2-security-1 arc 2: `auth.vue`, `change-password.vue` (the toast). quality-services-1 arc 2: `auth.vue`.
- No open PR touches this lane's files at planning time (`gh pr list` filter).

## Known limits searched

`gh issue list --state closed --label known-limit --search "backup import restore again"`: #1116, #744, #1206, #455, #700; none bears on this refactor.
