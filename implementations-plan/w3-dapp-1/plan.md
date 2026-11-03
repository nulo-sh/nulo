---
plan: w3-dapp-1
tier: light
status: arc 1 merged (#1573); arc 2 in progress (OA-1 answered E)
issues: "#1460, #1461 (arc 1); #1380 (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at ed30c2565
trunk: dev
post_implementation_hardening: not scheduled
---

# w3-dapp-1: a Connect retried while locked, a window closed early, a stripped string argument

A Connect clicked again while the wallet is locked folds into a dead queued request, and both fail (#1460). A dApp window closed before its `create()` resolves leaves its request, and the dApp's retries, pending for ten minutes (#1461). A call's string argument loses the characters the card strips, with no mark (#1380). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1 answered E on 2026-11-03; OA-2 and OA-3 open, each built as A).

## Outcome & Quality Bar

- **For whom**: a person who clicks Connect on a dApp while the wallet is locked and again later; a person who closes a dApp or passkey window as it opens; a person approving a call whose string argument holds characters the card cannot draw.
- **Excellent**: (1) after unlock the newest live Connect opens its window, and the badge counts only requests that can still succeed when it is repainted; (2) a person's close settles its window at once, however the close and the creation reach the worker; (3) the card never shows a string as whole when it is not, and prints UTF-8 text as written where its bytes have one reading (arc 2, OA-1 E).
- **Good enough**: no timer repaints the badge between events; no new copy in arc 1.

## Findings (paths verified at `ed30c2565`)

| # | Path | Label |
|---|---|---|
| #1460 | Locked. t=0: discovery r1 for (O, chain 1) is queued (`discovery-queue.ts:68-86`). t=70 s: r2 for the same pair; `enqueue` coalesces (`:69`) and `discovery-flow.ts:120-122` rejects r2. Unlock: `drain` rejects r1 as stale (`:115`). Broken: the newest live request drains on unlock. Consequence: both Connects fail; the badge counted a dead request. The same holds when r1 is still live at r2 (t=50 s) and expires before unlock (t=58 s). A dead entry also holds a per-origin (`:73`) or global (`:77`) cap slot. | demonstrated (probe red on the base) |
| #1461 | `openAndAwait` subscribes `onRemoved` inside the continuation after `create` resolves (`window-manager.ts:128`). A removal that reaches the worker before that resolution meets no listener; the handle adopts a closed window and waits for `timeoutMs` (10 min for dApp windows). Retries for the pair wait on it (`discovery-flow.ts:297-318`). Broken: a person's close settles the handle. The ordering is already treated as real (`verify-admission.ts:201-210`, its test at `verify-admission.test.ts:175-186`). | demonstrated in code (probe red on the base); the browser timing is plausible, not reproduced |
| #1380 | `call-decoder.ts:167` passes a `str<N>` on as decoded; `callSurface` keeps it (`call-surface.ts:146-150`); `valueText` strips format and control characters (`:202-203`). `readableGrants` (`:291-297`) refuses the same string on a grant. Broken: the window says when it cannot show a value whole. Consequence: a call string reads whole while it is not; a lone surrogate draws as a replacement glyph. | demonstrated (trace) |

The claims held. Not in the issues: (a) a dApp that resends one `requestId` while locked overwrites its SDK row (recon, SDK facts), and today's coalesce then rejects that id, killing its own queued entry; (b) a real contract's UTF-8 string arrives byte by byte, so its continuation bytes 0x80-0x9F are C1 controls the print strips: #1380's fix touches non-ASCII text, not only hostile strings (OA-1). (c) Arc 2: the SDK's encoder writes a `str<N>` one field per UTF-16 unit (`charCodeAt`, stdlib `encoder.js`), the decoder reads one character per field (`String.fromCharCode`), and aztec-nr serializes a `str` as its UTF-8 bytes and deserializes each field `as u8`, keeping the low byte (protocol `serde` crate). So a field past 0xFF is not a byte the contract reads, and accented Latin-1 text arrives in two encodings (OA-2).

## Assumptions

- **Facts**: F1 the cites above and in recon. F2 (corrected by both legs) the SDK records a row before `onPendingDiscovery` (`discovery-flow.ts:83-84`), but by `enqueue` the row can be gone (`terminateForTab`, SDK `:422-425`) or expired (a reset wait of up to 60 s, `network-reset/service.ts:297-306`), and it is keyed by the page's `requestId`, so a later request with that id, from any tab, replaces it with a fresh object (SDK `:257-269`). So an entry owns its row only while the SDK's row for its id is the very object it queued (Codex final pass), the rule `bindLiveSession` already applies to sessions (`background.ts:488-490`). F3 `rejectDiscovery` sends the dApp nothing; a rejected discovery times out on the page at 60 s. Today the newer of two requests for a pair meets that fate; after D1 the older does, the behaviour #1460's "Expected" names (promoted by the owner, decision page 94, P94-03). F4 the per-handle `onRemoved` listener already exists; its start moves and it gains a mode before adoption. F5 `stopWatching` is the one teardown every settle path calls except `_settleUserClose` (`window-manager.ts:212-234`). F6 the SDK's provider mints each discovery's id with `crypto.randomUUID()` (`extension/provider/extension_provider.ts:177`), and subframes are refused at ingress (`background.ts:398`).
- **Inferences**: I1 (disputed, settled by design) arrival order at `enqueue` is not receipt order in every interleaving: Codex r1's probe has a newer discovery, started in the task that ends a reset, overtake an older one parked in `waitForRunEnd` by microtask count; Opus r1 holds that separate tasks keep the order. D1 compares the SDK's receipt `timestamp`, so it relies on neither, at no extra read (D2 reads every row). I2 (corrected) removals buffered while a handle has no window id have no fixed bound: they count the windows closed between `openAndAwait` and `create`'s answer, at most `timeoutMs`. A page opens popups only on a user gesture, so it cannot churn many; a fixed bound would add an overflow policy that brings the missed close back.
- **Asks**: OA-1 answered (E). OA-2, Latin-1-only text in its two encodings, and OA-3, right-to-left text, each built as A until the owner answers.

## Architecture & Implementation

- **D1, #1460, the newest live request per pair**: `enqueue(discovery, chainId)` keeps the SDK's row object in the entry with its `chainId`. In order: the incoming request must itself be live (D2), else the queue is untouched (Opus r1: a tab closed, a 60 s reset wait or a resend already queued must not displace a live entry); the sweep (D2), which also drops an entry a resend of its id replaced, for any chain, without a reject; then one private `admit(entry)`: no entry for the pair → the caps, then queue; a strictly later receipt `timestamp` than the queued entry's → reject the queued one and take its place; otherwise refuse. Ties keep the queued entry. The queue rejects every request it refuses or supersedes through one `rejectOwned(discovery)`, which rejects only while the SDK's row is that object, so `enqueue` returns nothing and the caller no longer rejects (Codex final pass: the caller's unguarded reject could delete a successor). One entry per pair, so the badge still counts one per dApp chain.
- **D2, dead and replaced entries**: one private `liveDiscovery(entry)` answers the entry's object when the SDK's row is that object and pending, or returns nothing: a gone, replaced (F2) or settled row is dropped without a reject; an expired one is rejected. `drain` calls it per entry (re-reading the clock per entry, as now). `enqueue` sweeps the queue with it first, so the caps count live entries, and repaints the badge when anything left. A wallet locked mid-drain puts the rest of its snapshot back through `liveDiscovery` and `admit`, not a bare `push`, so a request that arrived during the drain keeps the rule (both legs); a refused one is rejected.
- **D3, #1461, listen before creating**: `openAndAwait` calls a private `watchRemovals(handleId, handle, kind)` before `getLastFocused`. It subscribes `onRemoved` once; the removed-id set lives in the listener's closure and collects ids while `windowId` is undefined; once `windowId` is set, a removal of that id settles the handle as a person's close. Adoption moves into a private `adopt(handleId, handle, created)` (the complexity budget): the identity fence; an id the set holds settles the handle as a person's close (no `windows.remove`), consulted only while the handle is still watched (`unsubOnRemoved !== null`), so a `detach` before adoption never consumes it (both legs); otherwise it sets `windowId` and drops the set. The second fence after subscribing (`window-manager.ts:136-140`) goes: nothing is awaited between them any more. `_settleUserClose` calls `stopWatching`, so every settle path releases the listener.
- **D4, logs**: lines D1–D3 add, edit or move keep a constant message with named properties (`{ request: describeExternalId(id), chainId }`). Every queue line a locked dApp can repeat at will (a replacement, a sweep's drop or stale reject, a cap refusal) logs at `debug`, as `rejectFailedDiscovery` does (Opus r1; CLAUDE.md § Logging policy: `warn` reaches every user's log).
- **D5, #1380 with OA-1 E, how the card reads a `str<N>`**: one pure `readWireString(decoded)` in `call-surface.ts`, applied by `callSurface` to every decoded string it shows. In order: trailing U+0000 are the padding and drop; a field past 0xFF is a character no byte can hold, so the value is unreadable; bytes that are valid UTF-8 (`TextDecoder` fatal, BOM kept) and decode to text whose NFC form holds a code point past U+00FF read as that text; otherwise the bytes read one character each, as today. The text must print whole (`safeWire` at 4096 leaves it unchanged) and hold no default-ignorable code point (`\p{Default_Ignorable_Code_Point}`: U+034F and the Hangul fillers survive `safeWire` yet draw nothing) and no character of a right-to-left block (OA-3), or the value is unreadable. Latin-1-only text keeps today's reading because its one-byte form would read the same (OA-2, A for that case). A decoded call with an unreadable string reads as `{ kind: "raw", reason: "arguments", fn }`, as an undecodable call does, keeping its decoded name for the title: the notice, the raw toggle, Confirm as today.
- **D6, the grant rule**: `readableGrants` refuses a grant exactly when `readWireString` finds one of its strings unreadable, so a grant reads its strings as a call does and the padding no longer refuses one.
- **Files**: arc 1: `packages/wallet-bridge/src/discovery-queue.ts` and its test; `apps/extension/src/wallet/services/wallet-sdk/discovery-flow.ts` (the `enqueue` call loses its reject; the comment at `:113-119`), and any other caller or test the typecheck and the `background.*` suites name; `apps/extension/src/wallet/services/window-manager/window-manager.ts` and its test. Arc 2: `apps/extension/src/popup/windows/execute/call-surface.ts`, `call-surface.real.test.ts`, `call-surface.test.ts`, one `OperationCard.*.test.ts` and `index.test.ts` (Confirm).
- **Alternatives not taken**: the issue's sweep alone (fixes t=70 s, not a retry at t=50 s that expires before unlock); no coalescing, every request queued within the caps (two clicks would count 2 on the badge, a visible change, and the drain would fan out dedupe waiters); keeping the later arrival (I1: arrival order can invert); a timer that repaints the badge at expiry (a new lifecycle); refusing a reused `requestId` from another tab at ingress (the SDK's id model, owned upstream by #127; F6 leaves no supported way to learn another origin's id); one manager-wide `onRemoved` listener with a bounded buffer, as the gate has (a listener for the worker's lifetime, and an overflow policy, where a per-handle one already exists); asking `windows.get` after adoption (`WindowPort` cannot confirm absence, and the read races too).

## UI impact

- **Arc 1, the toolbar badge**: before, it counts a dead queued request until unlock; after, it counts live ones whenever it is repainted (an enqueue or a drain). Count rule, colour and copy unchanged. Not an owner ask: #1460, as the owner promoted it (P94-03), names the dead count as part of the defect and the newest live request as the expected one (ledger, Opus r1 dissent).
- **Arc 1, two tabs of one dApp clicking Connect while locked**: before, the older connects at unlock if still live; after, the newer, as #1460's "Expected" says (F3).
- **Arc 1, dApp and passkey windows**: no visual change; a window closed as it opens ends its request at once instead of after ten minutes.
- **Arc 2, the execute window** (OA-1 E, the owner's sign-off of 2026-11-03, P101-01: "So if they want to sign a memo with "José" they should be able too, but I don't want to: 1. Break everything else just because of it. [...] 2. Put the user at risk just cause."): before, a call's string argument prints with direction, zero-width and control characters stripped and nothing marked, and UTF-8 text beyond ASCII prints as mojibake or stripped; after, UTF-8 text holding a character beyond Latin-1 prints as written ("€", "José — café"), and a string the card cannot print whole shows the existing "Can't read the arguments" notice (the summary at rest, the raw toggle under the details), Confirm as for any unreadable call, the title unchanged. That includes a field past one byte, which is how the SDK's encoder writes "€", an emoji or CJK text and which the contract reads as its low byte: such a call, readable before, now reads as unreadable, and such a grant is refused (E's "a character no byte can hold"). A grant reads the same way and is refused when unreadable, as today; a padded one now reads. No new copy. Latin-1-only text keeps today's reading (OA-2); right-to-left text reads as unreadable (OA-3). The PR carries before/after captures (light, Chrome) of the U+202E call.

## Security & Adversarial Considerations

- **Hostile dApp** (controls `requestId`, its origin's discovery rate, and call arguments): D1 keeps one entry per pair, so distinct-id floods stay bounded by the caps and each superseded or refused id is rejected upstream (the SDK map stays bounded, as today). A page supersedes only its own origin's entry, the same power it has today to block one; a second tab of one origin is superseded by the newer (F3). A row replaced by a reuse of its id, from any tab, is dropped, never rejected or processed for the entry (D2, F2); the reuse itself is the SDK's id model (#127). D2 sweeps at most 32 entries per enqueue.
- **Windows**: D3 adds no listener a handle did not already hold; the buffer holds only window ids (I2). A removal of an unrelated id never settles a handle, and a detached handle never consumes one (tests).
- **Execute strings**: display only; the call runs as the dApp sent it. Arc 2 changes what the card shows, never what is signed. A hostile dApp controls every field: For one `str<N>`, D5 never prints two different field sequences as one exact text (the UTF-8 reading holds a code point past U+00FF, today's never does; the padding is restored by N), never prints a field the contract truncates, never prints a default-ignorable character or right-to-left text that would reorder on screen (OA-3), and keeps the BOM a default decoder would drop. Look-alikes stay out of scope, as for every wallet string: composed and decomposed text beyond Latin-1, a braille blank or a wide space for a space, a combining overlay.
- **Logging**: constant messages, named properties, no request contents. **Storage, permissions, crypto, dependencies**: none.

## Arc 1: the locked queue and the early close (#1460, #1461)

### Phase 1 ✓

- **Red first** (one commit): the tests marked Red fail on the base copies of the two source files.
- Do D1, D2, D4 in `discovery-queue.ts`; drop the caller's reject and rewrite its comment (`discovery-flow.ts:113-122`) to the new rule. Do D3.
- **Tests** (`discovery-queue.test.ts`, handler backed by a map of SDK-shaped rows, `Date.now` stubbed):
  - Red: r1 at t=0, r2 for the pair at t=70 s → r2 queued, r1 rejected; drain at t=75 s processes r2 only.
  - Red: r2 at t=50 s, drain at t=58 s → r2 processed, r1 rejected once.
  - Receipt order wins over call order: r2 (t=10 s) enqueued before r1 (t=0) → r1 refused, r2 kept.
  - An incoming request that is not live keeps the queued one, each case: r2's row deleted (its tab closed), r2 expired, or r2's object already replaced by a queued resend (a delayed first `enqueue`) → the queue unchanged, badge "1", and only the expired r2 rejected.
  - A resend of r1's id (a new object), for chain 1 and for chain 2 → one entry, the resend's, nothing rejected; for chain 2, a later r3 for chain 1 queues beside it.
  - Four expired entries for origin O on chains 1-4; chain 5 at t=70 s → queued, the four rejected, badge "1". Control: four live entries → the fifth is refused and rejected, the four untouched.
  - Locked mid-drain: `processFn` for r1 enqueues r2 for the pair, then returns `false` → the queue holds r2 alone, r1 rejected. The same with a resend of r1's id instead, for chain 1 and for chain 2 → the resend alone, nothing rejected (its fresh row survives).
  - Existing tests: the coalesce case becomes the replacement case; the caps cases assert `size` and the rejects instead of a return value; the rest keep their meaning on the map-backed handler.
- **Tests** (`window-manager.test.ts`, `create` wrapped to call the real one, then `closeByUser` its id, then return):
  - Red: after `flushCreate()`, a captured outcome is `WINDOW_CLOSED_BY_USER` with no clock advance (never an awaited promise, which would fail the base by vitest timeout); `windows.remove` not called; the timeout cleared.
  - Control: another window's removal before adoption leaves the handle live; a later close of its own window settles it as a person's close.
  - `detach` before adoption with the removal buffered: adoption does not settle the handle, and a later `settle` resolves it.
  - Every settle path (settle, cancel, timeout, person's close, `handOver` before adoption) leaves no `onRemoved` listener (a spy counting live subscriptions).
- **Gate**:
  - `bun run lint`; `bun run lint:actions`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test --retry=0`; `bun run --cwd apps/extension test src/wallet/services/window-manager src/wallet/services/wallet-sdk src/wallet/services/passkey src/wallet/services/dapp-interaction --retry=0`; `bun run test:all`.
  - From the root: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-locked-queue.test.ts tests/e2e/network/connect-locked-queue-sw-restart.test.ts tests/e2e/network/connect-deny.test.ts tests/e2e/network/window-placement.test.ts`, then with `NULO_E2E_BROWSER=firefox` added.
  - Before the network runs (they rebuild `dist/`), build with CI's smoke flags: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`; from `apps/extension`, `env -u EXTENSION_PATH NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/passkey-paths.test.ts tests/e2e/toolbar-panel.test.ts` (the second runs on Firefox only); then the same flags with `build:firefox`, and the run with `NULO_E2E_BROWSER=firefox` added.
  - Pass: every command exits 0; the two red tests fail on the base copies. Record each browser's wall-clock. No e2e scenario is added: no browser can order a removal before `create`'s answer on demand, and the queue is pure.
- **Result** (`1003743fb` red, `e660abf83` fix, review fixes `0dcec23fc`): lint, lint:actions, typecheck:all, test:all exit 0 on the head. Red evidence and the mutation check: `lessons/phase-1.md`. Smoke at retry 0: Chrome 3/3 (24 s), Firefox 9/9 (165 s). Network at retry 0: Chrome 5 passed, 1 Firefox-only skipped (221 s); Firefox 6/6 (270 s).

## Arc 2: a call string the card cannot print whole (#1380, OA-1 E)

### Phase 2

- **Red first** (one commit): the cases marked Red fail on `origin/dev`.
- Do D5 and D6 in `call-surface.ts` (it replaces `printsWhole`).
- **Tests**:
  - `call-surface.real.test.ts` (node, the real decoder over a `str<N>` memo function, fields as the wire carries them): Red: U+202E inside, a zero-width joiner, a lone surrogate field, an interior NUL, a UTF-8 BOM → `raw`, reason `arguments`. Red: "Total 5 €" as UTF-8 bytes reads as written. A clean ASCII string NUL-padded reads without its padding (control). The SDK's "José" reads "José" and the UTF-8 "José" reads "JosÃ©" (OA-2). A field past 0xFF ("€" as one field) is unreadable.
  - Also there: a UTF-8 U+034F (`cd 8f`) is unreadable; a four-byte emoji reads; a struct holding an array holding a UTF-8 string reads, a hidden character there is unreadable, and the adjacent non-string values are kept.
  - `call-surface.test.ts` `readableGrants`: Red: a padded string and a UTF-8 "€" read; the refused classes stay refused; `readableGrants` then `callSurface` reads the original byte-shaped string once.
  - `OperationCard.wire.test.ts`: the U+202E call shows the notice, its raw toggle and the section open; "€" prints in the decoded row.
  - `index.test.ts`: Confirm stays enabled under an unreadable call; a UTF-8 grant enables it, an unprintable one holds it.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/popup/windows/execute src/popup/windows/fee --retry=0`; `bun run test:all`; no smoke file opens the execute window (it needs a dApp), so the network files that open it and read its arguments: `NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/authwit-lifecycle.test.ts`, on Chrome and with `NULO_E2E_BROWSER=firefox`. No e2e scenario is added: the reading is pure and the component tests drive the card. Captures: the U+202E call before and after, light, Chrome.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1–D4 | as above | see Alternatives not taken |
| Arcs | #1460 and #1461 ship together (dApp windows and the connect lifecycle, no UI question); #1380 waits on OA-1 | one PR for all three (holds two fixes behind an owner question) |
| Badge | a correctness fix, no owner ask (Codex r1 agrees) | Opus r1: a one-line owner acknowledgement. Rejected: the owner already decided the behaviour by promoting #1460 with its Expected line; the count rule, copy and colour stay |
| Smoke files | `passkey-paths.test.ts` on both browsers, plus `toolbar-panel.test.ts` on Firefox | `toolbar-panel.test.ts` alone (deviation: it is Firefox-only; on Chrome the passkey ceremony runs in a `WindowManager` window during `passkey-paths.test.ts`) |
| Fields over 0xFF in a `str<N>` | arc 1: no action. Arc 2: unreadable (D5), OA-1 E's "a character no byte can hold": aztec-nr deserializes each field `as u8`, so the contract reads the low byte, not what the card would print | a check in arc 1 (Opus r1 labels it plausible); the brief's restatement "keep today's reading" for them (it prints a character the contract never reads) |
| OA-1 | E, signed by the owner 2026-11-03 (P101-01, at `250cec0a6`): "How would a non-ascii thing look this way? What I am trying to maximize is the UX... So if they want to sign a memo with "José" they should be able too, but I don't want to: 1. Break everything else just because of it. So we may need to evaluate correctly when to parse this way; 2. Put the user at risk just cause." With A's treatment for what stays unprintable. Arc 2 widens from A to D5 and D6. | A alone (the recommendation); B, C, D |
| D5, Latin-1-only text | today's reading (A for that case) and OA-2: its UTF-8 and one-byte forms would print as one text | UTF-8 whenever valid (the brief's rule (1): two arguments read alike, and only one is the contract's text); the one-byte form unreadable (changes the SDK's own encoding of "José", which reads whole today) |
| D5, default-ignorable | refused with the strip set (Codex arc 2 plan r1: UTF-8 `cd 8f` is U+034F, a combining grapheme joiner `safeWire` keeps and nothing draws) | adding it to `safeWire` (a shared sanitizer every wallet surface reads, out of this arc's scope) |
| D5, right-to-left text | unreadable (A) and OA-3: strong right-to-left letters reorder digits and words on screen with no control character, #1380's consequence, which today's reading never shows (Opus arc 2 r1 named it; traced: `12א34` draws `34א12`) | printing it as written (the reordering); a bidi-override style (a new look, an owner call) |
| D5, decomposed Latin-1 | NFC before the past-Latin-1 test (Opus arc 2 r1: `e` plus U+0301 drew like the SDK's `é`) | none |
| D5, where | `callSurface` reads every decoded string once, at display; the decoder and the wire type stay as they are | reading in the decoder (its output also feeds the grant gate, and reading an already read string again is not idempotent) |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | reject: row ownership, I1, the drain's re-queue | all 8: ownership in D2 (1), F3 (2), timestamps (3), re-queue via `admit` (4), detach-aware buffer (5), I2 (6), OA-1 corrected with option E, a UTF-8 fixture (7), `lint:actions` (8) | an ingress refusal of a reused id (out of scope, #127) |
| Codex final r2 (resumed) | reject: origin is not ownership; the caller's reject can delete a successor | both: entries keep the SDK object, `rejectOwned` checks identity, the queue owns every reject, tests for same-id resends in the drain and a delayed first `enqueue` | none |
| Codex final r3 (resumed) | approve: no new material finding | none | none |
| Arc 1 Codex r1 | conditional approve: a same-id resend repeats the `info` push line; the detach test detached before the close; the queue's red run fails on the API | the log level, the test order (a mutation check proves it), the old-API probe as the red evidence | the long constructor comment (pre-existing, untouched) |
| Arc 1 Opus | conditional approve: the detach test, the push line, the cap comment | all three | none |
| Arc 1 Codex r2 (resumed) | approve | none | none |
| Arc 2 Codex plan r1 | conditional approve: U+034F survives the print check; nested and emoji tests; injectivity holds per `str<N>` and as exact text; comments | all 4 | none (it confirmed A for OA-2, display placement, and a field past 0xFF unreadable against the pinned serde) |
| Arc 2 Codex r1 | approve: one comment (the grant gate's non-idempotence) | the comment | none |
| Arc 2 Opus r1 | conditional approve: an unreadable decode titled by the dApp's label; decomposed Latin-1 drew like the SDK's; UI impact understated the SDK's wide fields and named a section that does not open; a grant test on the UTF-8 strip path; right-to-left reordering | all, the last as A plus OA-3 | the Confirm pin as red evidence (kept as a pin: the window stubs the card); a comment on the cut that never binds (Codex asked for fewer comments there) |
| Opus r1 | conditional approve | incoming liveness (1), resend dropped first (2), `debug` levels (3), re-queue (4), detach and the dead fence (5), extraction names (6), test wording and captured outcome (7), F2, F4 (8), OA-1 reach and A plus E (9), `audit:vue` in arc 2 | the badge acknowledgement (ledger); I1 "holds" (kept as disputed, D1 does not depend on it) |

## Delivery

- **Arc 1**: branch `worktree-w3-dapp-1`, one PR to `dev` (`gh pr create`), ready, no labels at creation, after the Codex loop converges and the gates pass. Title: `fix(dapp): a locked Connect retry drains on unlock, and an early window close settles` (85 characters). Body: what changed and why, the gates with outcomes, each browser's wall-clock for the touched e2e files, "#1380 waits on OA-1", `Closes #1460`, `Closes #1461`.
- **Arc 2**: branch `w3-dapp-1-a2` off `dev` (arc 1 merged as #1573), one PR, ready. Title: `fix(execute): a call string the card cannot print whole says so; utf-8 text prints` (82 characters). Body as arc 1's, with the owner's sign-off quoted, OA-2, captures, `Closes #1380`. The close-out lands as its final commits; it comments on #127 that a pending row can be taken over by another tab's reuse of its id, which the queue now drops (D2).

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `ed30c2565`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; the arc map says arc 2 changes only the execute card. One Opus `general-purpose` review beside each arc's round 1. Hard stop at three rounds.
- Steps 3 and 4 as written. The close-out moves this folder to `archive/w3-dapp-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/w3-dapp-1/plan.md`, then `agent-worktree done w3-dapp-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1 phase ✓ in implementations-plan/w3-dapp-1/plan.md, its gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material finding, quoted); a ready PR to dev closing #1460 and #1461; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/w3-dapp-1 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; arc 2 only once OA-1 is answered; never merge.
