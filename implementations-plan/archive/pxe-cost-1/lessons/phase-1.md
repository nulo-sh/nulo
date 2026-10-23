# Phase 1 — instruments and the base measurement

## Setup (scratch, nothing committed or pushed)

- **Base export.** `git archive b9c5586a6` (this branch's merge of `origin/dev`, with #1043's sealing and
  #1048) into `~/.cache/nulo-backlog/pxe-cost-1/exports/base`, `bun install --frozen-lockfile`. Every
  run records the export's `PROVENANCE` file and the sha256 of the probe and of `service.ts` in its
  `env.txt`, so a run names the tree it measured. `run-tree.sh`'s hard-coded HEAD and
  `measure-branch.sh`'s push are not used.
- **Instruments.** pxe-limits-1's `instruments-final.patch` applied with `git apply --reject`: every
  hunk but `closeOffscreen`'s applied (#1048 added a line at its top); that one line went in by hand.
  Its per-tick wrapper in `startPollScheduler` is dropped: with the gate a tick only enqueues.
  `tools/instrument-scan.py` adds the wave instruments to the incoming-transfer service on any
  export, by anchors the base and the gated head share: a wave per scheduler commit (its targets,
  the time every target's first `pollPublic` started after the commit has returned, the poll count),
  tick outcomes by kind, class reads by verdict and the last one's time, and every episode-store
  `set`/`remove` (count, serialized bytes, time) through a proxy on the session area.
- **Probe.** A new scratch file, `_probe-unlock-scan.test.ts`, beside pxe-limits-1's probes. It keeps
  #1038's clock: `unlockAt` is taken before `ensureUnlocked` types the password, Home is
  `waitForHash(HOME)`. Seeding is the holdings family's (token rows with no contract, plus a projected
  balance row each), cumulatively at 10, 100 and 1,000; then, in a fresh profile, 64 tokens deployed
  from the script wallet (eight sends in flight) and added through `token.parseTokenInterface` +
  `token.addToken`, the import popup's two calls. Before each measured unlock: worker restart and one
  unlock (A3 seals the seeded balance rows; done when no `nulo:core:token-balances@` row is
  plaintext), then that unlock's wave end and a quiet PXE. The measured unlock is a lock and a
  same-worker unlock, as #1038's.
  - In the popup document: the submit (a capture listener on `auth-submit`), the session record's
    arrival (`storage.onChanged`), and from the submit a heartbeat: one `profile.getActiveProfile`
    over a fresh port per second, sequential, each sample its lateness behind schedule plus its round
    trip. It stops 30 s after the wave ends.
  - Retry (`incoming-transfer.retryIncomingScan`) starts 10 s after the wave ends; the probe's own
    timeout is 300 s, so a Retry past the popup's 60 s is measured, not cut.
- **Invocation** (from `~/.cache/nulo-backlog/pxe-cost-1`):
  `tools/run-export.sh base <id> chrome PXL_COUNTS=10,100,1000 PXL_DEPLOYED=64 -- tests/e2e/network/_probe-unlock-scan.test.ts`.
  The script waits for load1 < 150 and no deps-audit-1 soak, then runs `bun run e2e:agent` at
  `NULO_E2E_RETRY=0` with `PXL_OUT` set; records land in `runs/<id>/rec.jsonl`.
- A shake-out run (`p1-shake-chrome`, 10 seeded + 2 deployed) passed first.

## Base measurement — `p1-base-chrome` (2026-10-22, 12:35-12:45 UTC, exit 0)

Offsets in ms from `unlockAt`. Episode writes are those landed by the time Retry starts (the wave's
own), as activity beside the timings, not as a share of the delay: the writes overlap other work.

| point | load1 | submit | session | Home | rows | wave end | heartbeat worst | heartbeat p50 | episode writes | written | write time | Retry | outcomes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 seeded | 83 | 55 | 659 | 907 | 923 | 865 | 37 | 3 | 10 | 0.0 MB | 0.1 s | 91 | 10 failed |
| 100 seeded | 113 | 14 | 454 | 956 | 1,027 | 1,029 | 33 | 3 | 100 | 0.8 MB | 0.4 s | 560 | 100 failed |
| 1,000 seeded | 105 | 112 | 523 | **26,075** | 33,104 | 30,842 | **20,201** | 6,308 | 1,000 | **80.6 MB** | 23.7 s | 34,603 | 1,000 failed |
| 64 deployed | 153 | 11 | 435 | 1,070 | 1,091 | 1,272 | 87 | 5 | 0 | 0 | 0 | 413 | 64 idle-at-tip |

- Every seeded scan fails at its class gate (class reads `unresolved`), as the recon traced. The
  64 deployed tokens' scans hit the warm class cache and end at tip: no class read, no episode.
- **The session record is visible within about 0.5 s at every size**; what grows is the popup's way
  from there to Home (25.5 s at 1,000) and every RPC it makes meanwhile (heartbeat p50 6.3 s, worst
  20.2 s). The unlock RPC itself is not slow (F1).
- **The failure wave's episode writes at 1,000:** 1,000 full-map writes, 80.6 MB serialized, 23.7 s of
  storage time inside the 30.8 s wave: the O(N²) storm the plan predicted (D8). Retry at 1,000 took
  34.6 s, past half the popup's 60 s limit.
- A3's conversion at the warm-up: 0.9 s (10), 4.1 s (100), 30.3 s (1,000), recorded apart from the
  measured unlock.

## Gate

Every record is present at every point. The base 1,000-token Home time is 26.1 s ≥ 5 s: I3 holds (A3's
sealing left the burst in place), the arc continues.
