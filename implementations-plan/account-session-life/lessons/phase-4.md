# Arc 4: lessons

## Plan revision (2026-10-14)

- Base: `origin/dev` at `15881c7d` (arcs 1 to 3 merged as #253, #266, #422), branch `account-session-life-arc-4` (D-orch-9). Read: page 7's records on #157, #100, #99, #159, #137, #208, #24; #421; the shots report for #157 and the mock branch `shot/157-C` (`4230d900` mock Ready, `a4c7f456` the bar).
- Recon: two Sonnet explorers (the page 7 pick sites; the e2e restart harness and the mock), plus the planner's own reading of the transport, the worker's boot and the popup shell.

### Where the first plan's § Arc 4 and the tree disagreed (the tree wins)

1. **"The reconnect boot runs on Ready."** The first `onConnected` fires inside `connect()` before `app.vue` mounts (`popup/index.ts:28`, `utils/core.ts:70-73`), so the watch at `app.vue:425-433` sees only reconnects. Under Ready, the first Ready arrives after mount and would start a reconnect run that supersedes the mount-time one. And a service that never says Ready would start no run at all (shots finding 2), so neither a fresh popup nor one open across a restart would get the banner. Revised: a run starts at mount and on `onDisconnected` (a drop of a Ready port); its reads wait for Ready inside their own 60 s deadline.
2. **"The unlock screen while it is still deciding."** True only for a popup open across a restart. The first navigation awaits the guard's `getProfiles` when no profile is selected (`route-guard.ts:47-56`), and `onBeforeMount` awaits `router.isReady()` before `loadProfile` (`app.vue:350-369`), so a fresh popup is empty until the service answers (shots finding 1). Revised: a 200 ms grace, then a provisional route with no service read.
3. **`onBeforeMount` reads the settings before `loadProfile`.** Under Ready that read waits up to 60 s, which would put the never-starts banner at about 120 s. Revised: both start together; the theme is painted before first paint.
4. **"The loader keeps today's timing under C."** Under Ready the flag is false at every start, so the loader would show on every cold start, which C excludes. It is visible today only when `chrome.runtime.connect` throws (F24). Revised: deleted, with I5 to check that no person reaches that case.
5. **I3** (a port opened during a cold wake meets no listener) is demonstrated by #421: about 140 reconnects a second, each starting a boot run that supersedes the last.
6. **Ready from `ensureInitialized()`.** It polls every 500 ms (`core/initialization.ts:13-21`), which would add up to half a second to every cold start. Revised: a started promise resolved by `start()`.
7. **The send boundary.** A loop over `ensureTransportReady()` would never exit on the offscreen transport, which returns a promise on every call (`offscreen/client.ts:141-148`), so the hook stays.
8. **The first plan's restart e2e** proved the absence of "Unchecked runtime.lastError" entries, which arc 2 already fixed. Revised: a held-boot case using the fixture migration's hold (`src/e2e/migration-fixture.ts:28,56`), which parks the boot before `registerServices`.
9. **#99, #100, #159** closed with arc 1's merge, so arc 5's PR refers to them. #169 (G1) merged, so the one-lane host rule is gone.

### Decisions the revision made (panel below)

- Arc 4 holds #157 (Ready, the bar), #421 and P7-09; arc 5 holds P7-05 to P7-07. Arc 4 is a full PR; arc 5 shares one file with it, where arc 4 only rewrites a comment.
- P7-05: hand off on a timeout or a bootstrap failure; superseded and tail failures keep arc 1's behaviour (OA-8); no lock of the new session; the named limit is 60 s.
- P7-07: confirm the kept credential unless it failed for no PRF; keep `unconfirmed` so the window's words stay.
- OA-7: until the profile is known, hide the type-dependent half of the unlock screen in place.

### Panel, round 1 (2026-10-14, over the revised sections)

- **Codex** `gpt-6.1-sol` high, session `01a13c0a-a873-7363-b58e-9f87a161f69a`, read-only: `reject`, 10 findings. Transcript: `audit-rev4-codex-r1.md` (gitignored).
- **Opus 5.5 Plan agent**: `conditional approve`, 14 findings (O-R1 to O-R14). Transcript: `audit-rev4-opus-r1.md` (gitignored).
- Every finding was checked at the tree before its disposition (plan § Audit verdicts). What changed in the design:
  - Items 6 and 7 above changed again. Ready now means the whole collection started (`collectionStarted()` after the last phase), because a per-service Ready let a queued unlock reach Profile before the integrity coordinator installed its delegate, and `openSessionVerified` skips the check without one (`profile/service.ts:1344-1353`). The coordinator's re-derivation is already outside `start()`, so the cost is storage reads (I8, measured in 4.1).
  - The send boundary hook is gone: between Ready and a continuation only microtasks run, so the "wait" branch was unreachable outside a fake. A deadline check before the post replaces it, closing Codex's delayed-continuation path (`base-client.ts:125,165`).
  - The provisional route is now replayed through the guard on Ready, because the boot run alone left an empty wallet on auth and selected nothing in an own window or after a drop (`lock-landing.ts:45`, `app.vue:300`).
  - One grace per page load (the redirect chain spent 200 ms per hop); a flat 250 ms retry (doubling to 2 s added up to 1.5 s); the hand-off fenced on the shell's profile and `isLogined`; the page's own client for P7-09, so the backup rollback keeps 60 s.
  - New asks on OA-7 (option C, 0 ms, the empty wallet's swap) and OA-8 (the 60 s value, reopening goes straight in). Opus's condition: hold arc 4's merge until OA-7 is signed.

### Panel, round 2 (Codex, resumed)

- `reject`: 7 of 10 FIXED; R2-1 (a read that fails after Ready is never replayed), R2-4 (an abandoned hand-off released the latch) and a new High (the replay's unconditional assignment after its awaits overwrote the boot run's selection, reproduced by Codex at `route-guard.ts:47-52`). All three hold at the tree and are fixed in the plan. Transcript: `audit-rev4-codex-r2.md` (gitignored).
- Found while checking R2-4: the "profile selected at Create" allowance admitted a locked profile another window unlocks during the wait, whose bootstrap the hand-off would then supersede. The fence now also requires no current bootstrap of another profile in flight.

### Panel, round 3 (Codex, resumed; the audit loop's last round)

- `conditional approve`: the three round 2 items FIXED. Its condition held at the tree: `inFlightBootstraps` clears when the core settles, before `bootstrapActiveProfile`'s final session read and `isLogined` commit, so the fence's predicate now spans each activation call to settlement. Transcript: `audit-rev4-codex-r3.md` (gitignored).

## Phase 4.1: base evidence (2026-10-14, at `ae921510`)

A throwaway build counted each popup port's opens and closes (`background/client.ts`) and stamped each service's `start()` and the end of `services.start()` (`base-service.ts`, `runtime.ts`); a throwaway spec drove it on both browsers. Neither was committed.

- **I4 holds.** A worker held before its listeners (the fixture hold, below) refuses every port at once on both browsers, through `runtime.lastError` on Chrome and `port.error` on Firefox. One locked popup opens 9 ports over 7 services (`config` and `incoming-transfer` twice). Each reopens about 170 times a second on Chrome and 96 on Firefox, so about 1,500 and 860 connects a second per popup. One retry spacing covers both.
- **I5 holds.** `chrome.runtime.reload()` closed every extension page on both browsers: two popup tabs, an onboarding tab and an own window, plus the side panel on Chrome. Only the worker target remained. Firefox's toolbar panel was not measured; nothing in the evidence suggests it outlives its add-on.
- **I6 holds.** With the schema marker rewound to 1 and the hold set before `stopBackground`, the successor ran the fixture migration on both browsers: the journal's running key appeared and the popup showed the Updating barrier at `#/`. Phase 4.4 needs no browser relaunch.
- **I7 holds, no fix.** Of the 21 `onConnected` subscribers, five skip the first call by counting (`useConfigRead`, `useIncomingSyncHealth`, `useTokenBalanceSnapshot`, `useSeedStatus`, `SelectTokenPopup`), so the first Ready reaching them changes nothing. The rest repeat a read that replaces state. `useArrivals.startRead` overlaps the mount's read under its generation guard, which already handles the `onQuotesUpdated` read every page start triggers. `tryReplayForTriple` replays once per triple (`replayedForKey`). Six reads have no ordering guard (`usePrices`, `holdings.vue` `readConfig`, `activity.vue`, `TokensView.vue` `fetchTokenImports`, the journal detail, `operation-journal/client.ts` `emitSnapshot`); the first Ready adds one more overlapping read of the kind every reconnect already makes, with no write in between at page start.
- **I8 holds.** From Profile's `start()` to the end of `services.start()`: 3 to 6 ms on Chrome (four boots), 5 to 63 ms on Firefox (five boots). The last service finishes 0 to 1 ms before the end. One Ready after the whole collection costs under 70 ms against a per-service Ready.
- Also measured: from the hold's release to the end of `services.start()`, 393 ms on Chrome and 836 ms on Firefox. A cold start from a page open: 1.4 to 2.3 s on Chrome, 2.8 to 4.6 s on Firefox.

## Phase 4.4: the held-boot e2e (2026-10-14)

- The case: `sw-resilience.test.ts` › "a popup opened while the background starts…". Estimate 20 s Chrome, 30 s Firefox. Measured: 9.2 s Chrome and 11.4 s Firefox alone (cold fixture), 3.4 s and 7.9 s inside the file run.
- Release of the hold to `data-service-ready` on the page: 550 to 556 ms on Chrome, 708 to 844 ms on Firefox. Against phase 4.1's release to the end of `services.start()` (393 ms, 836 ms), the refused-port spacing adds about 160 ms on Chrome and nothing measurable on Firefox, inside the 250 ms the plan allows.
- Red on base: with the base source and base fixtures (one throwaway import stub), the case fails at `waitForHash("#/popup/auth")` after 10 s, the hash never leaving empty. A first attempt with the HEAD fixtures failed earlier, inside `openPopup`, because the base shell has no `data-service-ready`; that is not the proof, so it was rerun.
- File runs, retry 0: Chrome 10/10 in 64 s, Firefox 5/5 (5 Chrome-only skips) in 67 s.
- Screenshots (`screenshots/arc4-*`, Chrome, both themes) were taken under two throwaway holds that were never committed: one between the listeners and `collectionStarted()`, one at the head of `deleteProfile`. At 360 px the 2 px bar disappears when an image viewer downscales the page; the pixels show it on rows 0 and 1 (the accent in light, cream in dark), so the `arc4-start-bar-edge-*` files are 3× crops of the top 20 px.
