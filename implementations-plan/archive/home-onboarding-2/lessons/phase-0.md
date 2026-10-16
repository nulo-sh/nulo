# Phase 0: planning log

## Recon (2026-10-15)

- Two Explore agents (sonnet): the reuse sweep and the Firefox e2e harness map. Findings in [recon.md](../recon.md).
- #132: closed by #348 on 2026-10-13. HEAD `dfdf4c31` ships page 18's option A. No arc.
- #156: page 18 option A, and page 16's manifest pin B (still in force, written to #156's Decision).
- Firefox 153.0.4's `Extension.sys.mjs` (read from the installed browser's `omni.ja`, scratch copy outside the repo): `manifestOptionalPermissions` merges `optional_host_permissions` with an MV3 manifest's origins, so P16-04 B grants nothing new at run time.
- The page-18 shot branch `shot/156-a` (`2d7981a0`, throwaway) was read as evidence only: it inlines the row in both pages and re-reads only after a click, with no `onAdded`/`onRemoved` handling.

## Consults

### Codex round 1 (gpt-6.1-sol, high, read-only; session `01a14189-611f-7b01-bca8-93a68462ecef`; ran on the `alejo-icloud` roster account, which the managed `CODEX_ACCOUNT=best` picked)

Verdict: **conditional approve** (prevent pre-grant probes from satisfying the grant refresh; make disposal terminal; distinguish failed permission reads from grants).
- R1-1 Medium, demonstrated: presto-core 1.2.1's `checkStatus` joins an in-flight probe even when forced (`presto-client.js:55-74`, verified by the planner). So under D2 a `start()` probe that left before the grant answers the forced check after it with the pre-grant minimal body. Accepted, by a different fix: the permission composable calls `start()` only once the grant is known, so no probe leaves while the grant is missing (D2). The archived D9 gate inside `usePrestoCheck` is not needed for that. The known-limit alternative (a stale post-grant screen) is rejected because it breaks the signed "checks Presto at once".
- R1-2 Medium: fence invalidation alone is not terminal. `start()` dispatches a probe after `dispose()` when its config read resolves late (demonstrated on today's code), and a late `request()` answer can begin a fresh read. Accepted: `disposed` checks after every await, with deferred-promise tests.
- R1-3 Medium, plausible: a re-read that throws must not fabricate a grant. Accepted: a failed re-read keeps the last observed state. Only an initial failure falls back to today's page, and it never counts as a grant.
- R1-4 Low: I3's ordering is not guaranteed. Accepted: `unknown` reads `detecting` by contract; tests cover both resolution orders.
- R1-5 Low: OA-1's options overclaim; N-1 is redundant. Accepted: OA-1 reworded; N-1 moved into F1's rationale and removed from OWNER-ASKS.
- R1-6 Low: F2's date (the decisions are of 2026-10-15) and the plan's size. Accepted.

### Opus Plan lens (opus, read-only)

Verdict: **conditional approve**.
- 1: plan.md lagged the round-1 log. Fixed: one consolidated revision.
- 2: R1-1 should be a known limit, because a human grant lands long after the mount probe (2 s per attempt, `presto-transport.js:7`). Partly accepted: the window is narrow, but D2's two callbacks remove the cause, so no known limit is needed and `usePrestoCheck` keeps its design.
- 3, 4, 5, 6, 8, 9, 10, 11, 12: accepted. 4 also removed `request()`'s re-read: every grant arrives through `onAdded`, and the e2e now proves `onRemoved` and `onAdded`.
- 8 and 10 were verified by the planner in Firefox 153.0.4's `omni.ja`:
  - `ExtensionsUI.sys.mjs:48-62` moves a popup's prompt to the window's selected tab.
  - `schemas/permissions.json:110` is `requireUserInput: true`.
  - `ext-permissions.js:217` adds the permission in the parent after the prompt.
- 7: rejected. P16-04's record told the owner that A meant "nothing new on the AMO listing", so B already accepts the listing change.

### Codex round 2 (resume, same session)

Verdict: **conditional approve** (close the remaining startup and revocation paths; handle grants after a failed first read).
- R2-1 Medium, demonstrated with two SDK reproducers:
  - A revoke during a granted page's startup (its config read, or the SDK's startup retry) lets a probe leave without the grant.
  - A re-grant before that probe settles joins it.
  - Disposition: KL-1, the alternative Codex named. Holding the grant's check until the earlier probe settles is a coordination protocol, and the residual is cosmetic: the version rows read "—" until the next visit.
- R2-2 Medium: after a failed first read, a later grant was lost. Fixed: an `unknown` status, and a later `true` from any status but `granted` calls `onGranted`.
- Verified sound: terminal dispose, failed re-reads keeping state, event-only grants, Chrome's earlier `start()`, the footer logic, I1, OA-1 and the e2e event coverage.

### Codex round 3 (resume, same session)

Verdict: **approve**, no new material finding. One Low, applied: KL-1's text now names the failed-first-read variant, and the plan says "a page that mounts without the grant sends no probe" instead of an absolute.
