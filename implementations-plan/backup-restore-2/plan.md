---
plan: backup-restore-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at ad4de50d8
trunk: dev
issues: none (tracked privately)
post_implementation_hardening: not scheduled
---

# backup-restore-2: a restored transaction row belongs to the restored profile

One arc, one PR against `dev`, branch `backup-restore-2-a1`. A full-backup restore binds every transaction row to the profile it creates and to one of that profile's accounts, and a row whose account the restore drops later is purged before the restore finishes. The finding is tracked privately; this plan states only the change and the invariants it keeps. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src`; `S` = `wallet/services`.

## Outcome & Quality Bar

- **For whom**: a person who restores a full backup file (their own, or one handed to them) beside profiles they already hold.
- **Excellent**: (1) every transaction row the restore leaves in storage names the created profile and one of its accounts, so nothing in the file reaches another profile's history or exports; (2) a restore of a person's own backup is unchanged: same accounts, same history, no new error rows, on Chrome and Firefox.
- **Good enough**: no new screen and no new copy a person meets on today's import path.

## Architecture & Implementation

Invariants, each enforced in `TransactionService`, the owner of the tx store, so no caller ordering is trusted:

- **I1** `restore(txs, profileId)` writes `TxSchema.parse({ ...tx, profileId })`, the threaded id, as `AuthRegistryService.restore` does (`S/auth-registry/service.ts:775`). A row's `ambiguous` flag is kept: it only hides a row.
- **I2** `restore` refuses (throws inside `restoreRows`, so the row gets `restoreError`) a row whose `accountScopeKey(chainId, account)` is not in `accountService.getAccountsRaw(profileId)`, read once under the tx lock. Check order: Pending, hash collision, parse with I1, I2, epoch, write.
- **I3** `TransactionService.init` registers `accountService.registerAccountPurgeSubscriber`, as auth-registry and token-balance do, and purges each dropped scope with `purgeForAccounts([address], profileId, chainId)`. So `reconcileImportedAccounts`, which awaits subscribers before it deletes a keyless imported account, removes that account's restored tx rows before the import finalizes. The `onAccountDeleted` listener stays for the other deletion paths; a second purge is idempotent. A rejected purge now stops the reconcile before it deletes any account row (dependents already purged stay purged), `settleHeldAccounts` propagates it, and the import rolls the created profile back, as it already does for a failed authwit or balance purge (`composables/useFullBackupImport.test.ts:618,2037`). No new recovery policy.

Control flow (order unchanged): profile restore → networks → `AccountService.restore` → the composable's account filter → keys → tokens → service slices (`TransactionService.restore`: I1, I2) → reconcile (I3) → `finalizeRestore`, whose integrity check re-derives every derived account and quarantines the chain or withholds the profile on a mismatch, as today.

**File-level change map**

| File | Change |
|---|---|
| `S/transaction/service.ts` | `restore`: I1, I2; drop the `D16:`/`B:`/`H:` tags in the comments it rewrites. `init`: I3. |
| `utils/full-backup-helpers.ts` | `normalizeAllIds` doc: it rewrites the key on every row that carries it, which is what it does. |
| tests | see each phase |

**Alternatives not taken**

- **A. Refuse at `AccountService.restore` a derived row the master does not derive** (the lane brief's item 3, with the password master stashed until finalize). Rejected: `nulo-v6.1` superseded `nulo-v6` in place (`packages/aztec-runtime/src/account/address-freeze.ts:108-132`), only the v6.1 artifact is vendored, and the epoch-5 note (`S/backup/backup-migration-registry.ts:66-72`) makes a `nulo-v6` backup's derived rows restore and the integrity check quarantine their chain. A restore cannot tell such a row apart from any other non-deriving row, so the check would drop a person's own accounts. The finalize-time check is that design: `S/profile/service.integration.test.ts:2829` pins that it runs before the session opens, and `S/account-integrity/coordinator.test.ts:286-312` pins its quarantine and withhold verdicts.
- **B. Check an imported key against its row's address at key restore.** Rejected for the same rotation: a `nulo-v6` imported row restores and use refuses it, and refusing it at restore loses a key no recovery phrase re-derives.
- **C. Make `normalizeAllIds` add the key to every tx row.** Gives a generic helper per-slice knowledge; I1 makes it redundant.
- **D. Make `TxSchema.profileId` required.** A stored-shape change; I1 gives the same guarantee for restored rows with no migration.
- **E. A change in the execution path.** Outside this lane's restore scope; reported to the orchestrator (§ Decisions, P4).

## Assumptions

**Facts** (recon.md cites each): `TxSchema.profileId` is optional; `normalizeAllIds` leaves a row without the key; the composable drops tx rows of accounts it did not import, silently; every live writer passes a fence, so `addTransaction` stores a `profileId` (`S/execution/transfer-executor.ts:474`, `S/execution/dapp-send-executor.ts:780,1301`); `TransactionService` registers no account-purge subscriber today, while auth-registry (`:145`) and token-balance (`:159`) do; `restoreImportedKeys` rewraps without checking key against address (`S/account/service.ts:1182-1193`); `restore` is reachable only from extension pages; a row error shows as the existing generic outcome plus a verbatim detail line; no stored shape moves.

**Inferences**

- I2 is unreachable through today's import: the composable filter keys on the same `(chainId, account)` and runs first. I2 holds the invariant at the store, as token-balance's ownership check does (`S/token-balance/service.ts:692-699`). Authwits are left as they are: their restore binds the profile id and their reads and purge are profile-scoped.
- I3 adds no lifecycle: it joins an existing awaited registration and its documented failure contract.

**Asks**: none open. OA-1 records the one new detail line; the arc ships its "what ships now" form.

## Security & Adversarial Considerations

- **Threat model**: the backup file is attacker-controlled (`S/backup/README.md`); the attacker can hand over its password. The boundary is between profiles in one wallet: rows from a file must not enter another profile's history, exports or account set.
- **Input validation**: I1 and I2 sit after the Pending and collision guards, inside the tx lock and the deletion fence. A refusal is a row error; the slice continues.
- **What stays as designed**: a derived or imported row that does not derive under this build is caught at session open (quarantine or withhold) or at use, never at restore (Alternatives A, B).
- **Secrets, crypto, supply chain, least privilege**: none touched. No log line carries an address (the logging policy).

## Phase 1: transaction rows bind to the restored profile and its accounts (I1, I2) ✓

- Change `restore` in `S/transaction/service.ts`.
- Add a `getAccountsRaw` stub to the tx restore tests (`S/transaction/service.test.ts`, `service.finality.test.ts`). Make the collision case in `S/cross-profile-isolation.test.ts` name the restoring profile's own account, and assert the collision message.
- Tests (`S/transaction/service.test.ts`): (a) a row with no `profileId` and a row naming another profile id, both naming the restored profile's account, are stored with the threaded id (red at the base); (b) a row naming an address the profile does not hold, and a row naming its address on a chain where it holds none, are refused with the account message and not stored, beside a stored control row.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test src/wallet/services/transaction src/wallet/services/cross-profile-isolation.test.ts`. Pass: exit 0, and (a) and (b) fail against the base copy of `service.ts`.

## Phase 2: a dropped account takes its restored rows with it (I3) ✓

- Register the subscriber in `TransactionService.init`.
- Add `registerAccountPurgeSubscriber` to the account fakes of the tx service tests.
- Tests (`S/cross-profile-isolation.test.ts`, real `AccountService` and `TransactionService`, a keyless imported account): (c) with the tx store's delete held behind a gate, `reconcileImportedAccounts` does not resolve and the account row stays until the gate opens; then the profile's tx row for the scope is gone, while the same address's row under another profile and the profile's row on another chain stay (red at the base, which resolves before the gate opens); (d) a rejected tx delete rejects the reconcile and the account row stays.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Pass: exit 0, and (c) and (d) fail against the base copy.

## Phase 3: a person's own backup still round-trips ✓

- Run at retry 0, Chrome then Firefox (`NULO_E2E_BROWSER`): the smoke files `tests/e2e/backup-roundtrip.test.ts` and `tests/e2e/backup-imported-account.test.ts` with `bun run test:e2e -- <files> --retry=0` after the armed smoke build; the network files `tests/e2e/network/backup-migration-roundtrip.test.ts` and `tests/e2e/network/backup-restore-integrity.test.ts` (it restores doctored tx rows through real storage) with `NULO_E2E_PROVERLESS=1 bun run e2e:agent <files> --retry=0`. No new scenario.
- Deviations: `agent.sh` runs only the network config, so the smoke files take the smoke command; the network files run proverless, as CI's network lanes do. No base run: no scenario is added or changed, so the README's before-and-after applies to none.
- **Validation gate**: every run green; each file's wall-clock per browser in `lessons/phase-3.md`. `bun run check:plans` green after staging.

## Decisions

- **P1 (round 1, Opus Plan leg: reject; Codex: conditional approve).** Opus blocked the restore-time derivation (verified, Alternative A) and noted the key restore does not check addresses (verified; the draft's Fact was wrong). Codex's conditions: correct that Fact (done); await the tx purge in reconcile (verified, I3); specify the stash's ownership (moot with A).
- **P2** Codex's smallest fix for imported rows (verify the key at restore) is rejected: Alternative B.
- **P3** Both legs keep I2 as cheap enforcement at the store; both keep `ambiguous` as it is.
- **P4** Out of scope: a change Opus proposed in the execution path, reported to the orchestrator with its trace.
- **P5** An existing residual in the tx purge's shared-ownership rule, reported to the orchestrator. It concerns unscoped rows, which restores before this fix can have stored; after it, no restore or live writer stores one. Codex round 2 corrected the draft's label for it.
- **P6 (round 2, Codex: conditional approve).** Conditions: state the purge-failure behaviour (I3, done); hold test (c) behind a gate and add the rejection case (d) (done); relabel P5 (done). Codex agrees P4 stays out of this arc.
- **P7 (round 3, Codex, resumed verification): approve.** "All three conditions are addressed in the revised plan … No new regression or blocking finding."

**Audit verdicts (implementation)**

- **R1, Codex: no new material findings; Opus diff review: no bugs.** Accepted: stale init comment and long guard comments rewritten, the dangling `D16` reference fixed, a kept `ambiguous` flag pinned in test (a) (`511a7a676`). Rejected: a separate malformed-row test (the fee-chooser test already fails without the codec). Deviation kept: the collision test pins the collision message instead of naming the profile's own account. Details: [lessons/phase-4.md](lessons/phase-4.md).
- **R2, Codex (resumed): no new material findings.** Converged.

## Delivery

One arc, A1 = phases 1-3, branch `backup-restore-2-a1` off `origin/dev`, one PR against `dev`, not stacked (D-orch-1), not a draft. Title: `fix(backup): a restored transaction row binds to the restored profile and its accounts` (86 chars). The body states the change, the invariants, the validation runs with outcomes and the per-browser e2e wall-clock; it names no weakness and refs no issue. The close-out is the PR's final commits. No lanes: the phases share one test harness.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `ad4de50d8`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, prompt files under `~/.cache/nulo-backlog/backup-restore-2/`; once, over the net diff from `ad4de50d8`, after phase 3; resumed with `resume-codex.sh`; hard stop at three rounds. Log each round in `lessons/phase-4.md`.
- Step 3: `gh pr create --base dev`, then `gh pr checks <n> --watch`. Add `e2e:extension-smoke` or `e2e:extension-network` only if the path filter skips a suite this change needs.
- Step 4: the Outcome block (Known limits, Open items, seeds retired), lessons promotion, `STATUS.md` deleted, `git mv implementations-plan/backup-restore-2 implementations-plan/archive/` in its own commit, index line moved; merge `origin/dev` first and read `index.md` and `lessons.md`.
- Step 5: after the merge, `agent-worktree done backup-restore-2 --merged`. A lead does not merge; the orchestrator does.

## Seeds

`/goal Phases 1-3 of implementations-plan/backup-restore-2/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged on the net diff (a resumed pass with no new material finding quoted); PR against dev open with the close-out commits; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/backup-restore-2 forward per its plan.md: reality check (plan, lessons, git status, PR checks), next pending step, fast gates after each edit, Codex for decisions, stop after 5 failures on one step; never merge.`
