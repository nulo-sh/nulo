# Phase 2: arc 2 log

## Design consult before building (2026-10-11)

- Page 2's answers go beyond the plan in four places (ask 1 = C, ask 7 = B, ask 8 = B, and the four-cause shared label). Codex gpt-6.1-sol at high, read-only, challenged them before any code: **change before building**.
  - D1: accept the three ingress causes; capacity differs. The approval popup's estimate builds and caches a signed request before Allow, and that build can call `createAuthWit` (`execution/tx-request-builder.ts`), so a later capacity refusal cannot promise "before anything was signed". Accepted: capacity keeps today's row (D-impl-10).
  - D2: `entryEpoch === undefined` proves capture failed, not that the wallet locked: a profile reserved for deletion throws the same bare `Error("Wallet locked")`. Accepted: an explicit `WalletLockedError` for the no-session case only (D-impl-8).
  - D3: the 30 s close belongs in the page; watch the query flag immediately (a mount-only timer misses a same-document navigation), one timer, cleared on flag removal and on dispose. Accepted for phase 2.4.
  - D4: `session_ended` also files profile switches and same-profile re-unlocks during execution (`execution/service.composition.test.ts`), so "Stopped when the wallet locked" can name the wrong cause. The strings ship verbatim as signed; the conflict goes to OWNER-ASKS (D-impl-11).
  - Missed by me: arrival-time checks already suppress the queued row for an unusable account or unserved chain, so the new kinds label rows whose state changed while they waited; they do not add history for every refusal.

## Phase 2.1 (#83) and 2.2 (#86), 2026-10-11

- The no-account throws in `resolveNetworkAndAccount` were bare `Error`s; `NoUsableAccountError` (in-process, `packages/wallet-bridge/src/account-resolution.ts`) types them with unchanged messages. It is never a `WalletError`, so `toWalletResponseError` still answers the unclassified constant.
- `WalletLockedError` keeps the message "Wallet locked" and is a plain `Error` subclass: an RPC flattens it to that message, and every caller that matched the message still matches.
- The profile-binding refusal passes `"wallet_refused"` explicitly: its error is built at the guard and never reaches `queuedFailureKind`.
- The title side-channel is a module `WeakMap<Error, string>` in `contract-resolver.ts`, not a `refusalTitle` field on `ScopeViolationError` (D-impl-7): a WeakMap entry cannot reach `toPayload()`, `JSON.stringify` or `normalizeError`, and it also titles the plain `Error("Method not found")`. So `packages/extension-messaging/src/errors.ts` does not change, and the never-happens pins (absent from `toPayload`, `Object.keys`, JSON and `normalizedRaw`) live in `contract-resolver.test.ts`.
- `_transitionLocked` refuses a title on a non-failed stage with a `ValidationError`, so no caller can rename a live record.
- The composition case spies `planner.processAztecJsPayload` to throw a real binding refusal after the claim. Mutation: dropping `failedTitle` from the service adapter's forward turns it red (title stays the claimed name).
- Pins moved with the behaviour: `background.refusal-log.test.ts` (five rows: the claimed "SENTINEL-NAME" now reads "Transaction"), `background.legal.test.ts` (the Terms settle now pins the exact kind and title instead of `expect.anything()`), `dapp-send-executor.test.ts` (seven `markJournal` calls gain the untitled fourth argument).
- Lint slip: I ran root `bunx --bun tsc` and `bunx biome check` once each (root `bunx` fetches npm `@latest`); `git status` showed nothing stray. Switched to `bun run typecheck:all`, `bun run lint`, `bun run format`.
- Gate 2.1: `bun run lint` 0; `bun run typecheck:all` 0; `bun run --cwd packages/wallet-core test` 278 passed; `bun run test` 11258 passed, 4 skipped (first run red on 13 stale pins, fixed as above).
- Gate 2.2: same root run; `bun run --cwd packages/extension-messaging test` 385 passed; `bun run --cwd packages/wallet-bridge test` 681 passed.

## Phase 2.3 (#123 items 1-2), 2026-10-11

- `DappIdentityBlock` gains an `actionTestId` prop (testid only), so the e2e reads the line by testid.
- Before the request loads, the line reads "wants to connect on this network": the permission window's own fallback in the same expression (`capabilities/index.vue`), so no new word (D-impl-12).
- The "Connecting on" line lasts only until the check replaces the page; `connect-one-window.test.ts` records every distinct text of the line through a `MutationObserver` into `sessionStorage` (like the Enter repeats), so a reload between the pages loses none.
- `background.connect-window.test.ts` pins that the window is told the decoded chain id; mutation (a constant `chainId`) turns it red.
- The network-unavailable notice keeps "wants to connect to your wallet": no decision covers it.
- Gate 2.3: `bun run lint` 0; `bun run typecheck:all` 0 (first run red: three `discover()` calls in `dapp-interaction/service.test.ts` lacked the new `chainId`); `bun run test` 11265 passed, 4 skipped. Commit 3f59b27.

## Phase 2.4 (#124), 2026-10-11

- The interaction service returns `expiredUrl` (its own discover URL plus `&expired=1`, from the handle's request id), not the bare URL: the gate navigates to what it is given and never builds a URL (D-impl-13). A page-supplied `expiredUrl` in the answer is ignored (service test).
- `WindowReservation.expire()`: unstarted frees the slot; standby with a page moves to `closing` before the hook and the navigation, tombstones through the new `expired(id)` hook and navigates; a rejected navigation closes the window. A standby window attached without a page is closed as before.
- The discover page reads `expired` from the route (a computed over `router.currentRoute`), watches it immediately (Codex D3), keeps one 30 s timer cleared on flag removal and on unmount, and skips the live-request start when it mounts already expired, so the auth redirect cannot unmount the overlay. The expired overlay renders outside the `isLogined` wrapper, so a lock under it keeps it.
- `discover/index.test.ts` needed a `vue-router` mock (the page now reads the route) and `enableAutoUnmount(afterEach)`: earlier tests leave pages mounted, and every mount reads the one shared route ref, so 20 leaked pages each started the 30 s close.
- Pins moved: the abandonment table in `background.connect-window.test.ts` (an expired slot now keeps its window, and its only navigation is the expired page); the standby exits table's expiry row now reads "expiry of a window with no expired page".
- E2E: the plan said a stalled key exchange was out of the harness's reach. A busy loop scheduled on the playground's main thread (`setTimeout(loop, 0)` before Allow is clicked) blocks its half of the handshake on both browsers' process models, so `session-tabClose.test.ts` now carries the cancellation control (tab closed while connecting: window gone within 10 s, never on the expired page) and the expiry itself (overlay over the connect page, the run logs same-document or reload, OK closes it). This replaces the manual expiry check with a repeatable one.
- Mutations, each red: serving expiry through `releaseIfUnstarted` (3 cases: gate, background, abandonment), starting the page while expired (1 case).
- Gate 2.4: `bun run lint` 0; `bun run typecheck:all` 0; `bun run test` 11276 passed, 4 skipped. Commit 579006b.

## Phase 2.5 (#126), 2026-10-11

- The pin drives the real background and dispatcher through `background.connect-window.test.ts`'s handler: a lone `sendTx` on the established session files one queued record (control), then a batch holding a `sendTx` leg rejects with the batch refusal and files none.
- Gate 2.5: `bun run lint` 0; `bun run test` 11277 passed, 4 skipped. Commit 5909783.

## Phase 2.6 (#128), 2026-10-11

- Probe on the base build (the new `sim-methods.test.ts` #25 case run before the fix, Chrome, retry 0): red, the dApp received `"The wallet could not process the request."`, the unclassified constant. The worker log was not captured; the throw is PXE's own type check, `Cannot run public function as utility` (`@aztec-labs/pxe` 6.0.0-rc.1, `contract_function_simulator.js:183`), since `findFunctionBySelector` resolves `balance_of_public` from `nonDispatchPublicFunctions` and the name matches (moderate confidence).
- The type check sits after `assertSelectorBinding`: a mismatched name is still a scope refusal, so a dApp learns no function's type through a name it was not granted.
- `InvalidWalletArgumentsError.forMethod` fixes the message, so the code channel rebuilds it losslessly; `walletErrorFromPayload` already maps `INVALID_PARAMS`.
- Commit-msg hook refused `executeUtility` in a subject (subject-case); the follow-up `git add` then landed both staged sets in one commit, split again locally before any push.
- Mutation: removing the guard turns both refusal cases red.
- Gate 2.6: `bun run lint` 0; `bun run typecheck:all` 0; `bun run test` 11282 passed, 4 skipped. Commits a1a9593 (fix) and 4d56391 (opt-in shots of the refused-send card and detail).
