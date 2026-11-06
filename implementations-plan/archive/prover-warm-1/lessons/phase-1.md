# prover-warm-1, phase 1: the probe

Every launch ran through `agent.sh` at retry 0, one at a time, from the worktree root. Numbers, hashes and deviations: [../recon.md](../recon.md) § Probe.

## Attempts

1. **Chrome runs 1-3 plus the constrained run 4:** exit 1, then 3 failed and 1 passed. Every C, H, S0, W and split record was complete; the A arm failed on a probe bug, and Resource Timing counted no WASM fetch.
2. **Firefox runs 1-3 plus the constrained run 4:** 4 of 4 passed, using the fetch counter and the A-arm fix.
3. **D2's added pairs, Chrome runs 5-6:** 2 of 2 passed, including the A arm.
4. **D2's added pairs, Firefox runs 5-6:** the first launch was stopped in setup by the driver's tool time limit: the run was backgrounded inside a foreground call. The relaunch, detached, passed 2 of 2.

## What bit

- **`e2e:agent` is a root script.** `bun run e2e:agent` fails with "Script not found" from `apps/extension`. `agent.sh` changes into it itself, and spec paths stay relative to `apps/extension`. The plan's Phase 2 gate command was corrected to run from the worktree root.
- **Resource Timing does not list an extension-scheme fetch on Chrome.** The bb WASM is fetched from `chrome-extension://`, and `performance.getEntriesByType("resource")` showed none. Count at the fetch shim instead.
- **`chrome.offscreen.closeDocument()` throws when no document is open** ("No current offscreen document"). A helper that may run after the page was already closed must check for a live page first.
- **A wait inside a foreground tool call cannot exceed its time limit.** Launch a run longer than ten minutes with the tool's own background mode, never with `&` inside a foreground call.

## Reading

- The removable init is 1.2-1.6 s, while the proof itself varies by 3.7-6.5 s between pages of one shape on a shared host. Five pairs per browser put both medians under 1 s.
- Even the whole init falls short of the issue's 2 s bar on either browser.
- At the median, a warm-up at window open makes the review 0.6-0.7 s slower (R4), because it competes with the fee estimate for the PXE page.
