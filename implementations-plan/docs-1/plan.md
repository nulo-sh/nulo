---
plan: docs-1
tier: light
status: planned; final Codex pass approve; arc 1 implementing (auto-continue)
issues: "#665 #667 #668 #672 (all arc 1); P38-01, P38-11 and P38-12 have no issue (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) plus the driver's read; one Codex round (gpt-6.1-sol, high) and its resume, one Opus leg on the wording
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# docs-1: the documents say what the code does

Three document picks the owner signed on decision page 38 and four small behaviour fixes. One arc, one PR against `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/`, `.github/` or a root document name.

The picks, as signed:
- **P38-01 = A**: "Keep passkey-only recovery; the documents state the real boundary plainly, through the private advisory first." The advisory is drafted (tracked privately). #597, which records the known limit, is not edited here; its text changes when the advisory is published.
- **P38-11 = A**: "Today's behaviour is the contract: raw hashes refused; inner-hash intents always confirmed with the consumer shown; SECURITY.md corrected."
- **P38-12 = A**: "Known limit: old files keep restoring; reopened on the first production user or a leaked old backup; the document is corrected."

## Issue claims that did not hold

Every claim of #665, #667, #668 and #672 holds at 2c0df3b9 (recon.md § Claims). Additions:
- **#668.** The guard misses six more test-only flags, not one (recon.md § Keys). Phase 4 refuses the class.
- **#665.** The viewer already handles a failed clear: it keeps its list and shows the existing "Failed to clear logs" toast (`components/JsonViewer/LogsViewer.vue:156-170`, pinned by `LogsViewer.test.ts` "a failed clear keeps the window live"). Only the store hides the failure.
- **P38-12.** Older password backups can also be unencrypted: encryption became mandatory with PR #55 (2026-10-09); v0.30.2 has neither #51 nor #55, v0.31.0 has both, and a plain file still imports (`composables/useFullBackupImport.ts:555-562`).

## Outcome & Quality Bar

For a reader of `SECURITY.md` or `packages/wallet-crypto/ATTACK-SURFACE.md` (a contributor, a store reviewer) and the person whose wallet runs this code. Excellent means:
1. Every changed sentence is true of the code at the PR's head, names the file that enforces it, and claims nothing stronger. The passkey boundary is stated as a boundary; no sentence describes how anyone could use it.
2. Each behaviour fix has a test that fails on today's code with a success control beside it; only the test that pinned the old behaviour is flipped.

Good enough: no rewrite beyond the named sections; stale paths are fixed only inside the sections edited.

## Assumptions

**Facts** (read at 2c0df3b9; both panel legs re-checked them):
- F1. `LoggerStore.storageOps` is `createSerialQueue({ onError: () => {} })` (`wallet/logger/store.ts:23`), which resolves a rejected op (`packages/wallet-core/src/utils/serial.ts:36-41`). The propagate form returns the op's outcome and continues past a rejection (`serial.ts:48-56`). `clear()` empties the worker's buffer before the removal (`store.ts:55`).
- F2. `applyRetentionPolicy()` runs in `.finally` of the config-load leg (`wallet/runtime.ts:463-466`): a rejection there would veto the boot.
- F3. `getEntropy` throws ``Invalid mnemonic word '${word}'`` (`packages/wallet-core/src/utils/mnemonic.ts:2131`), reached from `importMnemonic` with no earlier word check (`wallet/services/profile/service.ts:1670-1680`); `packages/extension-messaging/src/core/base-service.ts:124` logs it at debug, the RPC envelope forwards it, and copy-error copies it. The seed form renders only the error title (`components/composite/import/ImportSecretForm.vue:99-102`).
- F4. The env guard names five variables (`.github/workflows/_build-extension.yml:78-100`). Its four callers pass `with:` inputs only; a reusable workflow inherits no caller env. Only the e2e lanes set `VITE_*`, on their own jobs. `scripts/ci-cd/gh-step-harness.ts` runs a step under `bash -e -o pipefail` and returns stdout and the exit code, not stderr.
- F5. `refreshIfStaleQuotes` never checks a session (`wallet/services/price/service.ts:143-161`); the unlock handler awaits `ensureAlarm()` before its refresh with no re-check (`:209-214`); `onAlarmTick` treats `getActiveProfile() === undefined` as locked (`:178-184`).
- F6. `createAuthWit`: the schema copy and the scope check both refuse a raw hash (`packages/wallet-bridge/src/wallet-schema-args.ts`, `method-scope-checkers.ts:308-312`). Scope refuses an out-of-scope intent only when the app holds a transaction grant or a simulation grant with a transaction scope (`:214-224,282-300`). The confirmation card shows caller, target, function and arguments for a `CallIntent`, and consumer, inner hash and an opaque-authorization warning for an `IntentInnerHash` (`popup/windows/execute/OperationCard.vue:578-616`).
- F7. A password full backup carries a key made for that backup (`wallet/services/account/service.ts:1026-1050`); the file leaves the page only encrypted under the profile password that `openBackupTransfer` checked (`popup/pages/settings/security/export/full.vue:160-164,222,400,576-580`; PBKDF2 600 000 in `packages/wallet-crypto/src/encryption-key.ts:7`). A passkey backup carries the profile's DEK sealed under the passkey's wrap key (`full.vue:205-220`). The compat epoch has been 5 since the repository's first commit (`wallet/services/backup/backup-migration-registry.ts:80`), so older files restore; a password change rewraps the DEK and never rotates it (`profile/service.ts:1112-1133`).
- F8. The passkey master derives from the PRF output and the public credential id only (`packages/wallet-crypto/src/passkey-credential.ts:31-35,53-90`); the ceremony sets no `authenticatorAttachment` (`wallet/utils/passkey-ceremony.ts:65-69`); passkey import makes a fresh DEK (`profile/service.ts:2143`). `SECURITY.md` cites `src/wallet/services/passkey/credential.ts` and `src/wallet/services/profile/encryption/encryption-key.ts`, both gone.

**Inferences:** I1. No caller depends on `clear()` resolving after a failed removal: its one production caller maps a throw to the toast. I2. Nothing parses the "Invalid mnemonic word" text (one test matches `/Invalid checksum|Invalid mnemonic/`, `profile/service.integration.test.ts:900`).

**Asks:** none open.

## Architecture & Implementation

One arc, five phases, one new test file. Each phase is a commit.

**Phase 1, documents (P38-01, P38-11, P38-12).** `SECURITY.md` § Crypto-bound invariants: the label and `EncryptionKey` paths point at `packages/wallet-crypto/src/`; the Passkey RP ID bullet's last sentence becomes W1. § Authorization enforcement: both paths move to `packages/wallet-bridge/src/`; the `createAuthWit` paragraph becomes W2. `packages/wallet-crypto/ATTACK-SURFACE.md`: `:86-89` becomes W3; the backup row (`:42`) and `:99-101` become W5; the limitation at `:115-117` becomes W4. File the P38-12 known-limit issue first (five sections, label `known-limit`, closed as not planned in one command, reopening condition: the first production user, or an old backup known to have left the owner's machines), then write its number into W4.

**Phase 2, #665.** `wallet/logger/store.ts`: `storageOps` takes the propagate form. `clear()` returns the removal's outcome. The flush, the retention-off purge and `applyRetentionPolicy()` each swallow their own failure with `.catch(() => {})` (F2: a boot never fails on a log purge). The `enqueueStorageOp` TSDoc says the queue only orders and each caller owns its failure. The buffer still empties first (F1).

**Phase 3, #667.** `mnemonic.ts:2131` throws `Invalid mnemonic word at position ${wordIndex + 1}` (`wordIndex` is the word's place, `:2126`; `index` is its wordlist lookup).

**Phase 4, #668.** The guard step refuses every set, non-empty `VITE_*` variable except the two production build options, `VITE_FEE_JUICE_BRIDGE_URL` and `VITE_NULO_ALLOW_IFRAME_DAPPS` (`for name in $(compgen -e)`, one `::error::` per name, exit 1). An allowlist fails closed, so a new test flag needs no edit and no source scan. Its comment and `SECURITY.md`'s "enforced fail-fast" stay true.

**Phase 5, #672.** `doRefresh` returns the usable cache when `getActiveProfile()` is `undefined`, after the backoff check and before the request is built; across that await and the cache read it keeps the generation check (a kill-switch flip meanwhile returns `{}`). This is the one point every refresh path reaches (connect, unlock, re-enable, alarm) and the last await before `fetchFn`, so a lock during the unlock handler's `ensureAlarm()` is caught too. `onAlarmTick` keeps its check, which also clears the alarm. The class TSDoc (`:53-55`) says fetches start only while a session is open.

**Alternatives not taken.** #665: keep the report queue and rethrow from inside the op (two error paths in one queue). #668: a denylist with a source-scan drift test (more parts, still open by default); renaming flags to one prefix (touches every e2e lane). #672: the check in `refreshIfStaleQuotes` only (misses the unlock-handler path); documenting the locked refresh (the weaker posture).

### Wording

- **W1** (replaces "The derivation trusts the browser … (known limit #597)."): "The wallet holds no factor of its own: the master derives from the passkey alone, which is what lets a fresh install recover the master and every derived account from the passkey (imported keys come back only with a full backup). Who may use the passkey for this RP ID is decided by the browser and the authenticator, not by the wallet, and the wallet adds no restriction of its own (known limit #597)."
- **W2** (replaces the `createAuthWit` paragraph): "`createAuthWit` takes a `CallIntent` or an `IntentInnerHash`, never a raw message hash: the argument schema refuses a raw hash before the scope check and before any window (`packages/wallet-bridge/src/wallet-schema-args.ts`), and the scope check refuses it again (`packages/wallet-bridge/src/method-scope-checkers.ts`). The `from` account must be one the app's accounts grant allows. When the app holds a transaction grant, or a simulation grant with a transaction scope, a `CallIntent` whose call is outside that scope is refused, and so is an `IntentInnerHash` whose `consumer` contract that scope does not cover at any function; with no such grant, nothing is refused on scope. A `CallIntent` inside the scope is signed without a window only while the app's consent to sign authorizations without asking is in effect (`packages/wallet-bridge/src/dispatcher.ts`). Every other admitted request opens a confirmation: for a `CallIntent` it shows the authorized caller, the target contract, the function and its arguments; for an `IntentInnerHash`, the consumer contract and the inner hash, with a warning that the wallet cannot show what the hash authorizes."
- **W3** (replaces `:86-89`): "**The passkey path has no offline attack.** The master comes from the passkey's PRF output, which only the authenticator computes, after user verification; nothing on disk lets anyone compute it. A disk reader gets `credentialId` (a public identifier) and ciphertext they cannot key; there is no password to guess. The same design makes the passkey the whole secret: the wallet holds no second factor, so a fresh install recovers the master and every derived account from the passkey alone (imported keys come back only with a full backup). Against what is on disk, it is the strongest profile type on offer; beyond that, it is no stronger than the control the browser and the authenticator keep over who may use the passkey for its RP ID."
- **W4** (replaces `:115-117`): "**A password full backup made before PR #51 (2026-10-08; v0.30.2 and earlier) still restores and carries the profile's long-lived DEK; one made before PR #55 (2026-10-09) may also be unencrypted.** A password change rewraps the DEK and never rotates it, so whoever can open such a file and later reads the source profile's storage can open imported-key rows created after the export. Since v0.31.0 the file is always encrypted under the profile's password and carries a key made for that backup alone. Accepted while the wallet has no production users (known limit #709)."
- **W5** (`:42` becomes two rows; `:99-101` rewritten): password row "the master, the entropy, and a key made for this backup alone, under which its imported-key rows open (never the profile's DEK) | the profile's password at export time (a later password change does not touch the file)"; passkey row "the credential id, the profile's own DEK sealed under the passkey's wrap key, the imported-key rows | the keys open only with the passkey; without the optional password, the file shows accounts, contacts and activity". `:99-101`: "**A decrypted password backup is plaintext.** Master, entropy and the backup's own imported-keys key, in the clear. Since v0.31.0 the wallet writes the file only encrypted, which puts it on the strength of the profile's password; see the known limit below for older files."

## Phases

Every gate includes `bun run lint` and `bun run typecheck:all`.

- [x] **Phase 1, documents.** Tests: none (prose). Gate: `bun run check:plans` and `bash scripts/check-no-local-paths.sh` exit 0; `git grep -n 'wallet-sdk/capability-map\|passkey/credential.ts\|profile/encryption/encryption-key\|strictly the strongest\|long-lived profile DEK\|never leaves the device' -- SECURITY.md packages/wallet-crypto/ATTACK-SURFACE.md` prints nothing; the known-limit issue is closed with its label.
- [x] **Phase 2, #665.** Tests (`wallet/logger/store.test.ts`): flip "a removal that fails still resolves clear()" to "a removal that fails rejects clear(), and the next one still runs"; "removes all logs" stubs session storage and awaits. Guard test (passes today, fails if the boot catch is dropped): "a purge that fails at boot does not fail the boot". Deviation: no unhandled-rejection test; a `void` site cannot raise one, since each propagate-queue link already carries the tail's handler (`serial.ts:51`); its explicit catch states the caller's choice. Gate: `bun run --cwd apps/extension test src/wallet/logger src/components/JsonViewer` and `bun run test` green.
- [x] **Phase 3, #667.** Test (`packages/wallet-core/src/utils/mnemonic.test.ts`): a phrase with word 7 replaced by a marker string rejects with "Invalid mnemonic word at position 7" and the message does not contain the marker; the round-trip tests are the control. Gate: `bun run --cwd packages/wallet-core test` and `bun run test:all` green.
- [x] **Phase 4, #668.** Tests (new `scripts/ci-cd/build-env-guard.test.ts`, step found by name, run through `runStep`): exit 0 with nothing set, with both production options set, and with a `VITE_*` set to the empty string (controls); exit 1 with an arbitrary `VITE_X`, with `VITE_NULO_FEE_MULTIPLIER`, with `VITE_COINGECKO_API_KEY` and with a `VITE_NULO_E2E_*` name. Gate: `bun run test:ci-gating` and `bun run lint:actions` green.
- [ ] **Phase 5, #672.** Tests (`wallet/services/price/service.test.ts`): locked (`state.profile = undefined`) with an empty cache, `refreshIfStale()` fetches nothing and its `.quotes` is `{}`; locked with a partial cache seeded into storage, it fetches nothing and returns that set; `onActiveProfileChanged.invoke(PROFILE)` while `getActiveProfile()` answers `undefined` fetches nothing; a `showFiatValues` flip to `false` while a locked refresh awaits its session read returns `{}`. The unlocked pipeline tests are the control. Gate: `bun run --cwd apps/extension test src/wallet/services/price`, `bun run test`, `bun run test:all` green; smoke `cd apps/extension && bun run test:e2e -- tests/e2e/fiat-display.test.ts --retry=0` on Chrome once load1 < 150.

## Security & Adversarial Considerations

- **Documents.** W1 and W3 state two facts: the wallet holds no factor of its own, and the browser and the authenticator decide who may use the passkey. Neither says how, or by whom, that decision could be used. W2 and W5 state the enforced contract; W4 is the owner's accepted limit, with its reopening condition on the issue.
- **#665.** No boundary crossed; a false success stops, and the boot keeps its no-veto property (the Phase 2 guard test).
- **#667.** No recovery word enters an error message, so neither the debug log nor a copied error can hold one. The position is not secret.
- **#668.** The guard fails closed: any `VITE_*` other than the two production options stops the build. No token or permission changes.
- **#672.** No price request starts while no profile session is open, on any path. A request already sent when the lock lands completes; it has left.
- Supply chain and crypto: no dependency, no primitive changes.

## UI impact

None of the signed surfaces change. One failure path reaches existing behaviour: when the stored copy cannot be removed, Clear logs now shows the existing "Failed to clear logs" toast and keeps the viewer's list, where today it empties the list as if it worked; the worker's buffer is already empty and the stored copy stays until the next clear. No component, copy or layout changes, and the failure has no known trigger (D6).

## Decision ledger

Panel round 1: Codex `conditional approve` (W1 to W4 tightened, two gates corrected, the log-viewer change recorded); Opus `conditional approve` (W1 to W5 rewritten, a stale path, Phase 4 simplified). Every point below is adopted unless it says rejected.
- **D1, #665 queue form.** Both: propagate form, catch at the three swallowing sites; silent best-effort purge at boot stays (a retry or a report path adds obligations for a failure with no trigger).
- **D2, #667 text.** Both: name the position, never the word; the producer fix covers the log, the envelope and copy-error.
- **D3, #668.** Codex approved the denylist plus a `git grep` drift test; Opus proposed the allowlist. Adopted: the allowlist. It fails closed with fewer parts, and no build of this workflow sets any `VITE_*` today (F4). Opus: `test:release` gates nothing here (dropped); `::error::` text is not testable through the harness (the tests assert exit codes). Codex: test an exported empty value (added).
- **D4, #672.** Codex: the connect-path check alone does not hold for the unlock handler (trace at F5). Adopted: the check moves into `doRefresh`, the shared point before the request; this is the same one check, not a new mechanism. Codex: assert `.quotes`, seed the partial cache directly (adopted).
- **D5, wording.** W1: Codex found the draft said more than the boundary (adopted: cut to the two facts the owner named); Opus: "platform" is wrong (roaming keys work) and recovery does not bring imported keys back (adopted). Opus's added consequence sentence rejected for the reason Codex gave. W2: both found the out-of-scope case wrong (adopted Opus's text). W3: both: "never leaves the device" is false (`passkey-ceremony.ts:145`), "strongest" holds only against the disk (adopted). W4: Codex: the consequence needs the opened file (adopted); Opus: old files may be plaintext, versions beat dates (adopted). W5: Opus's protection columns adopted; I3 confirmed by both. Opus: `SECURITY.md`'s `EncryptionKey` path is stale in the same section (adopted).
- **D6, UI.** Codex round 1: the failed-clear path is an observable change needing sign-off. Driver: the viewer's own designed and tested failure behaviour now receives the failures it was built for; no surface, copy or row rule changes, and #665 is in the orchestrator's signed scope with `UI impact: none`. Codex's verification pass agreed: the recorded before/after and the orchestrator's notice suffice; it authorizes no other UI change. No `OWNER-ASKS.md` entry.

Codex verification pass: `conditional approve`; W1 to W5, D3 (allowlist, its shell tested under `bash -e -o pipefail`), D4 and the gates verified. Conditions, both adopted: the position counter is `wordIndex`, not `index` (the wordlist lookup); the locked early return in `doRefresh` keeps the generation check (path: session await pauses, fiat display is turned off, the stale refresh would return quotes). W2 now says "admitted request". Confirm resume: `approve` (no new material defect).

## Delivery

One arc on `worktree-docs-1`, one PR against `dev`, no stack. Title: `fix: log clear, phrase error, build env guard and locked price refresh; docs match the code` (≤ 93 characters, checked before `gh pr create`). Body: what changed and why, the three picks by id and text, each gate's outcome, `Closes #665`, `Closes #667`, `Closes #668`, `Closes #672`. No label at creation; the path filter runs smoke for `apps/extension/src`. Merge `origin/dev` in before the PR. Collisions: none on files (recon.md § Collisions); Phase 4's test is its own file because ci-dedupe-1 edits `scripts/ci-cd/behavior-gating.test.ts`.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 2c0df3b9. Specific here:
1. No diff review (`code_review: off`).
2. The review loop runs once over the diff from 2c0df3b9 after Phase 5: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` per round; both verbatim rules and the adversarial ask in every prompt; at most three rounds. One Opus diff review runs beside the first round. Rounds log to `lessons/phase-N.md` and the ledger.
3. Delivery as above, then `gh pr checks <n> --watch`.
4. Close-out as the PR's final commits: Outcome block (`Known limits:` the Phase 1 issue), lessons promotion, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, index line moved. Then report and wait; the orchestrator merges.
5. After the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/docs-1/plan.md`, then `agent-worktree done docs-1 --merged`.

## Seeds

Drafts; not run (the orchestrator owns sessions here). Recommended: `/goal`.

```
/goal In implementations-plan/docs-1/plan.md all five phases are marked ✓, each backed by its gate passing in the transcript and LESSONS_FILE=implementations-plan/docs-1/lessons/phase-N.md printed; the Codex loop over the diff from 2c0df3b9 converged (a resumed round with no new material point, quoted); one PR against dev exists (gh pr view output), opened only after that, carrying the close-out (git show --stat of the archive move); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/docs-1 per its plan.md: reality check (plan.md, lessons/, git status, PR checks); the next unticked phase and its gate; after Phase 5 the Codex loop, then Delivery and close-out; decide with Codex, never wait; stop at the hard limits; after the merge run the teardown.
```
