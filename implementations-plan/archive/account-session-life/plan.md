---
plan: account-session-life
tier: mid
status: completed; arcs 1 to 5 merged (#253, #266, #422, #445, #453); phase 3.4, the cross-arc fixes and this close-out in the close-out PR
issues: "#99, #100, #159, #198, #158 (arc 1); #157 part (arc 2); #24, #137, #208 reveal (arc 3); #157, #421 (arc 4); #99, #100, #159, #137 page 7 picks (arc 5); #208 autocomplete (3.4, close-out PR)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet), plus 2 for the arc 4 revision; dual audit (Codex gpt-6.1-sol high + one Opus Plan agent) per revision; resumed rounds verify
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-15. Planned 2026-10-10; arcs merged on 2026-10-10 (1, 2), 2026-10-14 (3) and 2026-10-15 (4, 5).
- **Status:** delivered in five PRs against `dev`, [#253](https://github.com/nulo-sh/nulo/pull/253), [#266](https://github.com/nulo-sh/nulo/pull/266), [#422](https://github.com/nulo-sh/nulo/pull/422), [#445](https://github.com/nulo-sh/nulo/pull/445) and [#453](https://github.com/nulo-sh/nulo/pull/453), then the close-out PR from `account-session-life-closeout` (phase 3.4, the final cross-arc pass's fixes, this close-out). Merging it closes the plan.
- **Shipped:**
  - Arc 1 (#99, #100, #159, #198, #158): one critical section per account address; a bounded, identity-checked profile activation; the passkey retry confirms its saved credential; account RPC params refused as `INVALID_PARAMS`; ConfirmPopup's dead branch deleted.
  - Arc 2 (part of #157): the port client reads `lastError`, an untrusted port is closed, `deleteProfile` waits for its delegate inside one 30 s budget, the PXE fence keeps every dead generation.
  - Arc 3 (#24 not planned under P7-01, #137, #208's reveal): the unlock failure toast; on Change password, the current password's own eye beside the new pair's shared one.
  - Arc 4 (#157, #421): Ready after the whole service collection started, the 250 ms pre-Ready retry and the send check; the unlock frame with the start bar (P7-08b = C) and the provisional route replayed at Ready; GlobalLoader removed; Delete Profile's own 30.5-minute client (P7-09).
  - Arc 5 (P7-05 to P7-07, P7-10, P7-12): Create account skips an occupied address; a new profile that does not open says so and hands off; the passkey window starts over after no PRF; Continue closes the unlock screen's own failure toast.
  - Close-out PR (#208): `autocomplete` on the backup decrypt field and the full export's encrypt pair (P7-04). From the final cross-arc pass: the unlock screen's last-active lookup leaves a profile opened meanwhile, and a page reached during the start-up stays where the person took it.
  - `lessons.md`: the popup port's Ready joins the popup-call entry, merged with the dropped-port entry to stay within the budget.
- **Dropped, rejected, superseded:**
  - #24's strict-mode recovery bearer: not planned (P7-01). OA-1 to OA-3's and OA-6 to OA-8's "what ships now" forms: superseded by page 7 and its re-signing.
  - P7-05's slow-start second line ("The wallet is taking long to start."), offered in chat: no answer, so the recorded words ship.
  - Every other alternative a decision rejected is in § Trade-offs and § Decision ledger.
- **Known limits:** #458 (P7-09 across two chains), #459 (O-R14, a service that never starts), #460 (O-R14, a crash loop after Ready), #461 (O-R11), #462 (a hydrate-only activation), #463 (account reads and edits without a session).
- **Open items:** #464 (`confirmProfileOperation` without a caller), #465 (the account-file password's autocomplete), #466 (OA-9, `owner-decision`).
- **Seeds retired:** the `/goal` and `/loop` drafts are retired and removed; this plan is a record, not a task list.

# Account, profile and session lifecycle: races, retry, the port handshake, unlock and credentials

Nine issues and page 7's picks on how accounts, profiles and sessions start, wait and end, in five arcs and a close-out. Size: the orchestrator set this five-arc plan a 600-line target; shipped arcs keep their evidence in short form, and the Outcome and the cross-arc verdicts take it about 20 lines over.

- **Arcs 1 to 3 (merged).** Arc 1 (#253): one critical section per account address (#99), a bounded, identity-checked profile activation (#100), the passkey retry confirms its saved credential (#159), account RPC params (#198), ConfirmPopup's dead branch (#158). Arc 2 (#266): the half of #157 no person sees. Arc 3 (#422): #24 closed as not planned (P7-01), the unlock toast (#137, P7-02), the split reveal (#208, P7-03).
- **Arc 4.** The Ready handshake (#157, P7-08 = C): a popup call waits until the service says it has started. The start-up moment as P7-08b = C draws it: the unlock screen, and a 2 px bar along the top edge until Ready. The boot check stops depending on a connection, so a service that never starts ends in the banner and the reconnect storm stops (#421). Delete Profile gets the time its page promises (P7-09).
- **Arc 5.** Page 7's picks for arc 1's surfaces: Create account skips an imported account's address (P7-06, #99); a new profile that does not open says so and goes to the unlock screen, or to the open profile's home when another profile took over (P7-05, P7-12, #100); the passkey window starts over after an authenticator with no PRF (P7-07, #159); Continue closes the last unlock failure's toast (P7-10, #137).
- **Phase 3.4** (#208's autocomplete, P7-04) waited on backup-import-export arc 3 (#454), which rewrote both files first; it ships in the close-out PR.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md) (first plan), [lessons/phase-4.md](lessons/phase-4.md) (this revision).

## Scope

**In:** the nine issues, #421, and page 7's records P7-01 to P7-09 with every surface they name.

**Out:**
- A strict-mode recovery bearer (#24, closed under P7-01).
- `confirmProfileOperation` and the recovery coordinator's `confirm`, which lost their popup caller in arc 1; session checks on account reads and metadata edits (`getAccounts`, `getAccount`, `changeAccountName`, `changeAccountVisibility`). Filed at the close-out: #464, and #463 as a known limit.
- Fee-map cleanup on profile deletion (#91, fees-and-sponsors arc 2): arc 2's R4 seam stands.
- `restore()`'s account writes (backup-import-export owns them).
- OA-9 (which toasts Continue closes on the unlock screen): ships its "what ships now" form. OA-6 to OA-8 were signed on page 7's re-signing.
- The onboarding tab's start-up: page 7 names the popup. Onboarding keeps its page while its calls wait, with no bar.
- The `--scrim-loader` token in `@nulo/design`: its contract belongs to that package, though arc 4 deletes its only reader.

## Regrouping against the lane map

- **#198 and #158 moved into arc 1**: page 7 governs neither, and #198 edits the files #99 edits.
- **#157 split into arc 2 (no screen) and arc 4 (owner decision)**: `isBackgroundConnected` drives the start-up loader and the reconnect boot (`apps/extension/src/utils/core.ts:62-73`, `popup/app.vue:425-433`), so Ready changes what a person sees.
- **Arc 5 is new**: P7-05 to P7-07 reverse what arc 1 shipped as "what ships now". P7-09 is #157's and #421 was filed for arc 4, so both ride arc 4.

## Outcome & Quality Bar

**For whom.** A person using the wallet popup: creating a profile or an account, importing one, opening the popup while the background service starts, unlocking after the browser restarted it, deleting a profile behind a proof; and the maintainer who later reads a lock, a fence or the port state machine and must see why it is safe.

**What excellent looks like.**
1. A race between two of the person's own actions ends in one of the outcomes the actions would have had one after the other, never a mixed state. Each race has a never-happens test with its success control.
2. A retry creates a second secret only where a record says so: one passkey per created profile, except a new one after an authenticator with no PRF (P7-07); an imported key row only behind its imported account row.
3. Nothing a person sees changes except what a recorded decision names, quoted in § UI impact.
4. A call made while the service starts or restarts is answered or refused exactly as a fresh call made just after the start would be, and is posted at most once. A service that never starts ends in the banner within about a minute, whatever its ports do.

**What good enough looks like.** No new abstraction beyond what each fix needs. No refactor of the window's passkey flow, the deletion coordinator or the offscreen handshake. No timing change beyond the numbers a record names (200 ms, 30 minutes) and two this plan names: P7-05's 60 s limit, listed for the owner (OA-8), and a flat 250 ms between refused ports, which can lengthen a cold start's bar by at most that and is measured in 4.4.

## Assumptions

### Facts, arcs 1 to 3 (verified at `643c0c9`)

- F1. Create and the default-account paths serialised on `${profileId}:${chainId}:0`, import on `:1`; create had no duplicate-address check (`account/service.ts`).
- F2. An imported account's address is a pure function of its signing key, the function a derived account uses (`packages/aztec-runtime/src/account/nulo-account.ts:67-89`).
- F3. Row-lock keys are `JSON.stringify(["account", profileId, chainId, address])` (`account/spec.ts:27-29`); `KeyedLock` is not reentrant; `EntityStorage.get` hides an undecodable row, `contains(id)` does not.
- F4. `activateCreatedProfile` polled `isLogined` with no id check and no deadline; `awaitProfileActivation` is the bounded, identity-checked wait (`composables/unlockWait.ts`); a failed bootstrap records `appStore.bootstrapFailure`.
- F5. `handleCreate` keeps its latch when `onCreated` throws (`useProfileCreateFlow.ts`).
- F6, F7. The in-page passkey create minted a new credential per attempt; the window confirms the kept one (`popup/windows/passkey/index.vue`). `classifyPasskeyFailure` reads a `NotAllowedError` cause as "not-confirmed" and a `PasskeyPrfError` as "no-prf" (`utils/passkey-copy.ts:80-96`).
- F8, F9. RPC params keep `undefined` holes; `BaseService.handleRequest` invokes `rpcMethods` and the framework `backup`/`restore`; `InvalidWalletArgumentsError.forMethod` carries `INVALID_PARAMS`.
- F10 to F13. The port client reported Connected at `connect` and ignored `lastError`; the server left an untrusted port open; `deleteProfile` threw before its delegate existed; the PXE fence kept one dead generation.
- F14 to F16. `ToastOptions.sub` exists; `change-password.vue` drove three fields from one flag; SECURITY.md § Session secret (password profiles) item 5 already says a strict-mode restart shows the lock screen.
- F17. Network files marked `@requires-proverless` run only with `NULO_E2E_PROVERLESS=1` (`apps/extension/scripts/e2e/agent.sh:21-33`).

### Facts, arcs 4 and 5 (verified at `15881c7d`)

- F18. The port client sets Connected and fires `onConnected` synchronously inside `openPort`, and reconnects at once on any close (`packages/extension-messaging/src/background/client.ts:62-78,94-99`). A request awaits readiness only when `ensureTransportReady` returns a promise, under a deadline set before the wait (`core/base-client.ts:117,125,287-309`), and posts at `:165` without checking that deadline again. The offscreen transport returns a promise except once after its bypass is armed (`offscreen/client.ts:141-148`).
- F19. The server registers `onConnect` in each `Service` constructor (`background/service.ts:31-36`), and the worker constructs the services only in `registerServices`, after the migration gate, the engine and the config and Barretenberg load (`apps/extension/src/wallet/runtime.ts:207-264`). The worker's entry registers no `onConnect` (`wallet/index.ts`). The shots capture showed a port opened before then is refused, and reopened about 140 times a second (#421).
- F20. `ensureInitialized` polls every 500 ms for up to `DEFAULT_INIT_TIMEOUT_MS` = 30 s (`core/initialization.ts:13-21`); `start()` sets `initialized` after `init` (`core/base-service.ts:64-69`).
- F21. `popup/index.ts:28` opens the profile client before mount, so the first `onConnected` fires before `app.vue`'s watch exists and only a reconnect starts `loadProfile({ reconnect: true })` (`popup/app.vue:425-433`). `onBeforeMount` awaits `router.isReady()`, then the settings read, then `loadProfile()` (`app.vue:350-369`).
- F22. The router's first navigation awaits the guard's `getProfiles` whenever no profile is selected and the route is not register, import or new profile; passkey routes proceed early (`popup/route-guard.ts:28,47-56`). So a fresh popup is empty until the service answers. A guard that throws fails the first navigation, and `onBeforeMount` then never reaches `loadProfile` (the comment at `app.vue:296-299` relies on a reconnect run for that case).
- F23. `resolveBootSession` bounds each read by `lookupActiveProfileWithBackoff`'s 60 s deadline (`popup/boot-session.ts:39-64`, `popup/auth-guard.ts:48,60-81`); an "unreachable" result sets the banner (`app.vue:254-263,472-481`).
- F24. `GlobalLoader.vue` renders while `!isBackgroundConnected`, at `z-index: 9999`, in the popup and the onboarding shells. It is visible only when `chrome.runtime.connect` throws, since a reconnect flips the flag back in the same tick. About 20 e2e sites wait for its absence.
- F25. Twenty-one `onConnected` subscribers re-read on reconnect (`rg -n "onConnected\.add" apps/extension/src`), among them `useConfigRead`, `useArrivals`, `useLegalAcceptance` and the profile and journal clients' snapshots.
- F26. `auth.vue` focuses the password field only at mount and selects the last-active profile through `getProfiles` (`popup/pages/auth.vue:217-227`); the heading, its line and the form depend on `appStore.profile?.type` (`:59,253-310`).
- F27. The theme is painted before first paint from a `localStorage` hint (`popup/index.html:6-8`, `utils/general.ts:8-15`). `.noanimations` kills transitions only (`packages/design/src/base.css:375-378`).
- F28. The only `runtime.onConnect` listeners are the worker's (`background/service.ts:35`, `core/adapters/chrome-browser-api.ts:126`).
- F29. Fixture builds hold the boot inside the migration engine, before `registerServices`, while `nulo:e2e:migration-hold` is set (`apps/extension/src/e2e/migration-fixture.ts:28,56`); the hold releases itself after 30 s (`:38`). CI's source-built smoke arms it (`.github/workflows/_extension-smoke-e2e.yml:66,115`); the release-artifact smoke has no fixture (`tests/e2e/migration.test.ts:20-24`). A popup opened mid-migration shows the Updating barrier over every screen (`tests/e2e/migration.test.ts:220`).
- F30. `ProfileServiceClient` overrides no timeout and passes no `requestTimeoutMs`, which `ServiceClient` already accepts (`wallet/services/profile/client.ts:23`, `background/client.ts:42`), so `deleteProfile` gives up at 60 s; the backup rollback retries its delete up to three times through the shared client (`composables/full-backup-restore.ts:62,152`); `reset.vue` shows its 30-minute hint after 10 s and "Couldn't delete profile. Try again" on any error (`popup/pages/settings/security/reset.vue:45,61-72,158-161`). Other clients override per method (`execution/client.ts:23-25`).
- F31. Create picks max index + 1 over same-type rows, writes over whatever holds the address under its row lock, then deletes that address's imported key (`account/service.ts:311-314,333-340,365-371`). `ensureDefaultAccount` shares the path; `provisionDefaultAccount` returns when any row exists. New accounts are named by the smallest free number, not the index (`utils/account-name.ts`).
- F32. `activateCreatedProfile` has one caller, the popup's New profile page, which opens only from the unlock screen's profile list and from register (`SelectProfilePopup.vue:73`, `register.vue:46`); onboarding activates on its own (`popup/pages/profile/new.vue:71`, `onboarding/pages/create.vue:56-59`). `CREATE_START_WAIT_MS` (30 s) bounds only the start; `ActivationSupersededError` comes from the start-only mode (`unlockWait.ts:31-43,69`). `supersedeProfileActivations()` stops every earlier run from setting `isLogined` (`composables/useProfileBootstrap.ts:50`). An error toast stays until closed; a lock closes every toast (`popup/scope-epoch.ts:17-26`).
- F33. The window keeps every `PasskeyUnconfirmedError`, no-PRF included, and confirms it on Try again; its body reads the unconfirmed line while one is kept (`popup/windows/passkey/index.vue:45-50,74-88`). The background fixes the profile id when it opens the window and refuses another user handle (`profile/service.ts:729-740`).
- F34. #99, #100 and #159 closed with arc 1's merge; #157, #208 and #421 are open. #169 (gate G1) has merged.
- F35. The integrity coordinator installs its delegate in its own `start()`, a later phase than Profile's, and `openSessionVerified` skips the check while no delegate is set, refusing only a known durable block (`account-integrity/coordinator.ts:65-68`, `profile/service.ts:1344-1353`). `ServiceCollection.start` starts no later phase after a failed one (`packages/wallet-core/src/base/index.ts:69-89`). The wallet-sdk handler is installed only after `services.start()` (`wallet/runtime.ts:264,275`).
- F36. A boot run over a locked wallet with no profile selected and no candidate settles where it is (`popup/lock-landing.ts:45`); only the guard (`route-guard.ts:54`) and `lockedState.land` (`locked-state.ts:31`) route to register. A reconnect run over a matched route, and every run in an own window, treat the page as established and select nothing (`app.vue:300`).

### Inferences (each checked in the phase named)

- I1, I2 (arc 1): confirmed in [lessons/phase-1.md](lessons/phase-1.md). I4 to I8 (arc 4): confirmed in phase 4.1, [lessons/phase-4.md](lessons/phase-4.md).
- I4. Firefox's event page refuses a port opened before its listeners exist the way Chrome does, so one retry spacing covers both; the close channel does not matter, since any close before Ready is retried. Phase 4.1.
- I5. Unknown. Both browsers close an extension's pages, tabs, own windows and side panels when it reloads, so no person reaches GlobalLoader's one visible case (F24). If false, such a page shows the bar, then the banner. Phase 4.1.
- I6. A stopped worker's successor runs the fixture migration's hold when the schema marker is rewound before the stop. Phase 4.1; if not, 4.4 relaunches the browser as `migration.test.ts` does.
- I7. The `onConnected` subscribers (F25) re-read idempotently, so a first `onConnected` that now reaches them after they subscribe only repeats a read. Phase 4.1 lists each, and names those that do more than a read (`tryReplayForTriple`, `useArrivals.startRead`).
- I8. The whole collection starts within a few hundred milliseconds of Profile's start, since every `init` awaits storage only and the coordinator's re-derivation runs outside `start()` (`coordinator.ts:74-84`). Phase 4.1 measures it on both browsers.

### Asks

OA-1 to OA-8 were answered on page 7 and its re-signing (OWNER-ASKS § Answers). OA-9 (which toasts Continue closes) is open and ships its "what ships now" form.

## Architecture & Implementation

### Arcs 1 to 3 as built

- **#99.** Create and import check and write an address under its row lock (`tupleLocks.withLock(accountRowId(...))`), taken inside the type section. Lock order 1: type key, then row key; a row-lock holder awaits storage only and never calls `unwrite`. `unwrite` deletes only a row whose `type` and `index` are its writer's; `reconcileImportedAccounts` selects and deletes under the row lock. Create replaced an imported row and deleted its key: OA-2's "what ships now", which arc 5 replaces.
- **#100.** `awaitProfileActivation(appStore, id, CREATE_START_WAIT_MS, { deadlineCovers: "start" })`, an identity re-check after every await, and `ActivationSupersededError`; `handleCreate` logs a category and keeps its latch on any rejection (OA-1's "what ships now", which arc 5 replaces).
- **#159.** `credentialId?` on the create request; `useProfileCreateFlow` keeps the last non-no-PRF `PasskeyUnconfirmedError` while the name is unchanged.
- **#198, #158.** `AccountMethodSchemas` checked by an `invoke` override that refuses with `INVALID_PARAMS`; the dead ConfirmPopup branch deleted.
- **Arc 2.** The client reads `lastError` and `port.error`; the server disconnects an untrusted sender's port; `deleteProfile` waits for its delegate inside one 30 s budget taken at entry (`performance.now()`); the PXE fence keeps a per-profile lifecycle record (current, dead generations, the clear in flight) and joins a clear in flight. R4 seam: `coordinator.ts`, `profile-deletion/types.ts` and the tombstone repository untouched.
- **Arc 3.** `auth.vue`'s failure ladder ends with the P7-02 toast; `change-password.vue` has two reveal flags.

### Arc 4: the Ready handshake and the start-up moment

**Wire and server.** `MessageType.Ready` (4) carries no content and means the whole wallet has started, not one service.
- `IService` gains an optional `collectionStarted()`, which `ServiceCollection.start` calls on every service after its last phase succeeds. `BaseService` resolves a one-shot promise there.
- On a port it accepts, the Port `Service` posts Ready when that promise resolves. Past `DEFAULT_INIT_TIMEOUT_MS` from the accept, it logs a fixed category at debug and `disconnect()`s the port; the client opens another. A post to a port that closed meanwhile is dropped. Request handling is unchanged.
- Why the whole collection: a popup call then never meets the start-up window in which an unlock opens unchecked (F35). The dApp path already waits for the same point. A boot that fails in any phase never says Ready, so it ends in the banner. The cost is the later phases' start, storage reads only (I8).

**Client states** (`background/client.ts`): `Disconnected` → `Connecting` (a port, no Ready yet) → `Connected`.
- Every port has a generation. A message or a close from a port that is not current is ignored, and that port is closed, so the client never holds two. Events from the current port are dispatched in either state, as today.
- `ensureTransportReady()` returns void when `Connected`. Otherwise it opens a port if none is open and no reconnect is pending, and returns the Ready promise of this `Connecting` episode, which survives pre-Ready closes. A throw from `chrome.runtime.connect` rejects as today.
- On Ready from the current port while `Connecting`: `Connected`, then resolve the Ready promise. `onConnected` fires in a task (`setTimeout(0)`), so every queued request has posted first; the task captures the generation and fires nothing if it moved. Any other Ready is ignored.
- A close from `Connected`: as today. Reject every posted request with "Client disconnected" (a posted request may have run, so it is never resent), fire `onDisconnected`, reconnect at once.
- A close from `Connecting`: reject nothing (nothing was posted), fire nothing, reconnect after a flat 250 ms.
- An explicit `disconnect()`: close the port, cancel the reconnect, reject the Ready promise and every posted request, and fire `onDisconnected` only from `Connected`.

**The send check** (`core/base-client.ts`, `background/client.ts`). After the readiness wait, `request()` rejects with its timeout error, sending nothing, when the deadline has passed. Nothing is awaited between that check and the post. The port client's `sendEnvelope` posts only while `Connected` on the current port; otherwise the request rejects with the disconnect error, and nothing reopens a port. Between Ready and a request's continuation only microtasks run, so the one thing that can intervene is an explicit `disconnect()`. The offscreen transport is untouched.

**The boot check never waits for Ready to start** (`popup/app.vue`, new `popup/boot-triggers.ts`, `utils/core.ts`). `isBackgroundConnected` becomes `isServiceReady`: true on the profile client's `onConnected` (a Ready), false on its `onDisconnected` (a drop of a Ready port).
- `boot-triggers.ts` owns the wiring, testable without mounting the shell, like `network-switch.ts`. `loadProfile` runs at mount and on `onDisconnected`, the drop today's reconnect follows in the same tick (F21); never on Ready. A Ready says the reads can now be answered, not that the shell's knowledge went stale. The reads wait for Ready inside their own 60 s lookup deadline (F23).
- So a service that never says Ready ends in the "unreachable" banner at about 60 s, for a fresh popup and for one open across a restart. Pre-Ready churn starts no run, so nothing supersedes the run that waits (#421).
- `onBeforeMount` awaits `router.isReady().catch(() => {})`, so a first navigation that fails no longer skips the check (F22). It then starts `loadProfile()` and the settings read side by side. The settings read waits for Ready too and must not delay the check; the theme is already painted (F27).

**The first screen** (`popup/route-guard.ts`, `popup/index.ts`, new `popup/start-grace.ts`). `popup/index.ts` takes one deadline at page load: `START_GRACE_MS` = 200 ms, the bar's delay before it shows.
- While the session is unchecked and the service has not said Ready, a navigation waits for Ready until that deadline, never longer. So the redirect chain `/popup` → General → `popup-auth` spends 200 ms in all.
- With Ready by then, the guard decides as today. Past it, the guard skips its service reads and marks the navigation provisional. An auth-required route goes to `popup-auth`, the answer an unchecked session gets today (`auth-guard.ts:35`), and any other route proceeds, unselected. So `router.isReady()` no longer waits on the service (F22), and a normal open looks as today.
- **The repair.** On every Ready while a navigation is provisional, and when a boot run decides while one is and the service is Ready, the shell replays it: `router.replace({ path, force: true })`, with `path` the provisional navigation's target. The guard now reads and decides exactly as today: register for an empty wallet, the last-active profile, `requirePasswordProfile`, an own window's route. A guard run whose reads fail also marks its navigation provisional, so a read that fails after Ready is replayed when the boot run decides. The mark clears only when a guard run's reads complete.
- The replay and the mount's boot run may interleave. The guard's profile block now assigns only if no profile is set after its awaits (`route-guard.ts:47-52` assigns unconditionally today), so a profile the boot run selected meanwhile stands. With that, every order ends where today's guard-then-run order ends, since the guard also sends a logged-in `popup-auth` back (`route-guard.ts:30`).
- So no route the shell reaches without reads outlives the next Ready, and the boot runs keep today's `pageEstablished` rule (F36).

**The bar** (`components/StartBar.vue`, new, mounted in `popup/app.vue` before `<Header />`). It renders while `!isServiceReady && !bootOutcome`, as `data-testid="start-pending"`, `aria-hidden="true"`, `pointer-events: none`, `position: fixed` along the top edge, 2 px high, under the barriers (10000) and above the sheet (9000). It is transparent until a CSS animation delay of 200 ms; then a segment in `var(--nulo-accent)` sweeps across, and under `prefers-reduced-motion: reduce` a static bar shows instead (shot `shot/157-C`, commit `a4c7f456`). It gives way to the banner when the boot check gives up; during RETRY it shows again until Ready. The shell root renders `data-service-ready` from `isServiceReady`, an e2e hook like `data-session-checked`.

**The loader goes.** `GlobalLoader.vue` and its test are deleted from both shells: under C nothing covers the start-up, and its one visible case is a page whose extension context is gone (F24, I5). Such a page now shows the bar, then the banner when its calls fail at once. Every e2e wait for the loader's absence becomes `waitForServiceReady(page)` on `data-service-ready`. The regenerated `types/{auto-imports,components}.d.ts` drop it, and the comments that name it (`LegalAcceptanceSheet.vue:127`, `account/service.ts:246`) are rewritten.

**The unlock screen before the profile is known** (`popup/pages/auth.vue`; OA-7). While `appStore.profile` is undefined, the heading, its line and the form keep their place but are hidden (`visibility: hidden`), out of the Tab order and the accessibility tree. A passkey profile never shows the password form; a password profile's form appears in place, and a passkey profile's shorter form re-centres the column once (OA-7 asks). When a password profile becomes known and focus is on `document.body`, focus moves to the password field, as the mount does today. The pill shows an empty name until then (P7-08b). An empty wallet's unlock frame gives way to register at the repair (OA-7 asks).

**Delete Profile's bound (P7-09).** `ProfileServiceClient`'s constructor passes `options` through to `ServiceClient` (F30). `profile/client.ts` exports `deleteProfileClient()`, a client with `requestTimeoutMs: DELETE_PROFILE_TIMEOUT_MS = 30 * 60_000 + DEFAULT_INIT_TIMEOUT_MS`, the page's promise in the record's words. `reset.vue` uses one for `deleteProfile` only and disconnects it in `onBeforeUnmount`. The deadline covers the Ready wait (F18). The backup rollback keeps the shared client's 60 s, so its three attempts stay bounded at three minutes. A deletion behind proofs on two of a profile's chains can still outlast the bound, and the page then says what it says today while the background finishes. That path is plausible but unverified, its consequence a wrong message; the close-out files it as a known limit.

**Queued calls and sessions.** A call queued across a restart reaches the new worker, which applies its own session state: exactly what a fresh call from the same page just after the restart would get. Under strict mode no session exists and session-checked calls are refused; under lenient mode the bearer restores the same profile during init, before Ready. A call that acts on "the active profile" acts on the one active when it arrives. The flows that move secrets carry a `RunFence` or `ExecutionFence` that refuses a changed session.

**Invariants.** A request is posted at most once, before its deadline, and only on a port that said Ready after the whole wallet started. `onConnected` fires at most once per Ready, never for a port that is no longer current. Every port the client stops using is closed. A boot run starts at mount and on a drop of a Ready port, and nothing else supersedes it. A route decided without reads is replayed at the next Ready.

### Arc 5: page 7's picks for arc 1's surfaces

**P7-06 (#99): Create account skips an occupied address.** In `createAccountInternal`, inside the type section: derive at max index + 1, take that address's row lock, and read `contains(id)`. If the key is occupied, release the lock, take the next index and derive again; otherwise write, as today.
- Any occupied key is skipped: an imported row, or one the codec hides. So create never overwrites a row it cannot read.
- A skipped index is never chosen again while a derived row above it exists, because the next index is max + 1 over derived rows (F31). The visible name takes the smallest free number, so no gap shows.
- `dropReplacedImportedKey` is deleted: an imported key now always keeps its row. A key without its row exists only between a torn import and the next boot's orphan sweep, which init awaits before any call (`account/service.ts:162-172`), so no create meets one. `ensureDefaultAccount` inherits the skip; `provisionDefaultAccount` never reaches it.
- The loop is bounded by the occupied keys at derived addresses: imported rows and rows the codec hides. Each attempt takes the row lock afresh, never across a derivation, so lock order 1 holds. Arc 1's `unwrite` and reconcile re-checks stay; they guard a row's own writer.

**P7-05 (#100): a create that does not open says so.** In `activateCreatedProfile`:
- The wait gains `limitMs`: `CREATE_ACTIVATION_LIMIT_MS` = 60 s, beside the 30 s start deadline, counted from when the create call returns and the profile exists. Name entry, the create call and a passkey ceremony are the person's own steps, so they are not the start-up the record names. It is one more timer in the one watcher, cleared on every settlement. 60 s is the call bound every popup read already has and the boot banner's limit; the record asks for a named limit without a value, so OA-8 lists 60 s for the owner.
- On any failure of the wait or the tail it hands off. To the unlock screen only while this popup shows no other profile: `!appStore.isLogined`; `appStore.profile` is unset, the created one, or the one selected when the page opened (`selectedOnEntry`); and no activation of another profile is in flight. `useProfileBootstrap` keeps the ids of the `bootstrapActiveProfile` calls from entry to settlement, through the final session read and the `isLogined` commit, and exports the predicate; `inFlightBootstraps` would not do, as it clears before that read (`useProfileBootstrap.ts:142-144,175-180`). New profile opens only from the unlock screen and from register, so `isLogined` is false at Create. Otherwise (P7-12 = B): the toast below and `/popup/general`, the open profile's home, with nothing recorded or superseded; a tail failure after the created profile opened lands there too.
- The hand-off calls `supersedeProfileActivations()`, so a start that finishes later does not move the screen (F32); an activation that starts after it is untouched. It awaits `setLastActiveProfileId(profile.id, { unless })` through the storage facade's `unless` seam (`utils/storage.ts:80`), where `unless` is "another profile opened or was selected", then checks again and goes home if so (P7-12). Otherwise it sets `appStore.profile`, pushes `/popup/auth` (the unlock screen re-selects the last active profile on mount) and calls `openToast({ kind: "error", label: "Something went wrong", sub: "Open the wallet again to unlock your new profile." })`, which replaces the shell's bootstrap-failure toast (one snack at a time).
- It logs `{ reason }` (`activationFailureReason`'s category) at warn and resolves, so `handleCreate` releases its latch as the page leaves. Only a failure of the hand-off itself rejects, which keeps the latch.
- The session the create opened stays open in the worker. Unlocking re-opens it, and reopening the popup goes straight in (OA-8 notes it). The unlock screen is not a security boundary for an open session. Onboarding is unchanged (F32).

**P7-10 (#137): Continue closes the last failure's toast.** The unlock page records the id of each toast its failure ladder opens; `handleUnlockWallet`, past its two guards, closes the current toast when it has that id, as the passkey ceremony closes only its own. Another surface's toast stays (OA-9 asks).

**P7-07 (#159): the window starts over after a no-PRF authenticator.** In the window's `prompt`, a kept `PasskeyUnconfirmedError` is confirmed on Try again only when `classifyPasskeyFailure` does not read it as "no-prf". Otherwise Try again runs the request's own create again, under the same profile id the background requires (F33). `unconfirmed` stays set, so the body keeps "Your passkey was saved but not confirmed. Try again to finish.": the record keeps the words. The no-PRF credential stays orphaned, as the in-page start-over leaves one.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 to 3 | `account/{service,spec}.ts`, `unlockWait.ts`, `new-profile-helpers.ts`, `useProfileCreateFlow.ts`, `create-passkey-profile.ts`, `passkey-ceremony.ts`, `passkey/spec.ts`, `ConfirmPopup.vue`, `fixtures/passkey.ts`, `passkey-retry.test.ts` | arc 1 (merged, #253) |
| 1 to 3 | `extension-messaging/src/background/{client,service,index}.ts`, `profile/service.ts`, `aztec-runtime/src/pxe/service.ts` (+ tests) | arc 2 (merged, #266) |
| 1 to 3 | `auth.vue`, `change-password.vue` (+ tests), `auth-flows.test.ts` | arc 3 (merged, #422) |
| 4 | `packages/wallet-core/src/base/index.ts` (+ test) | `collectionStarted()` after the last phase |
| 4 | `packages/extension-messaging/src/messages.ts`, `background/{client,service}.ts`, `core/{base-client,base-service}.ts`, `testing/{port-registry,transport-harness}.ts` (+ `client.test.ts`, `service.test.ts`, `base-client` tests) | Ready, states, generations, the 250 ms retry, the send check |
| 4 | `apps/extension/src/utils/core.ts` (+ test), `popup/app.vue`, `popup/boot-triggers.ts` (+ test, new), `popup/start-grace.ts` (+ test, new), `popup/route-guard.ts` (+ test), `popup/index.ts` | `isServiceReady`, `waitForServiceReady`, the boot triggers, the grace, the replay, `data-service-ready` |
| 4 | `components/StartBar.vue` (+ test, new); `components/GlobalLoader.vue` (+ test, deleted); `onboarding/app.vue`; `types/{auto-imports,components}.d.ts` (regenerated); comments in `LegalAcceptanceSheet.vue`, `account/service.ts` | the bar; the loader goes |
| 4 | `popup/pages/auth.vue` (+ `auth.test.ts`) | the hidden form while no profile is known; focus when it appears |
| 4 | `wallet/services/profile/client.ts`, `popup/pages/settings/security/reset.vue` (+ tests) | `deleteProfile`'s bound on the page's own client |
| 4 | `tests/e2e/fixtures/extension.ts`, the files that wait for the loader, `tests/e2e/sw-resilience.test.ts` | `waitForServiceReady`; the held-boot case |
| 5 | `wallet/services/account/service.ts`, `create-import-lock.test.ts` | the skip; `dropReplacedImportedKey` deleted |
| 5 | `composables/unlockWait.ts`, `composables/useProfileBootstrap.ts`, `utils/lastActiveProfile.ts`, `popup/pages/profile/new-profile-helpers.ts`, `new.vue`, `useProfileCreateFlow.ts` (+ tests) | `limitMs`; the fenced hand-off; the activation predicate; the pointer's `unless` |
| 5 | `popup/windows/passkey/index.vue` (+ `index.test.ts`) | start over after no-PRF |
| 5 | `popup/pages/auth.vue` (+ `auth.test.ts`) | Continue closes its own failure toast |

### Trade-offs and alternatives not taken

- **#99, one lock per (profile, chain)**: replaced, because create's write still raced a rename's read-modify-write and import queued behind create's L1 probe (Codex 1, 8). **Re-check after the write**: an undo is itself a racing write.
- **#100, one deadline over the whole activation** (first plan): rejected then, because slow but healthy start-ups landed on General. P7-05 now accepts that cost, so arc 5 adds the overall limit beside the start deadline, which keeps the superseded detection.
- **#159, a fourth `PasskeyRequest` mode**; **an exact mirror for no-PRF**: rejected (one meaning per field; a credential that can never confirm).
- **#198, `ValidationError` with per-method `validateParams`**: rejected; the no-ask names `INVALID_PARAMS`, and one override cannot be forgotten.
- **#157, Ready in arc 2**: replaced; it changes what the popup shows (Opus 1, Codex 7).
- **#157, a module-scope `onConnect` that parks early ports and hands them to each service** (outline B4). It would end the refusals instead of spacing them, and Ready would arrive without a retry step. It adds a registration protocol between the entry and every service, and a boot that fails holds its ports until each page's deadline. A flat 250 ms retry bounds the cost to four attempts a second per client and at most 250 ms of extra wait.
- **#157, Ready per service; refusing session opens until the delegate exists** (Codex). Per-service Ready leaves a queued unlock able to open unchecked while a later phase hangs (F35). Refusing opens instead turns a quick unlock on every cold start into an error. One Ready after the whole start closes the window for popup calls, at the cost of the later phases' storage reads (I8).
- **#157, doubling the retry to 2 s** (first draft): it adds up to 1.5 s to a cold start (Opus). Now that a reconnect starts no boot run, a flat 250 ms cannot bring #421 back.
- **#157, the boot run repairs a provisional route itself** (a `register` landing in `decideLockLanding`, Opus). It misses an own window's route and `requirePasswordProfile`; replaying the navigation reuses the guard's every rule.
- **#157, a separate boot timer started on the first connection attempt** (#421's suggestion). Once only mount and a drop start a run, the run's own lookup deadline is that timer; a second one would race it.
- **#157, the loader on a "transport lost" signal**: new client state for a case no person reaches (I5).
- **#157, the unlock screen with no grace; the password form before the profile is known** (the shot): every normal open would show the empty pill and swap the form a round trip later, and a passkey profile would flash the password form. OA-7 asks.
- **#157, a background boot id that refuses queued calls; resending unanswered requests**: rejected; the first refuses the boot's own reads, the second can repeat a request that ran.
- **P7-05, lock the new profile's session at the hand-off.** It needs a handle-guarded pair of reads and closes a session the record does not name; superseding the activation keeps the screen where the record puts it.
- **P7-07, a fresh profile id in the window**: the background fixes the id when it opens the window, so a new id needs a new request and cancels the step (F33).
- **P7-09, a longer timeout for every profile call**, or a per-method override: only the page waits on a proof drain, and the backup rollback would inherit 91.5 minutes (Codex).

## Security & Adversarial Considerations

**Threat model.** The actors are:
- a web page or dApp, which reaches the background only through the wallet-sdk path, never these ports or RPCs;
- another extension or a content script, which can open a port with a service's name, refused by `isTrustedInternalSender`;
- a compromised popup or extension page, which has full RPC access;
- stale state: a restarted worker or offscreen document, a capture that outlived a deletion, a port from before a restart.

The secrets in play are the master secret, the imported-keys DEK, sealed imported keys, passkey credential ids and user handles, and the PXE store keys.

| Arc | Actor | Before | After |
|---|---|---|---|
| 1 | The person, two popups; a dApp that provisions a default account | A create and an import of one address interleave; a parked rename writes an imported row back | One address, one lock; each outcome is a serial order; undo and reconcile delete only their own rows |
| 1 | Another window unlocking another profile | The create page wrote its profile over another session | Nothing is written or routed unless the created profile is the active, bootstrapped one after every await |
| 1 | A compromised extension page | A missing `profileId` ended in a TypeError naming internals | A typed refusal with a fixed message; the method never runs |
| 2 | Another extension; a restarted worker or offscreen | Refused ports stayed open; erased generations could be re-admitted | Closed at once; every erased generation stays refused |
| 3 | Shoulder-surfing; password managers | One eye revealed all three passwords | Page 7's proposals; the toast never carries error text |
| 4 | A page whose service never says Ready | A fresh popup stayed empty, for good when the hang came before the listeners (#421) | Its calls wait inside their own deadline and reject with the timeout. The send check posts nothing past the deadline, so no request, an unlock's password included, reaches a worker after its caller gave up. The boot check gives up at 60 s and shows the banner |
| 4 | An unlock queued across a cold start | It could reach the worker before the integrity delegate existed, and open unchecked if a later phase hung (F35) | Ready comes only after the whole start, so no popup call meets that window; a boot that fails in a phase answers no popup call |
| 4 | A route decided without reads | No such route | It goes only to the unlock screen or proceeds unselected, under the barriers; the next Ready replays it through every rule of the guard (register, own windows, `requirePasswordProfile`) |
| 4 | A forged or stale Ready | No handshake | Only the port's far end can post on it, and the only `onConnect` listeners are the worker's (F28), behind the trusted-sender check. A Ready on a non-current port is ignored and the port closed; a second Ready changes nothing; Ready carries no content |
| 4 | A boot that crash-loops or hangs | About 140 reconnects a second, each a new boot run | Reconnects spaced 250 ms per client; no boot run per pre-Ready reconnect |
| 4 | Delete Profile behind a proof | The page reported failure at 60 s while the deletion ran on | The page's own client waits 30.5 minutes; the backup rollback keeps 60 s; the call gains no authority |
| 5 | Create against an imported address | The imported row and its key were replaced | Create never overwrites an occupied address, so an imported key keeps its row |
| 5 | A new profile that does not open | "Creating…" forever | The hand-off writes the pointer only while no other profile opened (`unless`), routes to the unlock screen only after re-checking, else to the open profile's home with nothing written, and opens or closes no session |
| 5 | The window's retry after no PRF | The same credential, which cannot confirm | A new credential under the same user handle; the old one stays orphaned, as in-page |

**Lock order (1, 5).** Type key, then row key. A row-lock holder awaits storage only and never calls `unwrite`; arc 5 takes the row lock per attempt, never across a derivation. Reconcile's dependent purges run outside every row lock. Nothing that holds `restoreLock` or `runExclusive` calls create or import.

**Logging.** Ready, a pre-Ready close (its reason category), a stale-port drop, the send check's refusal, the server's give-up and the replay log fixed categories and numbers at debug: a service that never starts would otherwise fill every person's buffer at warn. The P7-05 hand-off logs its reason at warn. No new line carries a credential id, user handle, address, password, profile id, error message or URL (CLAUDE.md § Logging policy).

**Keyboard and focus.** The bar takes no focus and no pointer, and is `aria-hidden`. The hidden form is out of the Tab order and the accessibility tree, and focus moves to the password field only from `document.body`. No Escape or Enter handler is added.

**Least privilege, crypto, supply chain.** No new permission, dependency, CI token or cryptographic primitive; WebAuthn stays in `passkey-ceremony.ts`, sealing in `@nulo/wallet-crypto`; the age gate and the frozen lockfile are untouched.

## Implementation

Gates run from the repo root unless they say `apps/extension`. Retry 0 everywhere: smoke `--retry=0`, network `NULO_E2E_RETRY=0`; a file marked `@requires-proverless` runs in its own call with `NULO_E2E_PROVERLESS=1` (F17). G1 (#169) has merged, so lanes may share the host: check the load first, and never run two `e2e:agent` runs in this worktree. A red/green proof takes the old copy from the arc's base (`git show 15881c7d:<path>` for arcs 4 and 5), never from `HEAD`. Each test is a **new proof** (fails on the base copy) or a **guard** (holds on base and pins behaviour the change keeps).

### Arcs 1 to 3 (shipped)

Every gate below passed with exit 0 at retry 0; STATUS.md and `lessons/phase-1.md` to `phase-3.md` hold the runs.

| Phase | What | Gate result |
|---|---|---|
| 1.1 ✓ | #99 row-lock check and write, owned undo and reconcile | account unit 113/113; four proofs red on `643c0c9` |
| 1.2 ✓ | #100 the activation wait, the identity re-checks | unit 52/52; I1 confirmed |
| 1.3 ✓ | #159 the retry confirms | unit 227/227; `passkey-retry` Chrome 9/9, Firefox 9/9; base created twice |
| 1.4 ✓, 1.5 ✓ | #198 params; #158 deletion | account unit 121/121; ConfirmPopup 8/8; `rg` gate 0 |
| Arc 1 boundary ✓ | audit:vue, test:all, six smoke files, two network files | Chrome 29/29, Firefox 15/15 |
| 2.1 ✓, 2.2 ✓, 2.3 ✓ | transport; the delegate wait; dead generations | test:all 0; profile unit 370/370; proofs red on `fd47407` |
| Arc 2 boundary ✓ | audit:vue; smoke and network on both browsers | smoke Chrome 10/10, Firefox 9/9; network Chrome 3/3 + 3/3, Firefox 4/4 |
| 3.1 ✓, 3.2 ✓, 3.3 ✓ | #24 closed; the unlock toast; the split reveal | auth 26/26; settings 56/56; smoke Chrome and Firefox |
| Arc 3 boundary ✓ | audit:vue; smoke on both browsers; one network file | Chrome 12/12, Firefox 12/12; network 2/2 |

### Arc 4: the Ready handshake

#### Phase 4.1: base evidence ✓

1. List the 21 `onConnected` subscribers (F25). For each, write whether a first `onConnected` that now arrives after it subscribed changes what it does (I7). Name any that is not idempotent; phase 4.3 fixes it locally.
2. On both browsers, stop the worker with no extension page open while the fixture migration's hold is set and the schema marker rewound (I6). Record whether the popup's ports are refused, at what rate, and how many ports one popup opens (I4).
3. On a cold start on both browsers, time Profile's start and the end of `services.start()` with a throwaway log line (I8).
4. Reload the extension with a popup, an extension tab, an own window and, on Chrome, the side panel open, on both browsers, and record which close (I5).
5. Write all four to `lessons/phase-4.md`.

**Validation gate**
- Commands: none beyond the recorded evidence.
- Pass: `lessons/phase-4.md` answers I4 to I8. A "no" for I6 makes phase 4.4 relaunch the browser as `migration.test.ts` does. A gap over 500 ms for I8, or a "no" for I5, goes to OWNER-ASKS before phase 4.2 or 4.3 builds on it.
- Layers: none (evidence).

#### Phase 4.2: wire, server, client, send check ✓

1. Build `collectionStarted()`, the wire, the server's Ready, the client's states and the send check as § Arc 4 states.
2. Teach `port-registry.ts` and `transport-harness.ts` to post Ready after `collectionStarted()`.
3. `client.test.ts`, with fake timers:
   - **New proof.** A request made while `Connecting` is not posted before Ready. **Guard:** it posts once after Ready and resolves.
   - **New proof.** Two pre-Ready closes reject nothing, fire no `onDisconnected`, and each reconnects after 250 ms; an explicit `disconnect()` cancels a pending reconnect. **Guard:** the request resolves after the third port's Ready.
   - **New proof.** An explicit `disconnect()` between Ready and a request's continuation rejects the request and opens no port. **Guard:** a later request reopens the port.
   - **New proof.** A request is never posted when its deadline passes while it waits, nor when the clock passes the deadline between Ready and the continuation. **Guard:** both reject with the timeout error.
   - **New proof.** `onConnected` does not fire on a bare connect. It fires once per Ready, in a later task, after every queued request has posted. A disconnect or a drop before that task fires none.
   - **New proof.** A message or a Ready from a stale port is not acted on, and that port is closed. A second Ready on the current port fires nothing. An event from the current port while `Connecting` is dispatched.
   - **Guard.** A request posted on a `Connected` port that drops rejects with "Client disconnected" and is not posted again, also when a subscriber reconnects in `onConnected`.
4. `service.test.ts`:
   - **New proof.** A trusted port gets Ready only after `collectionStarted()`, not at `onConnect` and not at its own service's `start()`.
   - **New proof.** At the init bound the port gets no Ready and is disconnected. **Guard:** an untrusted port still gets nothing.
5. **New proof** (`wallet-core` base test). `collectionStarted()` reaches every service after the last phase, and none after a failed phase.
6. **Guard.** The offscreen transport's tests (`core/base-client-*.test.ts`, `offscreen/*.test.ts`) pass unchanged.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`.
- Pass: exit 0. Each new proof fails against the base copies of `index.ts`, `client.ts`, `service.ts` and `base-client.ts`.
- Layers: lint, typecheck, unit (every package).

#### Phase 4.3: the popup shell ✓

1. In `utils/core.ts`, rename `isBackgroundConnected` to `isServiceReady` and add `waitForServiceReady(ms)`. Move the boot triggers to `boot-triggers.ts` and remove the watch on the flag; `onBeforeMount` as § Arc 4 states.
2. Add `start-grace.ts` (the page-load deadline, the provisional mark, the replay), the guard's use of it, the bar, `data-service-ready` on the popup and onboarding shell roots, and the hidden form in `auth.vue`.
3. Delete `GlobalLoader.vue`, its test and both mounts; regenerate the two `.d.ts` files; rewrite the two comments. Replace every e2e wait for the loader's absence with a new `waitForServiceReady(page)` fixture.
4. Fix any subscriber phase 4.1 named, locally.
5. Tests:
   - **New proof** (`route-guard.test.ts`). An unchecked session with no Ready by the page-load deadline sends an auth-required route to `popup-auth`, calls neither read, and marks the navigation provisional. A second navigation after the deadline waits for nothing. **Guard:** with Ready inside the grace, the guard reads and decides as today; once the session is checked, no grace applies.
   - **New proof** (`start-grace.test.ts`). On Ready, a provisional navigation is replayed once, with `force`, and its reads decide: an empty list goes to register, a list selects the last active profile, a passkey profile on a `requirePasswordProfile` route goes to `/popup/settings/profile`. A failed read keeps the mark and the next Ready replays again; a completed read clears it. A read that fails after Ready, with no later Ready, is replayed when the boot run decides.
   - **New proof** (`route-guard.test.ts`). The guard's `getProfiles` answers, the boot run selects B, then the last-active read answers A: B stays selected. **Guard:** with no selection meanwhile, the last active profile is selected as today.
   - **New proof** (`boot-triggers.test.ts`). Mount starts `loadProfile` without waiting for Ready or the settings, whether `router.isReady()` resolves or rejects. A drop of a Ready port starts a run; a pre-Ready close and a Ready start none. With a client that never says Ready, the mount's run is the only one and ends "unreachable" at the lookup deadline.
   - **New proof** (`core.test.ts`). `isServiceReady` follows `onConnected` and `onDisconnected`. `waitForServiceReady` resolves true on Ready and false at its bound.
   - **New proof** (`StartBar.test.ts`). The bar renders while the service is not Ready and no boot outcome is set; it is gone after Ready and with an outcome. The source pins the 200 ms delay and the static bar under reduced motion.
   - **New proof** (`auth.test.ts`). With no profile, the heading, its line and the form are hidden and the password field cannot take focus. **Guard:** a password profile set later shows the field and focuses it when focus was on the body, not when the pill had focus. A passkey profile shows the passkey form and never shows the password field.
6. Run `! rg -n "global-loader|GlobalLoader|isBackgroundConnected" apps/extension packages`.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; the `rg` gate; `cd apps/extension && bun run test:e2e -- tests/e2e/sw-resilience.test.ts tests/e2e/registration.test.ts tests/e2e/passkey-paths.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox` (a fixture changed).
- Pass: exit 0 on both browsers. The new proofs fail against the base copies.
- Layers: lint, typecheck, unit, component, smoke e2e on Chrome and Firefox.

#### Phase 4.4: the held-boot e2e and the screenshots ✓

1. Add one case to `sw-resilience.test.ts`, skipped unless the build carries the fixture (`migration.test.ts:20-24`). Register a password profile, lock, rewind the schema marker and set the migration hold (F29). Close every page and stop the worker. The hold's 30 s self-release counts from the stop, so open the popup at once as a raw page, as `migration.test.ts:131-135` does, not through `openPopup`, which would wait out the hold.
   - **New proof.** While the hold stands, the hash reaches `#/popup/auth` under the Updating barrier, with `start-pending` present, `data-service-ready` absent and the password field's computed visibility hidden. On the base, the hash stays empty. The barrier covers the frame, so this proves the route, not the look; the screenshots show the look.
   - **Guard.** After the hold clears, the barrier goes, the pill shows the profile's name, the password field shows, `data-service-ready` appears, an unlock reaches `#/popup/general`, and `consoleErrors` and `pageErrors` are empty. Record the time from the release to `data-service-ready`, the retry's added wait.
   - Failure mode: the first screen and the shell's first boot run on real browser ports while the worker has no listeners (Chrome holds the first connect, then refuses; Firefox per I4), with the real router. No fake reproduces that refusal pattern or the first navigation. Estimate: 20 s on Chrome, 30 s on Firefox; measure both.
2. **Guard.** The Chrome-only "open popup survives the kill" case proves the run started by a drop.
3. Take screenshots in both themes with `shotSend` (`tests/e2e/fixtures/send-page.ts`) under a throwaway local hold after the listeners, before `collectionStarted()`, never committed: the bar over the unlock frame; the never-starts frame (the banner over the unlock frame); the bar over General across a restart; an empty wallet's unlock frame, then register.

**Validation gate**
- Commands: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e -- tests/e2e/sw-resilience.test.ts --retry=0` on a build with `VITE_NULO_E2E_MIGRATION_FIXTURE=1`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0 on both browsers; the new proof fails on the base build; both measured runtimes and the added wait are recorded in `lessons/phase-4.md`.
- Layers: smoke e2e on Chrome and Firefox.

#### Phase 4.5: Delete Profile's bound (P7-09) ✓

1. Pass the constructor's `options` through, add `deleteProfileClient()`, and use it in `reset.vue` as § Arc 4 states.
2. `profile/client.test.ts`, with fake timers:
   - **New proof.** A `deleteProfile` on `deleteProfileClient()` answered after 10 minutes resolves.
   - **Guard.** One unanswered at 30 minutes and 30 seconds rejects with the timeout error. The shared client's `deleteProfile` and `getProfiles` still give up at 60 s, the rollback's bound.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/profile/client.test.ts src/composables/`.
- Pass: exit 0; the new proof fails against the base copy.
- Layers: lint, typecheck, unit.

#### Arc 4 boundary gate

- Commands:
  - `bun run audit:vue`; `bun run test:all`.
  - `cd apps/extension && bun run test:e2e -- --retry=0` (full smoke), then the same with `NULO_E2E_BROWSER=firefox`.
  - On Chrome, then with `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/connect-locked-queue-sw-restart.test.ts tests/e2e/network/cold-wake-discovery.test.ts tests/e2e/network/firefox-background-restart.test.ts`.
  - The same pair of browsers with `NULO_E2E_PROVERLESS=1` for `tests/e2e/network/backup-restore-sw-restart.test.ts tests/e2e/network/inflight-call-background-death.test.ts`.
- Pass: every command exits 0; a file a browser skips by design counts as passing.
- Layers: lint, typecheck, unit, build, smoke and network e2e on both browsers.
- Then the arc's Codex loop. The PR body states each browser's smoke and network suite wall-clock before and after.

### Arc 5: page 7's picks for arc 1's surfaces

#### Phase 5.1: Create account skips an imported address (P7-06) ✓

1. Build the skip as § Arc 5 states; delete `dropReplacedImportedKey`.
2. Rewrite the replacement cases of `create-import-lock.test.ts`, whose mock gives index 0 the address `SHARED` and every later index `NEXT`:
   - **New proof.** An imported row at `SHARED`: a create keeps that row and its key unchanged and writes `NEXT` at index 1.
   - **New proof.** A create that started before an import of `SHARED` took the row lock lands at `NEXT`, and both rows survive.
   - **New proof.** A row the codec hides at `SHARED` is skipped, not overwritten.
   - **New proof.** `ensureDefaultAccount` over an imported `SHARED` returns index 1, and a second call returns the same row.
   - **Guard.** Two creates still take indices 0 and 1; an import of an address a create holds is refused; a keyless imported row is still reconciled. The schedules where a create replaces a row mid-reconcile can no longer occur and are removed.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/account/`; `cd apps/extension && bun run test:e2e -- tests/e2e/accounts.test.ts tests/e2e/account-import-export.test.ts --retry=0`.
- Pass: exit 0; the new proofs fail against the base `service.ts`.
- Layers: lint, typecheck, unit, smoke e2e (Chrome).

#### Phase 5.2: the hand-off (P7-05, P7-12) ✓

1. Add `limitMs` to `awaitProfileActivation`, and the hand-off to `activateCreatedProfile`, which now takes `openToast`.
2. Tests, with fake timers:
   - **New proof** (`unlockWait.test.ts`). With `limitMs`, an activation that started and still runs rejects with `UnlockTimeoutError` at the limit. **Guard:** without it, the same schedule resolves after 5 minutes.
   - **New proof** (`new-profile-helpers.test.ts`), one case per class: a bootstrap failure, a start that never comes (30 s) and a slow start (60 s after the create returns). Each sets the store's profile to the created one, writes it as last active, pushes `/popup/auth` and opens the P7-05 toast once. In the slow case, a later activation routes nowhere.
   - **New proof.** Another profile open, or its activation in flight (its final session read held), in this popup when the wait fails: `ActivationSupersededError`, no pointer, route or toast. Another profile opening during the pointer write: the write is skipped (`unless`) and the hand-off throws `ActivationSupersededError`, so the latch holds.
   - **Guard.** A superseded activation rejects with `ActivationSupersededError` and hands off nothing; an activation inside the limit lands on General as today; `handleCreate` releases its latch after a hand-off and keeps it after a rejection.
3. Take the toast over the unlock screen in both themes with a throwaway local hook, never committed.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/composables/unlockWait.test.ts src/popup/pages/profile/ src/composables/useProfileCreateFlow.test.ts`; `cd apps/extension && bun run test:e2e -- tests/e2e/passkey-retry.test.ts tests/e2e/registration.test.ts --retry=0`.
- Pass: exit 0; the new proofs fail against the base copies.
- Layers: lint, typecheck, unit, smoke e2e (Chrome).

#### Phase 5.3: the window starts over (P7-07) ✓

1. Change `prompt` in `popup/windows/passkey/index.vue` as § Arc 5 states.
2. `index.test.ts`:
   - **New proof.** After a no-PRF unconfirmed failure, Try again calls the ceremony's create and never its confirm, and the body still reads the unconfirmed line.
   - **Guard.** After a not-confirmed failure, Try again confirms the kept credential (the existing case).

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/windows/passkey/`; `cd apps/extension && bun run test:e2e -- tests/e2e/passkey-retry.test.ts tests/e2e/passkey-toolbar-panel.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox` (WebAuthn).
- Pass: exit 0 on both browsers; the new proof fails against the base copy.
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

#### Phase 5.4: Continue closes the last failure's toast (P7-10) ✓

1. Route the failure ladder's toasts through one helper that records the toast id; close that toast at the next attempt, as § Arc 5 states.
2. **New proof** (`auth.test.ts`): Continue after an unexpected failure closes its toast before the new attempt answers. **Guard**, in the same case: a toast another surface opened stays.

**Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/auth.test.ts`; smoke `tests/e2e/auth-flows.test.ts` on Chrome, retry 0. Pass: exit 0; the proof fails on the base copy.

#### Arc 5 boundary gate ✓

- Commands: `bun run audit:vue`; `bun run test:all`; `cd apps/extension && bun run test:e2e -- tests/e2e/accounts.test.ts tests/e2e/account-import-export.test.ts tests/e2e/registration.test.ts tests/e2e/passkey-retry.test.ts tests/e2e/passkey-toolbar-panel.test.ts tests/e2e/auth-flows.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/imported-account-execution.test.ts`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, build, smoke e2e on both browsers, network e2e (Chrome). No e2e scenario is added: each pick's branch is proved where it lives (the account service, the activation helper, the window), and no browser behaviour decides it.
- Then the arc's Codex loop. The final cross-arc pass rides the close-out, after 3.4.

### Phase 3.4: backup autocomplete (P7-04) ✓

Built on `account-session-life-closeout` from dev `0266d1b2`, after backup-import-export arc 3 merged (#454). Add `autocomplete="current-password"` to `ImportFullBackupForm.vue`'s decrypt field and `autocomplete="new-password"` to `export/full.vue`'s pair, with one component assertion per field class. Gate: lint, typecheck, `cd apps/extension && bun --bun vitest run src/components/composite/import/ src/popup/pages/settings/security/export/`. Result: 100/100; both assertions red on the base markup. The fields are where the plan names them; the export pair's assertion sits in `full-passkey.pins.test.ts`, since the pair renders for passkey profiles only.

## UI impact

- **Arc 1** (#159, recorded no-ask "Mirror the passkey window's saved-credential confirmation on retry"): the retry opens the sign-in prompt for the saved passkey. #100, #99, #158, #198 and arc 2: none.
- **Arc 3**: #24 (P7-01) none; #137 (P7-02) "The spinner stops and a toast reads "Something went wrong" with the line "Try unlocking again.""; #208 (P7-03) "The current-password field gets its own show/hide eye; the new password and its confirmation share the second one."
- **Popup opened while the service starts** (arc 4; #157, P7-08 = C, P7-08b = C): "The unlock screen at once with a 2 px bar sweeping along the popup's top edge until the service has started. Nothing else changes and nothing moves. On a normal open at most one frame of the bar, none with a 200 ms delay before it shows; on a cold start the bar runs about a second and the unlock screen appears about a second sooner than today. The profile name stays blank until the service answers." As built: the unlock screen comes once 200 ms pass without Ready, one grace per page load, so a normal open looks as today; until the profile is known its heading, line and form keep their place hidden, and a passkey profile's shorter form re-centres the column once; an empty wallet's unlock frame gives way to register when the service answers (OA-7 asks all three). Today: an empty page for 1.2 to 1.9 s on a cold start.
- **A service that never starts** (arc 4; P7-08 = C): "A service that never starts shows that screen for up to 60 s, then the banner." As built: the unlock frame and the bar, then at about 60 s the banner "The wallet service could not be reached." with RETRY; the bar gives way to it. A boot that fails in any start phase counts as one that never starts. Today: empty for about 61 s then the banner, or empty for good (#421).
- **A popup open across a restart** (arc 4): the bar shows over the current screen until Ready, none within 200 ms. Today nothing shows, and a call in the gap could fail.
- **The full-screen loader** "INITIALIZING / RECONNECTING" (arc 4): removed. Today it renders only on a page whose extension context is gone (I5); that page now shows the bar, then the banner.
- **Delete Profile beyond 60 s** (arc 4; P7-09 = B): "the popup waits for deleteProfile up to the hint's 30 minutes plus the start-up allowance, so the page keeps "Deleting…" and its hint until the background finishes, then shows "Profile deleted" as on the quick path. No new words." The backup import's rollback keeps its 60 s.
- **Create account on an imported account's address** (arc 5; P7-06 = B): "Skip it: keep the imported account as it is and create the next account after it."
- **Popup New profile that does not open** (arc 5; P7-05 = B): "the toast reads "Something went wrong" with the line "Open the wallet again to unlock your new profile." and the popup goes to the unlock screen with the new profile selected." Named limit: 60 s after the new profile exists (OA-8). Reopening the popup after the hand-off goes straight in, since the session stays open.
- **The same, while another profile took over or after the page's last steps failed** (arc 5; P7-12 = B): "Say so and stay on the open profile. The toast reads 'Something went wrong' with the line 'Open the wallet again to unlock your new profile.', and the popup goes to the open profile's home."
- **Unlock screen, Continue after a failed unlock** (arc 5; P7-10 = B): "pressing Continue again dismisses the toast before the new attempt, so a retry that unlocks lands on a clean Home." As built: the screen's own failure toasts only (OA-9 asks about the other two).
- **Passkey window, Try again after no PRF** (arc 5; P7-07 = B): "Try again starts a new passkey so the person can pick an authenticator that works. The window's words stay."

Sign-off: each line rides the record it quotes; OA-7 and OA-8 were signed on page 7's re-signing (P7-11 = A, P7-12 = B); OA-9 ships its "what ships now" form (CLAUDE.md § UI changes). Arc 4's PR attaches both themes of the bar over the unlock frame, the never-starts frame and the bar over General across a restart. Arc 5's attaches the P7-05 toast and the accounts list after a skip. All are taken with throwaway local hooks, never committed. P7-07 and P7-09 draw nothing new: a browser prompt, and the page's ten-second state held longer.

## Decision ledger

**Outlines compared, first plan.** A (chosen): a per-address check and write; the existing activation wait with a start deadline; a saved credential on the create request; an `invoke` override; the invisible transport fixes and the fence now; Ready on the owner's answer. B (cheapest first): re-check rows and undo; a bounded poll; an in-call confirmation retry; a module-scope port buffer; callers retry `deleteProfile`. A won: B's undo races, its poll is the bare poll the brief rules out, its retry shows a second prompt with no click, and its buffer leaves `lastError` and refused ports alone.

**Outlines compared, arc 4 revision.** A4 (chosen): Ready from the started promise; client-side generations, epoch and backoff; boot runs started only by mount and by a drop; a 200 ms grace before a provisional first route; the bar; the loader deleted. B4: the worker parks early ports at module scope and hands them to each service on registration; no client backoff; the loader kept for a lost transport. A4 won: B4 adds a registration protocol across every service and holds the ports of a boot that failed (§ Trade-offs). The audit then reshaped A4: one Ready after the whole start, a flat 250 ms retry, a send check in place of the epoch, one grace per page load and the replay.

### Orchestrator decisions

- **D-orch-1 to D-orch-3 (2026-10-10).** No stack: each arc opens its own PR against `dev`. Arc 1 only, then. R2-1 asked first on arc 1's review: both legs found it unreachable.
- **D-orch-4 to D-orch-6 (2026-10-10).** After a squash merge the next arc branches from `dev`. Arc 2 lands first under R4 and says `Refs #157`. Arc 2's design was asked first; the answers are below.
- **D-orch-7, D-orch-8 (2026-10-14).** Arc 3 builds 3.1 to 3.3; 3.4 is deferred until backup-import-export arc 3 merges, and #208 stays open. P7-05 to P7-09 wait for a plan revision.
- **D-orch-10 (2026-10-15, arc 5's brief).** Build P7-06, P7-05 with P7-12's words, P7-07 and P7-10 from dev `1a8b2b6d`; one PR against `dev` with `Closes #99`, `#100`, `#159` and `Refs #137`; 3.4 and the close-out are not this arc's.
- **D-orch-9 (2026-10-14, the arc 4 revision's brief).** Arc 4 builds P7-08 and P7-08b = C, owns #421, and gives each of P7-05, P7-06, P7-07 and P7-09 a phase, in arc 4 or a small arc 5. OA-6 is not planned. 3.4 stays deferred. The tree wins over the plan; the branch is `account-session-life-arc-4` from `dev` `15881c7d`.

### Audit verdicts

**First plan, round 1, Codex** (`gpt-6.1-sol`, high): `reject` (blocking findings: imported-key cleanup, the activation tail, Ready-to-send race, session isolation, overlapping erasures).

| # | Finding | Disposition |
|---|---|---|
| C1 High | Create's write skips the row lock; a parked rename writes back | Accepted: per-address check and write |
| C2 High | #100 fences the wait, not the tail | Accepted: re-check after each await |
| C3 High | Ready is not bound to the send | Accepted into arc 4 (now the send check, arc 4 revision) |
| C4 High | Queued calls can act under a successor session | Fact corrected; session binding rejected (a queued call gains nothing a fresh call lacks) |
| C5 High | Two same-generation clears overlap | Accepted: join the clear in flight |
| C6 Medium | Dead-generation no-op contradicts the pinned refusal | Accepted: explicit precedence |
| C7 Medium | `isBackgroundConnected` drives screens | Accepted: Ready moved to arc 4 behind OA-4 |
| C8 Medium | The L1 probe has no total bound | Moot under the per-address design |
| C9, C10 | Override must pass `backup`/`restore`; label guards | Accepted |
| — | Make R4's order unconditional | Rejected: R4 is the orchestrator's text |

**First plan, round 1, Opus 5.5 Plan agent**: `conditional approve`. O1 (the loader's timing; same as C7), O2 (proverless files), O3 (the sweep is a fourth reader), O4 (`restore` through the override), O5 (a 30 s deadline regresses slow starts), O6 (a renamed profile's passkey label; keep `prf` without `results`), O7 (the app's console never reaches Puppeteer), O8 (same as C4), O9 (disconnect cancels backoff and rejects Ready), O10 (labels), O11 (log, not throw, a failed key delete), O12 (2b need not wait): all accepted, O8 as a fact correction.

**First plan, final fresh pass, Codex**: `reject`. F1 (import's undo deletes a replacement) accepted, its key half rejected. F2 (reconcile deletes a healthy derived row), F3 (the unfenced `storageLocalSet`), F4 (120 s does not mean wedged: start-only deadline), F5 (the loader over the banner under B), F6 (a deferred `onConnected` after a disconnect), F7 (the subscriber guard's order): accepted. **Round 2** (resumed): `reject` on R2-1 (a stale dependent purge after a replacement), rejected on evidence: no session-holding create reaches the reconcile window, and holding a row lock across subscriber purges breaks lock order 1. R2-2 (a proof that passed on base) accepted: it is a guard.

**R2-1 asked first** (D-orch-3, on `9574a9d`, again on arc 1's HEAD). Codex (`01a12394-…`, then `01a123b2-…`) and Opus: `UNREACHABLE, high`. The evidence: `SessionManager.open`'s one call site refuses a restore-pending profile; neither restore branch opens a session; the only caller reconciles before `finalizeRestore`; create and import need the profile's session. The plan stands.

**Arc 1 review** (`9574a9d..9c4b9c8`). Codex round 1: `CHANGES`, three Medium, each fixed with a never-happens test: the import's emit after its epoch check (a5c3170), a cancel during the confirming assertion dropped the credential (dd9bc51), a failed identity check released the latch (95c6ec7). Opus: `CHANGES`, the same three plus a type-level schema pin and four comments (1a6e040); one rejected (clearing the saved credential after an "other" failure: the window keeps it). Codex round 2: `APPROVE`.

**Arc 2 design asked first** (D-orch-6, on `fd47407`). Codex (`01a12405-…`): 1a, 1b HOLD, 1c HOLE; Opus: all HOLD. D1 (the popup's 60 s against two 30 s waits) was accepted for arc 2's share as one budget taken at entry; the page's own 60 s limit became OA-5. D2 to D7: accepted or confirmed (clear `clearing` on every settlement, publish the erase synchronously, a joiner inherits a failure, no start phase awaits the offscreen, refused ports log only the sender id). **Arc 2 review** (`fd47407..eeb3303`): Codex `CHANGES`, one Medium (wall clock in the budget: `performance.now()`, 964c9aa); Opus `APPROVE`, one Low (`Promise.withResolvers` raised the Chrome floor: `deferred()`, fbe0f79); Codex round 2 `APPROVE`.

**Arc 3 review** (from `d3dc441`). Codex (`01a13b93-…`): `APPROVE`, one Low (the passkey rung's `return` had no guard; a71acaea), one Comment accepted, one rejected (the two-flag comment states an invariant). Opus: `CHANGES`, the same two plus OA-6 (not built). Codex round 2: `APPROVE`.

**Arc 4 revision, round 1, Codex** (`gpt-6.1-sol`, high, `01a13c0a-…`): `reject` (blocking findings: the provisional route's repair, the send-time deadline, Ready before the integrity delegate, the unfenced hand-off). **Opus 5.5 Plan agent**: `conditional approve` (register reachable, a run after the provisional route selects, one grace per load, a lower retry cap, the hand-off fenced, OA-7 signed before arc 4 merges). Each finding was checked at the tree.

| # | Finding | Disposition |
|---|---|---|
| C1 High, O-R1 High, O-R2 | Past the grace, an empty wallet stays on auth; a drop or an own window makes the next run select nothing (F36) | Accepted: the provisional mark and the replay on Ready. Opus's `register` landing rejected (§ Trade-offs) |
| C2 High | Ready can come before the integrity delegate exists (F35) | Accepted: Ready after the whole start. Refusing opens without a delegate rejected (§ Trade-offs) |
| C3 Medium | A delayed continuation posts past its deadline | Accepted: the send check, with that schedule as a proof |
| C4 High, O-R5 | The hand-off can land over another profile's session | Accepted: hand off only while no other profile shows, `unless` on the pointer, re-check after the write |
| C5, O-R3 | The grace repeats per navigation, about 600 ms | Accepted: one deadline at page load |
| C6 | "60 s from Create" starts at the wrong point | Accepted as wording: 60 s after the profile exists; OA-8 lists the value |
| C7, O-R12 | Updating covers the held frame; the 30 s self-release; `openPopup` waits out the hold | Accepted: a raw page, the route asserted under the barrier, skipped without the fixture, a never-Ready proof in `boot-triggers.test.ts`, screenshots under a post-listener hold |
| C8, O-R14a | The rollback inherits 30.5 minutes three times | Accepted: the page's own client; the rollback keeps 60 s |
| C9, O-R6 | OA-7 lets the column move; the grace; the planner's 60 s; reopening goes straight in; the register swap | Accepted: all on OA-7 and OA-8; merges held until signed |
| C10, O-R8 | F18, F22, F23, F29, the skip bound, I5 | Accepted: corrected |
| O-R4 | The doubling retry adds up to 1.5 s | Accepted: a flat 250 ms, measured in 4.4 |
| O-R7 | A failed first navigation still skips the check | Accepted: `router.isReady().catch` |
| O-R9 | The send boundary's "wait" branch is dead | Accepted: no epoch or hook; `sendEnvelope` checks `Connected` |
| O-R10 | The `rg` gate hits generated types and two comments; arc 5 shares a file | Accepted: listed in the file map; the intro corrected |
| O-R11, O-R14b, O-R14c | A keyless imported row's index lost to reconcile; a never-starting service holds `reset.vue` 30.5 minutes; a crash-loop after Ready keeps superseding runs | Known limits, filed at the close-out |
| O-R13 | Events before Ready unspecified | Accepted: dispatched from the current port in either state |

**Round 2** (Codex, resumed over the fixes): `reject`. Findings 2, 3, 5 to 10 FIXED. Each remaining item was checked at the tree and accepted:

| # | Finding | Disposition |
|---|---|---|
| R2-1 High (C1 not fixed) | A guard read that fails after Ready, with no later Ready, leaves its mark unreplayed | Accepted: the boot run's decision also replays a remaining mark |
| R2-new High | The replay's unconditional assignment after its awaits overwrites the profile the boot run selected (`route-guard.ts:47-52`; Codex reproduced it) | Accepted: the guard assigns only if still unset, with the split-read proof |
| R2-4 Medium (C4's fix) | A hand-off abandoned after the pointer write resolves and releases Create's latch | Accepted: it throws `ActivationSupersededError`. Found while checking it: a bootstrap of another profile in flight also passed the fence; the in-flight predicate closes it |

**Round 3** (Codex, resumed over the round 2 fixes): `conditional approve`. R2-1, R2-new and R2-4 FIXED. One condition, checked at the tree and accepted: the predicate over `inFlightBootstraps` misses an activation whose core finished but whose final session read is pending (`useProfileBootstrap.ts:142-144,175-180`); the predicate now spans each `bootstrapActiveProfile` call to settlement, with a proof that holds that read. The audit loop stops here at its third round; arc 4's own Codex loop re-reads the built fence.

**Arc 4 review, round 1** (`15881c7d..8e29450c`; Codex `01a13c6d-…` gpt-6.1-sol high, and one Opus agent alongside): Codex `CHANGES`, Opus `CHANGES`. Each item was checked at the tree:

| # | Finding | Disposition |
|---|---|---|
| C1 High | A forced replay of the unlock screen after the session unlocked redirects to `from`, itself, without end (Opus confirmed: no 30-hop cap in production) | FIXED 4d913436: never back to the route itself; proof red before |
| C2 Medium | A superseded guard whose read fails late marks the route the person left | FIXED 4d913436: only the latest navigation's guard marks or settles; proof red before |
| C3 Medium | The deadline check ran before serialization, so a large payload could still post past it | FIXED 4d913436: the check follows serialization; proof red before |
| O1 Medium | Deleting the open profile locks the popup off Delete Profile; the unmount's disconnect rejected the call and dropped the rest of the reset (no toast, the deleted profile stays selected) | FIXED 3c3263ad: the client outlives the page while a call runs; component proof red before |
| O2 Low | `??=` keeps the reset's `0`, so the guard selects nothing | FIXED 3c3263ad: assigns when falsy; proof red before |
| O3 Low | The grace counted from navigation start while the bar's delay counts from its render | FIXED 3c3263ad: the deadline is taken at `popup/index.ts` evaluation, as § Arc 4 words it |
| O4, C4 to C6 | Comments: a wrong event claim, a plan path, narration, a garbled line, a caller named, the grace contract stated three times; `hidden()` reads a class | FIXED; the test notes the e2e reads the computed visibility |

**Arc 4 review, round 2** (Codex, resumed over `8e29450c..3b579ef0`): `CHANGES`; C1 to C3 verified fixed. Two regressions, both checked at the tree:

| # | Finding | Disposition |
|---|---|---|
| R2-1 Medium | With the client now outliving the page, a deletion that returns after another profile was unlocked selected the first remaining profile, cleared its state and routed to the unlock screen (the 60 s shared client had the same path, much shorter) | FIXED: the tail drops the deleted profile, shows its toast, and leaves a session another profile took over; proof red before |
| R2-2 Medium | The self-redirect fallback sent a replayed unlock screen to Home, losing an own window's route when the replay cancelled the shell's push | FIXED: it goes where an unlock would (`postAuthRoute`); proof red before |

**Arc 4 review, round 3** (Codex, resumed over `3b579ef0..133460ca`): `APPROVE`, no findings; R2-1 and R2-2 verified. The loop closes at its third round.

**Arc 5 review, round 1** (`1a8b2b6d..de20bab6`; Codex `01a13d01-…` gpt-6.1-sol high, and one Opus agent alongside): Codex `CHANGES`, Opus `CHANGES`; each item checked at the tree:

| # | Finding | Disposition |
|---|---|---|
| C1 Medium, O2 | The unawaited push released Create's latch while a guard read kept the page up: a second click made a second profile | FIXED eee20090: the hand-off awaits its navigation and rethrows a failed one; proof red before |
| C2 Medium, O1 | A superseded activation failing later published the shell's failure toast over the hand-off's (the shell fences on its event sequence, which a supersede does not move) | FIXED eee20090: an event-driven activation overtaken by `supersedeProfileActivations` resolves false; proof red before |
| C3 Medium, O3 | No PRF found while confirming a kept credential: the window confirmed it forever (`confirmCreatedCredential` throws a bare `PasskeyPrfError`) | FIXED eee20090: the window confirms through `confirmMinted`, which wraps every failure; proof red before |
| O4 Comment | A hand-off from a page the person already left moved them out of their screen | FIXED 9bcb382a: no route, toast, pointer or supersede once the page is not current |
| O5, O6 Comment; test:all | A vacuous assertion; the predicate's doc; `toast-call-sites.test.ts` wants each `openToast` call a literal | FIXED (9bcb382a for the literals); O6's path (another window's unlock superseded by the create, then the create failing) left as is |

**Arc 5 review, rounds 2 and 3** (Codex, resumed): round 2 `CHANGES`, round 1's six verified; one Low, demonstrated: a person who pressed Back during the hand-off's pointer write still got the created profile selected, the unlock screen and the toast. FIXED 3e190ed7 (leaving joins the write's `unless` and ends the hand-off); proof red before. Round 3 `APPROVE`, no findings.

**Final cross-arc pass** (the six lane commits from `643c0c9` plus phase 3.4, read at `14236008`; Codex `01a13d90-…` gpt-6.1-sol high, and one Opus agent alongside). Round 1: Codex `CHANGES`, Opus `CHANGES`; each item checked at the tree:

| # | Finding | Disposition |
|---|---|---|
| X1 Medium (Codex) | `auth.vue`'s mount lookup waits for the service since arc 4, then selects the last active profile over one an activation opened meanwhile, or after the page left; demonstrated with HEAD's callback | FIXED d51d3111: it assigns only while mounted, locked and with the selection it started from; two proofs red on base, one control |
| X2 Medium (Opus) | Arc 4's unlock frame offers New profile, Import and Delete profile before the mount's boot run decides; that run then moved the person to the unlock screen (`select-and-auth`), losing what they typed. X1's fix removed the late lookup that hid it. Plausible but unverified | FIXED 5e060510: `isEstablishedAtDecision` compares the route at decision time with the one the run started on. Opus's route-name list rejected: it misses the reset page and restates the guard's exemptions |
| X3, X4 Comments (Codex) | The default-account docs still promised index 0; the activation doc said it opens the session | FIXED d51d3111 |
| X5 Comment (Opus) | `handleCreate`'s failure category is always "other" since arc 5's hand-off classifies its own; a garbled `openPort` docblock | FIXED 4f39285f: one fixed warn line; the sentence repaired |

Round 2 (Codex, resumed): `APPROVE`, X1 to X5 verified, no new finding. Round 3 (Codex, resumed over the close-out commits): `CHANGES`, four Lows, all text and each checked at the tree: the Outcome's arc 3 line overstated the reveal; #458 took a proof's 30-minute bound for the drain's and promised the deletion completes; #462 lacked the prerequisite that starts a hydrate (only an import's timeout recovery calls it); #465 dated the field to #454. All corrected; the code is as round 2 approved it.

### Deviations from the plan text (the tree wins)

- **Arc 2.** One deadline taken at entry covers the init and the delegate waits; `DEFAULT_INIT_TIMEOUT_MS` is exported from `background/index.ts`; three more PXE test files moved to the record shape; the shared `PortRegistry` fake passes the port to `onDisconnect`.
- **Arc 3.** 3.4 deferred (D-orch-7); 3.2's guards are mostly existing `auth.test.ts` cases; 3.3 added no e2e case.
- **Arc 4 revision, against the first plan's § Arc 4** (details in `lessons/phase-4.md`):
  - The reconnect boot ran "on Ready". It must not depend on Ready: it now runs on mount and on a drop (F21 to F23; shots findings 2 and 3).
  - OA-4's premise "the unlock screen while it is still deciding" held only for a popup open across a restart; a fresh popup is empty until `getProfiles` answers (F22), so the first screen is a change to make.
  - "The loader keeps today's timing under C" became the loader's removal, because Ready makes the flag false at every start (F24).
  - I3 is demonstrated (F19, #421). The send boundary became a deadline check before the post and a `Connected` check in `sendEnvelope`, which leave the offscreen transport alone (F18). Ready comes after the whole collection started, not from the 500 ms poll (F20) or one service's start (F35). `sw-resilience.test.ts` gains a held-boot case instead of the first plan's base-evidence case, because arc 2 already reads `lastError`.
- **Arc 5 build** (details in `lessons/phase-5.md`): P7-12 = B replaces the superseded and tail-failure rethrows with the open profile's home; the selection is captured when the page opens; the in-flight predicate counts the event-driven activations only (the 80-line budget; the hydrate-only case is a deep edge); P7-10 is phase 5.4; `activationFailureReason` moved to `unlockWait.ts`.
- **Phase 3.4 and the close-out** (details in `lessons/phase-6.md`): the fields stood where the plan names them after #454; the export pair's assertion sits in `full-passkey.pins.test.ts`, since the pair renders for passkey profiles only. The unchecked account reads and edits, listed as an item to file, are a known limit (#463): every extension page reaches those rows through `chrome.storage.local` directly, so a session check guards nothing. The hydrate-only activation case is a known limit too (#462). The account-file import's password field, outside P7-04, is #465.
- **Arc 4 build.** `reset.vue` disconnects its client on unmount only when no call runs, else when the call settles: a disconnect at unmount dropped the rest of a reset the lock had routed away from (O1). The type-roles surface inventory swaps `overlay:GlobalLoader` for `overlay:StartBar`.

## Delivery

No stack (D-orch-1, D-orch-4): each arc opens one PR against `dev` (`gh pr create --base dev`), without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter would skip a suite the change needs; arc 4 needs both suites, arc 5 smoke.

| Arc | Branch | Phases | Base | PR title (≤ 93 chars) | Issues |
|---|---|---|---|---|---|
| 1 to 3 | (merged) | 1.1 to 3.3 | `dev` | #253, #266, #422 | closed or referenced |
| 4 | `account-session-life-arc-4` (this branch) | 4.1 to 4.5 | `dev` `15881c7d` | `fix(messaging): calls wait for the background's ready, the popup opens on the unlock screen` | `Closes #157`, `Closes #421` |
| 5 | `account-session-life-arc-5` | 5.1 to 5.4 | `dev` `1a8b2b6d` | `feat(profile): create skips a taken address; a new profile that does not open says so` | `Closes #99, #100, #159`, `Refs #137` (D-orch-10) |
| 3.4, close-out | `account-session-life-closeout` | 3.4, cross-arc pass, close-out | `dev` `0266d1b2` | `feat(backup): password autocomplete on the backup forms; close account-session-life` | `Closes #208` |

- The close-out rides the last built change, phase 3.4, as its final commits (`implementations-plan/README.md` § Portable rules, rule 5).
- Each PR body says what changed and why, the validation runs with outcomes, the per-browser suite wall-clock before and after when it adds an e2e scenario, the records it quotes, and the screenshots. Merging is the orchestrator's call.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `15881c7d`. `code_review: off`, so step 1 is absent. What is specific here:

- **Review loop** per arc at its boundary, before its PR: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds (then `ARC_FAILED`). Arc map: "this is arc N of 5; arcs 1 to 3 are merged; arc 4 builds the Ready handshake and the start-up moment; arc 5 builds page 7's picks for arc 1's surfaces". Log each round in `lessons/phase-N.md` and § Audit verdicts.
- **Final cross-arc pass** after the last built arc: a fresh Codex session over the net diff from `643c0c9`, asking for seams between arcs, duplication across arcs and drift from this plan, in the same loop.
- **Close-out** ✓: the items it filed are on the Outcome's `Known limits:` and `Open items:` lines; #137 carries a comment for OA-9.
- **Teardown** after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/account-session-life/plan.md`, then `agent-worktree done account-session-life --merged`. This session did not enter through `EnterWorktree`; relay a refusal and stop.
