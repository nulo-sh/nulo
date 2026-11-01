---
plan: port-leak-1
tier: light
status: plan approved (Codex final approve); arc 1 in progress
issues: "#1435"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: fcc4da219
trunk: dev
post_implementation_hardening: not scheduled
---

# port-leak-1: the Connected app detail page closes the clients it opens

#1435: Settings › Connected apps › one app builds a network client and one account client per chain inside `fetchAccounts`, and its `onBeforeUnmount` disconnects only the session client. Each visit leaves those ports open until the popup closes. Recon: [recon.md](recon.md). Paths are under `apps/extension/src/` unless they name a package. One arc, one PR.

## Outcome & Quality Bar

- **For whom**: a person who opens connected apps' detail pages during one popup session; the worker that holds a port for each client.
- **Excellent**: (1) after the page unmounts, none of its clients holds a port, and none opens a new one; (2) the page reads, shows and logs exactly what it does today while it is mounted.
- **Good enough**: idle ports from other pages, and #457's reopen class elsewhere, stay as they are.

## Assumptions

**Facts**
- F1. `popup/pages/settings/connected-apps/[id].vue:110-141`: `new NetworkServiceClient()` (L111), `new AccountServiceClient()` per chain that has a network (L131); `onBeforeUnmount` (L202-204) disconnects `dappSessionService` only. The issue's claim holds at the base. One precision: a client opens a port only on its first request (F2), so a visit leaves one port for the network client when the session lists a parseable account, plus one per chain with a network.
- F2. Construction opens nothing; the first request opens the port and waits for Ready (`packages/extension-messaging/src/background/client.ts:77-99,209-213`).
- F3. `disconnect()` closes the port, ends a pending Ready and rejects every pending request with `new Error(CLIENT_DISCONNECTED_MESSAGE)` (`client.ts:101-108`; `core/base-client.ts:354-356`). A request after `disconnect()` opens a new port (closed known limit #457).
- F4. The popup's Vue error handler is `forwardVueError` (`popup/index.ts:95`): a client-disconnect rejection goes to `console.debug`, any other error to `console.error` (`wallet/logger/console-forwarding.ts:25-32`).
- F5. `getAccount(profileId, chainId, address)` takes the chain per call (`wallet/services/account/client.ts`, a passthrough), so one account client serves every chain. House shape: a page builds its clients at setup and disconnects each in `onBeforeUnmount` (`popup/pages/tokens/[id].vue:57-73,211-216`).
- F6. Siblings: `connected-apps/index.vue` builds one session client at setup and disconnects it (L46, L110-112); `DappSessionVerification.vue` and `GrantedCapabilitiesList.vue` build none. No sibling has the path, so the PR fixes one file.
- F7. No smoke e2e opens the detail page: `tests/e2e/update-replay.test.ts` opens the list only, and is skipped unless `NULO_E2E_UPDATE_FROM` is set (L657). Three network files open it: `type-roles-windows.test.ts:172` (an account row, so both reads end to end), `connect-check-window.test.ts:290`, and `authwit-variants.test.ts:128`, whose `setConnectedAppAuthorizations` (`fixtures/popups.ts:363`) opens the page, leaves it and opens it again in one popup, the defect's own path.

**Inferences**
- I1 (revised after Codex R1). Disconnecting the clients does not alone stop `fetchAccounts`. A read pending at unmount rejects (F3), but a read already settled whose continuation runs after the teardown sends its next request on a closed client, which opens a new port (F3). Codex reproduced that order with the real `ServiceClient` in memory: open, post, disconnect, continuation, open. In the browser the order needs the settle and the unmount in one task, which the page's own triggers do not produce: plausible but unverified at the page. The invariant also rests on every await in the chain being a request, a property of code outside the page. So the page fences its own reads (D2).
- I2 (narrowed). A read pending at unmount, or waiting for Ready, rejects with the disconnect error; that ends `onMounted`'s promise, and `forwardVueError` logs it at debug (F4). A disconnect between Ready and the request's send rejects with `RpcDisconnectedError` instead, logged at error (`packages/extension-messaging/src/background/client.test.ts:878`); that order also needs one task, and the lane leaves the logging rules as they are.

**Asks**: none for the owner ([OWNER-ASKS.md](OWNER-ASKS.md)). The panel settled D2 and D3.

## Architecture & Implementation

- **Cause**: the reads build their clients per call, outside the page's lifecycle, so the teardown never sees them.
- **Change** (`[id].vue` only): delete both constructors in `fetchAccounts`. Beside `dappSessionService` (section 7 of the SFC order), add `const networkService = new NetworkServiceClient()` and `const accountService = new AccountServiceClient()`; `fetchAccounts` uses them. Add `let unmounted = false` with the page's state (as `popup/pages/tokens/[id].vue:147`). `fetchAccounts` returns when `unmounted` after each read, and `onMounted` returns when it is set after `fetchSession`. `onBeforeUnmount` sets it first, then disconnects `dappSessionService`, `networkService`, `accountService`, in that order (the page has no composable or timer to order after them). No comment is needed: the shape is the house default.
- **File-level change map**: `popup/pages/settings/connected-apps/[id].vue`; its test `[id].test.ts`.
- **Not taken**: relying on the disconnect alone (I1); a composable (one page; CLAUDE.md § Composables); an account client per chain (F5); a terminal "closed" client state in `ServiceClient` (every caller; #457's disposition).

## UI impact

None. Nothing a person sees changes on any surface. Sign-off: decision page 94, P94-15 (signed 2026-11-01), option A: "Fix it: a small lane with the component test."

## Security & Adversarial Considerations

- **Invariant**: a page's clients hold no port after it unmounts.
- **Threat model**: no new trust boundary. Before the change, a session listing many chains, opened again and again, multiplied open ports (resource growth; exploitability unknown, and a dApp's control over the stored list is not established). After it, the page builds three clients whatever the list's length.
- **Logging**: no new log statement. Leaving the page now also emits the network and account clients' existing "Disconnected" debug lines (`client.ts:106`), and a read pending at that moment lands at debug (I2); none carries a secret or an address. Storage, crypto, permissions, supply chain: no change.

## Phase 1: the page owns its clients (#1435)

- Reproduce first: write the two tests below and run them against the base page. Both must fail.
- Change `[id].vue` as above.
- **Tests** (`[id].test.ts`): a colocated fake, no shared helper. A hoisted list records each built client by kind, and one log records every call. `disconnect()` rejects that client's unsettled calls with `new Error(CLIENT_DISCONNECTED_MESSAGE)` (from `@nulo/extension-messaging/errors`); an answer after that is dropped. A call after it is let through, as production opens a port for it. An answer may be held; the test settles a held call at once, as a response settles its request. The session client joins the same fake, so the existing cases keep their behaviour. `mountPage` seeds `app.profile` (`{ id: "p1" }`) and stubs `SettingItem` with its attributes falling through; the fixtures are production-shaped (a network `{ chainId }`, an account `{ chainId, address, name }`).
  - A, "every client the page builds is disconnected once": a session with two accounts on two chains (CAIP `aztec:<chainId>:<address>`, addresses `0x` + 64 hex below the modulus). The reads answer and both account rows render (the success control). Unmount. One client of each kind was built, and each `disconnect` ran once. Red at base: two account clients, and neither they nor the network client are disconnected.
  - B, `test.each` over two orders, the first `getAccount` held. (1) Unmount while it is out, then answer it as the worker would on a port nobody closed: the error handler (`global.config.errorHandler`) gets exactly one error, which `isClientDisconnectRejection` accepts. (2) Answer it, let the fake settle it, then unmount before the page's continuation runs: the handler gets nothing. In both, the call log does not grow after the unmount. Red at base for both (verified for order (1) with the draft): the page goes on to chain 2's reads. Order (2) is also red with the disconnects and no fence, so it is the test that proves the fence.
- **Validation gate**
  - From the root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run --retry=0 "src/popup/pages/settings/connected-apps/[id].test.ts"` and `bun --bun vitest run --retry=0 src/popup/pages/settings/`: green. A and B fail with the base page in place (`git show fcc4da219:<path>`).
  - E2E, from the root, one run at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/connect-check-window.test.ts tests/e2e/network/authwit-variants.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`: pass; record each wall-clock. Deviation from the lane brief: no smoke file opens the detail page (F7), so these three network files stand in on both browsers. They prove the page still reads and shows its accounts, not that its ports close; the component tests prove that.
  - `bun run check:plans` after staging: exit 0.

No e2e scenario is added: the defect is the page's teardown, which a component test drives exactly; e2e cannot count ports.

## Decision ledger

- D1. Clients at setup, one per service, closed in `onBeforeUnmount` after the session client. Not taken: per-chain account clients; a composable.
- D2. A page-local `unmounted` fence, checked after each read (Codex R1, I1). It is the house's page pattern and its lesson ("code paused across an await checks the live state after its last await"; a fence must be terminal, `implementations-plan/lessons.md` § Extension runtime), adds no lifecycle, and keeps the invariant inside the page instead of resting on the transport's await structure. Opus R1 dissents: I1's browser argument holds and no flag is needed. Kept, because the invariant then depends on code outside the page staying request-only between awaits, and the fence costs one boolean.
- D3. `fetchSession`'s catch turns any rejection into `router.push("/popup/settings/connected-apps")` (L94-97). Path: while the first session read is out, the page renders nothing (`v-if="session"`, L208), but the app shell's Header stays, and its network chip pushes `/popup/settings/networks` (`components/Header.vue:138-141,228-236`). The person taps it; `onBeforeUnmount` disconnects the session client (base behaviour); the read rejects; the catch sends the popup to Connected apps instead of Networks. A lock in that window is harmless (the auth guard keeps the popup on auth). Plausible but unverified: the window is one read on a fresh port, length not measured. Consequence: a wrong screen. It predates the lane, which does not change it. Settled: a separate open `bug` issue, #1486, deduplicated first (Codex R1: a wrong screen matters, the timing is unverified, the sign-off covers the leak). Rejected: a closed known limit (Opus R1, premised on no control to leave by, which the Header refutes); a fold-in (outside P94-15).

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | the page fences its reads (I1, D2), test B's second order; I2 narrowed; profile seeded and production-shaped fixtures; "no new trust boundary"; e2e does not prove port cleanup; D3 a separate open bug | none |
| Opus R1 | conditional approve | the call log ("no call after unmount") replaces the per-client record; `SettingItem` stubbed; `authwit-variants.test.ts` in the e2e gate; Logging names the "Disconnected" debug lines | no fence (D2); the real client over the shared port harness instead of the fake (the page test proves the page's contract, `client.test.ts` proves the port's; Codex R1 also judged the harness needless coupling); B red for the wrong reason (the draft's red was the second `getAccount`); D3 as a known limit (the Header refutes its premise) |
| Codex final (fresh) | approve | keep the fence (D2): B(2) verifies the page's contract, not a demonstrated browser race; D3 confirmed, filed as #1486 | none |

## Delivery

- One arc: branch `worktree-port-leak-1` to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, no labels at creation; add `e2e:extension-network` afterwards only if the path filter skips the network suite.
- Title: `fix(connected-apps): the detail page closes the network and account clients it opens` (84 characters).
- Body: the cause and the change; UI impact none, with the P94-15 quote; the sibling check (F6: only this page has the path); the gates with outcomes; no e2e scenario added; `Closes #1435`.
- The close-out lands as the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `fcc4da219`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, once over the arc's diff from `fcc4da219`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; a lessons promotion only if a gotcha generalizes (`lessons.md` is at its budget); #1486 already filed for D3; `STATUS.md` deleted; `git mv` to `archive/port-leak-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/port-leak-1/plan.md`, then `agent-worktree done port-leak-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phase 1 ✓ in implementations-plan/port-leak-1/plan.md, its gate passing in the transcript; the Codex loop converged on the diff from fcc4da219 (a resumed pass with no new material point, quoted); a ready PR to dev closing #1435; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/port-leak-1 from plan.md and lessons/: phase 1, its gate, the Codex loop, delivery, the close-out; never merge.
