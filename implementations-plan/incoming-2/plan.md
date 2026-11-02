---
plan: incoming-2
tier: light
status: arc 1 merged (#1482); arc 2 in review
issues: "#1429 (arc 1); #1431 (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 51ea220b1
trunk: dev
post_implementation_hardening: not scheduled
---

# incoming-2: a scan that loops on a half-answering node, and a received page that shows the wrong receipt

A node that answers its tips but refuses every public-log page sends the scan into a loop that never ends its tick, so the stall never shows and Retry does nothing (#1429). The received page keeps receipt A under receipt B's link, and reads a passing failure as "not found" (#1431). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, arc 2 only).

## Outcome & Quality Bar

- **For whom**: a person whose node half-answers (its public-logs endpoint returns 5xx or 429, or a custom node lacks it); a person who opens a receipt from an arrival snack, or while the worker restarts.
- **Excellent**: (1) each scan tick ends with one outcome; a node that refuses every page backs off and reaches Home's existing stall line, and Retry runs one more tick; (2) the received page shows only the receipt its route names, with that receipt's fee, and only a resolved absence reads "not found".
- **Good enough**: no new copy. A read that fails while the port stays up shows what OA-1 settles.

## Findings (paths verified at `51ea220b1`; lines in `apps/extension/src/`)

| # | Path | Label |
|---|---|---|
| #1429 | Anchored cursor; `getScanTips` answers; every `fetchTransferPage` rejects. `pollPublic` (`service.ts:1239`) → `scanAndRecord` (`:1264`) → `scanPublicContract` → `handleScanFailure` (`:2178`) → `beginReconciliation` persists a marker and steps (`:2375`) → the step's page read rejects → catch (`:2404`) reads tips → `beginReconciliation` (`:2414`) → `:2375` → … A resumed marker enters at `:2072`. Broken: one `ScanOutcome` per tick, and a failure backs off (ARCHITECTURE.md:103). Consequence: node calls, sealed cursor writes and a `warn` per pass while the fault lasts; `episodes.record` (`:1286`) is never reached, so no stall shows; `publicPolling` (`:1240`) stays set, so Retry returns at once. | demonstrated (trace; arc 1's test) |
| #1431 (a) | On receipt A, the snack's View pushes `/popup/received/B` (`useArrivals.ts:366`). `app.vue:677-678` reuses the page, which loads only in `onMounted`; `onReceiptUpdated` (`received/[id].vue:107`) drops B's updates. Broken: the page shows the record its route names. Consequence: A's amount, parties, hashes, fee, Copy and links under B's URL; a tap on Show fee asks the node for A's fee. | demonstrated (trace; arc 2's test) |
| #1431 (b) | The record read rejects (`Client disconnected` on a worker restart): `.catch(() => null)` (`:194`) reads as absent; "RECEIPT NOT FOUND" shows; nothing reads again. A failed network read (`:204`) hides the amount and links the same way. | demonstrated (trace; arc 2's test) |

The claims held. Not in the issues: the catch reads tips from the indexer, not `sharedTips`, so the loop repeats the tips call too.

## Assumptions

- **Facts**: F1 the cites above and in recon. F2 `onConnected` fires once per Ready, the first included, a task after the waiting requests post, unless the port dropped before that task (`extension-messaging/src/background/client.ts:181-192`); a drop after Ready rejects pending requests and reconnects (`:130-147`). F3 `received-fee-privacy.test.ts:60-75` counts fee lookups on the wire, so a second lookup at open fails or flakes it. F4 the three `beginReconciliation` callers return `failed` whatever its step did (`:2078`, `:2178`, `:2414`). F5 `retryIncomingScan` clears the gate and polls the active profile's targets on that network (`:1353-1362`). F6 #750 reopens on "a substantial public-arm change" once #540 has landed; #540 is closed, and this change is about twenty lines. F7 the stall line lives in `RecentActivityView` (`:836-845`), shown on Home (`general.vue:176`) only.
- **Inferences**: I1 a staged marker is stepped by the next tick that passes the gate, the network read and the class gate (`:2047-2072`); a restarted batch therefore waits one backoff, 30 s or more. I2 a failed tick writes the marker at most twice (`:2078`, `:2178`: the stage, then the restart's), once from `:2072`.
- **Asks**: OA-1, what the received page shows after a read that fails with no reconnect: answered, option E (decision ledger).

## Architecture & Implementation

- **D1, #1429**: split `beginReconciliation` into `stageReconciliation(target, cursor, tips, epochAtStart): Promise<boolean>` (build the marker, persist it through `persistCursorLocked` with its epoch fence) and `beginReconciliation` (stage, then step once, as now). The catch in `stepReconciliation` keeps its fresh `indexer.getTips` read, stages a marker on those tips (progress and `seen` cleared) and returns `failed`. The next tick that passes the gate steps it, so orphan deletion still waits for a full scan of one fork. The bound is the existing scheduler and episode.
- **D2, the restart log**: `this.logDebug("public reconcile restart", { contract, error })`, as the arm's other transient lines (`:1276`, `:2180`) and ARCHITECTURE.md:103. The stall's one `warn` (`:1329`) is unchanged; the dropped-page `warn` (`:2431`) is off this path.
- **D3, F-10 as a by-product**: `stageReconciliation`, `beginReconciliation` and `stepReconciliation` take `target: PublicTarget`; `handleScanFailure` names `PublicTarget`; `scanPublicContract` builds `target` before the resume branches. The arm's other scalar signatures stay: F-10 is report-only, and #750 owns the arm's shape.
- **D4, #1431 (a)**: a default-flush (`pre`) watch on `route.params.id` (SFC section 9) clears what belongs to the shown receipt before the page renders B. That covers `received`, `loaded`, `recordChainId`, `tokens`, and the fee row through a new `useReceiptFee.reset()` (fence invalidated, record and fee cleared, `loading`). Then it reads B. `pre`, not `sync`: leaving the page unmounts it before a `pre` watcher could read an undefined id. `app.vue` is unchanged.
- **D5, the read and its reconnect rule**: move the rule `useConfigRead` carries (only the newest read lands; read again on every connect after the first, and on the first when the newest read failed) into `composables/reconnectRead.ts`. Its `createReconnectRead(client, run)` takes a `run(isCurrent)` that resolves `false` to mark a failed read; a throw passes out of `read()` unmarked, as a throwing `land` does today. `useConfigRead` keeps its `onUpdate` keys around the rule and catches only `fetch`, so its behaviour is unchanged; its generic test cases move with the rule. The page splits its read into `readReceipt(isCurrent)` (the record) and `loadDetails(record, isCurrent)` (network, tokens, fee); each request checks `isCurrent` first. A rejected record read changes nothing shown and marks the read failed. A rejected network or token read lands what the page has, then marks it failed, so the reconnect after a worker restart reads again, the first observed one included (F2). `modeRead.read()` stays in `onMounted`.
- **D6, the fee across reads**: a read that lands the receipt and block already shown keeps a fee on screen; any other landing loads the fee as an open does, under the house rule that an unknown privacy mode counts as on. An `onIncomingTransferUpdated` still reloads it, as now.
- **D7, events across reads**: events for the route's id apply to a shown record at once, as now. While a run's record read is in flight, they also land in that run's slot, and its snapshot yields to the last one: an update replaces a found record, a delete wins. The slot opens with the run and closes when its snapshot lands. It replaces the page-wide `heldUpdate` and `deletedIds`, so a read that starts after a delete is authoritative. Handlers registered in section 7 are function declarations. `onBeforeUnmount` removes the listeners, disconnects the clients, then disposes the reader and the fee row (CLAUDE.md § Cleanup order).
- **D8, OA-1's state (option E)**: a record read that rejects with no receipt shown, and not because the port dropped (`isClientDisconnectRejection` or `RpcDisconnectedError`, after which the client reconnects and the rule reads again), shows History's empty-state layout: the History glyph, "Couldn't load this receipt" in `txt-danger`, "Try again, or open History to find it there.", Retry (reads again; the body is empty while it reads) and Open History. Its styles live once, in `popup/pages/empty-state.module.css`, which History's empty state composes too, unchanged.
- **Files**: arc 1: `wallet/services/incoming-transfer/service.ts`, `service.scenarios.test.ts`, `ARCHITECTURE.md:103`. Arc 2: `composables/reconnectRead.ts` (new) and its test, `useConfigRead.ts` and its test, `useReceiptFee.ts` and its test, `popup/pages/received/[id].vue`, `[id].test.ts`, `popup/pages/empty-state.module.css` (new), `activity.vue` (composes it).
- **Alternatives not taken**: a `restarted` flag on `beginReconciliation` (a boolean that steers control flow); no immediate step for any caller (slows the reorg path ARCHITECTURE.md calls immediate); keeping the marker when the fresh checkpoint equals `upperBoundHash` (a recovery-policy change the bound does not need); a retry cap (a retry policy); `:key="$route.fullPath"` in `app.vue` (remounts every page on every query change); reading again on every connect, the first included, as the journal does (a second fee lookup at open, F3); the reconnect rule copied inline into the page (Opus r1: three lines with another payload; rejected: a copy of a subtle rule that drifts from its twin); widening `useConfigRead`'s type to any client (its contract is config's `onUpdate` keys).

## UI impact

The owner approved this lane on decision page 94 (P94-01, signed 2026-11-01). The owner, 2026-10-30: "if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed."

- **Arc 1, Home's stall line**: it now appears for a node that refuses every log page, as it does for a node that is down. Copy unchanged. No other surface.
- **Arc 2, received, a push from A to B**: before, A's amount, From/To, hashes, fee and links under B's URL; after, B's.
- **Arc 2, received, a read that fails on a worker restart**: before, "RECEIPT NOT FOUND" until reopened; after, the header over an empty body until the reconnect's read lands, then the receipt. After a restart the amount comes back, and a fee on screen stays (D6).
- **Arc 2, received, a read that fails with no reconnect** (a 60 s timeout, a refused storage or profile read): before, "RECEIPT NOT FOUND"; after, D8. The owner's pick, decision page 97 (P97-01, signed 2026-11-02), option E: "The failure reads like the History page's own empty state, with both ways on as buttons." It replaces the page 95 lean (P95-02, B). The copy is the prototype's, word for word.
- No other copy, layout or style. Arc 2's PR carries before/after captures of the three received states.

## Security & Adversarial Considerations

- **Hostile node**: an attacker who controls the node's public-logs endpoint can refuse every page and, at the base, hold an unlocked wallet in a loop of node calls and sealed writes. After D1 a tick makes at most two marker writes and two failed page reads, under backoff, and the stall shows. This change crosses no new boundary. Not changed here, each a known limit filed at close-out after dedupe: a node's well-formed empty page finishes a reconciliation, so it can remove public receipts as it can hide them (`public-events.ts:275-277`, `service.ts:2460-2481`); a node that fails every other page keeps a marker restarting with progress between failures, so the episode keeps closing, no stall shows, and the forward scan waits behind the marker (`:2071-2072`, `:2448-2457`, `scan-episodes.ts:102-105`).
- **Received page**: the route id is the existing input; the service resolves only the active profile's records (`service.ts:627-635`). The run fence stops an earlier read, and D4 the fee row, from painting under another id; it also stops a read that outlives the page from opening ports again (`[id].vue:204,214`). Not changed here: a stored amount the row codec accepts but `BigInt` refuses throws on render (`[id].vue:119-128`); it needs a storage write. Known limit at close-out, after dedupe.
- **Logging**: D2 moves one line from `warn` to `debug`, the contract and error as named properties; the error's message is capped and URL-scrubbed (`wallet/logger/utils.ts:177-187`) but may carry the node's text. **Storage**: no shape change. **Lifecycle**: no timer or task; arc 2 adds one `onConnected` listener and one watcher, both gone at unmount. **Dependencies, permissions, crypto**: none.

## Arc 1: one restart per tick (#1429)

### Phase 1 ✓

- Do D1, D2, D3; edit ARCHITECTURE.md:103 to say the restart stages its marker for the next tick.
- **Tests** (`service.scenarios.test.ts`):
  - Health suite, new: "a node that answers its tips but refuses every log page restarts once per tick, backs off, reaches stalled, and Retry runs one tick". Restate `anchored` there. `getScanTips` answers a new checkpoint hash on its second call. `reader.fetchTransferPage` rejects, with a test-only breaker that serves an empty page after 50 calls so the base copy ends. Assert page reads only (two on the first tick, one per tick after), the marker staged on the second hash, one failure gated 30 s, no read inside the gate, stalled past ten minutes (`scan-health.ts:42` is strict), and one bounded tick from `retryIncomingScan`. Control: the reads answer again, and the next tick finishes the marker and ends the episode.
  - Rewrite `:3055` as the two-tick reorg proof: seed a marker whose `seen` holds an old-fork hash; the failed tick leaves a marker on fresh tips with progress and `seen` cleared and deletes nothing; the next tick keeps the canonical receipt and removes the orphan.
- **Gate**:
  - `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/wallet/services/incoming-transfer --retry=0`; `bun run test:all`.
  - From the root: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-transfers.test.ts`, then with `NULO_E2E_BROWSER=firefox` added.
  - Pass: every command exits 0; the new case is red on the base copy of `service.ts` (it hits the breaker). Record each browser's wall-clock. No e2e scenario is added.
- **Result** (`dd6ff7444`, review fixes `164f53813`): exit 0 each. On the base copy the new case read 51 pages in one tick and the `:3055` case stepped the restart in the same tick. `test:all`: one saturation timeout (lessons), then green. Network e2e at retry 0, 12 tests each: Chrome 379 s, Firefox 412 s.

## Arc 2: the received page reads what its route names (#1431; after OA-1)

### Phase 2 ✓

- Do D4–D7, and OA-1's answer (its recommendation needs no code beyond D5).
- **Tests**:
  - `reconnectRead.test.ts`: `useConfigRead.test.ts`'s generic cases, moved; the key cases stay, plus one that pins a throwing `land` (it rejects `read()` and marks nothing). Both files green proves the move.
  - `useReceiptFee.test.ts`: `reset()` drops a lookup in flight and returns to `loading`.
  - `[id].test.ts`: the route mock becomes `reactive`; `makeIncoming` gains a real `onConnected`, fired after the first request as `makeConfig`'s is. Marked cases fail on the base copy; each absence is paired with the released read landing.
    - A (fee shown) to B, B's network read held: no A data or A fee under B; A's late answers do not paint; then B lands, and a tap asks for B's fee. Red.
    - First connect: one record read, one fee lookup. A rejected read shows no "not found"; the next connect reads again and shows the receipt, amount included after a rejected network read. Red. Control: a resolved `undefined` shows "not found".
    - Events: an update during a reconnect's record read shows at once and wins over its snapshot; one after the snapshot, network read held, shows; a delete during a reconnect's record read keeps the receipt gone when the stale snapshot lands, and a later read that finds it shows it; a reconnect landing the same block keeps a tapped fee.
    - An unmount during the record read sends no network or token read.
- **Gate**:
  - `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/popup/pages/received src/composables --retry=0`; `bun run test:all`.
  - Build each browser with CI's smoke flags: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then the same flags with `build:firefox`.
  - From `apps/extension`: `env -u EXTENSION_PATH NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/received-fee-privacy.test.ts tests/e2e/type-roles.test.ts`, then with `NULO_E2E_BROWSER=firefox` added.
  - Then arc 1's `e2e:agent` line for `incoming-arrival.test.ts` (it opens a receipt from the snack), on both browsers; it rebuilds `dist/`, so smoke runs and captures go first.
  - Pass: every command exits 0; the marked cases are red on the base copy of the page. Record each browser's wall-clock.
- **Captures**: scratch smoke specs under `~/.cache/nulo-backlog/incoming-2/`, copied into `tests/e2e/` for one Chrome run on the base and one on the head, each on a fresh smoke build, then deleted. Wait on selectors and on B's own content, never on a sleep. (a) Seed two public receipts with different amounts; open A; `navigateByHash` to B; on the base wait for B's URL and A's content, on the head for B's content. (b) Hold the worker's storage read for the receipt through its CDP target, detach, then stop the worker with the fixtures' `stopBackground`; capture the base's "not found", and on the head the held state, then the receipt. (c) OA-1's state: make the worker refuse that read once while the port stays connected, wait for the worker's own count of the refusal, and capture the base's "not found" against the head's state. Commit the PNGs to `implementations-plan/incoming-2/screenshots/`.
- **Result** (`3d1ffadaf`, review fixes `671dcd69f`, `bf59e8639`): exit 0 each. On the base copy of the page 8 cases red, the controls green; each review fix's case red on the head before it. Smoke at retry 0, 15 passed and 1 skipped on Chrome (129 s), 16 on Firefox (173 s). Network `incoming-arrival` at retry 0 on Chrome, 7 tests, 224 s; Firefox not run, per the orchestrator's gate for this arc. Deviations: (b) a stopped worker also locks a password profile in the harness, so about 1 s later the popup routes to the lock screen: the frames are the window before it (base "not found", head the empty body), and the reconnect read is proved by the component tests; (c) the refusal holds until disarmed, since a background read can take a one-shot one.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1–D7 | as above | see Alternatives not taken |
| Arcs | #1429 and #1431 ship as two arcs: OA-1 concerns only the received page | one PR for both (it would hold #1429 behind an owner question it does not touch) |
| OA-1 | Option E, the owner on decision page 97 (P97-01, signed 2026-11-02): "The failure reads like the History page's own empty state, with both ways on as buttons." Built as D8 | A (the page 95 recommendation), B (the page 95 lean), C, D, F |
| D8 | A dropped port keeps the empty body, since its reconnect reads again (the approved restart line); every other rejection shows E | E on every rejection (a flash of the failure on each worker restart, against the approved restart line) |
| D8 styles | One `empty-state.module.css`, composed by History and the received page, each setting its title colour | a copy of History's three rules (the prototype's; a copy that drifts) |
| D6 rule | An armed fee row for the same receipt and block keeps its fee, its tap or its lookup in flight; a failed lookup looks again; any other landing disarms and resets the row at once, and the run does not await the fee step (its lookup can wait on the reconnect that must read again) | tracking the row's last id and block hash (state for a duplicate privacy-off lookup) |
| D8 scope | E only while nothing is on screen: a failed read after a resolved absence leaves "not found", as a failed read leaves a shown receipt (D5) | E replacing "not found" (Retry then fell back to "not found" while it read) |
| Access | Under the owner's 2026-10-19 delegation: Retry is a native button, Open History a link (`Button`'s `link`, a RouterLink), both in the Tab order after the header | Open History as a button that pushes the route (a navigation without link semantics) |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | conditional approve | 1 (D4 `reset()`), 2 and 3 (Security; known limits at close-out), 4 (F2), 5 (F7), 6 (I1, I2), 7 (D6 keeps a fee on screen; OA-1), 8 (D5: extract; auxiliary failures count), 9 (D7 slot; no page-wide tombstone), 10 (`:3055`), 11 (phase flags, `stopBackground`, B's content) | none |
| Codex final (fresh) | conditional approve: a delete-race control, D5's exception boundary, an OA-1 capture, OA-1 before arc 2 | all four (phase 2 tests, D5, capture (c), OWNER-ASKS wording) | none |
| Codex final r2 (resumed) | approve: the four conditions resolved, no regression | none | none |
| Arc 1 Codex r1 | approve (one comment nit) | the nit: `beginReconciliation`'s doc-comment states the why | none |
| Arc 1 Opus | conditional approve (no bug) | a test comment naming the fix, ARCHITECTURE.md's "unchanged" wording, a control at the gate's edge | none |
| Arc 1 Codex r2 | approve | none | none |
| Arc 2 Codex r1 | conditional approve | Retry falling back to "not found" (fixed as D8 scope), a moved block keeping its fee, the run awaiting the fee, four comments | none |
| Arc 2 Opus | conditional approve | the same Retry path; a tap lost to a same-block landing (D6 rule); a `RpcDisconnectedError` row, the kept-fee assertion, a superseded run, shared stubs; comments | the id and block-hash tracker (D6 rule) |
| Arc 2 Codex r2 | conditional approve: a Show fee press cancelled by a same-block snapshot | armed rows keep a lookup in flight (`bf59e8639`) | none |
| Arc 2 Codex r3 | approve, no new material finding | none | none |
| Opus Plan r1 | conditional approve | A1 (known limit), A2 (D4), A3 (fence before each request; unmount test), F3, F6, F7, I1 cost, I2; OA-1; D4 `pre` flush; D5 reconnect recovery limited to a restart, `modeRead` outside the read; D7 apply at once and hold, slot per run; TDZ, unmount order, the read split; tests (second checkpoint hash, `anchored`, page reads only, a real first connect); smoke flags, `EXTENSION_PATH`, `dist/` order, `type-roles.test.ts` | D5 inline (see Alternatives); ask (b) settled by D6 |

## Delivery

- **Arc 1**: branch `worktree-incoming-2`, one PR to `dev` with `gh pr create`, ready, no labels, after the Codex loop converges and the gates pass.
  - Title: `fix(incoming): a refused log page ends the scan tick, backs off and shows the stall` (83 characters).
  - Body: the owner's words, the gates with outcomes, each browser's e2e wall-clock, "F-10 in part: the reconciliation entry points take `PublicTarget`", `Closes #1429`.
- **Arc 2**: branch `incoming-2-a2` off `dev` after arc 1's merge, one PR with `gh pr create`. Title: `fix(received): the receipt page follows its link, and a failed read is not "not found"` (86 characters). Body as arc 1's, with the captures and `Closes #1431`. The close-out lands as its final commits, with the known limits filed and listed.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `51ea220b1`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask go in every prompt; the arc map says arc 2 rebuilds the received page on arc 1's base. One Opus `general-purpose` review runs beside each arc's round 1. Hard stop at three rounds.
- Steps 3 and 4 as written. The close-out moves this folder to `archive/incoming-2/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/incoming-2/plan.md`, then `agent-worktree done incoming-2 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1 phase ✓ in implementations-plan/incoming-2/plan.md, its gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material finding, quoted); a ready PR to dev closing #1429; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/incoming-2 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; arc 2 only once OA-1 is answered; never merge.
