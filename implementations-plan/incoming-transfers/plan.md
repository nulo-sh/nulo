---
plan: incoming-transfers
tier: mid
status: arcs 1 and 2 merged (#248, #420); arc 3a in review (#426); arc 3b built, at its boundary gate
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: arc 3b revision: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: plan at origin/dev ac259a7; arc 3b at origin/dev 264a4b30
trunk: dev
issues: [92, 97, 138, 139, 140, 141, 142, 143, 144, 227]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md) (§ Answers holds
page 4's). Recon: [recon.md](recon.md). Arcs 1 and 2: ledger D1 to D20, D-orch-1 to 11, audit
verdicts, assumptions and residue in [decisions.md](decisions.md); design and phases here at `264a4b30`.
Over the 350-line target by the build's audit verdicts, kept whole as this arc's evidence.

## Lane state

| Arc | Issues | State |
|---|---|---|
| 1 | #227, #144, #92 | merged, #248 (`9574a9de`) |
| 2 | #143, #138 | merged, #420 (`264a4b30`); P4-04, OA-5 A |
| 3a | #142, #97 | in review, #426 (head `6998ac16`), from `worktree-incoming-transfers-links` and this file's Arc 3 text; P4-01, P4-02b A, OA-2 A, OA-3 B, OA-6 A; not planned here |
| 3b | #141, #139, #140 | this revision; OA-4a A and OA-4b A govern its tap path (#141 addendum); the close-out follows 3a and 3b |

## Outcome & Quality Bar (arc 3b)

**For whom.** A person who opens a received public transfer, with privacy mode off (the default) or
on, and a person whose received row a reorg moved or dropped. **Excellent:**

1. Mode off: the fee loads on open, as today. Mode on, unknown or unreadable: opening the page sends
   nothing that names the transaction; only a "Show fee" press does; a fee already held shows at once.
2. An open received page and the feed follow a re-mined receipt to its stored block, fee row included.
3. A private receipt whose note the PXE no longer holds leaves the feed; a row seen on the finalized
   chain, or whose note was spent, stays; a moved note shows its new position.
4. Each rule has a test that fails with its mechanism reverted, beside a success control. **Good
   enough:** one new Settings row (OA-8), no other new words; the lookup itself unchanged.

## Architecture (arc 3b)

### #141: the receipt fee under privacy mode (F1 to F4)

- **Setting.** `privacyMode: z.boolean().default(false)`, global, not restorable (D29). Settings →
  Privacy gains a third row under Block Explorer, built as the Show fiat values row, with `Toggle`
  `privacy-mode-toggle` and OA-8's words.
- **Background.** `getCachedReceiptFee(id)` returns the record's cached fee or `null` from the record
  and the in-memory cache, with no network call (D26). `getReceiptFee`'s failure line logs a fixed
  message and `{ errorName }`: its hash prefix and the RPC message, which can echo the hash, go (R1 C5).
- **Popup.** `useReceiptFee` (C1, D27) takes the two calls and exposes `state` (`loading`, `shown`,
  `tap`, `none`), `feeJuice`, `load(record, tapOnly)`, `show()` and `dispose()`, each guarded by a
  `createRunFence` run. `load`: a note receipt has no fee row; `tapOnly` false: `getReceiptFee`, then
  `shown` or `none`; true: `getCachedReceiptFee`, then `shown` or `tap`. `show()` acts only in `tap`:
  `getReceiptFee`, then `shown`, or `tap` on `null` (OA-4a A).
- **The page.** `privacyMode` starts `null`; `tapOnly` is `privacyMode !== false`, so unknown and
  unreadable count as on. It is read with `useConfigRead`, follows `configService.onUpdate`, and goes
  back to `null` on the client's `onDisconnected` until the reconnect read lands (D25, R1 C2, F C1).
  The mount's `fee.load` runs once the first read settles; an Updated before then only replaces the
  record; a mode change starts no lookup. The row shows the
  shimmer, then `received-fee-value`, a native `<button type="button">` "Show fee"
  (`received-fee-show`) or the dash (`received-fee-none`). The header's "Privacy maxi" paragraph
  becomes the invariant. The dead `appStore.isPrivacyModeEnabled` and its shape pins go (D30).

### #139: open screens follow a re-mine (F5, F6)

- `rewriteMovedRecord` returns the rewritten record or `null`; `emitUpdatedIfShown(record, fenced)`
  emits Updated under the Added gate (`service.ts:2372-2374`): `!record.hidden &&
  (await this.isVisibilityEnabled()) && fenced()`. The public reconcile branch and #140 call it.
- The feed's `onUpdated` patches the row, then calls `refresh()`, whose `fence.begin()` drops any read
  that predates the update; `deletedDuringRead` keeps Deleted's precedence (R1 C3).
- The page listens to Updated beside Deleted: for its id and not tombstoned, it replaces the record
  and calls `fee.load` (the fee reloads with the mode off, returns to "Show fee" with it on, D28). An
  update during the first read is held and wins over it; a Deleted wins over both.

### #140: note rows reconciled against the PXE (OA-1 A; F7 to F11)

decisions.md D10's design (`settled`, two strikes, a bracketed `ACTIVE_OR_NULLIFIED` read), changed as:

- `scanNoteTarget` passes its shared tips into `scanContract`; `NoteService.getSyncedBlock(networkId)`
  returns the PXE anchor's `{ number, hash }` from `getSyncedBlockHeader` (R1 O2).
- **Verified anchor** (R1 C1): the PXE's block stream swallows a failed sync, so a notes read can
  answer from a stale anchor. A bracket is verified when the synced reads before and after it both
  carry the tips' `proposedBlockHash`; only a verified bracket settles, strikes or deletes.
- **Position** is block number, transaction index and note index (all on `RawNote`), so a same-height
  re-mine is a move (R1 C4). A pure `note-reconcile.ts` classifies; the service writes (D33).

Per (account, contract), after the `ACTIVE` read and the per-note commits:

1. Rows: that scope's unsettled note rows (`repo.listByContract`). One present in the `ACTIVE` read at
   another position is moved; nothing else is decided from that read.
2. When a row is missing from it, or a present row is at or below the finalized tip: `s1`, the
   `ACTIVE_OR_NULLIFIED` read, `s2`. Per row: at its position and at or below the finalized tip:
   settle; at another position: moved; missing, at or below `s2`, verified: delete if an earlier scan
   struck it, else strike; otherwise wait. Without tips nothing settles, strikes or deletes.
3. Writes re-read their row and write only if it is unchanged. Settle and moved run under the
   service lock behind `receiptFence`. Settle first re-reads the block timestamp and rewrites a changed
   one (a failed read leaves the row unsettled). Moved writes the position and the new block's
   timestamp, keeps id, `hidden` and `discoveredAt`, then `emitUpdatedIfShown` (`played` is keyed by
   id, F10). Delete runs in `withDeleterLock` behind its own fence, `deletersRunning === 1` at entry
   and before each write with the epoch and `isCurrent()` (R1 O3): `markBalanceDirty`,
   `deleteRecord`, Deleted, in `finishReconciliation`'s order.
4. **Not reached** (D32) while a rerun could decide something: a struck row, a missing row at or below
   `s2`, a row left unsettled by an unverified bracket or a failed timestamp read, a failed read, a
   stood-down write. A missing row above `s2` waits for a new block, which the gate runs on. A block
   that lands mid-scan leaves later contracts' brackets unverified until a quieter tick (F C2).
5. Strikes: an in-memory map by record id, cleared when the row is found, settled, deleted or leaves
   the unsettled set; a restart forgets them, which only delays a delete. No armed e2e (D31).

### File-level change map

| File | Phase | Change |
|---|---|---|
| `apps/extension/src/wallet/services/incoming-transfer/service.ts` | 3.3-3.5 | `rewriteMovedRecord` return; `emitUpdatedIfShown`; tips into `scanContract`; reconciler (pure part in new `note-reconcile.ts` + test); `getCachedReceiptFee`; the failure line |
| `…/incoming-transfer/spec.ts`, `client.ts`; `wallet/services/storage-codecs.test.ts` | 3.4, 3.5 | `settled?: true` on the note record, schema, codec `full` row; `getCachedReceiptFee` in `Methods`, `rpcMethods`, passthroughs |
| `…/incoming-transfer/service.scenarios.test.ts` | 3.3-3.5 | Updated cases, matrix re-pin, liveness spy; reconciler; cached fee; log |
| `apps/extension/src/wallet/services/note/{service,spec,client}.ts` (+ test) | 3.4 | status on `getNotesRaw`; `getSyncedBlock` |
| `apps/extension/src/composables/{useIncomingTransfers,useReceiptFee}.ts` (+ tests) | 3.3, 3.5 | refresh on Updated; the new composable |
| `wallet/config/config.ts`, `wallet/services/config/service.test.ts`; `popup/pages/settings/privacy.vue`, `received/[id].vue` (+ tests); `stores/app.store.ts` and its pins | 3.5 | `privacyMode`, kept on restore; the row; mode, fee row, Updated listener, header; dead ref |
| `apps/extension/tests/e2e/helpers/activity-seeds.ts`, one smoke file | 3.5 | a public-receipt seed; the scenario |

## Phases (arc 3b)

Build in order; `received/[id].vue` changes only in 3.5, after merging `origin/dev` if arc 3a has
merged (§ Delivery). Log to `lessons/phase-3.md` ("recorded": its red run is there); ✓ only on a pass.

#### Phase 3.3: Updated on a re-mine, service and feed (#139) ✓

1. `rewriteMovedRecord` returns its record; `emitUpdatedIfShown` after it; the feed refreshes on Updated.
2. Scenarios: a visible rewrite emits one Updated with the new hash; hidden, visibility off, or a
   handoff during the visibility read: none, beside the undisturbed control. Re-pin the matrix's
   reconcile rows (`visibility`, `updated`, `receiptFlags`); the reorg liveness proof
   (`service.scenarios.test.ts`, "reorg: a same-height hash change …") asserts one Updated naming `0xbh101b`. Feed: a read held
   across an Updated, then released, leaves the new block; a Deleted during it still removes the row.

Gate: `bun run --cwd apps/extension test src/wallet/services/incoming-transfer/ src/composables/ && bun run lint && bun run typecheck:all`.
Pass: exit 0; the emit-once case fails with the call removed, the held-read case with the refresh
removed (recorded). Layers: unit, lint, typecheck.

#### Phase 3.4: note reconciliation (#140) ✓

1. Status on `getNotesRaw` (default `ACTIVE`); `getSyncedBlock` with a stub in `makeNoteStub`;
   `settled?: true` in the type, schema and codec row.
2. `note-reconcile.ts` with a table test over § Architecture steps 1 and 2: positions, the `s2` and
   finalized boundaries, verified and unverified brackets, no tips.
3. Tips into `scanContract`; the reconciler after the per-note commits; step 4 returns `false`.
4. Scenarios, each beside its control:
   - missing on two scans past its block: after the first the row survives with no dirty mark and no
     Deleted, after the second it is deleted, marked and Deleted; missing once then found: kept,
     strike cleared; spent: settled, never deleted;
   - a stale anchor (synced hash differs from the tips) settles, strikes and deletes nothing and
     reports not reached, and so does a second contract whose read follows a mid-scan block, which the
     next quiet tick decides; a missing row above `s2` reports reached; a struck row reports not
     reached and the very next, unforced tick deletes it;
   - a same-height re-mine with a new index or time rewrites the row, one Updated, no second arrival;
   - the steady state makes one notes read; a settled row is never examined; a row stored unfinalized
     whose block was dropped while the wallet was closed is deleted, a settled one at that height stays;
   - a running deleter or a handoff makes settle, rewrite and delete stand down, not reached.

Gate: Phase 3.3's commands, then `bun run test:all` (it includes the extension suite). Pass: exit 0;
the survives-scan-one case fails with the strike check removed, the stale-anchor case with the hash
check removed, the next-tick case with step 3's `false` removed (recorded). Layers: unit, lint, typecheck.

#### Phase 3.5: privacy mode, the fee row and updates on the page (#141; #139's page half) ✓

1. `privacyMode`, a default pin, a restore test that a backup's value is not applied; the Settings row
   and its test (it renders, its toggle writes `setValue("privacyMode", true)`); delete the dead ref.
2. `getCachedReceiptFee`: `null` before a lookup, the fee after, no network-service call, beside
   `getReceiptFee`, which calls it. The failure line: an RPC error whose message holds a field-valid
   hash logs neither the hash nor the message.
3. `useReceiptFee`, at least ten cases: each `load` path; `show` from `tap` to `shown` and back to
   `tap`; `show` outside `tap` ignored; a stale result dropped after `load`, `show` and `dispose`; a
   note record making no call.
4. The page, four cases on a wire-shaped public receipt (field-valid hashes, a valid address,
   `satisfies IncomingPublicEventRecord`): mode off calls `getReceiptFee` on mount; mode on, pending or
   rejected calls only `getCachedReceiptFee`, an Updated meanwhile included; an Updated after another
   client turns the mode on, or during a held or rejected reconnect read, looks nothing up (a landed
   `false` read is the control); an Updated moves the Block row, wins over the first read,
   and loses to a later Deleted.
5. Smoke scenario (D34): seed a public receipt on the `readActivityScope` scope (its `E2E_LIST_TOKENS`
   token) and redirect its RPC origin to
   `startStub` (`tests/e2e/helpers/rpc-stub.ts`); with privacy mode on (toggled in Settings), the page
   shows `received-fee-show` and the stub logs no receipt request; after a press it logs one. Control,
   mode off: the stub logs one on open. Estimate 20 s; record the measure.
6. Screenshots, light and dark, in `screenshots/`: Settings → Privacy; the fee row, mode on (before,
   loading, after a press) and off; the Updated state.

Gate: `bun run lint && bun run typecheck:all && bun run test`; from `apps/extension`,
`bun run test:e2e -- <the scenario's file> tests/e2e/fiat-display.test.ts --retry=0`, then with
`NULO_E2E_BROWSER=firefox`. Pass: exit 0; the mount case fails with the page calling `getReceiptFee`
under mode on, the smoke scenario with the mode read removed (recorded). Layers: unit, component,
lint, typecheck, smoke (Chrome, Firefox).

#### Arc 3b boundary gate

- `bun run lint && bun run typecheck:all && bun run test:all`; `bun run check:plans` after staging.
- Network, Chrome, one `e2e:agent` run in this worktree at a time:
  `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/cold-wake-discovery.test.ts tests/e2e/network/account-switch-isolation.test.ts tests/e2e/network/public-events-capability.test.ts tests/e2e/network/receive-unregistered.test.ts`.
- Smoke, full suite, from `apps/extension`: `bun run test:e2e -- --retry=0`, then with
  `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0 at retry 0, one rerun for a named known flake; the PR body carries the screenshots,
  each browser's smoke wall-clock before (latest `dev` run) and after, and the owner's OA-8 answer.

## UI impact (arc 3b)

| Surface | Before → after | Sign-off |
|---|---|---|
| Settings → Privacy | a third row, "Privacy mode", off by default, under Block Explorer | C12-fetch B: "An opt-in Privacy mode in Settings → Privacy that turns every such lookup into a tap; automatic by default." Words and look: OA-8 |
| Received fee row, mode off | unchanged: shimmer, then the fee or a dash, on open; a re-mine reloads it | #141 addendum: "the fee loads automatically when the received page opens"; P4-05 |
| Received fee row, mode on or unreadable | "Show fee"; a press: shimmer, then the fee, or "Show fee" again; a fee fetched this session at once; a re-mine returns it to "Show fee" | P4-03's words under the addendum; P4-09 A; P4-10 A; OA-8 |
| Open received page after a re-mine | the Block row and the time follow the stored record | P4-05: "…an open received page and the feed show the stored block and fee instead of stale ones." |
| Activity and received page, dropped note | the row leaves; an open page shows its not-found state; a moved note shows its new block | OA-1 A (P4-06) |

## Security & Adversarial Considerations (arc 3b)

**Threat model.** The configured node (shared dRPC key on testnet) learns which receipt is opened and
when, and can lie about receipts, tips and prunes; a backup file is untrusted input.

| Path | What leaves the device, to whom |
|---|---|
| Fee, mode off | on open and after a re-mine: one lookup, `getTxReceipt(txHash)`, to the record's own node, which the client retries up to three times on a network error or 5xx, even after the page closes; none on a cache hit |
| Fee, mode on, unknown or unreadable | on open and after a re-mine: nothing; per press: one lookup, retried as above |
| #139 | nothing; Updated crosses the popup port under the Added gate, so a hidden record never reaches a screen |
| #140 | the per-scan notes read as today; bracket and timestamp reads only for rows that may settle or are missing; no per-transaction node lookup |

- **Structural privacy.** The tap path has no network path; unknown and unreadable count as on; an
  import cannot switch the mode. Retries stay (D42). **Logging:** no identifier; reconciler lines log
  counts at `debug`. **Supply chain:** no new dependency, permission, key or workflow.
- **Lying node** (capability: the configured node; boundary: the feed, not funds). A wrong fee is
  display only. A faked prune deletes unsettled rows, which return if the PXE sees the notes again
  unspent. Lying finality, or a PXE keeping a pruned note at a verified anchor, settles a dropped row
  for good; a block landing mid-scan on every tick would leave rows unsettled (more reads, no wrong
  delete). Both are known limits for the close-out.

## Assumptions

**Facts** (verified at `264a4b30`; the architecture cites the lines):
- F1. `getReceiptFee` uses `getNodeForUrl`, whose client retries (`aztec-runtime/src/utils/fetch.ts:112-122`);
  its cache is evicted on profile or chain purge, never persisted. F2. The page fetches on mount
  (`received/[id].vue:167-177`); `seedReceipt` seeds notes only.
- F3. Restore applies only `RESTORABLE_CONFIG_KEYS` (`config/spec.ts:15-24`), without `showFiatValues`;
  the shell follows updates (`app.vue:67`) but keeps defaults when its boot read fails (`:350-366`).
- F4. `appStore.isPrivacyModeEnabled` has no reader; `privacy.vue` and the page are untyped scripts.
- F5. `rewriteMovedRecord` (`service.ts:2333-2344`) is public-only, keeps `hidden`, emits nothing. F6.
  Updated is declared (`spec.ts:313`); the feed patches loaded rows only and an older read overwrites
  them (`useIncomingTransfers.ts:94-135`); the page listens to Deleted only.
- F7. `getNotesRaw` reads `ACTIVE` only (`note/service.ts:168-174`); a note record holds a position,
  no hash, and `commitScannedNote` never rewrites it. F8. `debug.getNotes` force-syncs; a failed sync
  is swallowed (stdlib `l2_block_stream.ts:237-242`); `getSyncedBlockHeader` does not sync.
- F9. `scanNoteTarget` (`service.ts:1456-1476`) keeps only `proposedBlockHash`; a run that misses the
  tip deletes its mark. F10. `played` is keyed by record id (`arrival-state.ts:65-70`). F11. After a
  `NULO_E2E_REORG` prune the network does not reliably mine again (`stale-anchor-recovery.test.ts:52-55`).

**Inferences:**
- I5. A re-included transaction keeps its note's siloed nullifier; if not, the old row is deleted and
  the note discovered anew, also OA-1's outcome. I9. The PXE detects on its first successful sync a
  prune made while it was closed (moderate). I11. A row is stored only from a read synced at or past
  its block, so a synced block below it means a prune since.

**Asks:** A8 (OA-8), the row's words and look, the hub entry, the fail-closed "Show fee". Working
assumption: OA-8's recommendation is built, and the PR merges only with the owner's answer.

## Decision ledger (continued)

D1 to D20, D-orch-1 to 11: decisions.md; D21 to D24, D-orch-12: arc 3a's (§ Delivery); R1 C*n*, R1 O*n*: below.

- **D25, the page owns the mode read, failing closed.** The shell keeps the default (off) when its
  boot read fails; the page's own read starts unknown and re-reads on reconnect.
- **D26, a cache-only method, not a flag:** a flag leaves the network path one forgotten argument away.
- **D27, a composable.** Round 1 Codex: page state with `createRunFence`; Opus: a draw; the final pass:
  keep. A C1 hook (CLAUDE.md § Composables); the run guard, the fragile part, is tested alone.
- **D28, a re-mine reloads the fee with the mode off** (the addendum: automatic by default); **D29,
  not restorable**, as Show fiat values: an import never switches a privacy setting.
- **D30, the dead store ref goes** (its name invites wiring the wrong value); **D31, no armed reorg
  e2e** (tree wins, F11); **D33, a pure classifier**, as `orphanedByReconciliation` is for public ones.
- **D32, not reached only while a rerun can decide** (refines arc 2's rule); Outline B's "until
  settled" defeats the block gate for the whole finality lag.
- **D34, one smoke scenario, proven at the wire** (R1 O6): the only layer that sees a request leave;
  component tests mock the client. #139 and #140 add no e2e (F11).
- **D42, retries stay:** `getSingleAttemptNodeForUrl` would end them but change mode-off behaviour.

## Audit verdicts (arcs 1 and 2: decisions.md; arc 3a: its own PR)

### Arc 3b round 1: Codex (gpt-6.1-sol, high, read-only), `reject (with blocking findings: stale PXE data can permanently settle an orphan; privacy mode is latched across later lookups; feed refreshes can overwrite Updated events)`

1. High, a swallowed PXE sync leaves a stale anchor that settles an orphan: verified anchor. 2. High,
   a mount-only mode read lets a later Updated look up under the mode: live mode. 3. Medium, an older
   feed read overwrites an Updated: refresh. 4. Medium, a same-height re-mine keeps stale indexes and
   time: position. 5. Medium, `{ error }` can carry the hash: a category. 7., 8. Low, wording, revert
   checks, a field-valid smoke hash. **All accepted.**
6. Medium, OA-8 used as permission. **In part**: built as the brief asks; merges only once answered.

### Arc 3b round 1: Opus (Plan agent), `conditional approve (with conditions: findings 1 to 5 fixed in the plan text before the build starts)`

1. Medium, an Updated before the mode read could look up: unknown counts as on. 2. Medium, the synced
   read had no home: `getSyncedBlock`. 3. Medium, `receiptFence` is closed inside `withDeleterLock`:
   the delete's own fence. 5. Medium, the hub entry, the fail-closed button, its font: OA-8. 6. Medium,
   the e2e can prove it at the wire: D34. 7. to 15. Low, F3, stand-downs, revert checks, the feed and
   live mode (= Codex 3, 2), finality lies (a known limit), gates, D27, size. **All accepted.**
4. Medium, one press is up to four requests. **Accepted** as words; single attempt rejected (D42).

### Arc 3b final fresh pass: Codex (gpt-6.1-sol, high, read-only, new session), `reject (with blocking findings: reconnects can retain mode-off permission for new fee lookups while privacy mode is on)`

1. High (F C1), a dropped config port keeps a landed `false` through the reconnect, so an Updated can
   look up under the mode. **Accepted**: unknown again on `onDisconnected`; a test (new evidence on R1 C2).
2. Medium (F C2), a block landing between the tick's tips read and a later contract's read leaves its
   bracket unverified; sustained, rows never settle. Plausible but unverified. **Accepted** as a test
   and a known limit: a stronger proof of canonicality is a policy change no evidence asks for yet.
Looks fine: the anchor, the delete fence, refresh-on-Updated, D27, revert checks, OA-8. The two fixes
are not re-reviewed; the implementer's first Codex round checks them first.

### Arc 3b build, round 1: Codex (gpt-6.1-sol, high, read-only), `reject (with blocking findings: a mount continuation can start a fresh fee lookup after unmount using stale mode-off permission)`

F C1 holds while mounted, F C2 holds. 1. High, `dispose()` dropped only answers in flight, so the
mount's continuation after a held network read looked up with the last mode, its listener gone.
**Accepted**: `dispose()` is terminal; a composable and a page regression, red with the guard removed.

### Arc 3b build, round 1: Opus (general-purpose), `holds (with non-blocking findings: a style copy, a PXE store reset, a storage read per block)`

1. Low, a copy of `.fee_show` in the reduced-motion block: removed. 2. Low, a PXE schema bump opens an
empty store, and unsettled rows from senders not re-registered are deleted: **a known limit**. 3. Low, a
full storage read per contract per block: **declined**, milliseconds beside the PXE read; listing once
per target would make every timestamp backfill a stand-down and a rerun.

### Arc 3b build, round 2: Codex (resumed), `approve`

No findings; the loop converged.

### Cross-arc fresh pass: Codex (gpt-6.1-sol, high, read-only, new session; #426's head for 3a), `reject (with blocking findings: SDK warnings still leak receipt transaction hashes before the sanitized fee catch)`

1. Medium, the retrying node logs a failed call's error text through the SDK's loggers (warn, and
   error per retry), past the fee lookup's own line. **Out of scope**: it predates the lane and covers
   every node the wallet builds; `trim` keeps the URL to its origin. Issue #432. Resumed: `approve`.

## Post-implementation

This plan plus `implementations-plan/README.md` § Post-implementation standard at `264a4b30`; `code_review` off.

- **Loops.** At the arc 3b boundary over `git diff origin/dev...HEAD`; then a fresh cross-arc session
  over `git show 9574a9de 264a4b30 <arc 3a's squash>` and arc 3b's diff. Prompts in
  `~/.cache/nulo-backlog/incoming-transfers/`; `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`
  (a quota or 401 error: once with `CODEX_ACCOUNT=alejo-icloud`, else log and continue). The ask names
  a lookup on open under the mode, a stale fee or block, a row deleted or settled wrongly, a hidden one.
- **Approval boundary.** Persisted state beyond `privacyMode` and `settled`, a timer, or a method
  beyond `getCachedReceiptFee` and `getSyncedBlock` stops for the orchestrator. **Close-out**, its own
  PR after 3a and 3b merge (standard step 4): decisions.md § Not this lane's four residues and the
  three #140 limits (lying finality or a kept pruned note, a sustained mid-scan block, a PXE store
  reset) filed; OA-7 and OA-8 answered or recorded.

## Delivery

| Arc | Branch | Base | PR title (≤ 93) | Closes |
|---|---|---|---|---|
| 3b | `incoming-transfers-arc-3b` (carries this plan commit) | `dev` | `feat(incoming): receipt fee on a tap under privacy mode, updates on re-mine, settled notes` (90) | #141, #139, #140 |
| close-out | `incoming-transfers-close-out` | `dev` | `docs(plans): close incoming-transfers` (37) | none |

- Plain PRs (`gh pr create --base dev`), no stack (decisions.md D-orch-4), no labels unless a path
  filter skips a needed suite. Never merge, never `--admin`, never force-push a pushed branch.
- **Arc 3a overlap.** Both arcs edit `plan.md`, `OWNER-ASKS.md`, `STATUS.md`, `received/[id].vue` and
  its test, and add `lessons/phase-3.md` and `screenshots/`. #426 already numbers its entries D-orch-12
  and D21 to D24 and its ask OA-7; those ids stay. The second to merge brings `dev` in: this file keeps
  its structure, arc 3a's ledger and verdicts go to decisions.md; OA-7 and OA-8 both stay; both lessons
  sections stay; Phase 3.5's tests rerun.

## Seeds (drafts until the orchestrator approves; no ELI5, orchestrator-owned)

**Recommended: `/goal`**
```
/goal Phases 3.3, 3.4 and 3.5 of implementations-plan/incoming-transfers/plan.md are marked ✓, each backed by its gate reported passing in the transcript with LESSONS_FILE=implementations-plan/incoming-transfers/lessons/phase-3.md printed; the arc 3b boundary gate passed (lint, typecheck:all, test:all, the eight-file network run with NULO_E2E_PROVERLESS=1, full smoke on Chrome and Firefox, all at retry 0); the Codex loop converged at the arc boundary and in the cross-arc pass, each quoted from a resumed pass reporting no new material finding; the arc 3b PR is open with screenshots and smoke wall-clocks (gh pr view in the transcript); /code-review was NOT run.
```

**Alternative: `/loop`**
```
/loop 15m Drive arc 3b of implementations-plan/incoming-transfers forward. Each firing: 1) read plan.md, STATUS.md and lessons/phase-3.md; if the arc 3b PR is open, babysit its checks only. 2) Take the next open phase in order 3.3, 3.4, 3.5; before 3.5, if arc 3a has merged, merge origin/dev and resolve per § Delivery. 3) After each edit run bun run lint and the touched tests; commit signed. 4) A phase is ✓ only when its gate passes: paste it, mark ✓, log lessons. 5) After 3.5: the boundary gate, the Codex loop (hard stop at three rounds), the cross-arc pass, then gh pr create. 6) Anything a person would notice goes to OWNER-ASKS.md, never decided here. Never merge, never push to main, never --admin, never force-push a pushed branch.
```
