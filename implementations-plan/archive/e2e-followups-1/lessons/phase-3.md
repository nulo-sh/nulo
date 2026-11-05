# Phase 3: the heavy-shard triage (#1300)

Firefox 153.0.4 headless, the proverless network build `e2e:agent` builds, at `65fed7968` (the test tree of `5ef0c119d`), retry 0, `VITE_NULO_FEE_MULTIPLIER=10`, the shard's two files under `taskset -c 180-183` (four CPUs, as on the CI runner). The host was loaded by other lanes (load 100-170 on 188 CPUs). The probe was a scratch copy of `same-token-concurrent-sends.test.ts`, run with `concurrent-sendtx-confirm.test.ts` behind it as in the shard; it opened no page and moved no focus, and was deleted after the runs.

- Every `reopen` (and the background-restart case's) armed, in the reopened popup, a 250 ms route trajectory (`location.hash`, `data-service-ready`, `shownOverlays`, `visibilityState`, `hasFocus()`) and a 100 ms stall sampler counting gaps over 200 ms while visible. A sampler that never armed counts as missing, never as "no gap".
- The Urgent case kept B's row on every poll, the review sheet's `send-review-fee-cap` text through a MutationObserver plus a capture-phase `pointerdown` on `send-review-submit`, the same-shape tx rows with their `createdAt`, and B's built fee on a throw.
- Plant check: a 2 s busy loop planted in a reopened popup showed as a 1,939 ms gap; the quiet run showed none over 1 s.

## 2026-10-28 · The 10 runs

| Run | Outcome | Wall-clock | Slow-script kills | Reopens (timed out, unarmed) | Max open / to Home | Trajectories over 5 s | Gaps over 1 s |
|---|---|---|---|---|---|---|---|
| 1 | rc=0, 17/17 green | 809 s | 1 (aztec-labs-kv-store~offscreen~index.ts) | 20 (0, 0) | 1239 / 503 ms | none | none |
| 2 | rc=0, 17/17 green | 790 s | 0 | 20 (0, 0) | 1134 / 481 ms | none | none |
| 3 | rc=0, 17/17 green | 750 s | 0 | 20 (0, 0) | 969 / 482 ms | none | none |
| 4 | rc=0, 17/17 green | 801 s | 0 | 20 (0, 0) | 1219 / 493 ms | none | none |
| 5 | rc=0, 17/17 green | 814 s | 0 | 20 (0, 0) | 1151 / 594 ms | none | none |
| 6 | rc=0, 17/17 green | 832 s | 0 | 20 (0, 0) | 1086 / 612 ms | none | none |
| 7 | rc=0, 17/17 green | 863 s | 0 | 20 (0, 0) | 1295 / 532 ms | none | none |
| 8 | rc=0, 17/17 green | 934 s | 0 | 20 (0, 0) | 1048 / 533 ms | none | none |
| 9 | rc=0, 17/17 green | 950 s | 0 | 20 (0, 0) | 2343 / 1543 ms | none | none |
| 10 | rc=0, 17/17 green | 894 s | 0 | 20 (0, 0) | 1640 / 624 ms | none | none |

Per-test durations, seconds (retry 0, Firefox, proverless, four CPUs):

| Test | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| different tokens | 132 | 141 | 126 | 129 | 146 | 139 | 148 | 161 | 142 | 145 |
| private on public FJ, public on private FJ | 18 | 19 | 19 | 19 | 18 | 19 | 19 | 19 | 19 | 24 |
| two sponsored public | 16 | 18 | 15 | 15 | 18 | 16 | 19 | 18 | 16 | 21 |
| public to private, two recipients | 16 | 18 | 16 | 17 | 17 | 17 | 18 | 17 | 17 | 17 |
| private, then private to public | 35 | 33 | 33 | 34 | 34 | 37 | 36 | 35 | 34 | 38 |
| public to private, then private | 33 | 36 | 31 | 34 | 35 | 35 | 35 | 39 | 34 | 37 |
| two private on Nulo's sponsor | 41 | 38 | 38 | 40 | 39 | 38 | 41 | 40 | 36 | 44 |
| two public on private FJ | 40 | 36 | 35 | 38 | 38 | 37 | 40 | 38 | 35 | 45 |
| after a background restart | 47 | 42 | 44 | 44 | 44 | 48 | 46 | 52 | 46 | 49 |
| first private, two tokens | 38 | 34 | 34 | 39 | 35 | 41 | 37 | 39 | 57 | 46 |
| two windows: waits at queued | 43 | 40 | 39 | 46 | 43 | 46 | 43 | 46 | 62 | 53 |
| two windows: cancelled | 31 | 30 | 28 | 33 | 30 | 32 | 32 | 34 | 44 | 38 |
| Send-page confirmed, dApp proves | 36 | 26 | 27 | 32 | 26 | 31 | 40 | 34 | 60 | 38 |
| Send-page held, dApp waits | 44 | 35 | 36 | 39 | 38 | 39 | 44 | 39 | 50 | 41 |
| after a full-backup import | 70 | 65 | 64 | 69 | 69 | 71 | 77 | 68 | 86 | 62 |
| the Urgent re-ask case | 48 | 45 | 47 | 48 | 47 | 49 | 50 | 47 | 51 | 45 |
| concurrent-sendtx-confirm (file 2) | 44 | 35 | 38 | 44 | 42 | 43 | 55 | 43 | 43 | 35 |

B's trajectory (the Urgent case):

| Run | Stages polled | Basis | Queued cap = queuedFeeCap(basis) | Re-ask fee | Review line at the press = basis cap text |
|---|---|---|---|---|---|
| 1 | queued → simulating → queued (re-ask) → proving | 120151315199160 | ['150000000000000'] = 150000000000000: True | 250315239998250 | ~0.00015 FJ ($0.001): True |
| 2 | queued → simulating → queued (re-ask) → proving | 106055352368280 | ['132000000000000'] = 132000000000000: True | 220948650767250 | ~0.000132 FJ (<$0.001): True |
| 3 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |
| 4 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |
| 5 | queued → simulating → queued (re-ask) → proving | 110082773167920 | ['137000000000000'] = 137000000000000: True | 229339110766500 | ~0.000137 FJ (<$0.001): True |
| 6 | queued → pending → simulating → queued (re-ask) → proving | 106055352368280 | ['132000000000000'] = 132000000000000: True | 220948650767250 | ~0.000132 FJ (<$0.001): True |
| 7 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |
| 8 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |
| 9 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |
| 10 | queued → simulating → queued (re-ask) → proving | 114781429659960 | ['143000000000000'] = 143000000000000: True | 239127978458250 | ~0.000143 FJ ($0.001): True |

- No reopen timed out or left its sampler unarmed; the slowest reached Home in 1.5 s (run 9, the host's peak), against `waitForHash`'s 15 s. No sampler saw a visible gap over 200 ms, so no stack was needed and no profile ran.
- The one slow-script kill (run 1) was in the offscreen document's kv-store chunk during the full-backup import case, with no reopen open.
- B was asked again once in every run, with the queued cap equal to `queuedFeeCap` of the seeded basis, and the review line at the press naming that cap. Of the 34 tx rows each run held at the press, the seed was the only Urgent one (the other two on public Fee Juice were A at Fast and one at Normal), so no newer row could be the basis. B's built fee was never needed: no run threw.
- Neither fingerprint reproduced. Per file, the probe's 16 tests took 632-790 s and `concurrent-sendtx-confirm` 35-55 s.

## 2026-10-28 · D7: no red in 10 runs

- H1 and H3 (the reopen): unresolved, no stall and no other route seen. H2a and H2b (the Urgent case): unresolved; in every run the queued cap was the seed's.
- A2 ships as arc 3's change. `waitForHash` stays a `TimeoutError` on a timeout, now naming the hash the page was at (read under a 2 s bound), because `withTimeoutMessage` relabels only that type: wrapping it in `withTimeoutMessage`, as A2 first said, would throw a plain `Error`, and the import trajectory's own `withTimeoutMessage` around `waitForHash` (`helpers/import-drivers.ts`) would pass it through without its diagnostic. The Urgent case's throw now ends with the review line read at the press and the seeded basis's cap.
- Forced once each, Firefox, retry 0 (one run, 289 s, the Urgent case alone with its seed's fee raised 100-fold and a `waitForHash` on a missing route):
  - `TimeoutError: waitForHash: #/popup/forced not reached in 2000 ms; the page is at "#/popup/general"`
  - `transfer 10000000000000000000 left the queue without an accept: {…"stage":"proving"…}; B's review read "Fee up to ~4.617896 FJ ($32.325), based on your last send. If it comes out higher, we ask again." at the press, and the seeded basis caps at ~4.617896 FJ ($32.325)`
- After the review moved the read into a capture-phase `pointerdown` on the confirm button, the Urgent message was forced again (258 s) and read the same line at the press.
- `scripts/e2e/wait-for-hash.test.ts` (3 tests) pins the message, the type, the 2 s bound and the pass-through of any other failure.
- #1300 closes as not planned with these numbers and a ledger row `(open)`; it reopens on a second first-attempt failure of either fingerprint.

## 2026-10-28 · Final gates

- The shard's real files at `585e4bead`, retry 0, `taskset -c 180-183`, proverless, `VITE_NULO_FEE_MULTIPLIER=10`: Firefox 17/17 green in 814 s (`same-token-concurrent-sends` 684 s, `concurrent-sendtx-confirm` 43 s); Chrome 17/17 green in 687 s (562 s, 31 s).
- CI's heavy concurrent-confirm job before this change, on the last three green PR runs: Firefox 735-799 s, Chrome 609-706 s; the whole network lane 1112-1262 s and 957-1030 s.
