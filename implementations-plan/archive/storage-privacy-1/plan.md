---
plan: storage-privacy-1
tier: mid
status: completed (2026-10-17): one PR against dev carries arc 1 and this close-out; OA-1 is open as #689
issues: "#660 (Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex review (gpt-6.1-sol high) with resume; one Opus Plan leg; a fresh final Codex pass
base: origin/dev at 13d5f8d0
trunk: dev
post_implementation_hardening: not scheduled
---

# storage-privacy-1: note receipts keyed by their note hash; local storage for trusted contexts only

Two changes in one arc. (1) An incoming-note row is keyed by the note's unique note hash, the leaf the protocol inserts when the note is created, and stores no nullifier; reconciliation matches a live note to its row by that key. (2) The worker restricts `chrome.storage.local` to trusted contexts where the browser offers the call (`Closes #660`). No UI change. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, a confirmation; the arc ships the standing rule's answer).

**Issue claims that did not hold:** #660's browser check is done (recon § Browser probe): Chrome 152 honours the call for `local` and keeps it across a relaunch; Firefox 153 has no such call, so the Firefox part becomes a known limit (D6). There is no declared minimum Chrome version; the API dates from Chrome 102.

## Outcome

- **Date:** 2026-10-17
- **Status:** completed. One PR against `dev` carries arc 1 and this close-out (`Closes #660`); merging it is the owner's call.
- **Shipped:**
  - A note receipt row is keyed by the note's unique note hash, and no stored key or value and no log line holds the note's nullifier. The composition test scans, settles and restarts over one store and checks both storage areas and the log buffer after every scan; its red run is in [lessons/phase-1.md](lessons/phase-1.md).
  - `NoteService.getNotesRaw` computes the hash and rejects when it cannot; `getNotes` does not hash (D2).
  - A moved row takes its note's `txHash` (D8).
  - The background sets `chrome.storage.local` to trusted contexts at every start, feature-detected and never blocking (D5, #660).
  - `SECURITY.md` names incoming receipts in the plaintext list and the access level in the content-script threat model.
  - `apps/extension/tests/COMPOSITION-TESTS.md` § Always: a never-happens check runs after every write it guards.
- **Dropped:** none. The Opus Plan leg's two rejected items are in the ledger; every arc-review comment nit was taken (`108cddf1`).
- **Known limits:** #687 (D6), #688 (D9).
- **Open items:** #689: OA-1, received rows on an updated install (ships A until the owner answers).
- **Deviations from the gates as written:**
  - `incoming-arrival` and `account-switch-isolation` are `@requires-proverless`: the runner refuses them without `NULO_E2E_PROVERLESS=1`, so both ran with it, as CI runs them.
  - Host load kept e2e off between the phases, so every e2e ran on the build carrying both. The first Chrome smoke started at load 154.7, over the 150 ceiling; the post-merge rerun started under it.
  - The review prompts of rounds 1 and 2 lacked the two verbatim rules of the post-implementation standard; round 3 carried them.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

## Outcome & Quality Bar

- **For whom:** a person whose received transfers the activity feed lists, and the maintainer of the incoming-transfer service.
- **Excellent:** (1) after discovery, settlement and a worker restart, no key or value the service writes to `storage.local` or `storage.session`, and no line in the log buffer, holds a note's nullifier, and the same run shows exactly one settled row per note; (2) on Chrome a content script reading `storage.local` gets an error, and the worker starts the same on a browser without the call; (3) the reconciliation code reads as before: one key, used for lookup and matching alike.
- **Good enough:** rows written by an earlier build stay until reinstall (D3). Firefox keeps its default access (D6).

## Assumptions

**Facts** (verified at 13d5f8d0):
- F1. A note row's id comes from `noteRecordId` (`incoming-transfer/spec.ts:117`) and its fields from `buildRecord` (`service.ts:2722-2750`), in `nulo:core:incoming-transfers` (`repository.ts:37,59`). Arrival rows store played ids (`arrival-state.ts:28-37`).
- F2. A note's unique note hash is `computeUniqueNoteHash(noteNonce, siloNoteHash(contract, noteHash))` (`@aztec-labs/stdlib@6.0.0-rc.3` `dest/hash/hash.js:37-65`); the PXE computes it to place the note in its tx and keys the note by its nullifier, never mutating it (`@aztec-labs/pxe` `dest/notes/note_service.js:113-154`, `dest/storage/note_store/note_store.js:9,37`). The nonce comes from the tx's protocol nullifier, whose preimage leaves out gas settings and call arguments (`stdlib` `dest/tx/tx_request.js:51-61`), while `txHash` hashes the kernel's public inputs (`dest/tx/tx.js:135-137`).
- F3. Therefore the position `(txHash, noteIndexInTx)` is not the note's identity: a fee-bump replacement re-mines the same note under a new `txHash`, and a reorg that re-executes a tx's public part can complete a different partial note at the same index. The unique note hash names the committed leaf in both cases; for the standard token note a receipt is built from (`UintNote`), the nullifier derives from that hash and the owner's key, so the two identify the same note. `ACTIVE_OR_NULLIFIED` reads return the same stored `NoteDao`.
- F4. The PXE wire already carries `noteNonce`, `noteHash` and `contractAddress` (`packages/aztec-runtime/src/pxe/schemas.ts:11-24`). Worker code already hashes with `@aztec-labs/stdlib/hash` (`wallet/utils/auth-registry.ts:6`), and in a worker `@aztec-labs/foundation`'s poseidon runs on `BarretenbergSync`, which `runtime.ts:467` initialises at start.
- F5. Nothing outside `incoming-transfer/` reads a note row's identity fields; record ids reach the popup only as opaque strings (recon).
- F6. Backups and migrations carry no incoming-transfer table. CLAUDE.md § Persisted-storage shape changes still states pre-production (no migrations), although both store listings exist (`BEFORE-LAUNCH.md` § 2: Chrome unlisted, AMO experimental).
- F7. Chrome 152 honours `storage.local.setAccessLevel` and keeps it across a relaunch; Firefox 153 has no such method. No content script or other untrusted context of the extension uses `chrome.storage` (recon).
- F8. `LoggerStore` keeps its lines in memory and copies them to the global `chrome.storage.session` only when retention is on (`wallet/logger/store.ts:45,94-127`).

**Inferences:**
- I1. The key names the note's creation, which the row's `txHash` already names.
- I2. The access level is start-up hardening, not a zero-window guarantee: Chrome applies it from the worker's first start, so code already running as the content script in a tab opened in the instant after install could read storage before the call completes. That residual is part of D6's known limit.

**Asks:** OA-1 recorded ([OWNER-ASKS.md](OWNER-ASKS.md)); implementation proceeds under its option A, the standing rule. The tier is the lane brief's `mid` (the spawn prompt's `light` defers to it).

## Architecture & Implementation

**Key (D1).** `noteRecordId(profileId, networkId, uniqueNoteHash)` returns `note:${profileId}|${networkId}|${uniqueNoteHash}`. The `clearScope` prefix is unchanged; the id keeps its length, under `ARRIVAL_ID_MAX`.

**Where the hash is computed (D2).** `getNotes` and `getNotesRaw` share a private read (fetch and per-note parse). Only `getNotesRaw` adds `RawNote.uniqueNoteHash`, from each `NoteDao` with `siloNoteHash` and `computeUniqueNoteHash`, outside the per-note parse-error catch, so a parse-error entry still carries it. A hash that cannot be computed rejects that read: the scan then stops before reconciliation and keeps every row, where an empty id would let two scans strike and delete a live row. `getNotes`, which the popup's Notes page calls, keeps its behaviour and its malformed-note tests. `RawNote` loses `siloedNullifier`. The incoming-transfer service never hashes, so it stays free of Barretenberg and composition-testable. The PXE wire schema is unchanged and still carries the nullifier into `NoteService`, which drops it.

**Flow.** Discovery skips a note without a `uniqueNoteHash` (today: without a nullifier); after D2 that guard only meets malformed input. The commit looks the row up by `noteRecordId(…, note.uniqueNoteHash)`. Reconciliation builds its map of live notes by that id (`notesById`, replacing `notesByNullifier`); `movedRows`, `needsBracket`, `forgetStrikes` and the bracket loop look rows up by `row.id`. `atPosition` adds `txHash`, and `moveNoteRow` rewrites it (D8), since a note can now be re-mined under another transaction.

**File-level change map:**
- `apps/extension/src/wallet/services/note/spec.ts`, `note/service.ts`: `RawNote.uniqueNoteHash` in place of `siloedNullifier`; the shared private read; `getNotesRaw` adds the hash.
- `apps/extension/src/wallet/services/incoming-transfer/spec.ts`: the header's keying lines; `IncomingNoteRecord` without the field; `noteRecordId`; the schema.
- `incoming-transfer/note-reconcile.ts`: `notesById(profileId, networkId, notes)`; `movedRows`, `needsBracket` by id; `atPosition` with `txHash`, its comment corrected (the note index does not move for one note).
- `incoming-transfer/service.ts`: lines 182, 1548, 1564, 1591, 1601, 1616, 1659-1672 (`moveNoteRow`), 1716, 1732, 2736-2737.
- New `apps/extension/src/wallet/utils/storage-access.ts` and its test; `apps/extension/src/wallet/index.ts` calls it after `registerContentMessageRelay()` (D5).
- `SECURITY.md`: § Storage privacy's plaintext list names incoming receipts (account, token, amount, transaction hash, note hash); § Content-script threat model gets the access-level line and the Firefox gap.

## Arc 1 (one PR, `Closes #660`)

### Phase 1 — note rows keyed by their note hash ✓

1. Change `note/spec.ts`, `note/service.ts`, `incoming-transfer/spec.ts`, `note-reconcile.ts` and `service.ts` as the change map says.
2. Adapt the fixtures that build note rows or `RawNote`s: the scenario suite's `note()` and `noteRecord()` factories (one default `txHash`, ids from `noteRecordId`, notes told apart by `uniqueNoteHash`) and its 55 sites, `note-reconcile.test.ts`, `service.test.ts`, `storage-codecs.test.ts`, `network-reset/service.composition.test.ts`, and the popup tests that build records (recon § Test surface). A pair that matches today must still match, so no test reaches strike or delete instead of the path it names.
3. `note-reconcile.test.ts`: one case each for a match, a move (block, and `txHash`) and a missing row, by id. Drop the note-index move case: one note's index cannot change (F2). In the scenario suite's re-mine table (`service.scenarios.test.ts:7160`), add "a new transaction": the same id, the new `txHash` stored, one Updated, one row, no second arrival (D8).
4. `note/service.test.ts`: with `@aztec-labs/stdlib/hash` mocked to deterministic fakes (Barretenberg does not load under vitest), `getNotesRaw` sets `uniqueNoteHash` from `noteNonce`, `contractAddress` and `noteHash` on both paths, and its output has no `siloedNullifier` key; a hash that throws rejects `getNotesRaw`. In the scenario suite: a notes read that rejects on two scans with verified tips leaves an unsettled row in place.
5. `service.composition.test.ts`, new test "no stored key, value or log line holds a note's nullifier, and discovery, settlement and a restart keep one settled row". Every stub stays constant (COMPOSITION-TESTS D4). The `NoteService` stub returns one `RawNote` that also carries a `siloedNullifier` by cast, as the wire does; a synced block whose hash is the reader's proposed hash; a block time. Choreography: scan 1 by the scenario suite's entry (`scanContract`, by cast) without tips: one unsettled row. Scan 2 with the reader's tips: settled. Then a new service over the same `FakeBrowserApi` and scan 3: still one settled row. Assert:
   - (a) the success controls: one note row, its id `noteRecordId("p1", "n1", uniqueNoteHash)`, unsettled after scan 1, `settled: true` after scan 2 and scan 3;
   - (b) the never-happens: the nullifier, with or without `0x`, appears nowhere in `JSON.stringify` of `storage.local.get(null)`, `storage.session.get(null)`, or the harness logger's `get(…)` buffer.
6. Update the e2e seeds to the shape the product writes: `tests/e2e/helpers/activity-seeds.ts` (`ReceiptSeed` takes a `noteHash` in place of `nullifier`), its two callers in `tests/e2e/rows.test.ts`, and the seed in `tests/e2e/network/incoming-transfers.test.ts`.

**Validation gate.** Commands from the worktree root:
- `bun run lint` and `bun run typecheck:all`: exit 0.
- `bun run --cwd apps/extension test -- src/wallet/services/incoming-transfer src/wallet/services/note`: green. Prove the composition test red once: with `buildRecord` still copying the nullifier, assertion (b) fails.
- `bun run test` and `bun run test:all`: exit 0.
- Smoke (it loads `dist/`, it does not build): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts --retry=0`: green.
- Network, one at a time, load1 under 150: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts`, then `incoming-arrival.test.ts`, then `account-switch-isolation.test.ts`: green. Real PXE notes reach rows only if the worker computed their hash, so these prove D2 end to end; no scenario is added.
- Layers: lint, typecheck, unit, composition, smoke e2e, network e2e.

### Phase 2 — local storage for trusted contexts ✓

1. Add `storage-access.ts`: an `async` `restrictToTrustedContexts(area)` that calls `area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` when the method exists and, on a throw or a rejection, logs `console.warn` with a fixed message and `{ error }`. It never rejects.
2. Call it from `apps/extension/src/wallet/index.ts` at module scope, right after `registerContentMessageRelay()`, with `chrome.storage.local`, as `void`.
3. `storage-access.test.ts`: present (called once with `TRUSTED_CONTEXTS`); absent (resolves, nothing called); rejected (resolves, one warning); and a source pin, in the manner of `legal/call-sites.test.ts`, that `src/wallet/index.ts` makes the call at module scope with `chrome.storage.local`.
4. Add the two `SECURITY.md` lines.

**Validation gate:**
- `bun run lint`, `bun run typecheck:all`, `bun run test`: exit 0, the new test included.
- Smoke on both browsers, each after its build with Phase 1's flags (`build:chrome`, `build:firefox`): Phase 1's smoke command, then the same under `NULO_E2E_BROWSER=firefox`: green. Chrome shows extension pages still read storage under the restriction; Firefox shows the worker starts without the call.
- No e2e is added: the recon probe proved the browser's behaviour, and the unit and pin tests prove ours (D5).
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

## Security & Adversarial Considerations

- **Threat model:** a compromised content script (`SECURITY.md` § Content-script threat model rates it High) and the boundary of which contexts reach `storage.local`; for incoming rows, the invariant that no row or key holds a nullifier, which stays in the PXE's per-profile encrypted store.
- **The key:** the unique note hash adds nothing the row lacks (I1). The nullifier reaches `NoteService` memory during a read and nothing after it.
- **Hostile input:** a sender controls a note's content and randomness, so it controls the inner `noteHash` but not the nonce; two notes cannot share a unique note hash without sharing a note-hash-tree leaf (D1 (c)).
- **What stays:** rows of earlier builds until reinstall (D3, OA-1); the rest of `storage.local` as it is (#522, unchanged by this plan); Firefox's content-script access and Chrome's first-start instant (D6).
- **Fail-open:** a missing or failed access-level call leaves today's behaviour and logs one warning; it never blocks the wallet.
- **Crypto, supply chain, least privilege:** the protocol's own hash helpers from the pinned `@aztec-labs/stdlib`; no new dependency, permission or token.

## UI impact

None. No screen reads a note row's identity fields (F5); the received-detail route takes the id as an opaque string, as it does for `pub:` ids.

## Delivery

- One branch, one PR against `dev`, no stack (D-orch-1). Opened only after the Phase 2 gate and the Codex loop.
- Title (84 characters): `fix(storage): key note receipts by note hash; keep local storage off content scripts`.
- Body: what changed and why, in this plan's words; an install with rows from an earlier build must be reinstalled (D3); the gates with outcomes; the composition test's red-then-green proof; `Closes #660`. No e2e scenario is added, so no wall-clock table.
- `apps/extension/**` trips both e2e path filters; no label.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at 13d5f8d0:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once, over the whole diff, after Phase 2 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material defect; hard stop at three rounds.
- Step 4, close-out, as the PR's final commits: the `## Outcome` block; the D6 and D9 `known-limit` issues, each filed and closed; the lessons pass; `STATUS.md` deleted; `git mv` to `archive/` in its own commit, the index line moved to `archive/index.md`.
- Step 5, after the merge: `agent-worktree done storage-privacy-1 --merged`, triggered by `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/storage-privacy-1/plan.md`.

## Review verdicts and decision ledger

Competing outline (reviewed with the first draft): key rows by a keyed digest of the nullifier under a profile secret held by the worker while a session is open. Rejected as D1 (a).

- **D1 — the key: the unique note hash.** Alternatives:
  - (a) a keyed digest under a profile secret: a key in the worker on every scan, a new derivation, and an answer for restore and re-key, for no gain over (D1);
  - (b) a random id: matching a live note to its row needs a stored link back;
  - (c) the inner `noteHash`: not unique, since a sender picks the randomness;
  - (d) the position `(txHash, noteIndexInTx)`, the first draft's choice: not the note's identity (F3);
  - (e) `noteNonce` alone: a replacement can put another note under the same nonce;
  - (f) a digest of the nullifier under a public separator: equality with the nullifier stays testable.
- **D2 — `NoteService` computes the hash; `RawNote` drops the nullifier.** No worker consumer of the nullifier remains; the hash stays out of the composition-tested service.
- **D3 — no migration**, by CLAUDE.md's pre-production rule (F6). On an install that is not reinstalled, rows from an earlier build are not rewritten: unsettled ones are struck and then deleted by reconciliation, settled ones stay beside the new rows as duplicate received rows until reinstall. A purge or rewrite would be a migration; the PR body says reinstall. Whether reinstall-only delivery is acceptable while store listings exist is OA-1, which ships the rule's answer.
- **D4 — the proof.** One composition test over the real repository and storage double (the scenario suite runs on a hand fake, #540), with constant stubs and success controls; a `NoteService` unit test for D2; the existing network e2e for real PXE notes.
- **D5 — the access level.** At module scope in the worker entry, beside the other start-up registrations; feature-detected; fail-open with a warning; unit tests and a call-site pin; no e2e.
- **D6 — the access level's residuals.** One `known-limit` issue, closed in the same breath: Firefox 153 has no `storage.local.setAccessLevel`, so its content scripts keep the default access; on Chrome the level holds from the worker's first start, not before (I2). Reopen when Firefox ships the method (the feature-detected call then needs only a check), or if a stronger first-install guarantee is required.
- **D7 — one arc.** Both changes are small and independent; one PR.
- **D8 — a move rewrites `txHash`.** With the key free of the position, a re-mine under a fee-bump replacement keeps the row; `atPosition` compares `txHash` and `moveNoteRow` rewrites it, so the row names the transaction on chain. Today's code keeps the first `txHash` on a moved row.

- **D9 — a replacement of the user's own send.** A known limit, filed and closed: a receipt row naming tx A, re-mined under the user's own replacement B, would keep its row after B's own-send exclusion has run (that exclusion looks rows up by B's hash). It needs the wallet to build a replacement, which it never does: the wallet passes no salt, and the installed entrypoints mint `Fr.random()` for every request (`@aztec-labs/entrypoints@6.0.0-rc.3` `dest/account_entrypoint.js:57`, `dest/default_multi_call_entrypoint.js:29`). Reopen if the wallet gains a speed-up or cancel that reuses a send's salt.

**Codex round 1** (gpt-6.1-sol, high): `reject` (blocking: D1's identity equivalence is false; the session-storage proof does not observe `LoggerStore`'s sink). Accepted:
- The position is not the identity (fee-bump replacement; a reorg re-executing a public completion): verified in the stdlib sources (F2, F3); D1 moved to the unique note hash, D8 added.
- The log sink: the test reads the harness logger's buffer (F8).
- I2 rewritten as hardening without a zero-window claim.
- D2's wording: the PXE wire still carries the nullifier into `NoteService`.

**Codex round 2** (resumed): `conditional approve (with conditions: fail scans on identity-hash errors; preserve own-send exclusion when a row changes transaction hash)`. Accepted:
- A hash failure rejects the read instead of an empty id (D2), with a `NoteService` test and a scenario test.
- F3 scoped to the standard token note.
- Confirmed: D8 is local and leaves the receipt-fee cache alone (note receipts never reach it); the worker hashes only after `bootRuntime` has initialised Barretenberg, in Chrome and Firefox; two hashes per note need no cache.
- The own-send condition: the path needs a wallet-built replacement, which the wallet never builds, so it is D9, a known limit, not a change.

**Final Codex pass** (fresh session, gpt-6.1-sol, high): `conditional approve` (sanitise the committed context; resolve D2's popup read; a service-level D8 test). All taken:
- F1, the threat model, D3 and the recon now state the change and its invariant only.
- D2: a shared private read; only `getNotesRaw` hashes, so the popup's Notes page keeps its behaviour.
- D8: a "new transaction" row in the scenario re-mine table.
- The distribution assumption became OA-1; I2 restated as best-effort, its residual folded into D6; D9 cites the entrypoints' salt.

**Final Codex pass, resumed** (verification): `approve`. It agreed OA-1 does not block the arc under option A.

**Opus Plan leg:** `conditional approve` (approved the position key; it did not weigh the public re-execution path, which Codex traced). Accepted:
- The composition choreography (the first scan settled at once) and a non-vacuous never-happens check (the stub's note carries the nullifier by cast).
- D3's account of old settled rows, and "reinstall" in the PR body.
- One default `txHash` in the scenario factories; drop the note-index move case.
- The journal's send-expiry reason, stated in the Security section.
- The helper catches a synchronous throw (`async`).
- Its Ask (installs from the store listings): answered by F6, the owner's standing rule.
- Rejected: dropping the row's unused `noteHash` (outside this change), and an extra assertion in a network e2e (the composition and unit tests already cover it).

**Arc 1, post-implementation** (over `3e365e83..HEAD`):
- **Codex round 1** (fresh session, gpt-6.1-sol, high, read-only): `approve — required changes: none`. It checked the hash against the pinned PXE, the id matching and D8's fence, the invariant's sinks, the tests' failure modes, the start-up call on both browsers and the committed text.
- **Opus diff review** (alongside round 1): `approve`. One nit, taken in `280b29c4`: a scenario comment still named the old key.
- **Codex round 2** (resumed, verification of `280b29c4` and the e2e results): `approve — required changes: none`.
- **Codex round 3** (resumed, with the standard's two verbatim rules and the adversarial ask): `approve — required changes: none`, plus five low-severity comment nits, all verified and taken in `108cddf1`.

## Seeds

```
/goal Phases 1 and 2 of implementations-plan/storage-privacy-1/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/storage-privacy-1/lessons/phase-N.md printed per phase; the Codex fix loop (gpt-6.1-sol, high) converged with a resumed round reporting no new material defect, quoted; one PR against dev exists, opened after the loop, carrying the close-out (git show --stat of the archive-move commit in the transcript); bun run test and bun run lint report exit 0.
```

```
/loop 15m Drive implementations-plan/storage-privacy-1 forward. Each firing: read plan.md and lessons/ as the state; if the plan is archived on origin/dev, run agent-worktree done storage-privacy-1 --merged and stop; if a PR exists, babysit its checks; otherwise take the next unchecked phase, run its validation gate, mark ✓, log lessons. Decide with Codex (gpt-6.1-sol, high), never wait for the owner; never merge.
```
