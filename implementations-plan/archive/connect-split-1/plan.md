---
plan: connect-split-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ f214e5cb
standard: implementations-plan/README.md § Post-implementation standard, read at 175d8268
---

## Outcome

- **Date:** 2026-10-19; reworked 2026-10-20 on the owner's decision.
- **Status:** completed. #886 closes #859 and #884, a draft until the orchestrator takes it out; its merge into `dev` closes the plan.
- **Shipped:** Allow answers the discovery and closes its connect window at once (D9); the check opens in its own window when the dApp starts its exchange, as a reconnection's does; closing a window after Allow never cancels; a refusal after Allow answers only the app (#927). A saved app no connection has reached reads "Allowed. Not connected yet." in Connected apps, its page says so, and its next check reads as a first connection's, from the verification hash establishment already writes, with no stored data added (D10). The `standby` reservation, the expired page, the step bar and `WindowPort.navigate` are gone; admission is the base's (D8); a fresh-document approval-filter pin; two connect journeys measured on both browsers at retry 0.
- **Owner asks:** OA-1 A, OA-2 B, OA-3 C (the owner, 2026-10-20); OA-2's note B (#884); OA-4 B (D8).
- **Dropped:** `ConnectBridge`, its `BRIDGE_MS` wait and the "Connecting on <chain>" state (D9, superseding D3); D5's per-tab cap (superseded by D8); outline B's navigate-in-place (D3); `focused: false` (D4); a playground Discover button (D6); a navigation watcher (D7).
- **Known limits:** #883 (D8, OA-4); #927 (a refusal after Allow shows nothing in the wallet, D9); navigation after the exchange stays #606's, commented (D7).
- **Open items:** #885 (a capture-mode hang that predates the plan); #849 took one Firefox occurrence.
- **Lessons:** one promoted: a PR conflicting with `dev` gets no `pull_request` run, folded into the merge-ref line. To keep the budget, the Confirm-enables entry moved to the `e2e-testing` skill, which also took this plan's e2e gotchas.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# connect-split-1: Allow closes the connect window; the emoji check opens its own

**Superseded in part (D9, D10, 2026-10-20).** The bridge (`ConnectBridge`, `BRIDGE_MS`), the quality bar's bridge timings (items 1 and 2), I1, and the bridge's change-map rows, tests and gates below record the arc as first built; the owner's decision replaced them, and the Outcome block and D9/D10 state what ships.

One arc, one PR against `dev`, `Closes #859` (and #884, D10). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

The owner, 2026-10-19, on #859: "I think sadly, we need to go back to “splitting” the concerns between those two pop-ups; although the two-stepper looks awesome, it’s not really “compatible” with how it might work in the wild." Allow answers the discovery and its window closes; the check opens its own window when the page starts the key exchange, as a remembered app's reconnection already does (#631).

## Outcome & Quality Bar

- **For whom**: a person connecting the wallet to a dApp for the first time, on a page that connects at once or on a wallet picker that lists wallets and connects later or never.
- **Excellent**:
  1. After Allow no wallet window waits for an exchange that may never come: on a page that has not started its exchange, the connect window is gone `BRIDGE_MS` after the wallet approves the discovery.
  2. A page that exchanges at once never shows its own page between the two windows: once its establishment reaches the worker's callback within `BRIDGE_MS` of the approval, the check window is created before the connect window closes (D3). J1 measures that, focus, and the time until the grid shows, on both browsers.
  3. The check window opens only for an Allow, from that Allow's tab and document origin, once per Allow, within the origin's two and eight in all (D8), and answers no key the person was typing elsewhere.
  4. A remembered reconnection behaves as at the base, and the reservation code gets smaller: the `standby` state, its expired page and `WindowPort.navigate` go.
- **Good enough**: a page that exchanges after the Allow's validity gets its session ended with no window (#606's slow-pick path, now also for a first connection); the wallet says nothing (OA-2).

## Assumptions

**Facts** (recon has the evidence):
- F1 The sdk sets no deadline between a discovery answer and the key exchange; the page starts the exchange when it chooses. Two exchanges on one id can both pass the sdk's check while the first awaits its key generation (`background_connection_handler.ts:306-331`).
- F2 Today an Allow attaches its window to the verify reservation (`standby`); the exchange navigates that window to the check; with no exchange the window waits until the reservation expires, 65 s after the discovery, then shows "Connection request expired" for 30 s. Closing that window at any point before the check cancels the attempt (`attach` fails on a buffered removal, `discovery-flow.ts:408-412`; a standby window's removal releases the slot and tombstones the marker), pinned by `background.connect-window.test.ts:478`, `:557`.
- F3 A remembered reconnection reserves at admission and opens a fresh window with `openVerifyWindow`: 400 wide, `min(800, anchor height)` tall, at the top right of the last focused normal window, re-read when the window opens; the browser gives it focus. The discover window uses the same size and anchor rule.
- F4 An exchange with a dead marker, no row or no reservation is ended before any window opens; one reservation backs one window (`markInFlight`).
- F5 `keyExchangeFromItsDiscovery` admits a key exchange only from its discovery's tab and document origin, on arrival (`background.transport.test.ts:277-330`). Before that, each document's content script passes a discovery approval to its page only for a request that document forwarded (`content-script/approval-filter.ts`, a per-document instance; `approval-filter.test.ts`, `content.test.ts:44`), so a document loaded after a navigation never receives the port of an earlier document's Allow.
- F6 The verify page installs no document key listener, focuses nothing on mount (`verify/index.test.ts:143`), and both buttons refuse a repeat or composing Enter.
- F7 `WindowPort.navigate` has no production caller outside the standby path; `test-ports.ts:11` and `packages/wallet-core/src/testing/fake-browser-api.ts:212-229` (+ its test `:133-142`) implement it.
- F8 Today an origin may hold two checks at once (`VERIFY_WINDOWS_PER_ORIGIN = 2`), so one tab can show two: two chains, or a new connection plus a re-discovery the row turns into a remembered reconnection (recon § 5).
- F9 `approveDiscovery` returns once the sdk has posted its answer; nothing confirms the page received it.

**Inferences**:
- I1 The playground's establishment reaches the worker's callback (after the sdk's key derivation) well under `BRIDGE_MS` after the approval. J1 logs Allow → check created; if any run exceeds `BRIDGE_MS / 3`, the implementer stops for the panel before the PR.
- I2 Closing the connect window under a check window of the same size and anchor is invisible (the new window is on top and focused). It fails if the person moved either window; then the check appears where a reconnection's would.

**Asks** (the arc ships each "what ships now" form as a draft PR):
- A-1 → OA-1 (owner): sign-off of both windows' new design, light and dark, Chrome.
- A-2 → OA-2 (owner): what the person sees after Allow when no check follows, including the bridge itself against closing at once.
- A-3 → OA-3 (owner): closing the connect window after Allow.
- A-4 → OA-4 (orchestrator, owner if they choose): the lane's "one check window per page" against "a remembered reconnection stays as it is" (D5, superseded by D8).

## Architecture & Implementation

**Shape.** The verify reservation goes back to one job, a slot for one check window: `unstarted → in-flight → opened → released`. The connect window leaves the reservation. After Allow the worker keeps the handed-over connect window as a *bridge* until that attempt's check window has been created, the attempt fails, its tab goes, or `BRIDGE_MS` passes after the approval with no establishment begun. A new connection's check opens through `openVerifyWindow` against the reservation admission took at Allow, the path a remembered reconnection uses.

**`ConnectBridge`** (new, `WSDK/connect-bridge.ts`, replaces the `handedOver` map; in memory, worker-scoped):

```ts
export const BRIDGE_MS = 1_500
export class ConnectBridge {
  constructor(clock: Pick<ClockPort, "setTimeout" | "clearTimeout">, closeWindow: (windowId: number) => void)
  // Every call names the hold it acts on: a page can reuse a request id, and a stale caller must
  // never reach its successor's hold.
  hold(id: string, tabId: number, windowId: number): BridgeHold // at Allow; a held id is ended first
  isOpen(hold: BridgeHold): boolean  // still held and its window not removed
  windowRemoved(windowId: number): void // fed by the existing ports.windows.onRemoved
  arm(hold: BridgeHold): void        // the approval call returned: end(hold) after BRIDGE_MS
  pin(id: string): BridgeHold | undefined // its establishment reached the callback: clear the timer
  end(hold: BridgeHold): void        // close now; idempotent; no-op when no longer held
  endForTab(tabId: number): void
}
```

**Control flow, new connection.**
1. Allow → `settleDiscovery` → `handOver` → `{ approved: true, windowId }` (no `expiredUrl`).
2. `runDiscoveryPopup`: `hold = bridge.hold(...)`; `admitVerifyWindow`; when a window was handed over and `!bridge.isOpen(hold)`, refuse as today's failed `attach` does. `attemptOpen` becomes `!reservation.abandoned && (no window handed over || bridge.isOpen(hold))`. `persistAndApprove` returns whether the approval landed: landed → `bridge.arm(hold)`; every other exit → `bridge.end(hold)` in `finally`.
3. Exchange → `onSessionEstablished`: `pinned = bridge.pin(id)` synchronously, then `handleSessionEstablished` → `openVerifyWindow`; `validated.then(end, end)` on `pinned` (not `finally`: a rejected `validated` is already handled at `background.ts:530`).
4. No establishment by `BRIDGE_MS` after the approval call: `end(hold)`. The unstarted reservation expires 65 s after the discovery and tombstones the marker (unchanged).

The protected boundary is the establishment callback, not the exchange's arrival: the sdk derives keys before it calls back (`background_connection_handler.ts:306-346`), and pinning at arrival would need a settlement path for exchanges the sdk drops. A pinned bridge lives as long as establishment's own awaits; otherwise the bridge lasts the admission wait (≤ the 55 s cut-off) plus `BRIDGE_MS`.

**Settled questions** (lane brief, phase 2):
- *An Allow's validity with no exchange* (D2): unchanged. The reservation expires `RESERVATION_GRACE_MS` (10 s) after the 55 s discovery cut-off; the marker goes stale 90 s after Allow. A later exchange is ended before any window opens (F4); what the page shows is #605's. The row written at Allow stays, as today.
- *A second exchange from the same page while a check is open* (D5): on the same id, ignored by the sdk once its entry is spent, else refused by `markInFlight` (F1's overlap included) and ended. A new discovery takes its own path, under the origin's cap of two checks (D8).
- *Where the window opens and what takes focus* (D4): as a reconnection's (F3); inside it nothing is focused (F6).
- *A quick exchange's gap* (D3): `pin` keeps the connect window until the check window exists whenever establishment calls back within `BRIDGE_MS`; J1 measures creation, focus, the grid's appearance and removal.
- *Persistence*: none new.

**No tab cap** (D8, superseding D5): the per-tab cap of one check that first shipped counted an unstarted reservation, so an Allow the page never used held its tab's slot for about 65 s, and the page's next discovery, answered from its saved row, waited or expired: a remembered reconnection no longer as it was. Admission stays the base's: two checks per origin, eight in all, one reservation per Allow. One page can still hold two checks at once (one per chain, or a new connection beside a saved-row reconnection), and allowed origins in several frames share one tab: a closed `known-limit` issue at close-out.

**File-level change map.**

| File | Change |
|---|---|
| `WSDK/connect-bridge.ts` (+ `.test.ts`) | new |
| `WSDK/verify-admission.ts` (+ test) | remove `standby`, `closing`, `attach`, `claimStandby`, `closeStandby`, `expiredUrl`, the standby branches, the hooks `closeWindow`, `navigateWindow`, `expired`; `unclaimed` → `unstarted`; add the tab count; header and `windowRemoved` comments |
| `WSDK/session-established.ts` (+ test) | remove the standby branch and `showVerifyInConnectWindow`; `windows` Pick drops `navigate`, `update` |
| `WSDK/discovery-flow.ts`, `discovery-approval.ts` (doc) | as in Control flow; `DiscoveryDeps.handedOver`, `closeWindow` → `bridge`; `tabId` into admission |
| `WSDK/background.ts` | `bridge` replaces `handedOver`; `onRemoved` also feeds `bridge.windowRemoved`; `tearDownTabAttempts` → `bridge.endForTab`; admission hooks keep `released`; `pin` and `end` around establishment |
| `WSDK/background.connect-window.test.ts`, `background.verify-reservation.pins.test.ts`, `test-ports.ts` | rewrite the blocks recon § 4 names; drop the removed hooks and `navigate` |
| `dapp-interaction/{service,spec}.ts` (+ test) | `DiscoveryOutcome` drops `expiredUrl`; `settleDiscovery` keeps `handOver` |
| `packages/wallet-core/src/ports/window-port.ts`, `testing/fake-browser-api.ts` (+ test), `core/adapters/chrome-browser-api.ts` (+ test, header note 4) | remove `navigate` |
| `popup/windows/discover/index.vue` (+ tests) | remove the step bar, `isExpired`, `EXPIRED_CLOSE_MS`, `leaveExpired`, the expired overlay; `approve()`'s comment says the worker closes the window |
| `popup/windows/verify/index.vue` (+ tests) | remove the step bar |
| `popup/windows/ConnectStepBar.vue`, `.test.ts`; `apps/extension/scripts/type-roles/surfaces.expected.json:508-515` | delete; drop its inventory entry |
| `tests/e2e/fixtures/popups.ts`, `fixtures/extension.ts` | `approveConnect`: Allow, the new verify window, the connect page closed, no third window; `recordCreatedWindows` also records removals, with `Date.now()` stamps; `connectPlayground`'s comment |
| `tests/e2e/network/connect-one-window.test.ts` → `connect-check-window.test.ts` | J1 and J2; `stallPage` moves here from `session-tabClose` |
| `tests/e2e/network/session-tabClose.test.ts` | its two connect-window scenarios go (J2 and `endForTab`'s unit test cover them) |
| `tests/e2e/network/window-placement.test.ts`, `session-reconnect.test.ts` | the check is its own window; the step-bar read goes |

**Trade-offs**: see D1-D7 in the decision ledger.

## Phase 1: what the sdk allows ✓ (at planning)

Recon § 1. Gate for the implementer: the installed `@aztec-labs/wallet-sdk` `package.json` says `6.0.0-rc.3`; another version → re-read F1's sources before phase 2.

## Phase 2: the wallet side ✓

Before the first code commit, with load1 under 150, run the base's `connect-one-window.test.ts` and `session-tabClose.test.ts` on both browsers (phase 3's commands) for the before wall-clock. Then, each step followed by the fast layers for the touched package:
1. `ConnectBridge` and its test (fake clock): an end before the timer closes once and the timer closes nothing later; the timer closes once; `pin` stops the timer and `end` still closes; `arm`, `pin`, `end` on an unheld id do nothing; `windowRemoved` makes `isOpen` false and `end` closes nothing; `endForTab` closes only that tab's; a second `hold` of an id closes the first window.
2. Remove standby from `verify-admission.ts` and `session-established.ts`; delete their standby tests; keep every unstarted, in-flight and opened case. The per-tab cap this step first added, with its queue and release-accounting cases, is gone (D8); in its place, a page that discovers again after an Allow it never used is answered at once from its saved row.
3. Rewire `discovery-flow.ts`, `background.ts`, `dapp-interaction`; remove `navigate` everywhere F7 names.
4. Rewrite `background.connect-window.test.ts`'s blocks; each never-happens case shares its fixture with a success control:
   - an Allow keeps the connect window until the check window is created, then closes it (port order: `create` before `remove`), even when establishment calls back just before `BRIDGE_MS` and the window takes longer (pinned); control: a remembered reconnection creates its window and closes nothing;
   - with no exchange, the connect window closes `BRIDGE_MS` after the approval and the slot stays held until the reservation expires; a later exchange opens no window and ends the session;
   - closing the connect window while its Allow queues or while the row is written refuses the attempt with no row (today's `:478`, `:557` meanings); control: left open, it proceeds;
   - closing the connect window after the approval landed leaves the attempt alive: the exchange opens exactly one check window and the session stays live (OA-3's shipped form);
   - a refused approval (expired, chain lost, profile switched) closes the connect window at once and opens nothing;
   - two exchanges on one id overlapping (F1) and a re-exchange while the check is open each open at most one window;
   - an exchange with no Allow and no row opens no window; F5's transport pins stay.
5. Windows: remove the step bar and the expired page; delete `ConnectStepBar`. Component tests over wire-shaped fixtures (a `0x` + 64 hex verification hash, a real request id): discover keeps "Connecting on <chain>" after Allow and never closes itself; verify keeps F6's pins, and each button ignores a repeat and a composing Enter while a plain Enter answers (control).

**Validation gate.** Commands: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Pass: every command exits 0; `grep -rn "standby\|claimStandby\|expiredUrl\|ConnectStepBar\|connect-step-bar\|navigateWindow" apps/extension/src apps/extension/scripts packages` prints nothing. Layers: lint, typecheck, unit, composition, component.

## Phase 3: the journeys, the measurements, the pictures ✓

1. `approveConnect` and `recordCreatedWindows` as in the change map; `approveConnect` starts recording and arms `waitForPopup(ctx, "verify")` before it presses Allow (the wait snapshots existing pages).
2. `connect-check-window.test.ts`, two scenarios, each run at retry 0 on both browsers:
   - **J1, a first connection** (failure mode: the check does not open on its own, opens a second or third window, or shows the dApp's page between the windows; only a browser shows window order, focus and paint). Allow; the check window opens and has focus (`document.hasFocus()` in it, and it is the last focused window); its grid matches the page's hash; the header reads "No account shared" and "Local Network"; nothing in it is focused, and an Enter, a held (repeating) Enter and Escape sent to it answer nothing (composing Enter stays a component test: a synthetic one proves no native activation); They match connects; the created windows are discover, verify, capabilities. Logs, with `Date.now()` stamps: Allow, check created, connect removed, and the grid first visible (polled in the check page from its target's appearance). These are evidence for I2 and OA-2, not a proof that no intermediate frame showed the page. Estimate 45 s (the replaced scenario).
   - **J2, connect later** (failure mode: a window waits after Allow, #859; control: the late exchange still opens the check). `stallPage(dapp, 10_000)`, Allow; the connect window closes and no wallet window remains while the page is stalled; the page resumes; the check opens with "Connection established"; They match connects. Logs Allow → connect removed. Estimate 30 s.
3. Adjust `window-placement`, `session-tabClose`, `session-reconnect`.
4. Pictures for OA-1 and OA-2: base and head, light and dark, Chrome, under `implementations-plan/connect-split-1/screenshots/`, linked by permalink in the PR body.

**Validation gate.** Load1 under 150 first. Commands: the phase 2 gate; `bun run audit:vue`; the smoke suite on both browsers, since its specs import `fixtures/popups.ts` (`cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e`, then with `NULO_E2E_BROWSER=firefox`); then, from the worktree root, `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/connect-check-window.test.ts tests/e2e/network/window-placement.test.ts tests/e2e/network/session-tabClose.test.ts tests/e2e/network/session-reconnect.test.ts tests/e2e/network/session-reconnect-flood.test.ts tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/cold-wake-discovery.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`. Pass: every run exits 0; every J1 log shows the check created before the connect window removed and Allow → check created under `BRIDGE_MS / 3` (else I1 fails: stop for the panel). The PR gives the check-created → grid-visible interval per browser for OA-2. Layers: network e2e, Chrome and Firefox.

## Security & Adversarial Considerations

Attacker: a web page, or a script on one, that sends discoveries and key exchanges at will and can navigate its own tab (recon § 1). Boundaries: wallet windows and their focus, the session row.

- **The check opens only for an Allow** (Excellent 3): no reservation, no window (F4); one window per reservation; the marker binds the Allow's profile and tab; F5 binds the exchange to the discovery's tab and document origin. **A navigation voids an unused Allow**: the old document's port dies with it; an approval landing after the navigation reaches no page, because the new document's approval filter holds no id it did not forward (F5); and an exchange from another origin is dropped on arrival. The one way through is a later document of the *allowed* origin that sends a discovery reusing the earlier document's request id, which the sdk then records afresh for that tab (`background_connection_handler.ts:257-268`): the allowed app connecting itself, still behind the emoji check, so no boundary is crossed (plausible but unverified; unchanged from the base). Tests: the filter and transport pins stay, plus one filter case: a fresh filter drops an approval for an id an earlier instance forwarded. Code comments state these as invariants.
- **Navigation after the exchange.** An exchange that passed F5, then a navigation while establishment awaits, can still open a check for a session whose page is gone: the transport checks on arrival, and on Chrome `tabs.onUpdated` sees no URL for an ordinary origin (Firefox delivers it, `session-tabNavigate.test.ts:158`). Unchanged from the base (the standby path navigated the same way), harmless to answer, and #606's "a check can outlive its session"; closing it needs a document-liveness lifecycle (D7). Comment on #606 at close-out.
- **Window stacking.** The connect window closes at Allow and holds no slot (D9). Checks: 2 per origin, 8 in all (D8).
- **Focus theft.** The check opens without a gesture; nothing inside is focused and no Enter or Escape at the document answers it (F6). Pinned in component tests and J1.
- **Weakened behaviour.** A late exchange used to land on a visible expired page; now it ends silently, and so does every refusal after Allow, the window being gone (#927). No capability, account or signature results (F4).
- **The not-connected line** (D10) reads a field establishment writes before it opens the check, so a row shows it from the Allow until a key exchange reaches establishment. Refusals known before the write (no session row, a profile mismatch, a stale approval, no reserved slot) leave it; a session ended after the write (a race with teardown, or its window failing to open) clears it with no check shown. A check closed unanswered leaves it cleared, though the app's calls still wait for They match. It grants nothing and reads nothing new: no stored data, no new message.
- **Logging, privilege, supply chain.** No new log line, permission, dependency or cryptography; `navigate`'s `tabs.query` and `tabs.update` leave.

## UI impact

- **Discover window** (OA-1 A, OA-2 B, OA-3 C): the two-segment bar leaves; Allow closes the window as soon as the wallet has the answer, with no "Connecting on <chain>" state; the "Connection request expired" page goes. No new line.
- **Verify window** (OA-1 A): opens as its own window for a new connection, as a reconnection's does; the bar leaves; same copy. A saved app no connection has reached gets "Connection established", not "Reconnected" (D10).
- **Connected apps** (#884 B): a row no connection has reached reads "Allowed. Not connected yet." in place of its grants; its page opens with "You allowed this app, but it has not finished connecting. Nothing is shared with it. Its next connection starts with the emoji check." Both go once a connection reaches establishment.

The owner signed OA-1 to OA-3 and #884's option on 2026-10-20; the PR body quotes the picks and notes.

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | Verify reservations lose `standby`; the connect window is never a slot | `attach` with a short expiry | both agree |
| D2 | An Allow's validity is unchanged | anchoring it to the Allow time (a second reservation deadline) | both agree |
| D3 | Superseded by D9. The bridge, pinned when establishment calls back, closed after the check window exists | outline B, settle-and-close at Allow; navigate in place (one window, against the split) | round 1: Codex B, Opus A; round 2: Codex A, subject to OA-2 |
| D4 | The check window opens as a reconnection's | `focused: false` (Firefox ignores it) | both agree |
| D5 | Superseded by D8. Ships a per-tab cap of one check, its FIFO collateral disclosed; the origin cap stays 2 | known limit (one per Allow, two per origin); per-tab queues (a scheduler change) | both asked to surface it: OA-4; Codex round 2 named the collateral and its tests |
| D6 | J2 stalls the playground with `stallPage` | a playground Discover button (four files and a README for one test) | Opus |
| D7 | No document-liveness tracking for a navigation after the exchange; a comment on #606 | a navigation watcher (the `tabs` permission or a content-script handshake) | Codex withdrew C1 in round 2 |
| D8 | No per-tab cap: admission stays the base's, and the stacking limit is a closed `known-limit` issue | D5's cap (an unused Allow blocks the tab's saved-row reconnection); a cap keyed on (tab, origin) that supersedes an unstarted reservation (it can kill a twin's exchange); a cap at window creation (a refusal, or a second queue with its own lifecycle) | implementation review: Opus's finding; Codex consulted, `DECISION: B` |
| D9 | Allow closes the connect window at once; `ConnectBridge` and `BRIDGE_MS` go; closing after Allow never cancels; a refusal after Allow answers only the app, a closed `known-limit` issue (#927) | D3's bridge; a notice window or toast for a refusal after Allow (a new surface the decision ruled out) | the owner, 2026-10-20: OA-2 B, OA-3 C |
| D10 | "Not connected yet" is a row with no `verificationHash`, which establishment writes before it opens the check; that read also makes the row's next check a first connection's | a stored connected flag or timestamp (new data) | the owner, 2026-10-20: #884 B; the words the orchestrator's, on the owner's note |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a154c9`): `reject (with blocking findings: navigation does not reliably void Allow; D5 contradicts the one-check-window-per-page invariant; the bridge's visual guarantee is unproved)`. Opus 5.5 Plan: `conditional approve (with conditions: closing before the approval lands still cancels, or OA-3; the bridge stays up while an exchange is handled; "one per page" goes up as an Ask)`. Dispositions (C = Codex, O = Opus):
- Accepted: O1/C6 closing the connect window → `isOpen` and `windowRemoved` keep today's cancellation before the approval; after it, OA-3. O2/C3 → `pin`; `validated.then(end, end)`. C2/O3 → OA-4 with a shipped form. C3 paint → J1 logs first paint; I2 rewritten. C4 → the timer's anchor named (F9); the bridge itself in OA-2. C5/O2 → the overlapping-exchange test. C7/O5 → the change-map rows. O6 → the base run before phase 2. O7 → keys sent to the check page. O8 → `stallPage`; the `session-tabClose` scenarios go. O4 → OA-2's note on rows left by picker pages.
- Disputed in round 1, settled in round 2: C1 (D7) and the pick of B (D3).

**Round 2** (Codex, resumed): `conditional approve (with conditions: correct the pin timing guarantee, disclose and test cross-tab queue effects, and make the visual validation gate substantive)`. C1 withdrawn (a stale check, no origin crossing; D7 proportionate). D3: revised A defensible, preferred for avoiding the dApp interlude, subject to OA-2. All five accepted: the protected boundary is the establishment callback and the bridge's lifetime is restated; the tab cap's FIFO collateral goes into OA-4 with three queue cases and the release-accounting cases; J1 asserts focus and logs the grid's appearance, the composing Enter stays a component test; `approveConnect` arms its wait before Allow; OA-2 names both waits.

**Final pass** (fresh Codex session `01a154d9`): `reject (with blocking findings: navigation does not reliably void an unused Allow)`, an A → B → A trace through the sdk; plus the post-approval close test, `audit:vue` and the smoke suite in the gate, J1's logs as evidence, and Firefox's URL visibility. The trace missed the content script's per-document approval filter; Security's first bullet now names it, with the same-origin id-reuse path labelled and a filter test added. The other four accepted. Resumed: `approve`; the A → B → A trace, rerun with the filter, gave no channel and no page answer, with both controls passing.

**Implementation review, round 1** (Codex fresh; Opus general-purpose, alongside). Codex: `reject (stale cleanup can close a successor's window; required visual assertions are missing)`. Opus: `conditional approve (fix or explicitly disclose and decide the per-tab cap under OA-4, with a test; restore the stamped-channel test; assert the order of creation and removal)`. All accepted: bridge holds are identity-guarded, captured across establishment and discovery cleanup, with a reused-id regression whose own bridge still closes (control); the connect journey asserts its timestamps, the order and Allow → check created under `BRIDGE_MS / 3`; `approveConnect` compares window-id sets and the late journey its whole creation history; the stamped-channel test is back over `openVerifyWindow`; stale comments fixed; journey ids left the test names. The per-tab cap goes (D8), after a Codex consult: `DECISION: B — Restore base admission behavior and record the inherited stacking limit rather than imposing a cap that breaks discovery-only wallet pickers.`

**Implementation review, round 2** (Codex, resumed): `reject (J2 deterministically reads its verify page after closure; update the stale plan contract)`. Both fixed: the late journey reads the check's window before its answer closes it; the quality bar and the bridge contract follow D8 and the identity-guarded holds.

**Implementation review, round 3** (Codex, resumed; the last): `conditional approve (Chrome and Firefox smoke suites pass; required base/head wall-clock comparisons are recorded)`, with no material finding left; the conditions are evidence, recorded in the PR.

**Implementation review, comment audit** (Codex, resumed, with the standard's two verbatim rules the earlier prompts left out): `conditional approve (apply the comment corrections above; previous validation conditions remain unchanged)`, no behavioral finding. Applied, with judgement: claims the code cannot hold (a frame never painted, a polled grid time) corrected, restatements deleted, the bridge and reservation contracts tightened; comments trimmed from base text kept as they stand; the controls keep their label.

**Owner rework, round 1** (Codex fresh, gpt-6.1-sol, high, session `01a158f1`; one Opus 5.5 diff review beside it), over the commits after the merge of `dev`. Codex: `conditional approve (with conditions: close the post-Allow profile-switch gap; restore the specified row copy; correct stale bridge documentation)`. Opus: `conditional approve (with conditions: finding 1 fixed, or the plan's claim corrected; finding 3 fixed)`. Accepted: the reserved-slot check moves above the hash write, so an exchange with no slot leaves its row not connected (test, with its success control); the row's line gets its own testid and J2 reads both lines by testid; a J2 guard that only added a way to fail goes; the pending-Allow test regains its disabled and loading assertions; stale comments, one log line and a test helper's name follow the close at Allow; the bridge passages above are marked superseded. Not acted on: an A → B → A profile switch during the admission wait meets the base's predicate unchanged, known limit #771; the row's words are the orchestrator's recorded call on #884 (Codex was sent a draft of them); writing the hash at They match instead of at establishment (Opus) would change D10's signal, so the PR states what the line means for the owner instead.

**Owner rework, round 2** (Codex, resumed): `approve`, no new finding; the profile-switch predicate matches `dev`'s, and the recorded words settle the copy.

## Delivery

- Branch `connect-split-1-a1` off `origin/dev` with this plan cherry-picked; one PR against `dev`, no stack (D-orch-1): `fix(connect): allow closes the connect window; the emoji check opens its own` (77 characters). Opened as a draft after the Codex loop converges, without labels; then `e2e:extension-network` if the path filter skips the network lanes. Body: what changed and why, the gates with outcomes, each browser's wall-clock of the replaced and the new scenarios, J1's and J2's measured times, OA-1 to OA-4 with their pictures and shipped forms, the accessibility calls (D4, focus and keys, under the owner's 2026-10-19 delegation), `Closes #859`.
- Parallelism: none; phase 3 rests on phase 2.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `175d8268`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, once, after phase 3's gate, over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three rounds. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: the draft PR (Delivery), then `gh pr checks <n> --watch`.
- Step 4, the close-out, as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the Outcome block; the lessons pass; the comment on #606 (Security, navigation after the exchange); the issue for rows left by picker pages, deduplicated first (OA-2's note), unless the owner's OA-2 answer covers it; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved; `bun run check:plans` green after staging.
- Step 5, after the merge: `agent-worktree done connect-split-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/connect-split-1/plan.md` succeeds.

| Where open work lives | Home |
|---|---|
| Work inside the arc | this plan and its PR |
| A bug, gap or deferred refactor that outlives the plan | a GitHub issue with a `Record` link |
| A product call, or a wait outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft advisory, recorded here as "tracked privately" |
| A path needing unsupported conditions, or a consequence that does not matter | a closed `known-limit` issue |

## Seeds

`/goal` (recommended): `implementations-plan/connect-split-1/plan.md is done: phases 2 and 3 marked ✓, each backed by its validation gate reported passing in the transcript (J1 and J2 on Chrome and Firefox at retry 0, the measurements logged); LESSONS_FILE=implementations-plan/connect-split-1/lessons/phase-N.md printed per phase; the Codex fix loop converged, quoted; the draft PR against dev exists with gh pr view output, opened after the loop, with the close-out's archive move in its last commits; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/connect-split-1 forward per its plan.md (read it and lessons/ first; plan.md is the state). Pick the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. A phase is green only when its gate passes as written. Then the Post-implementation loop, the draft PR, checks, the close-out; report and stop. Never merge.`
