# Phase 6: arc gate, pictures, review loop

## Review loop

- Round 1, Codex (gpt-6.1-sol, high, read-only, session `01a15ab1`) over the whole diff: `approve`,
  no material finding; it noted the owner's Mac check (OA-3) as the only proof of I2.
- Round 1, Opus 5.5 (`general-purpose`): `approve`, two Low notes, both applied in one commit:
  `leavePanelFor(route)` replaces the guard pasted on four pages (D13), and a failed probe logs as a
  probe, not as a sender read.
- Round 2, Codex resumed on that commit: `approve`.
- Round 3, Codex resumed with the standard's two verbatim rules, which the first two prompts had left
  out: three Low comment findings, all applied (the download latch's ordering, `StatusCard`'s header,
  three comments that narrated their code). The loop stopped at its three-round limit with nothing
  material open.

## Gates

- `bun run audit:vue`: pass (889 test files, the Chrome build).
- Pictures (scratch capture specs, never committed), light and dark: the Contacts own window after
  the panel's hand-off (Firefox, a 380x660 popup window); the done state in Chrome's popup at 360x600
  and in Firefox's panel; the contacts export's working card in Chrome's popup, held 5.15 s by a node
  that never answers, which is the probe's 5 s limit.

## Each phase's gate (all at retry 0)

- Phase 1: lint, `typecheck:all`, `test` (883 files) pass.
- Phase 2: the page tests; Firefox `toolbar-panel` 6/6 (177.7 s; the moved test 29.9 s at load 160,
  14.6 s on CI before), `own-window` 3/3, `contacts-import` 7/7 (397 s wall); Chrome `contacts-import`
  7/7 (116 s).
- Phase 3: `StatusCard` 10/10; Chrome `passkey-backup` 3/3; the working card's capture before (dev)
  and after equal byte for byte in both themes (the worker paused through CDP, animations frozen).
- Phase 4: composable 34/34, page and `goBack` tests; `security-backup`, `passkey-backup`,
  `backup-roundtrip` 7/7 on Firefox (145 s) and on Chrome (95 s, the rerun after a self-inflicted
  kill, lessons/phase-4.md).
- Phase 5: `test:all` pass; `contacts-import` 7/7 on Chrome (82 s) and Firefox (126 s); network
  `senders-advanced` 3/3 through `agent.sh` on Chrome (141 s) and Firefox (189 s); I3 in
  lessons/phase-5.md.
- Phase 6: `audit:vue` pass; the full smoke and network suites on both browsers ran on the PR's CI
  (sharded) and locally, where a host at load ~210 on 188 cores slowed them to hours; their results
  are in the PR.
