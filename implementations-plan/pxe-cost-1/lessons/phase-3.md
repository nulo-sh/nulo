# Phase 3 — choose K, then confirm

## Exports

`tools/make-export.sh head-k<K> 941c2620a <K>` for K = 1, 2, 4: `git archive` of the phase 2 head, the
same scratch instruments as the base export, the constant edited, a frozen install. The base export
is phase 1's (`b9c5586a6`).

## Probe corrections before a screen counted

Discarded as comparisons, kept in `runs/` as evidence: `p3-screen-*`, `p3-screen2-*`, and the base
arm of `p3-screen3-*`.

1. **The base's measured wave skipped most of its scans.** In `p3-screen-base` at 1,000 tokens every
   install poll returned within 8.6 s, but only 65 recorded a scan outcome before Retry (each head
   run recorded all of them). The probe locked and unlocked within a second.
2. **First fix, insufficient:** wait for the lock's empty scheduler commit, which drops every
   episode (`p3-screen2-base`: 66 outcomes).
3. **Second fix, insufficient:** also wait until no public poll is in flight (a live counter in the
   instruments) and count skip reasons per wave (`instrument-scan2.py`). `p3-screen3-base`: 435
   outcomes; the rest skipped on backoff.
4. **Cause, from a diagnostic pair with per-phase timing and throw counts (`instrument-scan3.py`,
   `p3-diag-base`, `p3-diag-k4`):** on the base, 918 of 1,000 install polls skipped on backoff,
   none threw; on the head, none skipped. A base tick poll that awaits the quarantine read across
   the lock enters `scanAndRecord` after the lock's commit, captures the lock's epoch and records its
   failure there, so the episode the lock dropped comes back (the await gap D7 closes); the unlock
   right after starts in backoff. A user who unlocks minutes later finds those gates expired. The
   probe now also waits, after the lock settles, until no stored episode is backing off.
   - Base wave phases in `p3-diag-base` (1,000 install polls): the 82 that scanned spent 6.9 s each
     on average in the quarantine read; every poll's outbox drain took 3.8 s on average (max 6.7 s).
     In `p3-diag-k4`: per poll 30 ms quarantine, 76 ms scan (of which the PXE class read runs about
     8 ms), 26 ms drain: about 130 ms a slot, 1,000 scans in 33.9 s at K = 4.
5. The deployed half failed in all three K = 1 runs: the first deploy batch never mined in 180 s,
   after a seeded half that ran longer than in the other arms (the node logged one `getCheckpoint`
   revert in the first).

## The screen

Valid arms: the base and K = 4 from `p3-screen4-*` (probe with every correction; both exports carry
the per-phase timing of `instrument-scan3.py`, a few counters per poll), and K = 1, 2 and 4 from
`p3-screen3-*` (head runs never skipped a scan, so the base's correction does not bear on them).
Offsets in ms from `unlockAt`; "heartbeat" is the worst sample; Retry starts 10 s after the wave.

| run | point | load1 | Home | heartbeat | wave end | Retry | outcomes before Retry | episode writes (MB) |
|---|---|---|---|---|---|---|---|---|
| base (`p3-screen4-diag-base`) | 10 | 62 | 442 | 7 | 461 | 50 | 10 failed | 10 (0.0) |
| base | **1,000** | 79 | **24,568** | **19,596** | **30,727** | 36,467 | 1,000 failed | 1,000 (80.6) |
| base | 64 deployed | — | — | — | — | — | the half failed: browser target closed after a node `getCheckpoint` revert | — |
| base (`p3-screen3-base`, deployed only) | 64 deployed | 169 | 1,994 | 151 | 2,354 | 982 | 64 idle-at-tip | 0 |
| K = 4 (`p3-screen4-diag-k4`) | 10 | 132 | 708 | 10 | 732 | 179 | 10 failed | 6 (0.0) |
| K = 4 | **1,000** | 127 | **1,047** | **96** | **52,694** | 55,181 | 1,199 failed | 1,023 (95.7) |
| K = 4 (`p3-screen3-head-k4`) | 10 | 113 | 644 | 14 | 768 | 182 | 10 failed | 6 (0.0) |
| K = 4 | **1,000** | 118 | **1,036** | **149** | **45,052** | 53,482 | 1,216 failed | 1,021 (96.7) |
| K = 4 | 64 deployed | 131 | 579 | 7 | 1,545 | 1,177 | 64 idle-at-tip | 0 |
| K = 2 (`p3-screen3-head-k2`) | 10 | 145 | 843 | 18 | 1,467 | 231 | 10 failed | 10 (0.0) |
| K = 2 | **1,000** | 165 | **1,274** | **90** | **71,967** | 84,534 | 1,117 failed | 1,117 (99.5) |
| K = 2 | 64 deployed | 126 | 661 | 5 | 1,806 | 1,280 | 64 idle-at-tip | 0 |
| K = 1 (`p3-screen3-head-k1`) | 10 | 150 | 761 | 5 | 1,098 | 181 | 10 failed | 10 (0.0) |
| K = 1 | **1,000** | 86 | **825** | **40** | **82,454** | 83,397 | 1,100 failed | 1,100 (96.7) |
| K = 1 | 64 deployed | — | — | — | — | — | the half failed: first deploy batch not mined in 180 s | — |

## The rule, applied

- **Responsiveness** (Home and the worst heartbeat within 1 s of the run's 10-token values) holds
  for every K at 1,000 seeded (worst: K = 2, Home +431 ms) and at 64 deployed; the base fails it by
  24 s.
- **The wave** (ends no later than the base's): at 1,000 seeded the base ends at 30.7 s; K = 4 ends
  at 52.7 s and 45.1 s, K = 2 at 72.0 s, K = 1 at 82.5 s. **No K meets it.** At 64 deployed K = 2
  and K = 4 do (1.8 s and 1.5 s against 2.4 s).
- Retry under 60 s: K = 4 only (55.2 s and 53.5 s).
- No value meets responsiveness and the wave, so step 3's last branch applies: **stop; I2 is
  rejected for {1, 2, 4}**. Nothing was loosened; the constant stays at the provisional 4 in the
  committed code, and no confirmation ran.

## Why the wave is slower

A gated scan holds its slot for about 130 ms (`p3-diag-k4`: 30 ms quarantine read, 76 ms scan, of
which the PXE class read runs about 8 ms, 26 ms outbox drain), mostly service-worker and messaging
work. The base overlaps all 1,000 of those, which finishes the wave sooner while it starves every
other RPC (Home 24.6 s, heartbeat 19.6 s). Coalescing bounds the episode backlog, not the write
count: each arm writes about one full map per failure (80-113 MB per wave), as D8 states.
