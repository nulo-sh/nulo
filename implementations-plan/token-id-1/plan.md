---
plan: token-id-1
tier: light
status: plan approved (final fresh Codex pass approve); arc 1 implementing
issues: "#1457"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at f738cba62
trunk: dev
post_implementation_hardening: not scheduled
---

# token-id-1: a token id is never reused after a delete

#1457: token ids are allocated above the highest stored id, so deleting the highest-id token frees its id, and a failed or cancelled transfer record (it carries `tokenId` alone) is then shown with the next token's symbol and decimals and listed on its page. The owner chose the cause fix: a persisted mark so an id is never reused. Recon: [recon.md](recon.md). Paths are under `apps/extension/` unless they name another root.

## Outcome & Quality Bar

- **For whom**: a person whose send failed or was cancelled, who then deletes that token and adds another on the same chain.
- **Excellent**: (1) on an intact mark, no token receives an id an earlier token on this device held, after a delete, a restore or a released lock holder; (2) every stored row reads exactly as before, and a damaged mark never blocks adding, seeding or restoring a token.

## Assumptions

**Facts**
- F1. One root, `nulo:core:tokens`, holds every profile's and chain's tokens at `@<id>`; `nextNumericId` returns the first free id above the highest canonical safe-integer key and, past `MAX_SAFE_INTEGER`, walks down to the first free key (`src/wallet/services/id-allocators.ts:17-66`); the add (`src/wallet/services/token/service.ts:507`) and the restore (`:1050`) call it under the token lock.
- F2. A transfer record stores `tokenId`, `amountRaw` and the recipient, no contract (`src/wallet/services/execution/transfer-executor.ts:642-656`); one token's delete leaves it; the card and the token page resolve it by id over the profile's tokens on the active chain (`src/utils/journal-state.ts:402`, `src/utils/activity-rows.ts:98`, `src/composables/useScopedTokens.ts:75`). Demonstrated at the base with the unit harness (a scratch case, not committed): T and U both took id 1; T's failed record read title "U", amount "<0.000001", and was listed on U's page.
- F3. A record whose `tokenId` names no token renders titled "Transfer" with no amount (`src/utils/journal-state.ts:463`, pinned by `journal-state.test.ts:261`).
- F4. The full backup restores tokens through `TokenService.restore`, which gives each row a fresh id; `restoreRows` turns a row's rejection into its `restoreError`; the journal is not in a backup (`src/composables/full-backup-restore.ts:649`, recon).
- F5. Every token-row write and delete the add and the restore issue is issued right after a synchronous `ownsLock()` and tracked (journal writes are not: a failure journals after a release, by design), so a successor drains it before it reads (`token/service.ts:472-476,604-628`); the chain sweep deletes without the lock, by design (#262).
- F6. A device-wide structured value key is read and written raw by its service: `nulo:legal:accepted` (`src/wallet/services/legal/service.ts:59,77`; `stored-shapes.ts` `legalAccepted`).
- F7. Row ids are plaintext at rest (SECURITY.md § Storage privacy); 1.0.0 reached no store (CLAUDE.md § Persisted-storage shape changes).

**Inferences**
- I1. Only the journal holds a token id past its row in a way that reaches a successor (recon table), so the mark fixes #1457 and removes the precondition of #693 and #262 (a reused id) on an intact mark, with no consumer change.
- I2. Where the mark is absent (an install from before this build), deleted, rolled back, or pushed to `MAX_SAFE_INTEGER`, ids can be handed out again: allocate 1 to 5, delete 3 to 5, adopt the build, and the next adds take 3, 4, 5 (Codex R1, Opus R1). The consequence is today's: #1457's relabel, and #262's sweep path (plausible). No store build predates the mark (F7); restoring erased history needs a source the wallet does not keep. A closed `known-limit` issue at close-out.

**Asks**
- None. P94-04 decides the approach. Where the mark lives and how a damaged one reads are the panel's calls (D1, D3).

## Architecture & Implementation

- **The mark**: one device-wide plaintext structured value, `nulo:core:token-id-high-water` (`TOKEN_ID_HIGH_WATER_KEY` in `src/wallet/services/token/spec.ts`), a bare integer: the highest token id this device ever reserved. `decodeTokenIdHighWater(raw)` returns `raw` when it is a safe non-negative integer, else 0; the service and the registry's `read` share it.
- **The allocator**: `nextNumericId(storage, floor = 0)` starts above `Math.max(floor, highest key)`; the clamp and walk-down are unchanged; the balance repository passes no floor.
- **The reservation** (`TokenService.reserveTokenId(ownsLock, track)`): read the key raw (a rejected read propagates), decode it, take `id = nextNumericId(this.tokens, mark)`, return `undefined` when `!ownsLock()`, else `await track(storage.local.set({ [key]: Math.max(mark, id) }))` and return `id`. The add (`advanceAdd`) returns its `fetched` progress on `undefined` and resumes on a fresh reservation; `restoreRow` throws `tokenLockLost()`. The mark lands before the row, so a crash between the two skips an id and never frees one.
- **File-level change map**: `src/wallet/services/id-allocators.ts` (floor; the header names the walk-down as the one reuse left); `src/wallet/services/token/spec.ts` (key, decoder); `src/wallet/services/token/service.ts` (reservation, two call sites, the reuse comment at `:941`); `src/wallet/services/token-balance/service.ts:544` (comment); `src/wallet/storage/stored-shapes.ts` (`tokenIdHighWater`: `value` ref, `structured`, `z.number().int().nonnegative()`, the decoder); `src/wallet/storage/stored-shapes/goldens.json`, `snapshot.json` (generator), `pins.ts`; `src/wallet/storage/root-census.test.ts` (`PLAINTEXT` reason); `src/wallet/storage/stored-shapes.writers.test.ts`; `tests/e2e/helpers/profile-chaos/checkers.ts` (`FAMILY_GROUPS`, `background`: the seeder writes it too); SECURITY.md § Storage privacy. Tests below.
- **Not taken**: a sealed per-profile mark (D1); a JSON `ValueStorage` key (D3); snapshotting the token into the journal record (P94-04 chose the allocator; a record shape change); keeping deleted rows as tombstones (every tokens reader changes, not additive).

## UI impact

No layout, copy or format changes. A failed or cancelled transfer whose token was deleted renders as such a record does today when no token holds its id (F3) and is listed on no token's page; before, it took the next token's symbol and decimals. Sign-off: decision page 94, P94-04 (signed 2026-11-01), option A: "Persist a monotonic token-id counter so an id is never reused; one lane, an additive storage stamp, a test that deletes and re-adds."

## Security & Adversarial Considerations

- **Invariant**: on an intact mark below the top of the id space, a token id names one token for the device's life; the wallet's own writes never lower the mark.
- **T1 (reads storage)**: learns the highest id ever reserved. Row ids are already plaintext (F7), but the mark outlives every profile's deletion and every chain purge, so it keeps the device's lifetime count of reserved ids after the rows are gone. SECURITY.md lists the family and says so.
- **T3 (writes storage offline), or a damaged disk**: deleting, rolling back or garbling the mark, or planting a key or a mark near 2^53, brings back today's reuse (I2), never a refused add (D3, D4). Storage rejections still refuse an add or a restored row, as today.
- **Released lock holder**: the mark write is issued right after a synchronous `ownsLock()` and tracked (F5); `Math.max` over a stale read does not replace that check.
- **Backup**: no mark in an export; an import allocates above the device's mark. Logging: no new line. Crypto, permissions, supply chain: no change.

## Phase 1: the token-id mark (#1457; arc 1)

- Build the mark, the allocator floor and the reservation as above. Rewrite each comment that states token ids are reused as current behaviour. Register the family; run `bun run baseline:storage -- --additive "<reason>"`; add the printed pin.
- **Tests**
  - Unit, `src/wallet/services/token/service.test.ts`, `makeHarness`:
    - Reproduction: add T (6 decimals), delete T, add U (18 decimals) on the same chain. U's id is above T's. A failed transfer record shaped as `transfer-executor.ts` writes it (`tokenId` T, `amountRaw` "1500000"), through `buildJournalTerminalCardProps` with `tokenById` over `getTokens("p1", chainId)`, shows title "Transfer" and no amount; `rowOnToken` is false for U. Red at the base (F2).
    - Restore: add two tokens, delete the higher one, restore two rows: their ids are above the deleted one; delete the highest restored, add one through a second service over the same storage: a fresh id, so nothing rests on memory (Codex final, optional, taken if the harness takes a storage area in a line). Red at the base.
    - Released holder, two mutation tests (the base has no mark, so they fail there by timeout, not by assertion): (a) hold the add's mark read (`holdRead`, counting only the add's reads), release the lock, let a second add take ids 1 to 3 and delete 2 and 3, answer the read: the first add's id is neither 2 nor 3; red with the `ownsLock()` check before the mark write removed (traced by both legs). (b) Hold the add's mark write (`recordWrites` on the mark key, as `:1051` holds a row write), release the lock, start a second add: it resolves only after the write lands, with an id above the held one; red with `track` removed.
    - `test.each` (D3) over a stored string and a stored `1.5`, with token 1 live: the add gets id 2 and the mark reads 2. A rejected read of the key rejects the add and writes no row.
    - The hostile `MAX_SAFE_INTEGER` restore case (`:326`) also asserts the mark still reads the first walked-down id after the second; red without `Math.max`. The three cases that build a successor at a freed id (`:835`, `:1292`, `:1332`) keep every assertion and remove the mark before the restore, the I2 state (D8).
  - Composition, `src/wallet/services/token/service.composition.test.ts:205`: reject the first row's write (the first `set` naming a `nulo:core:tokens@` key) instead of the first `set`; that row leaves no row, and the next row's id is 2, so its reservation stays consumed. Red with the row written before the mark.
  - `src/wallet/services/id-allocators.test.ts`: `test.each`, a floor above the keys and one below them.
  - Registry: the writer case (an add and a restore, the stored value parses back) with its `Equivalent` entry (the tuple and its length go to 19) and schema-identity check, the `full` and `minimal` goldens, the census reason, the `FAMILY_GROUPS` entry.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/wallet/services/token src/wallet/services/id-allocators.test.ts src/wallet/services/token-balance src/wallet/services/backup src/wallet/storage src/utils/journal-state.test.ts src/utils/activity-rows.test.ts src/composables/useFullBackupImport --retry=0` green; the reproduction and restore cases red with the base's `token/service.ts` and `id-allocators.ts` (`git show f738cba62:<path>`); each mutation test red with its guard removed.
  - `bun run test:ci-gating` (the plans gate and `apps/extension/scripts/e2e/profile-chaos-model.test.ts` run under it): exit 0.
  - Network e2e, from the root, at retry 0: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/token-management.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`: the case passes, not skipped. No smoke file adds and deletes a token (recon), so this is the brief's add-and-delete file. No scenario is added (D6).
  - `bun run check:plans` after staging: exit 0.

## Decision ledger

- D1. One device-wide plaintext mark. The id space is one root shared by every profile and chain (F1), so only a device-wide mark makes an id unique and never reused; a per-profile mark still needs the highest key over every profile, adds a sealed root, a purge and key availability, and loses the guarantee once its profile is deleted. Plaintext keeps a lifetime count (Security, T1). Both legs agree.
- D2. The mark is written before the row, issued under F5's rule. Not after the row: a worker death between the two leaves a mark below a live row, which a delete then frees.
- D3. A damaged mark reads as absent and the next reservation overwrites it; a rejected read propagates. Codex R1 argued fail closed, so a damaged mark never reuses an id; Opus R1 showed that refusal blocks every add, seed and restore on every profile with nothing in the wallet to repair it, while T3 gets the reuse anyway by deleting the key. Codex, resumed, accepted that. A structured bare integer read raw (F6), not a JSON `ValueStorage` key, so no parse error has to be told apart from a storage error (Codex resumed: a `SyntaxError` catch cannot prove where the error came from).
- D4. The floor goes into `nextNumericId`, so the clamp stays one copy and the balance repository keeps its behaviour. At the top of the id space the existing walk-down keeps ids unique, not monotonic; `Math.max(mark, id)` keeps the wallet's own writes from lowering the mark (Opus R1). Not taken: refusing an id not above the mark (Codex R1), which a planted mark near 2^53 turns into a permanent refusal; Codex, resumed, accepted the walk-down as a named fault limit (I2).
- D5. Other allocators unchanged: balance ids are referenced only in memory and balance rows are deleted by full identity; authwit ids have no persisted lookup that reaches a successor; contacts, networks and FPCs use random ids; account ids are deterministic (recon).
- D6. No e2e scenario: the failure is the allocator and an id lookup, which the unit layer drives exactly; the network file proves the add and delete still work in both browsers.
- D7. I2 is a closed `known-limit` issue, not work: rows older than the fix are out of the lane, no store build predates the mark, and the faults need T3 or a damaged disk.
- D8. The cases that need a successor at a freed id keep proving the release fences, which still guard the I2 state, by removing the mark; rewriting them to expect fresh ids would drop the fence they pin (both legs).

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | the walk-down hands out an id below the mark (D4, fixed as `Math.max`); I2 widened; F5 narrowed; the mark's lifetime retention in Security; D8; mark-write hold, row-write failure and D3 cases | fail closed (D3) and refusing at the top (D4), both withdrawn on resume |
| Opus R1 | conditional approve | read a damaged mark as absent (D3); `Math.max` (D4); I2; D8; one reproduction case, not a `test.each` over the stage; the composition case targets the row write; the writers tuple; full paths | none |
| Codex R1 (resumed) | conditional approve | D3 and D4 as Opus; a raw read, not a `SyntaxError` catch; the guarantee holds on an intact mark only, and #262's path returns under a damaged one (I2); the composition case asserts no row and a consumed reservation | none |
| Codex final (fresh) | approve | F5 narrowed to token-row writes; the restore case re-adds through a second service over the same storage (optional) | an authenticated, rollback-resistant counter: key management for a display-only fault |

## Delivery

- **Arc 1** (phase 1): branch `worktree-token-id-1` to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, no labels at creation. Title: `fix(tokens): a deleted token's id is never given to another token` (65 characters). Body: the change, the UI impact line with both quotes, the gates with outcomes, no added e2e scenario, `Closes #1457`. The close-out is the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `f738cba62`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, once over the arc's diff from `f738cba62`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; I2 filed as a closed `known-limit` issue; a comment on #693 and #262 that their reused-id precondition now needs a missing or damaged mark (both stay closed); `STATUS.md` deleted; `git mv` to `archive/token-id-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/token-id-1/plan.md`, then `agent-worktree done token-id-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phase 1 ✓ in implementations-plan/token-id-1/plan.md, its gate passing in the transcript; the Codex loop converged on the diff from f738cba62 (a resumed pass with no new material point, quoted); a ready PR to dev closing #1457; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/token-id-1 from plan.md and lessons/: phase 1, its gate, the Codex loop, delivery, the close-out; never merge.
