---
plan: backup-preflight-1
tier: light
status: arc 1 in review
issues: "#934 (arc 1, Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ e8fe932d4
standard: implementations-plan/README.md § Post-implementation standard, read at e8fe932d4
---

# backup-preflight-1: a migration that cannot touch a backup's rows never refuses it

Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #934 | `backup-preflight-1-a1` off `origin/dev`, carrying this plan | `Closes #934` |

## Outcome & Quality Bar

- **For whom**: a person who imports a full backup made by an older Nulo after a release migrated a store no backup carries (networks, fee payers, the journal, incoming transfers, stale-network records); the author of that release's migration.
- **Excellent**: (1) such an import succeeds with the backup's data unchanged, and every refusal that guards real backup rows stays exactly as it reads today; (2) the next migration of an unsliced root needs no `IMPORT_BLOCKING_ACK` entry, and an imperative one still does.
- **Good enough**: no e2e scenario; `CLAUDE.md`'s guardrail phrase waits for #938 (D5).

## Assumptions

**Facts** (at `e8fe932d4`; detail in [recon.md](recon.md)):
- F1 #934 holds: after the brand check, `rejectBlockedOrUncoveredRef` checks each ref in turn, block-listed then uncovered, so an unsliced ref listed before a blocked one reports "no backup slice maps to" (`backup-migrator.ts:171-198`). No migration ships (`realMigrations` is `[]`), so nobody meets it today.
- F2 The scratch store holds only registered slice keys: normalize writes nothing else and refuses an unknown slice; denormalize refuses a key outside every registered root.
- F3 A row-map migration over a root with no row stages nothing, and an absent value is skipped (`row-map-migration.ts:117-130`, `staging.ts:37-45`). The engine writes only its own `nulo:schema:` keys, which denormalize skips.
- F4 `useFullBackupImport.ts:186-189` shows an `incompatible` reason verbatim. `baseline.ts:276-279` throws on any refusal, so `snapshot.test.ts` R3 (and #938's R5) reach the rule only through the real migrator; #938 matches the substring `migration ${block} `, which byte-identical reasons keep.
- F5 Three test files restate the uncovered rule: `footprint-coverage.test.ts:52-67`, `backup-migration-core.pins.test.ts:186-262`, `backup-migrator.test.ts:149-165`.
- F6 #938 edits lines 24-36 of `footprint-coverage.test.ts`, line 20 of the backup README, line 133 of `ARCHITECTURE.md` and lines 142-146 of `CLAUDE.md`, whose line 146 says such a migration blocks import "until #934". Git conflicts on a change to the next line; one unchanged line between merges.

**Inferences**: I1 While storage namespaces stay disjoint, a backup-safe migration's transform of one ref never sees another ref's rows (`up()` handles each root alone), so an unsliced ref of a mixed footprint changes nothing for its sliced refs. I2 Namespaces are disjoint today: no real root or value key contains `@` or names another root's row. Nothing refuses such a name (recon). An authored root `nulo:core:contacts@x` would match contact rows with ids `x@…` through staging's prefix read, live and in a backup alike, so both runs still apply the same transforms; denormalize refuses a changed id. The "alike" argument does not cover a name aliasing a block-listed root's rows (`nulo:core:profiles@x`): the backup run passes profile rows through while the live run transforms them. Needs conditions the wallet does not support; no fix; a closed `known-limit` issue at close-out (Codex 3, Opus 1.1, Opus post-impl 3).

**Asks**: none for the owner. D1 departs from the brief's literal "whole footprint" wording; both panel legs back it, and the report and PR body flag it to the orchestrator.

## Architecture & Implementation

The fix deletes the uncovered gate. The rule, stated once at the preflight: lack of slice coverage alone never refuses a backup-safe migration; the brand, a block-listed root and a read of a required slice the backup lacks still do. The engine still runs that migration over the scratch store, where it finds no row (F2, F3); the result is `migrated` with the data unchanged. `CoverageIndex`, `buildCoverageIndex` and `rejectBlockedOrUncoveredRef` go; the block check reads `BACKUP_BLOCKED_ROOTS` inline. The rule is the per-ref form of the invariant: a migration that cannot touch a backup's rows never refuses that backup.

**Alternative not taken (D1)**: skip a migration only when its whole footprint is unsliced, and keep refusing a mixed one. It adds a predicate, and it still refuses a backup for a ref that cannot hold a backup row, which breaks the invariant above.

### Phase 1: The tests, red on the base ✓

- `backup-migrator.test.ts`, replacing `:149-165` with:
  - (a) a `defineRowMapMigration` v2 with an `addDefault` on `NETWORK_STORAGE_ROOT` and on the value key `TOKEN_PRICES_STORAGE_KEY`, from v1: `{ kind: "migrated", from: 1, to: 2 }`, and `data` equals `v1Data()`.
  - (b) the same footprint as `defineMigration`: exactly today's not-backup-safe reason.
  - (c) a row-map on each of `BACKUP_BLOCKED_ROOTS`: exactly today's block-listed reason.
  - (d) a mixed v2, contact `rename { legacyName: "name" }` beside the networks `addDefault`: `migrated`, `data.contact` as `v3` renames it, every other slice equal to the input.
- `backup-migration-core.pins.test.ts`: delete the "registry-uncovered root" pin (`:186-199`). Rename "blocked beats uncovered" to "a block-listed root refuses beside a root no slice maps to"; list `nulo:mystery` before the profiles root; same blocked reason. Change "uncovered beats absent-required-read" to expect the absent-read `failed` reason. The order comment becomes brand → blocked → absent-read.
- `footprint-coverage.test.ts`: move the loop body into a local `blocksImport(m)` returning `!isBackupSafeMigration(m) || touchesBlocked`. Delete `unmapped` and `coveredValueKeys`; keep `coveredRoots`. Add one test over scratch migrations, never registered in `realMigrations`: a row-map on `NETWORK_STORAGE_ROOT` (asserted absent from `coveredRoots`), the same refs as `defineMigration`, and a row-map on each blocked root. For each, assert `blocksImport` (false, true, true) and the exact kind the real import returns, `migrateBackupData({ data: {}, backupSchemaVersion: 1, migrations: [m] })`: `migrated` for the row-map on networks, `incompatible` for the others, with the result as the message. In the ack loop, also assert for every backup-facing migration that the same probe is `incompatible` exactly when `blocksImport` holds (an absent required read is `failed` there by design) (D3). Rewrite the header's rule sentence. Keep every hunk off lines 21-34 (F6).
- **Gate**: `bun run --cwd apps/extension test -- src/wallet/services/backup/`. Pass: exactly (a), (d), the two changed pins and the new coverage test fail, each on today's "no backup slice maps to" refusal; all else passes. Record the run in `lessons/phase-1.md`. Layers: unit.

### Phase 2: The fix, docs, full gate ✓

- `backup-migrator.ts`: the change above. Remove the `BACKUP_SLICE_REGISTRY` import if unused. Every remaining reason string stays byte-identical.
- Docs: the `backup-migrator.ts` and `footprint-coverage.test.ts` rows of `backup/README.md` (`:11-12`); "registry coverage" at `ARCHITECTURE.md:129`. Leave `CLAUDE.md` (D5).
- **Gate**: the Phase 1 command, all green; `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run check:plans` after staging. Then `git merge-file` the three shared files against #938's head (`gh pr view 938 --json headRefOid`) with their merge base. Pass: exit 0 each; `git diff --stat origin/dev...HEAD` names only the three test files, `backup-migrator.ts`, the two docs, `implementations-plan/index.md` and this plan's directory. Layers: lint, typecheck, unit.

## Security & Adversarial Considerations

- **Threat model**: the backup blob is attacker-controlled; the migrations and the slice registry are not. An attacker shapes slices only. Normalize writes only registered keys, so no hostile row can sit under an unsliced root (F2). A crafted id lands under its own slice's root and matches no other real root's `${root}@` prefix; only an authored aliasing name could (I2).
- **What stays refused**: an imperative migration (the brand check runs first, unchanged, and the brand stays non-forgeable); every block-listed root, mixed footprint or not; a read of a required slice the backup lacks. Tests (b), (c) and the two kept pins prove each.
- **Backstop**: a write outside every registered root still fails denormalize, fail-closed.
- No dependency, permission, credential, log line or message moves.

## UI impact

None. The "Incompatible backup" notice and every remaining reason it shows stay as they read. The one deleted reason needs a migration no build ships (F1).

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Delete the uncovered gate: an unsliced ref never refuses | refuse a mixed footprint (the brief's literal "whole footprint") | the unsliced part of a mixed migration cannot touch backup rows either (I1); less code; the sliced part keeps today's checks, as the brief asks |
| D2 | The engine runs the migration over the scratch store as a no-op | drop it from the `Migrator` run | the engine needs the whole version chain; the no-op uses it unchanged |
| D3 | `footprint-coverage` keeps its own `blocksImport` rule; exact kinds on the scratch migrations; agreement on every backup-facing one | export the preflight's predicate; the real import as the only oracle; kind-only agreement on the scratch cases | the rule stays readable where the ack list is; agreement catches a preflight refusal the rule misses, which would ship unacknowledged; exact kinds catch a `failed` regression (Codex 1, Opus 3.4) |
| D4 | No change to `snapshot.test.ts` (R3 here, R5 in #938) | add a carve-out there | neither restates the rule; both drive the real migrator, so the fix reaches them (F4) |
| D5 | Leave `CLAUDE.md:147` ("registry-covered footprints"); comment on #938 when this PR opens, naming that phrase and #938's own "until #934" clause on line 146 | edit it now (Codex 2) | line 147 is next to #938's 146, which must drop its "until #934" clause anyway, so the merge would conflict (F6) and the brief asks for a textual merge; #938 fixes both lines in one edit; the close-out fixes both if #938 merged first |
| D6 | No e2e scenario | a smoke import | nothing a browser could disagree on; the unit layer drives the real migrator; suite wall-clock unchanged |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a159d8`): `conditional approve (with conditions: assert exact agreement-test outcomes and correct CLAUDE.md before merge)`. Opus 5.5 Plan: `conditional approve (with conditions: restate the invariant per ref and flag D1 as a departure from the brief; put the unsliced root first in the blocked pin; test an unsliced value key; print the import result in the agreement assertion)`. Both back D1, D2 and D4 and call the pins change the exact new contract. Every claim checked against the tree:
- Codex 1, demonstrated (truth table): kind-only agreement passes a `failed` regression → exact kinds, result as message (also Opus C4).
- Codex 2 (fix `CLAUDE.md` now): rejected for D5's reason; Codex's own fallback, folding it into #938, is adopted with the comment on #938 (Opus 3.8). Codex rightly found #938's "until #934" clause (F6).
- Codex 3 = Opus 1.1/I1, needs unsupported conditions: an authored aliasing root or value key defeats "sees nothing", not the outcome → I1 and I2 qualified; no fix.
- Codex 4 = Opus C1: the one rule, per ref → Architecture's first paragraph; D1 flagged to the orchestrator (Asks).
- Opus 3.2, plausible: the blocked pin with profiles first passes a fix that stops at the first unsliced ref → `nulo:mystery` first.
- Opus F-recon, demonstrated: `token-prices` and `token-list` are unsliced JSON value keys; the deleted value branch had no test → (a) adds one; recon fixed.
- Opus 3.4, plausible: a future preflight refusal the rule misses ships unacknowledged → agreement over `backupFacing` (D3).
- Opus F1 (the check order), F4 (#938's substring match), 3.9 (the diff-stat gate missed `index.md`): fixed.

**Round 2** (Codex, resumed, verification): `approve`, no remaining material finding; D5's fallback accepted without new evidence to reopen it.

**Post-implementation round 1** (diff `origin/dev...backup-preflight-1-a1`). Codex (gpt-6.1-sol, high, session `01a159f0`): `FINDINGS: 0`. Opus 5.5 diff review: `FINDINGS: 4`, each checked against the tree:
- Opus 1, demonstrated: #938's line 146 also cites "until #934"; D5's relay and fallback covered only line 147 → both named (D5, step 4).
- Opus 2, plausible: `importOf` used `data: {}`, so a migration reading a required slice stopped at the absent read and the loop proved only "not refused" → the probe seeds `emptyBackup()` (`stored-shapes/baseline.ts`, now exported; one line, clear of #938's hunks) and asserts the exact kind for every backup-facing migration.
- Opus 3, needs unsupported conditions: a ref aliasing a block-listed root's rows now passes the preflight → I2 qualified; known limit at close-out; no code change.
- Opus 4: two test names claimed more than they checked → renamed.

**Post-implementation round 2** (Codex, resumed): `FINDINGS: 0`; converged. Final head: `lint`, `typecheck:all`, `test:all` (every workspace), `check:plans` exit 0.

## Delivery

- One PR against `dev`, opened ready after Phase 2 and the Codex loop. No label at creation.
- Title: `fix(backup): a migration of a store no backup carries no longer refuses old backups` (83 characters).
- Body: the invariant; the change; the gates with outcomes; no e2e scenario, so no suite wall-clock moves; D5; `Closes #934`; the Claude Code line.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `e8fe932d4`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 2, over `git diff origin/dev...backup-preflight-1-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`. Do not merge.
- Step 4: the close-out as the PR's final commits; merge `origin/dev` first. If #938 merged by then, fix `CLAUDE.md`'s "registry-covered footprints" and drop its "until #934" clause (D5). File I2's aliasing as a closed `known-limit` issue.
- Step 5 after the merge: `agent-worktree done backup-preflight-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/backup-preflight-1/plan.md` succeeds.

## Seeds

`/goal`: `implementations-plan/backup-preflight-1/plan.md arc 1 is done: Phases 1-2 marked ✓, each gate reported passing in the transcript; the Phase 1 red run recorded in lessons/phase-1.md; the Codex loop converged, quoted; the PR exists against dev with Closes #934; bun run test:all and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/backup-preflight-1 arc 1 per its plan.md (read it and lessons/ first). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 2, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`
