---
plan: locked-discovery-1
tier: mid
status: completed; delivered by the PR that closes #1849, which carries this close-out
issues: "closes #1849"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high, read-only; Opus Plan agent
base: origin/dev at eb42af540
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-18. Planned and delivered the same day, in one arc.
- **Status:** completed. The PR into `dev` that closes #1849 carries the implementation and this close-out. Its merge closes #1849 and archives this plan.
- **Shipped:**
  - A locked discovery from a site with a profile to unlock opens one unlock window per origin. The window:
    - shows the site's band over the popup's lock screen, which moved into `LockScreen.vue`;
    - times out at the SDK row's cut-off, which a later discovery from the site moves;
    - shares the connect caps, and the origin's own window counts toward its hand-over.
  - After the unlock, the drain hands the window to the site's connect window or network notice (`WindowPort.navigate`, restored) and brings it to the front.
  - The window closes when:
    - none of the site's discoveries is left (a remembered site's drain, a tab teardown, the drain's refit);
    - the person closes it, which refuses nothing;
    - a worker restart ends it.
  - The shell's three `/popup/auth` writers leave the window on its route.
  - `useDappApprovalWindow` asks the worker for the session (D6, D17).
  - The two locked-connect network specs and the restart spec now pin the window.
- **Review loop:**
  - Plan: Codex reject and Opus conditional approve, all folded; a final fresh Codex conditional approve, folded; then Codex approve.
  - Diff, round 1: Codex and Opus conditional approve (the drain's cleanup, fixed at `d04664dbc`).
  - Round 2: Codex conditional approve (the second-unlock gap, fixed at `1f6ddf00f`).
  - Round 3: Codex approve.
- **Gates** on the final head ([lessons/phase-3.md](lessons/phase-3.md)):
  - lint, `typecheck:all`, `test:all` and `check:plans` exit 0 (one `test:all` teardown flake in a file this plan does not touch, rerun once green, filed as #1858).
  - Smoke: the lock screen's readers, 29/29 on Chrome and on Firefox.
  - Network: 7 files, 9/9 on Chrome and on Firefox, at retry 0.
- **Dropped:** a smoke scenario (D9). Firefox captures, which Firefox 157+ refuses on extension pages (D18).
- **Known limits:** #1855 (KL-1, a dApp page that navigates away leaves its window until the cut-off) and #1856 (KL-2, a flow started from the window's lock screen can be cut by the cut-off or the hand-over), both closed as not planned with their reopening conditions.
- **Open items:** none. The pin reminder stays the owner's ask, [OWNER-ASKS.md](OWNER-ASKS.md) OA-1.
- **Lessons:** none promoted. `lessons.md` is at its budget, and the drain's ownership rule lives in its code and the regression test.
- **Seeds retired:** the `/goal` and `/loop` below are not live instructions.

# locked-discovery-1: a dApp's discovery while Nulo is locked opens an unlock window, then the connect window

A developer's report, relayed by the owner on 2026-11-18: "when i click on 'connect wallet' to start the wallet discovery on nemi, nulo does not popup. It only shows a badge on the icon. It may be unintuitive. And if Nulo is not pinned in the extensions, the user is stuck with the loading screen with no indication that his/her action is needed".

**The decision**, the owner's (2026-11-18, about 15:05 UTC), the sign-off for the direction: "I think we should go for L1. If such web browser / application does that spamming... Then it's the website's fault. I'd do L1, and change the behavior in case users ask to change it." L1: a discovery that arrives while the wallet is locked opens an unlock window, the popup's own unlock screen inside a dApp window, which continues into the connect window in the same window once unlocked. One arc, one PR against `dev`. Evidence: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md).

**Claims that did not hold** (at `eb42af540`): the brief's "2 windows per origin, 8 in all" are the check-window budget; the connect window's caps are 4 per origin and 32 in all (recon F2). Smoke has no dApp page, so the new scenario lives in the network suite (F12, D9).

## Outcome & Quality Bar

- **For whom**: a person on a dApp who clicks Connect while Nulo is locked (auto-locked, or not yet unlocked since the browser started), Nulo pinned or not.
- **Excellent**: (1) within a second of the click a Nulo window shows the site's origin above the popup's own unlock form, password or passkey, on Chrome and Firefox; (2) after the unlock, the same window shows the connect window for that site (or the network notice), with no second window; (3) closing the window without unlocking refuses nothing: the badge stays and a toolbar unlock within the 55 s still connects; (4) the window never outlives the request: it closes at the 55 s cut-off or when the dApp's tab closes, and a worker restart closes it.
- **Good enough**: a remembered site's check window opens as today after the unlock window closes; a lock landing during the drain leaves the rest on the badge, as today; a dApp page that navigates away (no signal without the `tabs` permission) leaves the window until the 55 s cut-off, a known limit.

## Assumptions

**Facts** (verified at the base; recon numbers):
- A locked discovery is queued and only badged (F1); the queue's 55 s expiry is lazy (no timer: a sweep, an enqueue or the drain rejects it); the drain on unlock empties the queue synchronously, then runs `handleDiscovery` per request, in order, awaiting each window (`background.ts:368-392`, `discovery-queue.ts` `drain`).
- No framework-level lock gate exists on service RPCs (F3); a window URL is written only by the extension (F11).
- `auth.vue` is one form for password and passkey, takes no props, and advances only from `#/popup/auth` (F5); passkey works in a popup window on both browsers (F9).
- A cold locked boot can push `/popup/auth` over any route that is not established (F6); `isLogined` lags the worker's session (F7).
- The restart cleanup matches each tab's current `documentUrl` against `RESTART_ENDED_ROUTES` (`restart-ended-windows.ts:60-80`).
- `WindowPort.navigate` (`tabs.query` + `tabs.update`, no `tabs` permission) ran on both browsers until `e8fe932d4` removed it with its last caller.
- The SDK drops a closed tab's pending discoveries in `terminateForTab` and tells no one (F13); a navigation is not signalled at all (`tab-lifecycle.ts` header).
- The wallet-sdk sends one discovery per Connect call and does not retry on its own (F10).

**Inferences** (attack these):
- I1 `tabs.update` to the connect URL either follows the fragment in the same document or reloads it (the removed connect-to-check navigation kept its test state in `sessionStorage` "so a reload between the pages loses none"); both land on the connect route, the reload through a fresh boot on an open session. Phase 3's e2e proves it on both browsers.
- I2 The worker's drain reaches `interaction()` before or after the window's own activation ends, in either order; D6 makes both orders land on the connect window without passing the lock screen again.
- I3 Five tabs of dApps that discover on load would open five windows after a browser start; the playground and the reporter's flow discover only on a click (F10). Accepted by the owner's words above.

**Asks**: none open for this arc. The pin reminder is out of scope: [OWNER-ASKS.md](OWNER-ASKS.md) OA-1, which concerns no surface this arc touches.

## Architecture & Implementation

### Shape

Three parts, each in the module that already owns its concern:

1. **The worker opens and ends the unlock window.** `DappInteractionService`, owner of every dApp window, gains a small registry, `UnlockWindows` (one window per origin, a `WindowManager` handle each). `discovery-flow.ts` decides when a window is due: after it queues a locked discovery, when a profile exists, the queue still holds a request of the origin (no await between that check and the open) and the shared caps allow. The window's deadline is the latest 55 s cut-off among the origin's pending discoveries as the SDK holds them (D3), so it is refitted on each queued discovery and on each tab teardown, and the handle's own timeout closes it at that deadline.
2. **The window hands over.** After the unlock the drain runs today's flow. When that flow opens the origin's connect window or network notice, `interaction()` takes the origin's unlock window (`WindowManager.handOver`) and opens the new handle on it (`reuseWindowId`), which loads the new URL in its tab (`WindowPort.navigate`). When the flow ends without a window (a remembered site, the every-site switch, a refusal), the drain closes the unlock window. The page never navigates itself (D2).
3. **The page.** The lock screen's body moves from `pages/auth.vue` into an L4 module, `LockScreen.vue`, which `auth.vue` now renders (D5). `windows/unlock` renders the site band over `LockScreen` while locked and over a spinner once unlocked, and never leaves its route; the shell's three writers that send a locked page to `/popup/auth` (the cold-boot landing, the unreachable landing, the lock event's landing) leave a page that renders its own lock screen in place. So the URL stays `#/windows/unlock?origin=…` until the worker hands the window over, and the restart cleanup recognises it by that URL.

### Interfaces

```ts
// packages/wallet-core/src/ports/window-port.ts — restored from e8fe932d4^
navigate(windowId: number, url: string): Promise<void>
// window-manager.ts
type OpenAndAwaitOpts = { /* … */ reuseWindowId?: number } // navigate, not create; placement ignored
retime(handleId: string, timeoutMs: number): boolean       // false once settled
// dapp-interaction/unlock-windows.ts (worker)
class UnlockWindows {
  show(origin: string, deadline: number): void // open, or retime the open one
  close(origin: string): void                  // no-op once handed over
  take(origin: string): number | undefined     // hand the window id over, once
  origins(): readonly string[]
}
// dapp-interaction/unlock-window-url.ts (pure, both sides)
unlockWindowHash(origin: string): string                  // "#/windows/unlock?origin=<encoded>"
siteOfUnlockWindowHash(hash: string): string | undefined  // the origin, or undefined
// packages/wallet-bridge/src/discovery-queue.ts
holds(origin: string): boolean                            // a live queued request of the origin
```

`DappInteractionService` exposes `showUnlockWindow`, `closeUnlockWindow`, `unlockWindowOrigins` (worker-internal, not RPC methods). `discover()` and `notifyNetworkUnavailable()` keep their signatures; adoption keys on `payload.params.dappMetadata.url`, which `discoveryDappMetadata` sets to `discovery.origin`.

### Control flow (new site, unlock in the window)

1. Discovery, locked → `enqueue` (badge) → `getProfiles()` non-empty → `fitUnlockWindow(origin, mayOpen)` → `discoveryQueue.holds(origin)` and below the caps → `showUnlockWindow(origin, deadline)` → `openAndAwait({ url: unlock, 400×800, top-right, timeoutMs: deadline − now, kind: "unlock" })`.
2. The document boots on `#/windows/unlock?origin=…`, records that it is an unlock window, and renders the band over `LockScreen`.
3. Unlock → the worker emits `onActiveProfileChanged` (ports first, then its own listeners) → the drain empties the queue and runs `handleDiscovery` → `runDiscoveryPopup` → `discover()` → `interaction()` takes the window → `navigate(window, discover URL)`.
4. The document shows the connect route (same document or a reload, I1); `useDappApprovalWindow.start` asks the worker's session (D6) and runs `init`; the connect window renders once `isLogined` flips. If the hand-over comes after the document's own activation, the unlock page shows the band over a spinner meanwhile.
5. The drain closes the origin's unlock window after each processed discovery: a no-op after a hand-over.

### File-level change map

| File | Change | Phase |
|---|---|---|
| `packages/wallet-core/src/ports/window-port.ts`, `packages/wallet-core/src/testing/fake-browser-api.ts` (+ test) | `navigate` and the fake's `navigates` record, restored | 1 |
| `apps/extension/src/core/adapters/chrome-browser-api.ts` (+ test) | `navigate` via `tabs.query({ windowId })` + `tabs.update`; header note 4 restored | 1 |
| `EXT/wallet/services/window-manager/window-manager.ts` (+ test) | `reuseWindowId` (window id known at once, removals watched from then, navigate then focus, a failed navigate settles "Failed to open window."); `retime`; `timeoutLogLevel` (default `Warn`) | 1 |
| `EXT/wallet/services/window-manager/restart-ended-windows.ts` (+ test) | `unlock` in `RESTART_ENDED_ROUTES`; `trackOpenWindows` passes `navigate` through | 1 |
| `EXT/wallet/services/dapp-interaction/unlock-window-url.ts` (+ test), `unlock-windows.ts` (+ test) | new | 1 |
| `EXT/wallet/services/dapp-interaction/service.ts` (+ `service.test.ts`) | owns `UnlockWindows`; the three methods; `interaction()` adopts for `discover` and `network-unavailable` | 1 |
| `packages/wallet-bridge/src/discovery-queue.ts` (+ test) | `holds(origin)` | 1 |
| `EXT/wallet/services/wallet-sdk/discovery-flow.ts` (+ test) | locked branch opens; `fitUnlockWindow`, `latestPendingDeadline`; the cap count includes other origins' unlock windows | 1 |
| `EXT/wallet/services/wallet-sdk/background.ts` (+ new `background.unlock-window.test.ts`), `test-ports.ts`, `background.connect-window.test.ts` (port fake) | the drain closes after each discovery; tab teardown refits every open origin | 1 |
| `EXT/popup/pages/auth.vue` → `EXT/popup/components/modules/auth/LockScreen.vue` | `git mv`, body unchanged but its `<route>` block and the one relative CSS path (`shake.module.css`, which the move breaks); a new `auth.vue` holds that block and renders `<LockScreen />`; `auth.test.ts` keeps mounting the page | 2 |
| `EXT/utils/window-document.ts` (+ test) | the boot record also notes an unlock window (`isUnlockWindowDocument()`) | 2 |
| `EXT/popup/lock-landing.ts`, `EXT/popup/locked-state.ts` (+ tests), `EXT/popup/app.vue` | `ownsLockScreen` in both landing states (`settle` / `stay`); `land` keeps a `windows-unlock` route that has profiles to unlock; `app.vue` computes it (`route.name === "windows-unlock"`, or the boot record while the router has not resolved) | 2 |
| `EXT/popup/windows/unlock/index.vue` (+ `index.test.ts`) | new page | 2 |
| `EXT/composables/useDappApprovalWindow.ts` (+ test) | the lock-screen decision through `authRequiredGate` | 2 |
| `apps/extension/tests/e2e/fixtures/popups.ts` | `PopupKind` gains `unlock`; a read of a held page's window id | 3 |
| `apps/extension/tests/e2e/network/connect-locked-queue.test.ts`, `connect-locked-queue-sw-restart.test.ts` | rewritten and extended (Phase 3) | 3 |

`EXT` is `apps/extension/src`. No stored shape, permission, dependency, RPC method or glossary entry changes.

### Mechanics that are not obvious

- **Two sources, two questions.** Whether a window may open: the queue still holds a live request of the origin (`holds`), read synchronously right before `show`. The drain empties the queue in the tick of the unlock event, so a `getProfiles()` answer that lands after an unlock opens nothing, although the SDK's row stays pending behind the connect window. How long it lives: `latestPendingDeadline(handler, origin)` = max over `handler.getPendingDiscoveries()` of that origin, not expired, of `timestamp + DISCOVERY_STALE_MS`; the SDK's map holds every unanswered request, queued, mid-drain or behind a window, and a closed tab's rows are gone (F13). `fitUnlockWindow`: no deadline → close; a window open → `show` retimes; none open and `mayOpen` and `holds` and below the caps → `show` opens. Tab teardown refits with `mayOpen` false, so a window the person closed is never reopened by another tab's close.
- **The order in the locked branch.** `enqueue` stays the first act after `getActiveProfile()` answers, as today: an await before it would let an unlock drain an empty queue and strand the request. `getProfiles()` comes after it.
- **Hand-over.** Inside `interaction()`'s lock: `take(origin)` → `windowManager.handOver(unlockHandle, id => id)` (sync; drops the registry entry) → `openAndAwait({ …, reuseWindowId })`, which sets the handle's window id before watching removals, navigates, then focuses the window as a created one is focused (the drain may serve an origin whose window lies under another). A person's close between hand-over and navigate fails the navigate: the request ends as a closed connect window does today. No path logs the browser's error (it can quote the URL).
- **The caps.** An unlock window opens only when the origin's connect windows + its unlock window stay under 4 and all connect windows + all unlock windows under 32. In `checkDiscoveryPopupCaps` the open unlock windows of other origins count; the origin's own does not, since the connect window that follows replaces it one for one. At a cap the request stays queued, badge only.
- **Expiry is not a failure.** The unlock handle opens with `timeoutLogLevel: Debug`: a page can make it expire every 55 s, and `warn` reaches every user's log.
- **A restart** loses the queue (as today); the window still shows `#/windows/unlock`, so the next worker closes it by its route (`unlock` in `RESTART_ENDED_ROUTES`).
- **The shell's route writers.** Three paths push `/popup/auth` over a page: `decideLockLanding`'s `select-and-auth` at a cold locked boot, `decideUnreachableLanding`'s `auth` when the worker stays unreachable with a profile known (`settleUndecidedBoot`), and `createLockedState`'s `land` on a lock event (a re-lock while the window waits). Each leaves a page that owns its lock screen in place: `ownsLockScreen` is `route.name === "windows-unlock"`, or, before the router has resolved a cold boot's first route, the boot record. It keys on the current route, not the boot record alone, because the record survives the hand-over and a handed-over connect window must lock as today. The seal, the reselection and `LockScreen`'s own `settleProfile` still run; only the push is skipped.
- **`LockScreen` in the window.** Its `advancePastAuth` acts only from `#/popup/auth`, so in the window it never navigates; the unlock page swaps it for the spinner when `isLogined` flips, and back on a lock.
- **`useDappApprovalWindow.start`.** After the session check it calls `authRequiredGate(isLogined, isSessionChecked, managers.profile.getActiveProfile)`: only a locked worker sends the window to the lock screen. A window handed over in the activation lag runs `init` at once and renders when `isLogined` flips; a freshly booted document is unaffected, since it sets `isSessionChecked` with or after `isLogined`. A connect window mounted after the unlock event never receives it (F8: the worker broadcasts to ports before its own listeners start the drain), so its profile guard cannot misread it as a switch.

### Alternatives (the competing outline and the rest; the decision ledger records the calls)

- **Outline B, pre-opened connect window.** On a locked discovery, create the discover interaction at once (`discover()` with the queued request) and let its existing redirect show the lock screen; after the unlock, the flow claims that interaction for a new site or cancels it (remembered site, every-site, refusal, notice). No navigate, no new route, no registry. Against: the window shows Allow and "Allow every site" before the flow has read the profile, the session, the Terms or the chain, so a remembered site flashes a connect window and an unserved chain swaps one window for another; an approvable discovery record exists before the flow decided a person must answer, and claiming or cancelling it is a new coordination; per-pair interactions instead of one per origin.
- **Close and reopen.** The unlock window closes itself after the unlock; the connect window opens fresh at the same place. Against the owner's "in the same window".
- **`chrome.action.openPopup`** (the toolbar popup): Firefox refuses it for an unfocused window, and the popup's unlock lands on Home, not the connect window. Not L1.
- **The page pulls its next route** (an RPC or an event from the worker once the document is logged in): one more RPC and event pair for what a worker push already does.
- **Redirect to `/popup/auth` with the band in `auth.vue`** (the round-0 draft): the window's URL then reads `#/popup/auth`, so a restart leaves an orphan lock screen whose unlock spins forever; a URL marker on `/popup/auth` would not survive the shell's own pushes.

## Security & Adversarial Considerations

- **Attacker**: any secure top-level page, or a script on it, that sends discoveries at will, can navigate or close its tab (a navigation leaves its pending rows, F13), and sees focus changes on its own page. **Boundary**: the person's password and the wallet's windows.
- **Invariants, each with its test** (Phase 1 and 2): the window is an extension page in a popup window with the browser's own frame (`openAndAwait`, F11); the password goes from `LockScreen` to `ProfileService` as from the toolbar, never through the dApp; the band shows the serialized origin from the content script's sender (`discovery.origin`, top frame only, `isSecureDappOrigin`), never `appName` or other dApp text (unit: a discovery with a lookalike `appName` puts only the origin in the URL and on screen); the window grants nothing: after the unlock the request meets today's flow (connect window Allow, remembered-site check, Terms, chain), and closing it before refuses nothing (unit + e2e); the caps bound the windows (unit at the cap: queued, no window).
- **Reach, with numbers** (the owner's "If such web browser / application does that spamming... Then it's the website's fault"): at most one window per origin and 32 in all; a page that hops through 32 origins in one tab keeps 32 windows open, each taking focus, renewed by each new discovery until its 55 s cut-off; a closed window reopens on the page's next discovery; a browser start with several dApp tabs that discover on load opens one window each. An unlocked wallet already lets the same pages raise 32 connect windows, so the locked state gains no reach the unlocked one lacks.
- **Habituation.** A site can now make Nulo ask for a password: people may learn to type it whenever a window appears. The design accepts it on the owner's words: the window is the real extension window with the popup's own form, so there is nothing new to imitate, and a page could already open a look-alike `window.open` popup without L1. Other wallets prompt the same way: MetaMask opens its unlock screen when a dApp asks for accounts while locked (confidence: high).
- **A new signal.** Beyond the discovery's outcome, a page now sees its own `blur` when the window takes focus: a locked Nulo is detectable, as an unlocked one already was through the connect window. Presence only, no account or state; timing is evidence, not proof of a state.
- **Reopening condition** for the three items above, in the owner's words: users asking to change it.
- **Logging**: new lines at `debug`, with request ids through `describeExternalId`; never the origin, the window URL or a browser error (which can quote the URL); the unlock window's expiry logs at `debug`.
- **Least privilege, crypto, supply chain**: no permission (`tabs.query`/`tabs.update` need none; a queried tab only lacks its url), no cryptography, no dependency.

## UI impact

The sign-off for each line is the owner's decision quoted above ("I think we should go for L1. … I'd do L1, and change the behavior in case users ask to change it."); the window's exact look goes back to the owner through the captures (Phase 3).

- **New: the unlock window** (`windows/unlock`, 400 × 800, top-right like the connect window): a band that shows the site as the connect window does (`DappIdentityBlock` with the origin only: app glyph, origin in the hostname role, the existing homograph warning for an IDN or punycode host) over the popup's lock screen, unchanged. No new copy. Light and dark, Chrome and Firefox.
- **New: its waiting view** after the unlock: the same band over a spinner, no text. Usually under a second; when two sites wait, the second's window shows it until the drain reaches that site or its cut-off passes.
- **Changed: where the connect window and the network notice appear** after such an unlock: in the unlock window, brought to the front, not a new one. Their content is unchanged.
- **Unchanged**: the toolbar badge; the toolbar popup's lock screen (the same component, no band); a remembered site's check window, which opens as today once the unlock window closes.

## Implementation phases (one arc)

### Phase 1: the worker opens, hands over and ends the window

1. Restore `WindowPort.navigate` (port, Chrome adapter, fake, `trackOpenWindows`) from `e8fe932d4^`, with its adapter and fake tests.
2. Add `reuseWindowId`, `retime` and `timeoutLogLevel` to `WindowManager`.
3. Add `holds(origin)` to `DiscoveryQueue`.
4. Add `unlock-window-url.ts` and `UnlockWindows`; wire them into `DappInteractionService` and `interaction()`.
5. Wire `discovery-flow.ts` and `background.ts`; add `unlock` to `RESTART_ENDED_ROUTES`.

Tests (one per behaviour; each never-happens assertion with its success control): `window-manager.test.ts`: reuse navigates, focuses and creates nothing; the reused window's close rejects as a person's close; a failed navigate settles as a failed open and logs no error text; `retime` moves the timeout (fires at the new time, not the old); a `Debug` level logs the timeout at debug. `discovery-queue.test.ts`: `holds` is true for a live queued request of the origin, false after the drain starts and for an expired one. `unlock-windows.test.ts`: a second `show` for the origin retimes and creates nothing; `take` hands the id over once; a person's close drops the entry and touches no request; the timeout closes the window. `unlock-window-url.test.ts`: round trip, and `undefined` for another route, a missing or unparseable origin. `service.test.ts`: a `discover` and a notice for the origin open on its unlock window (`navigates`, no `creates`); another origin's creates a window. `discovery-flow.test.ts` / `background.unlock-window.test.ts`: locked with a profile opens one window at the discovery's deadline; a second discovery from the origin opens none and retimes; no profile opens none (control: with a profile one opens); a `getProfiles()` answer held until after an unlock opens none (control: answered while locked, one opens); at the caps none opens and the request stays queued; with 32 unlock windows open, the drain's first new site still opens its connect window on its own unlock window, and a 33rd origin's is refused; the drain's new-site path hands the window over (no second window); a remembered site's drain closes it; a tab teardown closes it when no pending row of the origin is left and keeps it while another tab's row lives; a lookalike `appName` never reaches the window URL.

**Validation gate.** Commands, in order: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run --cwd packages/wallet-core test`; `cd apps/extension && bun run test -- --reporter=verbose src/wallet/services/window-manager src/wallet/services/dapp-interaction src/wallet/services/wallet-sdk src/core/adapters`. Pass: every command exits 0 and the verbose output lists each new test above as passed. Layers: lint, typecheck, unit, composition.

### Phase 2: the page

1. `git mv` the lock screen's body into `popup/components/modules/auth/LockScreen.vue` (leaving its `<route>` block in a new `pages/auth.vue` that renders it); repoint its one relative `composes` path. Run the auth tests and a build before any other change: they must pass unchanged.
2. Extend `utils/window-document.ts` with `isUnlockWindowDocument()`; add `ownsLockScreen` to `lock-landing.ts`'s two states and the `windows-unlock` keep to `locked-state.ts`'s `land`; compute it in `app.vue`.
3. Add `popup/windows/unlock/index.vue`: the band (`data-testid="unlock-site"`, hostname `unlock-site-hostname`) over `LockScreen` while `!isLogined`, over a `Spinner` in a container with `aria-busy="true"` (`unlock-waiting`) once logged in. The origin comes from the route's query through `siteOfUnlockWindowHash`; no other source.
4. In `useDappApprovalWindow.start`, replace the `isLogined` test with `authRequiredGate`.

Tests: `auth.test.ts` unchanged and green after the move; `window-document.test.ts` (an unlock route is recorded, another window route is not); `lock-landing.test.ts` (`ownsLockScreen` gives `settle` at a cold boot with a candidate and `stay` when unreachable with a profile; controls: without it, `select-and-auth` and `auth`); `locked-state.test.ts` (a lock event on `windows-unlock` seals and reselects but pushes nothing; controls: on `windows-discover` it pushes `/popup/auth`, and on `windows-unlock` with zero profiles it pushes `/popup/register`); `windows/unlock/index.test.ts` (locked: band with the exact origin text and the lock screen, no navigation; a punycode host shows the homograph warning; logged in: band and spinner, no lock screen; a lock while mounted brings the lock screen back); `useDappApprovalWindow.test.ts` (session open with `isLogined` false: `init` runs, no redirect; locked: redirect, the existing case).

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun run test -- --reporter=verbose src/utils src/popup src/composables src/components type-role-ban copy-dash-ban red-text-ban`; `bun run --cwd apps/extension build:chrome` (vitest skips CSS modules; the build resolves the moved `composes`). Pass: every command exits 0, the new tests pass, the three bans pass with no new reviewed-list entry. Layers: lint, typecheck, unit, component, build.

### Phase 3: e2e, captures, the arc's gates

1. `PopupKind` gains `unlock` (the URL stays `#/windows/unlock` while locked, so `waitForPopup` finds it); a helper reads a held page's window id (`chrome.windows.getCurrent()` in the page).
2. `connect-locked-queue.test.ts`, password: lock, Connect on the playground → `waitForPopup(ctx, "unlock")`; one window was created (`recordCreatedWindows`); its band reads the playground's origin (whole `textContent`); type the password in it → poll the held page's `location.hash` for `#/windows/discover` (same document or reload, I1); its window id is unchanged and no other window was created; then today's approve, check and serve steps. Passkey: lock, Connect → the unlock window opens with the passkey form (capture) → close it → the badge still reads `1` → unlock from the anchor popup → the connect window opens in a new window → today's steps. The file's header is rewritten for the new behaviour.
3. `connect-locked-queue-sw-restart.test.ts`: after the Connect, the unlock window is open. Where `stopsBackgroundUnderOpenPage` holds (Chrome), it stays open across `stopBackground` and is gone once the next worker boots; where it does not (Firefox), the spec closes it before the stop, as it closes every page today. The rest unchanged.
4. Captures with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/locked-discovery-1/shots`: `ld1-unlock-window` (Chrome, light and dark), `ld1-unlock-window-firefox`, `ld1-unlock-passkey`, `ld1-after-unlock`, plus `ld1-unlock-waiting` if a frame catches it; `ld1-today-badge` is not capturable (browser frame). `captions.json` with `<id>-light`/`<id>-dark` keys and measured heights.

**E2E budget.** No scenario is added: the two locked-connect tests change shape because the behaviour they pin inverts, and the restart spec gains one assertion. Failure modes only a real browser shows: the worker's window opening on a locked discovery, `tabs.update` keeping one window from lock screen to connect window (I1), a person's close leaving the request queued, the restart closing the window by its URL. Estimate: +5 s Chrome, +8 s Firefox per file; measured values and each browser's CI envelope before and after go in the PR body.

**Validation gate** (the lane's gate list, at retry 0, in order, never two at once):
1. `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `cd apps/extension && bun run test -- src/wallet src/core src/utils src/popup src/composables src/components type-role-ban copy-dash-ban red-text-ban`; `bun run test:all`; `bun run check:plans` after staging.
2. Smoke, on the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox` before the Firefox run), from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1`: `bun run test:e2e -- tests/e2e/auth-flows.test.ts tests/e2e/wallet-lock.test.ts tests/e2e/passkey-paths.test.ts tests/e2e/legal-acceptance.test.ts tests/e2e/tooltips-glossary.test.ts --retry=0` (the lock screen's readers), then the same with `NULO_E2E_BROWSER=firefox`.
3. Network, one run per browser, from the root: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-locked-queue.test.ts tests/e2e/network/connect-locked-queue-sw-restart.test.ts tests/e2e/network/connect-every-site.test.ts tests/e2e/network/connect-check-window.test.ts tests/e2e/network/connect-deny.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`, with `NULO_E2E_SHOT_DIR` set for the captures.

Pass: every command exits 0; every listed spec ran and passed at retry 0 on both browsers; counts per browser recorded in `STATUS.md`. Layers: all.

## Delivery

Single arc, so no stack: branch `locked-discovery-1-a1` off `origin/dev` carrying the plan commit; `gh pr create` after the review loop converges, ready, no label at creation (add `e2e:extension-network` only if the path filter skips the network lane). Title (85 chars): `feat(wallet-sdk): a locked discovery opens an unlock window that continues to connect`. Body: what changed and why, the owner's decision quoted as the sign-off, the `UI impact` lines, the accessibility calls (D13) as made under the owner's 2026-10-19 delegation, the tests, the e2e counts and runtimes per browser, the captures' paths, the known limits, the Codex verdicts, `Closes #1849`. The close-out lands as the PR's final commits. The PR changes what users see: stop after its checks; never merge.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A `windows/unlock` route that the worker hands over to the request's next window | outline B; close and reopen; `openPopup` | B shows Allow before the flow decided and keeps an approvable record early; the other two break "the same window" or are not L1. Codex and Opus agree |
| D2 | The worker pushes the hand-over (`WindowPort.navigate`) and focuses the window; the page never routes itself onward | page pulls via RPC or event | the connect-window precedent ("establishment pushes the route change, with no polling"); focus because the drain may serve a window under another (Opus r1 #3) |
| D3 | Opening needs the queue to hold the origin; the deadline comes from the SDK's pending rows | one source for both | the SDK row outlives the queue entry behind the connect window (Codex r1 #1, Opus r1 #2); the queue empties into the drain and knows no tab closes |
| D4 | One window per origin, sharing the connect caps, the origin's own window credited to its hand-over | one window for all sites; counting it | the brief's terms; counting it refuses its own replacement (Codex r1 #2, Opus r1 #4) |
| D5 | The lock screen's body becomes `LockScreen` (L4); the window renders it and keeps its URL; the shell's three `/popup/auth` writers leave a `windows-unlock` page in place (`ownsLockScreen`, the current route first) | redirect to `/popup/auth` with the band in `auth.vue`; a URL marker on `/popup/auth`; a close-on-reconnect rule; keying on the boot record alone | the redirect breaks the restart cleanup (Codex r1 #3, Opus r1 #1); a marker does not survive the shell's pushes; the lock event and the unreachable landing also push (Codex final #1); the boot record survives the hand-over |
| D6 | `useDappApprovalWindow.start` asks `authRequiredGate` | a wait inside the unlock page; accept a bounce | the router's own principle (F7); fixes the cause for every dApp window |
| D7 | The band is `DappIdentityBlock` with the origin only | "wants to connect" with no chain | the brief: "its origin, as the connect window shows it"; no new copy |
| D8 | The waiting view: band and spinner, no text | `LoadingState` | `LoadingState` needs a label: new copy |
| D9 | The scenario lives in `connect-locked-queue` (network) | a new smoke spec | smoke has no dApp page (F12); the network spec already drives this flow |
| D10 | The worker checks `getProfiles()` after the enqueue | before it | an await before `enqueue` can strand the request behind a drained queue |
| D11 | A remembered site's unlock window closes when the drain approves; the check opens as today | hand the check window over too | the check opens after the key exchange, from another module; "continues into the connect window" names the new-site path |
| D12 | A lock during the drain leaves the requeued requests on the badge | refit after a requeue | needs an unlock then a lock within seconds; badge-only is today's behaviour |
| D13 | Accessibility (owner's 2026-10-19 delegation): the band is not focusable; the waiting view is `aria-busy`; focus as `LockScreen` places it | a live-region text | no copy; the form's Tab order is unchanged |
| D14 | `timeoutLogLevel` on `openAndAwait`, `Debug` for the unlock window | the manager's fixed `warn`; the registry's own timer | a page can make the expiry recur every 55 s (Opus r1 #10); a second timer duplicates the handle's |
| D15 | Known limits, filed at close-out as closed `known-limit` issues: KL-1 a dApp page that navigates away leaves its window until the cut-off (no signal without `tabs`, Codex r1 #5); KL-2 a flow started from the window's lock screen (New profile, Import, Forgot password) can be cut by the cut-off or the hand-over (Opus r1 #5) | read the tab URL before each act; document liveness; hide the exits | KL-1 needs the `tabs` permission (owner-gated); KL-2's fix is a new check on three paths for a flow few start from a dApp window, and hiding exits changes the screen |
| D16 | Implementation: `UnlockWindows` exposes `retime` and `open`, not one `show`; the service exposes the registry as a field, not RPC | one `show`; three delegating methods | a tab teardown must never open, so the flow needs to tell a retime from an open ([lessons/phase-1.md](lessons/phase-1.md)) |
| D17 | Implementation: D6's worker read goes through a `getActiveProfile` option, asked only while the shell's flag is false | `managers.profile`; always awaiting the gate | composables receive their client from the parent; an await on the signed-in path moved `init` off the tick two tests pin ([lessons/phase-2.md](lessons/phase-2.md)) |
| D18 | Phase 3's network gate adds `cold-wake-discovery` and `lock-restart-reconnect`; Firefox captures are not taken | the five listed specs only | both drive a locked discovery; Firefox 157+ refuses `captureScreenshot` on extension pages (FIREFOX.md, #1329) ([lessons/phase-3.md](lessons/phase-3.md)) |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high): `reject (with blocking findings: late-open race, cap self-counting, restart cleanup and Firefox test gaps)`. Opus (Plan agent): `conditional approve` (restart orphan and its e2e, the late open, focus on hand-over; reach numbers to the owner or known limits). Every finding verified against the tree ([lessons/phase-0.md](lessons/phase-0.md)). Accepted: the late open (D3), the cap credit (D4), the restart orphan (D5, by keeping the URL rather than a marker or a reconnect rule), Firefox's `stopsBackgroundUnderOpenPage` (Phase 3 step 3), executable gates (retry 0, the armed smoke build, concrete directories, verbose reporter), focus on hand-over (D2), the expiry's log level (D14), `window-document.ts` reuse (recon miss), the lazy queue expiry and the RPC-gate wording (Facts), the focus signal as a new observable (Security), the reach numbers (Security; covered by the owner's words, not a new ask), I1 reworded to accept a reload. Known limits: D15. Rejected: none.

**Final fresh pass.** Codex (gpt-6.1-sol, high, new session): `conditional approve (with conditions: preserve the unlock route through shell lock/recovery routing and test those paths)`. Verified: #1 (medium, demonstrated) `createLockedState.land` (`locked-state.ts:54`) and `settleUndecidedBoot` (`app.vue:450`) push `/popup/auth` over any page, so a re-lock while the window waits, or an unreachable boot, would still erase the URL: accepted, D5 now covers all three writers with tests. #2 (low, demonstrated) the move breaks `auth.vue`'s relative `composes` path (`:567`): accepted, Phase 2 step 1 and a build in Phase 2's gate. Rejected: none. Re-check (same session, after the revision): `approve`; it asked only that the zero-profile case join the tests, which it now does. No new defect.

**Arc 1 review, round 1** (over `42a52832c..b0d3dc8ba`). Codex (gpt-6.1-sol, high): `conditional approve (with conditions: fix the stale drain cleanup and add its regression test)`. Opus (`general-purpose`): `conditional approve (with conditions: finding 1's fix also covers the retimed-window case)`. Both found that a drain ending after a re-lock closed the unlock window a fresh discovery of the site waited in; Opus showed the retimed-window case a captured handle misses. Fixed at `d04664dbc`: the drain closes only when the queue no longer holds the site; regression test, mutation-checked both ways. Accepted too: the restart spec's Firefox-vacuous wait, every comment finding. Not changed: the notice's new window after a mid-await tab close (cosmetic); the in-window passkey unlock, untested end to end and listed in the PR ([lessons/phase-3.md](lessons/phase-3.md)).

**Arc 1 review, rounds 2 and 3** (Codex resumed). Round 2, over `d04664dbc`: `conditional approve (with conditions: protect the window after a second unlock starts another drain)`: a second unlock's drain empties the queue before it takes the window, so the round 1 guard let an older drain close it. Fixed at `1f6ddf00f`: the drain ends with the teardown's refit over the SDK's live rows (`fitUnlockWindow(origin, false, …)`); the regression extends to the second unlock; mutation-checked three ways. Round 3, over `1f6ddf00f`: `approve`, no findings.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard read at `eb42af540`. Plan-specific values:

- `code_review: off`: step 1 is absent.
- Review: after Phase 3's gate, ONE Codex pass over the arc's net diff (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`), with this plan, the ledger, the adversarial ask and the two verbatim rules of § Post-implementation standard step 2; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) alongside. A second Codex round only on a material finding; hard stop at three rounds, then report. Rounds go under Audit verdicts and in `lessons/phase-3.md`.
- Then the arc's gates once more on the final head, push, the PR (Delivery), `gh pr checks <n> --watch` once; a known flake one rerun, real breakage a fix and a resumed round.
- Close-out as the PR's final commits, per the standard's step 4: merge `origin/dev` first and read `index.md` and `lessons.md`; the Outcome block; lessons promoted only if generalizable (8 KiB budget); KL-1 and KL-2 as closed `known-limit` issues; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- Teardown after the merge: the orchestrator's call in this program; the standard's step 5 applies once `archive/locked-discovery-1/plan.md` is on `dev`.

## Seeds

`/goal` (recommended): All three phases of implementations-plan/locked-discovery-1/plan.md are ✓, each backed by its validation gate reported passing in the transcript; the Codex pass over the arc's diff reports no new material finding (quoted); PR "feat(wallet-sdk): a locked discovery opens an unlock window that continues to connect" exists, ready, with `Closes #1849` and the captures listed; its final commits carry the close-out (`git show --stat` of the archive move); `bun run test:all` and `bun run lint` exit 0.

`/loop 15m` (fallback): Drive implementations-plan/locked-discovery-1 forward from plan.md (not the chat): run the next unticked phase, its gate, tick it, log `lessons/phase-N.md`; at the end run the Post-implementation section; decide open questions with Codex, never wait; never merge.
