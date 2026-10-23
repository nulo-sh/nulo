# pxe-cost-1, phase 0: planning consults

## Codex r0, the direction consult (2026-10-22, gpt-6.1-sol, high; session `01a162a3`)

Asked: #1033, a wallet-side balance sum for pinned Token classes or an upstream issue with
`blocked:external`; #1038, the shape of a bounded gate for the public scans.

- **#1033 → upstream, `blocked:external`** (confidence high). A wallet sum duplicates contract
  semantics to bypass a dependency's slow path; class pinning makes the copy controllable, not
  correct by cause. The note-schema map is a rendering aid (its decoder tolerates missing fields),
  and `packages/aztec-runtime/src/pxe/effective-class.ts` rebuilds the instance's class from its
  original class, while upstream executes the class current at the anchor, so a registered-instance
  check does not prove the executing bytecode. A `bun patch` of the PXE would fix the cause but is a
  maintained fork: its own plan. No cache: refreshes are event-driven and no per-note-set signal
  exists. Composition parity is impossible under D2/D4 (agreed).
- **#1038 → a service-local bounded queue** (confidence high on design, moderate on the latency
  gain). Conditions: install, ticks and Retry through it; one pending entry per key with `force`
  ORed and one shared completion; never dispatch a running key (else the gate feeds the
  `publicPolling` early return and loses the rebuild kick); a rebuild clears pending, never running;
  Retry awaits the admitted forced run, and its queue delay counts against the 60 s RPC limit
  (measure it; never raise the limit or make Retry fire-and-forget); K from {1, 2, 4} by
  measurement including deployed tokens; the popup starvation stays an inference: measure session
  visibility and popup responsiveness apart.
- Verdict recorded in plan.md D1-D5. All conditions adopted.

## Round 1, the plan audit (2026-10-22)

- **Codex r1** (resumed `01a162a3`): *reject*. Blocking: (1) `pollPublic` checks the install epoch,
  awaits `isQuarantined`, then `scanAndRecord` reads the epoch current after that await, so a delete
  or lock in that window lets the old scan write a cursor (demonstrated by trace) → D7; (2) a Retry
  queued behind a running scan that then fails meets fresh backoff and skips (demonstrated by trace)
  → D5 reworked (retry intent consumed at admission); (3) the phase 3 rule lacked a wave bound and a
  Retry disposition. Also: the probe's "unlock" includes `waitForHash(HOME)`; ticks attaching a
  waiter per call keep closures alive while a key waits (D9); token adds are confirmed by the
  person, so no dApp cap applies to watched tokens; OA-1's per-sender cost is 84 × (tokens + 1) per
  scope, and B/C/D/E needed qualifying. All accepted.
- **Opus r1** (Plan agent): *conditional approve* (findings 1-6). Finding 1, verified: the probe's
  tokens have no contract, `getContract` returns nothing, the class gate says `unresolved`, the scan
  fails, and each failure persists the whole episode map to `chrome.storage.session`, the area the
  probe's unlock polls: #1038's numbers measure a failure wave with O(N²) writes → D8 and the phase 1
  records. Others accepted: a wave bound against the base; a heartbeat instead of one RPC sample; A3's
  conversion done before each measured unlock; the suite at K = 1 and the gate re-run after K; step
  U's authorization quoted; K ≥ 2 preferred; `drop()` removed; the Retry test made red on base;
  option F in OA-1. Rejected: removing `clear()` (it drops stale Retry intent at each commit).

## Round 2, verification (2026-10-22)

- **Codex r2** (resumed `01a162a3`): *conditional approve*. D5, D7 and D9 hold. Conditions, all
  accepted: D8 bounds the backlog, not the writes (failures spaced wider than one write still write
  once each); a `persist()` ordering test (hold the first write, change while it is in flight, then
  `settled()`); a total K rule (all three constraints, then relax Retry only, else stop); the wave
  measured as every target's first `pollPublic` returning, after the warm-up's scans drain. One
  condition not taken as worded: a numeric write-count threshold; Opus r2 showed the gate spaces
  failures, so the count is a noisy proxy, and the heartbeat is the user-facing criterion (D8).
- **Opus r2** (resumed): *conditional approve*. R2-1 the write criterion restated; R2-2 a commit's
  `clear()` drops Retry intent, so Retry keeps today's up-front network clear too (D5); R2-3 a base
  run inside the K screen and the wave-only branch; R2-4 per-contract class counts, hold
  `isChainQuarantined`, test 1 head-only; R2-5 option F's omissions (existing senders, restore, the
  Senders page, one lock around count and register). All accepted.

## Final fresh pass (2026-10-22, gpt-6.1-sol, high; session `01a162bd`)

- First verdict *conditional approve*: keep the issue's clock (`unlockAt` before `ensureUnlocked`,
  to Home) beside the submit; enforce Retry under 60 s in every confirmation run unless the Retry
  known-limit branch was taken, and pair each head run with its adjacent base run. Clarifications:
  episode writes are activity, not a causal share; the K rule's first branch is conditional on a
  non-empty set; the copied helpers print a hard-coded HEAD and push a branch, so record real HEADs
  and push nothing; K slow tokens hold every slot (a known limit at close-out). D8's rejected
  write-count threshold should stay rejected.
- Verification resume: one stale clock phrase in the issue notes; fixed.
- Verification resume 2: **approve**.

## Step U (2026-10-22)

The orchestrator kept Ask A1 for the owner (decision page): nothing posted on
`AztecProtocol/aztec-packages`. Fallback done: #1033's `## Possible fix` now carries the upstream
draft (title, version, mechanism with source lines, reproduction, measured figures, the ask) and
the reopening condition; label `blocked:external` added; #1033 stays open.
