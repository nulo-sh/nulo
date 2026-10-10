# Phase 2: arc 2 log

## Branch

- Arc 1 merged as fd47407 (#253, squash), so arc 2 is `account-session-life-arc-2` cut from `origin/dev` at fd47407 (D-orch-4). The worktree's old branch tip 4f23ba3 has no content beyond fd47407.

## Arc 2 design asked first (D-orch-6)

- Codex (`gpt-6.1-sol`, high, session `01a12405-c32c-7a61-aa62-ac211ca2740a`) and an Opus 5.5 general-purpose agent, both read-only, were asked the three design questions first, in parallel with phase 2.1's code. Verdicts and dispositions: plan.md § Audit verdicts, "Arc 2 design asked first".
- Codex 1c found the one hole: the popup's profile client gives `deleteProfile` the default 60 s (`DEFAULT_RPC_TIMEOUT_MS`, no override), and the plan's delegate wait, stacked on `ensureInitialized`'s own 30 s, could spend 60 s before the first write. Checked in the tree. The arc-2 part is fixed in phase 2.2: one 30 s budget covers both waits, so the call reaches its first write no later than today. The rest is pre-existing and visible: `reset.vue` promises "up to ~30 minutes" while the RPC gives up at 60 s and shows "Couldn't delete profile. Try again" as the background keeps deleting. That is OWNER-ASKS OA-5, not built.
- Codex 1c also checked every registered service's start: none awaits the offscreen document, a READY or a PXE RPC, so a cold offscreen does not delay the coordinator's start.

## Phase 2.1: transport hardening

- Built as planned. `closeReason(port)` reads `chrome.runtime.lastError` and `port.error` on every remote close, before the client's own `disconnect()`, and logs `{ reason: "runtime.lastError" | "port.error" }` at debug, never the error's text. chrome-types declares neither property, so both reads cast, as `core/adapters/chrome-browser-api.ts` already does.
- The shared `PortRegistry` fired `onDisconnect` listeners with no argument; the browser passes the port. The fake now passes it, and its own test pins that.
- The server disconnects an untrusted sender's port right after its existing warn line. A port named for another service is still left open, now pinned: every service sees every `onConnect`, so closing it would kill a sibling service's port.
- `connectServiceClient` gained an optional `sender` so the test can open a port as another extension.
- Red/green against the fd47407 copies of `client.ts` and `service.ts`: both new proofs fail, every guard passes.

## Phase 2.2: the delegate wait

- `setDeletionDelegate` resolves a one-shot `Promise.withResolvers` (Chrome and Firefox 153 both have it). `awaitDeletionDelegate` takes the deadline at entry, awaits `ensureInitialized`, then races the injection against the time left. It holds no lock and writes nothing; at the bound it throws the existing "deletion coordinator not ready". `DEFAULT_INIT_TIMEOUT_MS` is now exported from `@nulo/extension-messaging/background` (a private package, not one of the three npm-staged ones).
- Tests (fake timers, a service started without a delegate): a delete started before the delegate waits past 29 s, a rename completes meanwhile (no lock held), and the delete completes once the delegate is set (new proof); with no delegate it refuses at 30 s with no tombstone, the row present and the id unreserved (guard); a delete that arrives before init finishes at 20 s refuses at 30 s from its start, not 50 s (new proof for the shared budget, red on a variant that starts the delegate's clock after init).
- Red/green against the fd47407 `profile/service.ts`: the wait proof and the shared-budget proof fail; the guard passes.

## Phase 2.3: dead generations and joined clears

- `profileLifecycles` holds `{ current?, dead, clearing? }` per profile. `clearProfileState` joins a same-generation erase in flight (published synchronously, removed in `finally` so a retry after a failure runs a fresh erase), refuses another current generation, no-ops a dead one, else marks `deleting` and runs `eraseProfile`, which re-checks ownership after the barrier. Provision refuses `deleting`, any dead generation and `live` under another one. `assertGenerationCurrent` refuses a dead capture before the no-current fallthrough. The orphan sweep's `has` check is unchanged in meaning.
- Three existing test files read the old map shape (`service-idb-delete`, `store-key-decode`, `incarnation-fence`) and were updated to the record. The tick-count pin in `service-idb-delete.test.ts` ("await shape") still reads 2 and 2: the lifecycle and barrier updates stay inside the erase.
- New proofs, each red on the fd47407 `pxe/service.ts`: a clear of the next generation with no provision between; every erased generation stays refused after a second deletion (provision and op), with a fresh one admitted; two clears of one generation erase once; a failed erase rejects both joined callers and the retry runs exactly one more erase (Codex 1b's addition). Guard: the orphan sweep skips a profile with only dead generations (`service-sweep.test.ts`).

## Arc 2 review

- Codex round 1 (session `01a12413-2d7f-7bd3-8a94-a662d0da92ea`): CHANGES, one Medium. The shared budget was measured with `Date.now`, so a wall-clock change mid-wait stretched or cut it. Fixed with `performance.now()`. `vi.setSystemTime` moves `Date` but not `performance.now()` under vitest's fake timers, which is what lets one test prove both directions; both cases fail on the `Date.now` copy.
- Opus: APPROVE, with one Low: `Promise.withResolvers` was the first ES2024 built-in in production code and would have raised the Chrome floor past the 116 the code states, silently (no polyfill under `esnext`). `deferred()` in `@nulo/wallet-core/utils` already does the job; look for it before reaching for a new built-in.
- Codex round 2: APPROVE, no findings. Closed at round 2 of 3.
- zsh does not word-split an unquoted `$VAR`: `bun run test:e2e -- $FILES` passed one argument and vitest found no files. List e2e files inline (or use an array).

## Arc 2 boundary gate

- `audit:vue` 0 on eeb3303, before the review fixes; lint, typecheck:all and test:all 0 again on cdcdad1, after them. Smoke on an armed build, retry 0: Chrome `security-reset`, `passkey-paths`, `duplicate-phrase-import`, `sw-resilience` 4 files, 10 passed, 1 skipped (a permanent `test.skip` in `sw-resilience`); Firefox the same 4 files, 9 passed, 2 skipped (that one and a `skipIf(isFirefox)`).
- Network, retry 0, each step started only on a free host (the `e2e-harness-gaps` lane held it for about an hour, back to back): Chrome `profile-reimport-matrix` 3/3 and `firefox-background-restart` skipped (Firefox-only); Firefox both files 4/4; proverless Chrome `backup-restore-sw-restart` 3/3; proverless Firefox the same file 3 skipped (`CHROME_ONLY.backgroundKillUnderPage`).
- Host etiquette in practice: a lane with queued network files re-takes the host within a second of releasing it, so a "free" poll followed by a separate launch loses the race. A runner that polls and launches in one script (detached with `setsid nohup`, so a tool timeout cannot kill a run mid-sandbox) got each step in as the lane's runs paused.
