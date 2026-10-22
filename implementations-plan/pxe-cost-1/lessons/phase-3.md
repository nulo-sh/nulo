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

## After the stop: shorten a slot's hold, then widen the screen

The orchestrator kept the three rules and asked for two steps: make a slot's work the scan itself,
then screen K in {4, 8, 16} and take the smallest K that meets all three (K = 4 if it does).

### What a slot holds (before)

`p3-screen4-diag-k4`, the 1,000-token wave: mean slot hold (the whole `pollPublic`) 208 ms; per poll,
quarantine read 47 ms, `scanAndRecord` 118 ms (`scanPublicContract` 113 ms, the episode lock section
3 ms), outbox drain 41 ms. At 10 tokens the quarantine read and the drain take 3-4 ms each: storage
reads inflated by the wave's contention. The one PXE call a seeded scan makes,
`getPublicTokenClassStatus`, runs p50 13 ms, mean 18 ms in the offscreen document. Around it a slot
makes about ten storage reads: the quarantine check (network rows twice, the quarantine state),
`getNetwork` in `scanPublicContract` and again in the reader's class-read transport, the PXE client's
chain guard (`isChainQuarantined`, the chokepoint, which stays), and the drain (active profile, every
outbox row).

### Consult (Codex, high, session 01a16454): build with amendments

Proposed: one per-network read per tick carrying the quarantine verdict (5 s, like the tips), the
network row and the tips; the public slot drains only after a `markDirty`, the note arm and `init`
keep their unconditional drains; the network row passed to the class read; the screen at {4, 8, 16}.

- **Quarantine shared only while in flight, never for 5 s after.** Trace: a cached "live" verdict, the
  chain classified as quarantined, another scan admitted inside the 5 s; the PXE guard refuses, and
  `scanAndRecord` records a failed episode, which the quarantine policy says a refusal never does,
  and an existing failure streak can then announce a stall. Catching `ChainNotSupportedError` around
  the scan is not enough (the tips read swallows errors; a forward-scan failure can start
  reconciliation). The network row and the successful tips keep a 5 s cache, cleared before the
  schedulers install.
- **The drain flag must be conservative.** Trace against the proposal: note descriptors skip hidden
  accounts (`getAccounts` without `all`), public recipients include them; with only hidden accounts a
  receipt's first drain gets `{ busy }`, no later receipt comes, no note scheduler exists, and the
  refresh is never requested. So a "may have rows" flag: true at start, set after a dirty write
  lands, cleared synchronously when a drain starts, set again on a non-empty snapshot, a failed read
  or no active profile.
- **The network row reaches the class read too** (the reader's transport resolves it per call).
- The note arm's epoch must still be captured before any shared read it awaits; the health
  announcements stay (in memory).
- The screen: record the range and the selection rule before running; same instruments, warm-up and
  backoff wait in every arm; check that every target scanned; seeded-only screens leave the 64
  deployed tokens and the balanced confirmation runs to qualify the chosen K.

Taken as given. The orchestrator's "once per network per tick" for the quarantine verdict becomes
"once per read in flight": a verdict kept past its read is the trace above. The note arm keeps its
order (its quarantine read is the shared one; nothing new is awaited before its epoch capture).

### What landed (step 2)

- `incoming-transfer/shared-reads.ts`: one read per key for every caller while it is in flight; a
  success serves for a TTL after it settled (0: never), a failure only while in flight. The tips read
  moved onto it (same rule as before), joined by the network row (5 s) and the quarantine verdict
  (TTL 0). `commitSchedulers` clears all three.
- `scanPublicContract` and the reader's four PXE-bound transport calls resolve the network through
  the shared read. The PXE chain guard is unchanged. The note arm keeps its order and its own
  `getNetwork`; its quarantine read is the shared one, awaited where it was.
- `BalanceRefreshOutbox`: a `mayHaveRows` flag (true at start; set after a dirty write lands; cleared
  before a drain's first await; set again on a non-empty listing, a failed listing or no active
  profile) and `drainIfMayHaveRows`, which `pollPublic` calls in place of `drain`. The note arm and
  `init` still drain unconditionally.

Tests (each red on HEAD's product code, 8 of them, or by mutation): `shared-reads.test.ts` (4);
`balance-outbox.test.ts` "drainIfMayHaveRows" (5: skip after an empty listing until a dirty write;
rows left keep it running; a write landing during a listing; a failed listing and no profile);
scenarios "reads the public scans of a tick share" (one quarantine read in flight and not kept past
it; one network read per tick, forgotten at a commit; ticks over an empty outbox list it only from
the note targets) and, in the causal-ack block, the hidden-account case (passes on HEAD; red when
the flag is not set again on a non-empty listing). Seven mutations (a 5 s quarantine TTL, no network
clear at commit, the flag cleared after the listing, no rearm on rows, no rearm on a stop, the public
slot draining unconditionally, `markDirty` not setting the flag): each turns at least one of these red.

Two existing scenarios changed their fixture, not their assertions: "drain-on-init after simulated
SW death" and "quiet chain: ticks with no new block drain the outbox". Each anchors a refresh task
`T1` the stub task ledger did not hold, so every extra drain read `T1` as missing, cleared the anchor,
and the next re-anchored it; they passed on HEAD because the boot (or the tick) ran an odd number of
drains (three: anchor, clear, anchor), and failed once the public slot skipped one. A real refresh's
task is in the ledger the moment `requestBalanceRefresh` returns it, so both now register `T1` as
processing; their assertions are unchanged and hold for any number of drains.

Gates: incoming-transfer suite 492 green, `bun run lint`, `bun run typecheck:all`, `bun run test`
(15,047 passed), `bun run test:all` (15 workspaces) all exit 0.

### The second screen: K in {4, 8, 16} on `b743e075f`

Exports `diag2-k4`, `diag2-k8`, `diag2-k16` (`tools/make-export.sh` with `DIAG=1`: the same
instruments as `diag-base`, per-phase timers included, the probe unchanged, sha `b046a4cd`); the base
arm is `diag-base` again. One run each, in the order base, 4, 8, 16, at 10 and 1,000 seeded tokens
(`p3-screen5-*`). Every arm recorded 1,000 first-scan outcomes before Retry; no head run skipped a
scan (the base's 1,000 backoff skips are its interval ticks after its wave, before Retry).

| run | point | load1 | Home | heartbeat | wave end | Retry | episode writes (MB) |
|---|---|---|---|---|---|---|---|
| base (`p3-screen5-diag-base`) | 10 | 80 | 618 | 10 | 479 | 125 | 10 (0.0) |
| base | **1,000** | 70 | **22,863** | **14,160** | **26,892** | 28,533 | 1,000 (80.6) |
| K = 4 (`p3-screen5-diag2-k4`) | 10 | 57 | 649 | 39 | 795 | 41 | 7 (0.0) |
| K = 4 | **1,000** | 57 | **730** | **57** | **20,440** | 24,200 | 732 (57.8) |
| K = 8 (`p3-screen5-diag2-k8`) | 10 | 66 | 650 | 3 | 561 | 43 | 6 (0.0) |
| K = 8 | **1,000** | 56 | **901** | **225** | **20,415** | 24,102 | 777 (61.4) |
| K = 16 (`p3-screen5-diag2-k16`) | 10 | 110 | 626 | 15 | 501 | 62 | 2 (0.0) |
| K = 16 | **1,000** | 72 | **1,848** | **381** | **16,599** | 17,419 | 779 (60.9) |

The rule, applied at 1,000 seeded tokens:

- K = 4: Home +81 ms and heartbeat +18 ms of its 10-token values; the wave ends at 20.4 s against
  the base's 26.9 s; Retry 24.2 s. **Meets all three.**
- K = 8: Home +251 ms, heartbeat +222 ms; wave 20.4 s; Retry 24.1 s. Meets all three.
- K = 16: Home +1,222 ms: **fails responsiveness**; wave 16.6 s; Retry 17.4 s.
- The smallest K that meets all three is **4**, the value already committed. Doubling it to 8 bought
  no wave time: a slot's hold doubled with it.

What a slot holds, the same timers before (`p3-screen4-diag-k4`, `941c2620a`) and after
(`p3-screen5-diag*`, `b743e075f`), the 1,000-token wave, mean per poll in ms:

| build, K | slot hold (mean / p50 / p90) | quarantine read | `scanAndRecord` | outbox drain |
|---|---|---|---|---|
| `941c2620a`, 4 | 208 / 196 / 281 | 47 | 118 | 41 |
| `b743e075f`, 4 | 80 / 67 / 130 | 27 | 52 | 0 (skipped: no rows) |
| `b743e075f`, 8 | 159 / 151 / 215 | 35 | 124 | 0 |
| `b743e075f`, 16 | 254 / 241 / 335 | 30 | 224 | 0 |

The host ran lighter than in the first screen (load1 56-110 against 79-169); both comparisons are
within one screen.

### Review round 2 (Codex, high, session 01a1647c) on `b743e075f`: reject, two local fixes

- **An endpoint edit left the cached network row in use** (demonstrated with a probe of the default
  reader: endpoints A, A, B across warm-up, edit, clear). `NetworkService` emits `onNetworkUpdated`
  in process right after it writes; nothing here listened, so for up to 5 s a PXE call could carry
  the replaced endpoint and rebind the chain's runtime to it. Fix: the service clears the shared
  network reads on that event. Test: the default PXE transport (the client's prototype stubbed, no
  injected reader) carries the edited endpoint on the next class read; red without the listener.
- **A clock set back reused a settled read** (demonstrated in memory: a TTL-0 quarantine verdict
  served after `Date.now()` moved back; a 5 s read would serve until the clock caught up). Fix: a
  negative age counts as expired. Tests: both TTLs, red without the guard.
- Not blocking, taken: the TTL test now holds the read past the TTL before it settles (red when the
  TTL runs from the start); the `clear()` test settles the forgotten reads after their replacement
  (red when a late success repopulates the cache); the quarantine scenario's second verdict is
  "quarantined" and suppresses the class read; the empty-outbox scenario counts the public polls it
  claims to have watched.
- The two fixture changes: realistic, not loosened (`BalanceJobQueue.enqueue` creates the task
  before `requestBalanceRefresh` returns its id; missing-task recovery keeps its own scenario).
- Measurement: the screen and the confirmation run `b743e075f`; the fixes change nothing the probe
  exercises (no network update, no clock change).
- The confirmation's run 2B overlapped about six minutes of local unit-test and typecheck runs (the
  mutation checks); its numbers are read with that in mind.

### Review round 3 (Codex, high, session 01a16488) on `6bd21664e`: approve

Both findings closed: all six `onNetworkUpdated` sites (rename, endpoint add/update/delete, primary,
reset) emit after the write; a read started before the edit settles into a detached entry and never
serves later callers; what remains is the pre-change race of one overlapping read. Negative ages
expire for every caller. One assertion was weak and is fixed: the quarantined second verdict's
scenario counted class reads, which the class-gate cache would also leave at two; it now counts
transfer-page fetches (red when the verdict is ignored).
