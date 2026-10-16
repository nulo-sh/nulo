# Phase 4: Show network name (#577)

- harden-quality-fixes-1 landed as #595 (d461b059) at 17:41Z; merged at 86fbd673, Header held no `showNode`. OA-1 answered P27-01 B, so D2's height rule ships.
- Red proof, unit: the off and flip cases fail on the merged base Header plus only the two testids; on passes.
- Review round 3 (Codex resume over 12edeaad, with an Opus 5.5 pass):
  - Codex P2, demonstrated at the composable: `BackgroundClient` announces Ready in a later task and drops the announcement when the port changes first (`extension-messaging/src/background/client.ts`, `onReady`); the pending read rejects, the reconnect's first delivered `onConnected` counts as the mount's, and nothing re-reads. Fixed in `useConfigRead` with `newestReadFailed`; its case reds on the old composable.
  - Codex P3, and Opus H: the scenario clicked `nav-general`, which Display does not render (`app.vue` shows `Navigation` only on `showBottomNav` routes): now `navigateByHash` to Home.
  - Opus lows: `document.fonts.ready` before the first height; a Header case for an update during the mount's read (reds when the `updatedSince` guard is removed); the plan quotes P27-01 B; the CSS comment names its line-height condition.
- Round 4 (Codex resume over ef5947ec): **approve**; one non-blocking P3, new evidence: `navigateByHash` waits only for the hash, so the scenario now also waits for Home's `nav-general`, which Display does not render.
