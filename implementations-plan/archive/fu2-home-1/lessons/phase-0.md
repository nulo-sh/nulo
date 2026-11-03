# fu2-home-1: phase 0 (planning)

## Measurement

- One uncommitted smoke spec on the armed Chrome build (`build:chrome` with the four `VITE_NULO_E2E_*` flags, 18 s), deleted after the run. It read the header's boxes and computed styles at 360, 340, 320, 300 and 240 px, the natural width of each seeded network name in the chip's own class (a hidden clone of the label), Home's hero and scroller heights, and onboarding's body width at 360 and 240 px.
- The option pictures on page 93 came from capture branches whose prototypes overflow the header's right padding (the lock 5.5 px from the edge at 360, 6 px at 240). They show the reading the owner signed, not a layout that fits.

## Consults
- **Codex, gpt-6.1-sol, high, read-only (session 01a19d46), plan round 1: reject.** Blocking: (1) D1 recorded the header's address after `activate()`, but the account can land while the network still persists (`guarded-network-activation.ts:57-63`): the record moves before `activate()`. (2) The switch run ends after `syncTransactions`, not when the account lands, and a newer switch or a lock could let an obsolete toast replace newer feedback: the plan now names the run's end as the moment (a local read after the account) and opens no toast when the scope moved. (3) D4 removes the network-read wait only; flags and the Presto setting are still read at mount: the outcome claim narrowed. Also: `security-backup.test.ts:63` presses a row on visibility, which D4 makes inert while pending, so arc 1 adds `waitForHomeReminders` there (I2 was false); D6 removes the header's keyboard copy path while Receive's is mouse-only, so Receive's address becomes a native button; `14ch` did not clear the revealed copy icon, so the threshold is `15ch` with a boundary e2e; long typed names keep today's ellipsis and their `NARROW_ACCEPTED` entry. All accepted after checking each against the tree.

## Panel, Opus 5.5 Plan leg (2026-11-02)

Verdict: conditional approve. Its before-address, phase-1 I2 check, lock and `15ch` findings matched Codex round 1, already folded. New, each checked against the tree and accepted:
- The before-address is read only when the header shows one; otherwise a quarantined network would read as "different".
- A seeded network's first account is derived in the worker, so the toast now waits on it: `settings-crud.test.ts:90` moves under the account's 30 s bound and the outcome says so. `syncTransactions` after it is a local read whose retry backoff tops at 750 ms, so the run's end stays the timing.
- Three widths cannot tell whether a container query's `ch` resolves against the container's font; a 4 px sweep asserting whole-or-absent can.
- Home's scroll shadow follows only the scroller's scroll and would stick below 359 px; hidden there. Wrapper testid added.
- `NewNetworkPopup`, arrivals and the takeover also switch; the line stays on the two switch toasts (copy beyond the pick otherwise), Receive covers every path.

## Panel, final fresh Codex pass (2026-11-02)

Verdict: conditional approve, then `approve` on resume. Conditions, each checked and folded: the toast's wait needs the awaited run's identity, not matching ids (A → B → A; unlock reassigns the network in `useProfileBootstrap.ts`, so it replaces the run too): a pure `settleLatestRun`, tested; reset's `accountLoaded` keeps rejecting, the swallow stays on the toast path; Fact 1 says either may finish first.
