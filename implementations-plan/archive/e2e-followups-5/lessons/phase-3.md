# Phase 3: arc gates, quality loop, delivery

## The fix loop

**Round 1** (started beside the Phase 2 gate, read-only, so the gate's tree was never edited under it; fixes applied after the gate was stopped).

- **Codex** (gpt-6.1-sol, high, session `01a1308e-42a0-7ca3-a150-026d701a1cf5`): **conditional approve.** No lock bypass under the trusted-port boundary: both logged-in writes check the captured fence with no yield before the write; superseded cores never become current again; the correlator drops duplicate responses; the guard is unchanged and hydration callers handle `null`. The shim keeps target identity; a broken window found still fails its readiness asserts; no assertion loosened; probe strings absent from both dists. Findings:
  1. P2: the 5 s race does not cancel the report; a stalled `windowsWithUrls()` holds the classic queue (close waits behind it) and keeps switching windows after the budget. **Accepted** (resolved by the Opus fix below).
  2. P2: recent exceptions keep no location, so a minified recursion stays unmappable. **Accepted:** first frame kept, printed 1-based.
  3. Minor: a test comment called the commit "the only report" of the URL; `errorFrames`' comment could shrink. **Accepted.**
- **Opus** (general-purpose, opus, final-diff review): **conditional approve.** Enumerated every `isLogined` writer: two set it true (both fenced after the final read with no await between), three set it false; joins inherit the old run's fence; each seal re-bumps it. Findings:
  1. **Material:** the report moved focus mid-test. `windowsWithUrls()` switches to every window, and the exception read is a privileged call that focuses the first browser window (FIREFOX.md row 42). `reconnectPlayground` lets its verify wait expire on every trusted reconnect, so in two Firefox network specs the report ran mid-test while the spec kept driving the browser. **Accepted, verified** (`fixtures/send.ts:15`). The report now reads only the handle list (no switch), BiDi's contexts, Puppeteer's pages and the watch's closes; the exceptions print at the launch's close, whose relay read already makes the privileged call.
  2. Nits: the abandoned read's queue hold (now ≤ 5 s, no switch); two URL-only waits pass against a broken window, as on Chrome (the close now prints its exception); the wiring test copies `markLocked` (known, proven by the forced e2e probe on the fix build). No change.
  3. Comments: the fence header and the supersede TSDoc now say a lock bumps the fence and superseded runs abandon setup; `hydrateKnownProfile`'s `null` names the supersede; `app.vue`'s lock-wins comment names the fence; "frames" → "messages" in `trackContexts`. **Accepted.**
- Commits `2583298` (harness) and `ce9c78b` (comments). Unit 71/71 (driver + bootstrap), lint and typecheck:all 0. Browser proof on Firefox (forced-throw build, `_probe-w4-proof`): the forced capability window and the licences tab found with their URLs; the forced `waitForTarget` failure listed four handles, four contexts, four pages and six watch closes; the close printed `<context>: Error: nulo:probe:forced-throw at moz-extension://…/assets/popup-….js:18:3437`.

**Round 2** (Codex resumed in the same session with the round-1 fix diff and these dispositions): **approve the fix diff.** All round-1 findings resolved: the report's only classic call is `listWindows()` (5 s, no switch), the exceptions keep a 1-based location, the comments are corrected, and the timeout path changes no focus. One new non-material comment error: "no context" does not mean BiDi never announced the window (`contextOf()` does not test announcement). **Accepted** (`docs(e2e)` commit). No new material finding, so the loop converged at round 2; no round 3.

## The final-head gate

On `64ac9a9` (`04bc780` added only the e2e skill's ledger rows), one stage at a time, retry 0:

| Stage | Result |
|---|---|
| lint, typecheck:all | 0, 0 |
| test:all | 0 (extension 742 files, 11,359 tests; every other workspace green) |
| test:ci-gating | 526 pass |
| armed Chrome and Firefox builds, probe grep over both | 0 hits |
| #322's CI replay (Firefox, seed `1960252198`, proverless) | 10 of 10 green, no recursion line |
| full smoke, Firefox | 51 files passed, 2 skipped (210 tests) |
| full smoke, Chrome | 49 files passed, 4 skipped (213 tests) |
| full network suite, Firefox, proverless | 113 files passed, 5 skipped (195 tests), `inflight-call-background-death` and `firefox-background-restart` (the `reconnectPlayground` specs) included |
| pinned `_cert-cap-window` × 20 | **not met (D18):** fix 11 of 20, base harness 14 of 20, no target-discovery timeout on either |

- The close-time exception print fired in 13 smoke and 12 network launches. All but `page-error-capture`'s (its own three throws) were the worker-restart cascade's `Client disconnected`, which the fixture already drops from the arrays; the print stays unfiltered, being the one place that shows what the arrays drop.
- **The pinned stage.** First attempt, everything pinned, the sandbox included: the Aztec node missed its 90 s health deadline and no test ran (exit 86). Second attempt: `run-pinned-net.sh` let the sandbox boot unpinned and, at `boot-ready`, pinned the runner's other processes (vitest and its worker; geckodriver and Firefox inherit it, masks read back as `0x10`) beside three busy loops on CPU 4. Fix 11 of 20: 7 at `switchToLocalNetwork`'s 5 s, 2 at `approveConnect`'s Allow click (10 s) in the discover window `waitForPopup` had found. Base harness, the same way: 14 of 20: 5 at `switchToLocalNetwork`, 1 at `waitForConnectedStatus` (30 s). The tree was restored and `git status` clean after.
- **Consult (Codex, same session):** the budget-shift reading holds (high); "mount exceeded 10 s" is not proved: the two reds establish only that Allow was not clickable in its budget (mount, initialisation or render). Choose A, conditional on the orchestrator's explicit gate exception; reject B (moving readiness into `waitForPopup` grants more time before the click deadline and changes Chrome's contract); no other seam regression is established, but "zero seam failures" overclaims: there were zero target-discovery timeouts. Recorded as D18 in those terms.
