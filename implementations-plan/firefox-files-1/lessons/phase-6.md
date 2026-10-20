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
