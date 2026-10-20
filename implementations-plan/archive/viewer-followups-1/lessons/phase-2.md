# viewer-followups-1: phase 2 (the search case) and the review loop

Every run was `test:e2e --retry=0`, armed, one at a time in this worktree, each started at load1 under 150 (the load is logged per run outside the repository). A file's wall-clock is vitest's `Duration`; the case's duration is the reporter's line for "the search panel open at the end holds the view while lines arrive".

## Before the edit (Phase 1 head `cafcc349`)

- 3 runs per browser, all green, so #922's known red did not show.
- Chrome: file 29.2, 30.7 and 32.4 s; case 832, 837 and 965 ms.
- Firefox: file 43.3, 39.6 and 42.8 s; case 1,318, 1,296 and 1,323 ms.

## The candidate before review (`284f9a9f`, `pointerClick` on the button)

- Firefox 10/10 and Chrome 5/5 green.
- Firefox: file 37.9-63.4 s; case 1,537-4,789 ms.
- Chrome: file 28.9-44.5 s; case 1,042-2,678 ms.
- The case pays for one more held line, the button's press and two more gap reads.

## Mutation controls (one build and one file run per browser each, on `284f9a9f`)

- **`focusin` stops nothing:** the search case red at the probe line's button assertion on both browsers (`viewers-csp.test.ts:408`, `expected null not to be null`). Every other case was green.
- **`holdPlace` returns `[]`:**
  - Chrome: the search case red at `expectHeld` (37 px), as named.
  - Firefox: the search case red one step earlier, at the probe line's button assertion. With no snapshot, the held probe line did not keep the button showing.
  - Both browsers also red the two selection cases at `expectHeld`, which the plan allows.
- Both controls are re-run on the final head below, with a Firefox diagnostic of the hold mutation's earlier red.

## Review loop

- **Codex round 1** (fresh session): approve, no finding. The first start lacked the Post-implementation standard's two verbatim rules. It was stopped before it answered (by its own process group) and rerun with them.
- **Opus diff review**, beside round 1: conditional approve. The plan's Audit verdicts record what was accepted and rejected.
  - The CRLF offset (D7) was confirmed in `logs-format.ts`: `formatLogs` joins with `\n` and counts a log's own `\r\n` as two characters, while `droppedPrefixLength` already converts with `state.toText`. A new row red on the old code (anchor 72, line start 71).
  - The revised rows' negative controls: no flag reds only the pending-target row, and no pin reds only the landing row.
- **Codex round 2** (resume, the fix diff `284f9a9f..d8ff3a79`): approve, no new material finding.

## Final gate (`d8ff3a79`)

The arc's build was kept for the burst comparison, and the base build was origin/dev's `LogsViewer.vue` and `logs-format.ts`.

- **Candidate:** Firefox 10/10 and Chrome 5/5 green.
  - Firefox: file 34.7-67.2 s (median 41.1); case 1,327-4,562 ms (median 1,464).
  - Chrome: file 38.5-52.2 s (median 45.4); case 985-2,139 ms (median 1,298).
  - Against the before runs, the case's median rose 146 ms on Firefox and 461 ms on Chrome. The host ran at load1 87-150 here and 95-131 before, which spreads the file's wall-clock.
- **Full smoke suite, once per browser:** both exit 0.
  - Chrome: 59 files passed and 7 skipped, 270 tests, 2,030 s.
  - Firefox: 62 files passed and 4 skipped, 270 tests, 3,119 s.
- **`focusin` stops nothing:** only the search case red, at the probe line's button assertion (`:408`), on both browsers.
- **`holdPlace` returns `[]`:** the search case red on both browsers, with the two selection cases.
  - Chrome red at `expectHeld` (`:421`). Firefox red at the button assertion (`:408`).
  - A Firefox diagnostic logged the scroller after the panel, the blur and the probe line:
    - Run 1 stayed put (top 934, gap 28 → 46, button shown) and red at `expectHeld`, 36 px, as named.
    - Run 2 was carried to the end by the probe line's arrival (top 934 → 980, gap 0, button hidden) and red at the button.
    - Without the snapshot, Firefox sometimes lands the held line at the end. Which CodeMirror path does it is not traced. Either way the broken hold reds the case.
- **Burst guard** (viewer-flake-1's B1: 500 lines while following, from the first burst line in the DOM to the first frame at the end). Base and arc were interleaved, with a fresh browser per sample. Each sample waited up to 180 s for load1 under 90, otherwise it ran under 150.
  - Firefox: base 505, 476, 370, 563, 418 ms (median 476); arc 413, 579, 385, 369, 453 ms (median 413). That is -13.2%. The first two pairs fell back, at load1 112-137; the rest ran at 65-83.
  - Chrome: base 380.4, 358.2, 398.8, 693.5, 390.8 ms (median 390.8); arc 389.5, 662.6, 394.5, 410.2, 536.5 ms (median 410.2). That is +5.0%, all at load1 64-84.
  - The arc leaves `onLogAdded`, `holdPlace` and `scrollToBottom` unchanged, so the spread is the host's.
- **Fast layers on `d8ff3a79`:** `test:all` exit 0 (extension 14,416 passed).
- The first final-gate script was stopped (by its own process group) before its first candidate run ended. It would have run the burst at the run gate's load ceiling, not one well below it, as the `e2e-testing` skill asks. The resumed script reused the arc build it had kept.
