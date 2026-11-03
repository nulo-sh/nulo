---
plan: quality-popup-1
tier: light (the spawn prompt names it; one Codex audit at high on gpt-6.1-sol, plus one Opus Plan lens)
status: approved by the panel; arc 1 merged (#1595), arc 2 in progress
issues: "#1443, #1478 (arc 1, Closes); #1453 (arc 2, Closes); #1471 (not done, closed with its reason)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at cf9ed1e40
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-popup-1: the backup trust gate and pick classifier, one pair of password components

Four quality findings on the import pages and the password fields, all refactors a person never notices. Arc 1 moves the backup trust gate out of a composable into the wallet layer and collapses Restore again's copies of the import's pick, decrypt and error-log code (#1443); it also gives onboarding's import the repeat-Enter guard the other two shells carry (#1478). Arc 2 gives the new-password pair and the current-password field one component each and the 128 cap one constant (#1453). #1471 and the rest of #1478 are not done (D7, D8). The owner's word on these findings (2026-11-02) is the go: "If they are worth doing and legit. I'd do them." Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src` unless they start with `tests/` or `scripts/`.

## Outcome & Quality Bar

- **For whom:** the next contributor who adds a backup refusal, changes a decrypt or pick rule, or changes a password field's attributes (an `autocapitalize`, an error association, the cap).
- **Excellent:** (1) each of those is one edit: a refusal's copy and its classification live once, the trust gate lives in `wallet/services/backup/` and no wallet module imports a composable, a pair or current field attribute lives in one component. (2) Every screen, copy, testid, Tab stop, stored row and log line is as it was, proven by the existing tests, the pins each phase adds first, and before/after pictures for arc 2.
- **Good enough:** the shells keep their own action stacks (D7); `auth.vue` keeps its own field (D11).

## Assumptions

**Facts** (citations in recon.md):
1. The gate's dependencies are pure: `@nulo/wallet-crypto`, two modules already in `wallet/services/backup/`, one copy constant and two types now in `composables/full-backup-restore.ts`.
2. No lint rule or scan restricts `src/wallet/**` imports; `backups.ts:1` is the only production `@/composables` import there.
3. The two pick flows also differ in admission, reset timing, the reset itself and the catch's log line; the two decrypt flows differ only in the import's name prefill.
4. The chaos model cites nine lines of `useFullBackupImport.ts`, two of `full-backup-restore.ts`, eleven of `unlock-method.vue` and one each of `ImportFullBackupForm.vue`, `useProfileImportFlow.ts` and `create.vue`; `scripts/e2e/profile-chaos-model.test.ts` (in `bun run test`) fails when a cited line moves or its fragment goes. Two fragments (`EARLIER_PASSKEY_BACKUP.title, …`, `parseError.title, …`) go with the classifier and need new ones.
5. Onboarding import has no Enter shortcut (pinned); the CLAUDE.md repeat-Enter rules bind the controls a page's shortcut names or a key handler focuses.
6. The three action stacks differ in labels, ellipses, most testids (the popup and onboarding share the four error-screen ones), size, gap, loading, the Finishing button and Back; the CTA rules already live once in `utils/full-backup-ctas.ts`.
7. Five of six new-password pairs fit `FilePasswordSection`'s testid scheme; change-password's repeat field is `new-password-repeat-input`; only `FilePasswordSection` names its hint. Three hosts' visibility refs outlive their pair (both import forms on a method switch, `unlock-method.vue` on a step change); change-password's pair is unconditional.
8. `src/composables/`, `src/utils/` exports and `src/components/` SFCs are auto-registered; the generated `src/types/{auto-imports.d.ts,.eslintrc-auto-import.json,components.d.ts}` are tracked and CI fails on a stale one.

**Inferences:**
- I1. `NewProfileCredentials`' `strengthHint` equals the pair's own `newPasswordHint(password, repeated)` wherever the component renders (a password profile only); its test's injected-hint assertion becomes a model-driven one.
- I2. A fragment root (shake wrapper and alert stay siblings in the host's 12 px column) with `inheritAttrs: false` and `v-bind="$attrs"` on the `Input` keeps every host attribute where it lands today: `autofocus`, `label`, `placeholder` reach `Input`'s props, `data-testid`, `@input` and `@click` its root.

**Asks:** OA-1 (onboarding's create password fields) in [OWNER-ASKS.md](OWNER-ASKS.md); nothing in this plan depends on it.

## Claims that did not hold

- #1443: "the only intended differences between the two pick paths are name prefill and password clearing": admission, reset timing and the log line differ too (Fact 3); each stays with its caller.
- #1478: "CLAUDE.md's keyboard rule holds on two of the three shells": the rule binds controls a page's Enter shortcut names; onboarding import has none (Fact 5). Restore again has no seed or Back button and no `fullBackupCta`.
- #1471: "a shared component has to keep those differences as slots or props": true, and they are most of the stack (Fact 6), so the component does not pay (D7).

## Architecture & Implementation

**Arc 1 — the backup flows (branch `worktree-quality-popup-1`).**

- **Phase 1, #1443 gate.** New `wallet/services/backup/trust-gate.ts` takes, byte for byte, `FullBackupEnvelope`, the earlier-passkey field, `ValidatedBackup` (now exported), the result type, `INTEGRITY_FAILED` (from `full-backup-restore.ts`), the integrity, incompatible and `EARLIER_PASSKEY_BACKUP` refusals, `isEarlierPasskeyBody`, `isBackupProfile`, `validateAndMigrateBackup`, `refusedAsEarlierPasskey`, and the `RestoreData` and `BackupProfile` types, which describe the gate's output; `full-backup-restore.ts` imports them back. Importers re-point: both composables, `stored-shapes/backups.ts`, `useFullBackupImport.test.ts`, `useContactImportExport.composition.test.ts`, `account/full-backup-keys.test.ts`. `wallet/services/backup/README.md` (the trust-gate order and its file map) and `ARCHITECTURE.md:131` name the new file. The chaos citations of the moved lines re-point (`model.ts`, `checkers.ts`, the literal in `profile-chaos-model.test.ts`).
- **Phase 2, #1443 copies.** Pins first, in `useRestoreAgain.test.ts` through the public pick and decrypt: an invalid-JSON file shows its parse refusal, a plain body with no profile type shows `UNRECOGNIZED_BACKUP`, a read that rejects shows "Failed to read the backup file" and logs restore again's own line (the overtaken pick is pinned at `:290-307`). The import's matrix is checked the same way and any missing class lands first. Then:
  - New stateless `composables/full-backup-selection.ts`, beside `full-backup-restore.ts`: `UNRECOGNIZED_BACKUP`, `DECRYPTION_FAILED`, `ACCOUNT_FILE_NOT_BACKUP`, `BACKUP_READ_FAILED`; `readPickedBackup(file)` returns `{ selection, refusal? }` (earlier passkey as an unreadable selection, parse error, unrecognized, in today's order; the probe refuses earlier-passkey bodies only, as today); `decryptSelection(selected, password, banner, onOpened?)` opens the selected backup and publishes the result itself (the opened selection, then the import's prefill through `onOpened`; or the refusal with the unreadable selection for earlier passkey and account file, none for a wrong password), with no await between its last stale check and its writes (D14). The composables keep the pick's admission, the pick counter and its `overtaken()` check right after awaiting `readPickedBackup`, resets, the prefill and their log lines. Two re-pick races in `useFullBackupImport.stages.test.ts` pin the decrypt's checks: one queued from the opened body's parse, one from inside the earlier-passkey read, the last await before any write.
  - New `composables/restore-error-log.ts` takes `errorLogWriters` (now also returning the unconditional `appendErrors` both `RestoreIo` literals use) and `hasRowsBeyondRetry`, with the raw-row comparisons, the count-only log line and the deletion of an emptied key unchanged. `useRestoreAgain` then imports nothing from `useFullBackupImport`.
  - `retryNetworkIds(ctx)` in `full-backup-restore.ts`, used by `retryReplacedRows`, the import's `retryNetworkNames` and restore again's `retryNames`.
- **Phase 3, #1478 guard.** Pin first in `onboarding/pages/import.test.ts`: a repeat Enter keydown on Decrypt, Import and Continue is prevented, a fresh Enter is not (control). Then `@keydown.enter="refuseRepeatEnter"` on those three, as the popup and restore again have them.

**Arc 2 — password entry (branch `quality-popup-1-arc2`, on arc 1).**

- **Phase 4.** `MAX_PASSWORD_LENGTH = 128` in `utils/password.ts`; the six constants and four prop defaults (recon) use it.
- **Phase 5, new-password pair.** New L3 `components/composite/NewPasswordPair.vue`: `FilePasswordSection`'s inner column, generalised. Props `testids: { input; confirm; toggle; hint? }` (each host passes its exact ids; only `FilePasswordSection` names a hint, so no id is invented), `placeholder` (default "Enter new password"), `repeatPlaceholder` (default "Repeat password"; change-password alone passes "Repeat new password"), `autofocus`, `maxLength` (default the constant), `labelRepeat`; models `password`, `repeatedPassword` and `hidden` (the host keeps its visibility ref, so a remount does not re-mask); a default slot after the repeat field; the hint computed inside. Hosts keep their wrapper, section label and `@input` (it falls through to the pair's root, as it fell through to each `Input`'s). Users: `FilePasswordSection`, `NewProfileCredentials` (drops `strengthHint`, I1), `ImportSecretForm`, `ImportFullBackupForm` (its note in the slot), `change-password.vue`, `unlock-method.vue`. `FilePasswordSection.test.ts`'s pair cases move to `NewPasswordPair.test.ts` unchanged; new cases: the slot, an absent hint id, a revealed pair that stays revealed across a method switch in `ImportSecretForm`.
- **Phase 6, current-password field.** New L3 `components/composite/CurrentPasswordField.vue`: the shake wrapper, the `Input` and the fading alert, as a fragment with `$attrs` on the `Input` (I2). Props `error`, `errorText` (default "Wrong password"), `errorTestid`, `toggleTestid` (the eye renders when it is given: every eye in the tree has an id); models `modelValue` and `hidden` (host-owned, as in phase 5). Hosts pass `data-testid`, `placeholder`, `label`, `autofocus`, `autocomplete` and their clearing listeners as today. Users: `SecretUnlockSection` (no eye, label "Password", clears on input and click), `unlock-method.vue`, `change-password.vue`. The three `.error_text` and `.shake` copies go. `SecretUnlockSection.test.ts`'s field cases move to `CurrentPasswordField.test.ts`, on the real `Input` so autofocus and error clearing are proven.

**File-level change map.** Arc 1: `composables/{useFullBackupImport,useRestoreAgain,full-backup-restore}.ts`, new `composables/{restore-error-log,full-backup-selection}.ts`, new `wallet/services/backup/trust-gate.ts`, `wallet/services/backup/README.md`, `ARCHITECTURE.md`, `wallet/storage/stored-shapes/backups.ts`, `onboarding/pages/import.vue`, the tests named above, `tests/e2e/helpers/profile-chaos/{model,checkers}.ts`, `scripts/e2e/profile-chaos-model.test.ts`, the generated files under `src/types/`. Arc 2: `utils/password.ts`, new `components/composite/{NewPasswordPair,CurrentPasswordField}.vue` and tests, `components/composite/{FilePasswordSection,SecretUnlockSection}.vue`, `components/composite/import/{ImportSecretForm,ImportFullBackupForm}.vue`, `popup/components/modules/settings/new-profile/NewProfileCredentials.vue`, `popup/pages/profile/new.vue`, `popup/pages/settings/security/{change-password,unlock-method,export/full}.vue`, `composables/useProfileImportFlow.ts`, `onboarding/pages/create.vue` (the constant only), their tests, `tests/e2e/helpers/profile-chaos/model.ts` (the `unlock-method.vue`, `ImportFullBackupForm.vue`, `create.vue` and `useProfileImportFlow.ts` citations), the generated files under `src/types/`.

## Decision ledger

- D1. Two arcs, the second on the first (the lane brief's two-PR form): arc 1 the backup flows, arc 2 the password fields. Arc 2 touches `ImportFullBackupForm.vue` and `useProfileImportFlow.ts` after arc 1.
- D2. The gate lives in `wallet/services/backup/`, beside the migrator it calls; the types describing its output and its integrity copy go with it, so no wallet module imports `@/composables`.
- D3. The selection code is two stateless functions over today's helpers, in `composables/` beside the other backup-flow modules, not a helper that owns the pick counter and admission: the guards and resets differ by design (Fact 3), so owning them would take five hooks for twelve lines. The caller keeps the last fence after the await (Codex R1-1, Opus O1); for the decrypt, D14 supersedes this.
- D4. The error-log writers get their own module, so Restore again no longer loads the import composable; `full-backup-restore.ts` stays Vue-free.
- D5. The Retry run is not extracted: the shared frame is four lines around `retryAccountStateStage`, which already holds the shared work.
- D6. `BACKUP_READ_FAILED` joins the selection module; the pick-time copy stays out of the wallet layer.
- D7. #1471 is not done: the parameter objects would hide the form's contract and make both page tests' fakes rebuild production's CTA view (weakening the read-order pins), and a shared stack would need about fifteen props for the deliberate differences (Fact 6). Two of ten shared-page commits changed both stacks, each adding a shell-specific variant.
- D8. #1478: the component is not done (D7); the guard parity is an accessibility call under the owner's 2026-10-19 delegation. Plausible but unverified: a held Enter on a focused onboarding Continue calls `continueImport` per repeat, and neither it, the flow's `completeImport` wrapper nor onboarding's has a latch (`useFullBackupImport.ts:884-887`, `useProfileImportFlow.ts:252-254`, `onboarding/pages/import.vue:50-64`), while the same control refuses the repeat on the other two shells. The fix is local, three attributes and no state.
- D9. Testids pass as an exact `testids` object, so none is invented or renamed (CLAUDE.md § testid preservation; Codex R1-4 over Opus O5's named exception). `repeatPlaceholder` serves change-password alone: the copy cannot change and the other choice is a copy of the pair.
- D13. Visibility is a `hidden` model: the hosts whose ref outlives the field bind it (both import forms, both `unlock-method.vue` steps), so a method switch or a step change keeps a revealed field revealed, as today (Codex R1-2); the rest leave it unbound and the component holds it for the same lifetime their ref had (final pass).
- D14. Decrypt publishes inside the helper, not after it returns (implementation, arc 1 end gate). A stateless `openPickedBackup` left both pages the same fence-and-publish tail, a new production clone (`audit:dup` 178/8787 to 179/8794), and a gap after the helper's return that each page had to re-fence and pin. Writing through the page's selection ref and banner with no await after the last check removes the clone and the gap by construction; `audit:dup` is back to 178/8787.
- D15. Arc 2 is one PR from `origin/dev`, on branch `quality-popup-1-a2` (the orchestrator's spawn): arc 1 landed as #1595 before arc 2 began, so there is no stack to add to; the close-out rides at its end.
- D10. Per-site placeholders, autofocus and labels stay props; unifying them is copy.
- D11. `auth.vue` keeps its own field: its alert margin, programmatic focus, `autocapitalize`/`autocorrect` and second alert differ, and three other lanes edit the file. `create.vue` keeps its variant (OA-1).
- D12. Sequencing: quality-sdk-1 also moves lines of `full-backup-restore.ts`; whichever lane lands second re-cites. Arc 2 merges `origin/dev` before its PR, after quality-popup-2 and fu2-security-1 arc 2 where they share `unlock-method.vue` and `change-password.vue`.

## Security & Adversarial Considerations

- **Threat model.** A backup file is hostile input. The refactor moves the gate that judges it and the code that classifies it; the risk is a changed order, a lost check or a refusal mapped to the wrong copy, not new input.
- **Invariants kept, with proof:** trust-gate order (checksum over the original body, compat-epoch, schema range, migrate, profile shape, earlier-passkey body) byte for byte (`useFullBackupImport.test.ts` gate copy, `backup-restore-integrity` network e2e, the stored-shape R5 backups through `backupProblems`); a stale decrypt or an overtaken pick never publishes, with no await between the decrypt's last check and its writes (D14; the two re-pick races and the existing pick races); the pick-time probe refuses only earlier-passkey bodies, so validation still precedes every restore write; restore again accepts only the reminder's own backup (existing refusals tests); the backup-run client ownership is untouched. The error log keeps hostile rows out of the exportable log (count-only line) and compares raw rows. Password fields keep `autocomplete`, the cap, autofocus, the eye out of the Tab path (`tabindex="-1"`) with its state, and the error's `role="alert"` and `aria-invalid` (the moved component tests, on the real `Input`).
- **Logs:** no log line changes; restore again keeps its own read-failure line. **Crypto, supply chain, permissions:** no new dependency, no crypto change.

## Phases and gates

Every gate runs from the worktree root. A test command is `(cd apps/extension && bun --bun vitest run <paths> --retry=0)`. A smoke command builds the browser armed first, after any `audit:vue` (whose build is unarmed): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`, then runs `(cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0)`; the Firefox run puts `NULO_E2E_BROWSER=firefox` on that test command (the selector defaults to Chrome). The base wall-clock and the base pictures come from an armed build of `cf9ed1e40` (arc 1) or arc 1's head (arc 2), made the same way. Pass: exit 0 for each, no test skipped that ran on the base, the pins red against a deliberately wrong move once (shown in `lessons/phase-N.md`, then reverted).

- [x] **Phase 1.** `bun run lint`; `bun run typecheck:all`; tests `src/composables src/wallet/storage/stored-shapes src/wallet/services/backup src/wallet/services/account/full-backup-keys.test.ts src/popup/components/modules/settings/contacts scripts/e2e/profile-chaos-model.test.ts`; `grep -rn "@/composables" apps/extension/src/wallet --include=*.ts | grep -v "\.test\.ts"` prints nothing.
- [x] **Phase 2.** Phase 1's gate plus tests `src/utils src/popup/pages src/onboarding/pages`; `grep -n useFullBackupImport apps/extension/src/composables/useRestoreAgain.ts` prints nothing.
- [x] **Phase 3.** The new pin; tests `src/onboarding/pages/import.test.ts`; lint; typecheck.
- [x] **Arc 1 end.** `bun run audit:vue` (its build regenerates `src/types/`: read the whole diff and commit it); `bun run test:all`; `bun run audit:dup` (production clones and dup lines no worse than 178 / 8787); smoke `tests/e2e/{backup-roundtrip,passkey-backup,restore-outcome,import-errors-scroll,import-dead-rpc,backup-migration,onboarding-import}.test.ts` on both browsers, wall-clock before and after; `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/restore-again.test.ts tests/e2e/network/backup-restore-integrity.test.ts` on Chrome; `bun run check:plans` after staging.
- [x] **Phase 4.** lint; typecheck; tests `src/components src/popup/pages src/onboarding/pages src/composables/useProfileImportFlow.test.ts scripts/e2e/profile-chaos-model.test.ts`; `grep -rnw 128` over the ten files prints only the constant.
- [x] **Phase 5.** Before pictures first (below). The new component test (at least ten cases, CLAUDE.md L3 minimum); tests `src/components src/popup src/onboarding scripts/e2e/profile-chaos-model.test.ts`; lint; typecheck.
- [ ] **Phase 6.** The same as phase 5 for the current field.
- [ ] **Arc 2 end.** Arc 1's end gate with smoke `tests/e2e/{security,security-backup,keyboard-guards,backup-roundtrip,passkey-backup,duplicate-phrase-import,auth-flows}.test.ts` on both browsers, no network run (no service path changes). Pictures: a scratch capture spec kept outside the repository, copied into `tests/e2e/` only to run and never committed (fu2-security-1's route), shoots New profile, Import (phrase and backup forms), Change password (with a wrong current password), Unlock method (both steps) and the three exports' unlock, light theme, Chrome, at the base and at the head; each pair is pixel-identical, and the PR attaches them.

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 (`gpt-6.1-sol`, high) | conditional approve | R1-1 the caller's fence after the decrypt helper's return, with a pin; R1-2 host-owned visibility (D13); R1-3 autofocus reaches `Input`; R1-4 exact testid object (D9); R1-5 `components.d.ts`; recon facts (overtaken pick pinned, `NewProfileCredentials`' column); I1's model-driven test | none |
| Opus Plan lens | conditional approve | O1 = R1-1; O2 `$attrs` on the `Input` (I2), over R1-3's explicit prop: fewer props, today's attachment points; O3 arc 2's citations and the citation test in phases 4-6; O4 `ARCHITECTURE.md:131`; Facts 4, 6, 8 corrected; the selection module in `composables/` (D3) | O5 keep invented hint ids as a named exception (D9 takes R1-4) |
| Codex final (fresh) | conditional approve | F1 smoke runs on an armed build of each browser at each compared revision, with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`; Fact 7 corrected to three hosts; D13 narrowed to the hosts whose ref outlives the field. I2, O2, O5's rejection, `toggleTestid` and D1-D12 confirmed | none |
| Codex final (resumed) | conditional approve, then approve | F2 the Firefox selector goes on the test command, not the build | none |
| Arc 1 Codex fix R1 (`gpt-6.1-sol`, high) | approve | comment cleanup: `validateAndMigrateBackup`'s doc to two lines, three captions that restate their names removed | none |
| Arc 1 Opus diff review | conditional approve | F1 a second re-pick race, inside the earlier-passkey read: the parse race could not tell where the last check sits; F2 the read-failure pin reaches the catch after the pick counter; F3 the name reset pinned from a set name; two comments that named their callers reworded; D3, phase 2 and the invariants line updated for D14 | none |
| Arc 1 Codex fix R2 (resumed) | approve | none: the fixes verified, no regression | none |

## Delivery

- **Arc 1** (phases 1-3): branch `worktree-quality-popup-1` to `dev`, `gh pr create`, ready, no labels at creation. Title `refactor(backup): the trust gate in the wallet layer, one pick and decrypt classifier` (85 characters). Body: what moved and why, "Not done, and why" for #1471 and #1478's component, the accessibility call (D8) under the owner's 2026-10-19 delegation, the gates with outcomes, `audit:dup` and the touched files' line counts before and after, `Closes #1443`, `Closes #1478`. #1471 gets its `## Decision` comment and closes when this PR opens.
- **Arc 2** (phases 4-6): `gh stack add quality-popup-1-arc2` after arc 1's loop converges; `gh stack submit --auto` when its own converges. Title `refactor(ui): one new-password pair, one current-password field, one length cap` (79). `Closes #1453`. The close-out is arc 2's final commits.
- **Parallelism:** none; arc 2 edits files arc 1 leaves.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `cf9ed1e40`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 per arc over that arc's diff (arc 1 from `cf9ed1e40`, arc 2 from arc 1's head), then one fresh pass over the net diff after arc 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; lessons promoted with a pruning pass; a comment on each issue left out; `STATUS.md` deleted; `git mv` to `archive/quality-popup-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/quality-popup-1/plan.md`, then `agent-worktree done quality-popup-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-3 ✓ in implementations-plan/quality-popup-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff from cf9ed1e40; a ready PR to dev closing #1443 and #1478; `bun run test` and `bun run lint` exit 0. Then phases 4-6 the same way on the stacked arc 2.
- `/loop 15m` Drive implementations-plan/quality-popup-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
