# Phase 1: arc 1, the egress guard

Every meaningful attempt of arc 1, in order. Commands ran from the worktree on Linux, Chrome and Firefox as the locked Puppeteer pins them, at `--retry=0`.

## Phase 1.1 (2026-10-10)

`fixtures/egress-guard.ts` and 17 unit cases. Gate (lint, `typecheck:all`, `test`): pass. The guard's and canary's ports are drawn as the harness draws its own (`reservePort(registeredPorts())`), bound, then claimed in `~/.agents/ports.md` until `stop()` (the orchestrator asked that the guard claim through the registry, never a hardcoded port).

## Phase 1.2: routing and the first whole run (2026-10-10)

- `scripts/e2e/browser-seam.test.ts` forbids a browser test in `fixtures/**`, so the browser's own hosts live on each driver (`ownHosts`), not in `egress-guard.ts`; a host listed for one browser fails on the other. Recorded as a deviation in the plan.
- Two smoke files on Chrome behind the guard (`fiat-display`, `navigation`): 7/7, each launch's canary recorded at the guard and never at the canary.
- **Whole smoke, Chrome, run 1** (armed dist, guard on): 6 files failed, 10 tests; 41 passed, 3 skipped (50 files, 1,505 s). The recorded host list held only declared and listed hosts across 78 launches; the canary counted zero on every launch. Hosts seen (launches out of 78): `update.googleapis.com` 79 entries, `clients2.google.com:80` 78, `accounts.google.com` 78, `www.google.com` 78, `egress-canary.test` 78, `api.coingecko.com` 53, `lb.drpc.live` 53 (2 to 99 attempts each: the node client retries), `android.clients.google.com` 27.
- Failures, all node-bound: `security-reset` (purge incomplete after 15 s, the profile's tombstone still set), `passkey-backup` and `passkey-paths` (the reset never reaches its route), `settings-crud` (deleting a network row, then four navigations in the same file-scoped launch), `send-keyboard` (the fee method picker), `rows` (rows never hold still).

### Stop rule (phase 1.2 step 12): the failures trace to the refused node

| Run (same armed Chrome dist, the six files) | Result |
|---|---|
| guard off (local, uncommitted switch) | 27/27 pass, 142 s |
| guard off, `lb.drpc.live` alone refused in-browser (`interceptRpc` refuse, local) | the same 10 fail, 269 s |
| guard off, `lb.drpc.live` answered by a loopback stub with HTTP 400 (`interceptRpc` redirect, local) | 26/27; only the fee-method-picker case fails, 154 s |

- The node client retries every network error with a 1 s, 2 s, 3 s backoff and stops only on a 4xx (`packages/aztec-runtime/src/utils/fetch.ts`). A refused tunnel is a network error, so each node call the wallet awaits costs about 6 s, and profile deletion waits for the PXE's in-flight work (`#266`'s coordinator).
- The price host is not involved: refusing the node alone reproduces every failure.
- The fee-method-picker case needs a fee method to finish loading, which needs real fee data from a node: neither refusal nor a 400 stub gives it one.
- Conclusion: 10 smoke tests in 6 files pass today only because the live Testnet node answers, which is #171's complaint made concrete. Arc 1 as planned (refusal, no build input changed, D2 and D-orch-2) cannot keep smoke green at retry 0. The plan's fallback F2 (a build seam that points the Testnet seed at a loopback stub) changes build inputs, which D-orch-2 forbids. The panel is consulted next.

## Firefox, first evidence (2026-10-10)

- The first guarded Firefox run was stopped after one file: Firefox's remote-settings sync also reaches `firefox-settings-attachments.cdn.mozilla.net`, which no list held, so every launch failed at its close with a message naming the host, the browser and where to list it (the check working as designed).
- Pref first (phase 1.3 step 2): `services.settings.server` set to `data:,#remote-settings-dummy/v1` at launch, the value the Remote Agent itself applies once it starts, did not stop it (same counts: about 5, 17 and 20 attempts to the three hosts per launch). Reverted; the three exact names are listed in `FIREFOX_OWN_HOSTS`.
- The control spec passes on both browsers, 6/6 each, none skipped: the background's HTTPS probe refused and recorded, loopback direct from the background, plain HTTP, `ws://` and `wss://` each reaching the guard on its own increase, IPv6 loopback direct, link-local recorded, and with the guard stopped neither the background nor the page reaches the canary. On Firefox the background probe runs through the driver's sandboxed evaluation and settles as on Chrome.

- **Whole smoke, Firefox, run 1** (armed dist, guard on): 7 files failed, 13 tests; 43 passed, 1 skipped (51 files, 2,588 s). The same 10 node-bound tests as on Chrome, plus 3 in the Firefox-only `passkey-toolbar-panel` (a passkey import or restore never completes; attribution below). Across 128 launches the canary was recorded at the guard every time and counted zero direct connections, and no undeclared host appeared. Hosts seen (launches out of 128): `egress-canary.test` 128, `content-signature-2.cdn.mozilla.net` 125 (3 to 41 attempts), `firefox.settings.services.mozilla.com` 124 (5 to 37), `firefox-settings-attachments.cdn.mozilla.net` 119 (17 to 97), `api.coingecko.com` 101, `lb.drpc.live` 100 (2 to 109), and the control spec's `egress-probe.test` and `169.254.0.1` once each.

## Stop rule, panel consult (2026-10-10)

- Codex (resumed session): hold now; F2 if the orchestrator authorises it. A 400 stub proves a terminal RPC error, not an offline connection; F2 gives both browsers one loopback transport before the first node request; Firefox redirect semantics and competing interceptors are unproven.
- Opus (Plan): a harness-only fast-400 stub through in-browser redirect, if a Firefox probe passes; split the fee-picker case, keeping its node-free steps in smoke and moving the pick to the network suite, which narrows that step's Firefox gate on `main` from required to advisory.
- Decision: both routes need an orchestrator decision (D-orch-2 for F2; the fee-picker relocation narrows a required gate under either), so arc 1 holds. The Firefox probe runs locally so the decision rests on facts.

## The stub probe, Firefox (2026-10-10, local only, reverted)

Opus's condition for option 2. A local patch, never committed: Firefox's interception gained a `redirect` mode (`channel.redirectTo` inside the parent-process `http-on-modify-request` observer), and each guarded launch, once settled, started a loopback stub claimed through the registry that answers every request with HTTP 400 and a JSON-RPC error body, then redirected `https://lb.drpc.live` to it.

| Run (armed Firefox dist) | Result |
|---|---|
| `passkey-toolbar-panel` (Firefox-only), guard off | 5/5 pass, 124 s: its three guarded failures come from the guard |
| the six node-bound files plus `passkey-toolbar-panel`, guard on, node redirected to the 400 stub | 31/32 pass; only the fee-method-picker case fails (no fee method loads, `send-keyboard.test.ts:122`) |
| Chrome (CDP `Fetch` redirect, armed after settle): the six node-bound files, guard on, node redirected to the 400 stub | 26/27 pass, the same single failure; over 15 launches the stub saw 318 POSTs and no `OPTIONS`, and the guard recorded no `lb.drpc.live` attempt, so no node request left before the redirect armed in these files |

- Every condition Opus set holds on Firefox: the stub saw 496 POSTs with their bodies (67 and 78 bytes) and no `OPTIONS`; the client read the 400 as a 4xx, inferred from the specs that fail on a refused node passing (an unreadable reply would be a retried network error); across 20 launches the guard recorded no `lb.drpc.live` attempt at arming or after (the observer saw every node request; none left before settle), the canary was caught every time, and no CSP violation was reported.
- The redirected request carries `Origin: null` (a cross-origin redirect), which the stub ignores; nothing in the wallet reads it.
- Codex's worry, that a bare `redirectTo` lacks the synthetic CORS handling Firefox's own `WebRequest.sys.mjs` adds around it, did not bite on this path: the extension's host permission for loopback covers the response.

## The panel after the probe, and the fee picker (2026-10-10)

- Codex, re-consulted with the probe's results: option 2, conditioned on a spec's own refusal taking precedence over the launch's redirect, and on a seeded-sponsor fixture for the fee picker. Both panel legs now agree; the hold above is lifted (plan D23 to D25).
- The fee picker needs a pickable row, not a node: with the two protocol FPC rows stored (`nulo:core:fpcs@…`, the canonical addresses `protocol-fpcs.test.ts` pins), `getFpcs` returns without discovery and Nulo's sponsor is eligible with no gas balance. With the guard and the stub, `send-keyboard.test.ts` passes 5/5 on Chrome (33 s) and Firefox (60 s).
- The old assertion could not tell a pick from a no-op: the only pickable row is the one already showing. With Enter replaced by Escape, the `data-fee-method` wait passed and only the new saved-pick wait (`nulo:ui:sendFeePaymentMethods`) failed.

## The whole-smoke runs with the stand-in, and a background kill (2026-10-10)

On the tree merged with `dev` at `236a2cd` (#270), armed dists rebuilt, retry 0:

| Run | Result |
|---|---|
| Chrome, runs 1-3 | 204/206 each (11 skipped); the same two `sw-resilience` tests fail every time: "an open popup outlives the kill" (`waitForWorkerLiveness` times out) and "strict mode default ON" (the lock screen never comes) |
| Firefox, runs 1-2 | 207/207 each (10 skipped), 1721 s and 1769 s; run 3 was stopped once the fix below changed the fixtures |

Isolated in a throwaway worktree on the same build, `sw-resilience` alone on Chrome:

| Variant | Result |
|---|---|
| A: as built, interception log on | 2/4 fail as above; no interception failure, no new service-worker attach after any kill |
| B: no stand-in (node refused at the guard) | 4/4 pass, so #270 is not the cause |
| C: stand-in on, auto-attach without `waitForDebuggerOnStart` | 2/4 fail, so it is not a target held for the debugger |
| D: stand-in on, its interception stopped for the kill and re-armed after | 4/4 pass |

- Cause: a DevTools session attached to Chrome's stopping service worker keeps its host for the successor, the hazard `stopBackground`'s own comment names, and the stand-in's interception holds one for the launch's life. Firefox's observer lives in the parent process and attaches to nothing.
- Fix (plan D26): `stopBackground` suspends the launch's held interceptions for the kill and re-arms them after; a spec's own stays armed. After it, `sw-resilience`, `sw-restart-network`, `imported-account-lifecycle` and the control spec pass on Chrome (13/13, 1 skipped) and Firefox (12/12, 2 skipped).

## The phase 1.2 gate: six whole-smoke runs (2026-10-10)

At `a76aa2a` (merged with `dev` at `236a2cd`), armed dists, retry 0, the two browsers' batches side by side:

| Browser | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Chrome | 206/206, 11 skipped, 1,252 s | 206/206, 1,230 s | 206/206, 1,238 s |
| Firefox | 207/207, 10 skipped, 1,720 s | 207/207, 1,776 s | 207/207, 1,706 s |

- Every launch's canary counted zero (126 launches per Chrome run, 128 per Firefox run), and no undeclared host appeared. The stand-in answered about 1,600 node requests per Chrome run and 1,830 per Firefox run.
- Hosts at the guard, every run: Chrome's `accounts.google.com`, `update.googleapis.com`, `www.google.com`, `clients2.google.com` (port 80) and, in about 27 files, `android.clients.google.com`; Firefox's `content-signature-2.cdn.mozilla.net`, `firefox-settings-attachments.cdn.mozilla.net` and `firefox.settings.services.mozilla.com`, hundreds to thousands of retries each; `api.coingecko.com` in 43-44 files; the canary; and the control spec's `egress-probe.test` and `169.254.0.1` once.
- `lb.drpc.live` reached the guard once in each Chrome run (`sw-resilience`'s kill window or `contacts-import`'s own interception swap) and once in Firefox run 2 (`contacts-import`): the cases the declared reason names.
- Durations: against the first guarded runs with the node refused (Chrome 1,505 s, Firefox 2,588 s), the stand-in saves about 270 s and 850 s. Today's CI smoke on `dev`-based PRs, unguarded, spends 1,261 s (Chrome) and 1,617 s (Firefox) summed over three shards on its own runners; this PR's shards are the like-for-like comparison.
- After the Opus follow-ups on the kill fix (the re-arm tells Chrome the background may be down), `sw-resilience`, `sw-restart-network`, `imported-account-lifecycle` and the control spec pass three times on each browser (Chrome 13/13, Firefox 12/12).

## Phase 1.3 step 10: smoke in a network namespace (2026-10-10)

- `unshare -rn sh -c 'ip link set lo up && …'` does not start on the development host: `unshare: write failed /proc/self/uid_map: Operation not permitted`. A bare `unshare -U` runs, so it is the uid map AppArmor refuses (`kernel.apparmor_restrict_unprivileged_userns = 1`). Lifting that is a root-level host setting, so the namespace run was not made; the canary and the negative proof stand in for it.
