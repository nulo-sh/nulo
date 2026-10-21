# fit-240-2: phase 0 (planning)

## The probe, 2026-10-21

- Detached checkout of #986's head (`fc6422d53`) in this worktree; `expectFitsNarrow` added uncommitted
  at five points in `passkey-backup` and `security-backup`; armed builds; retry 0; load1 near 160.
  Both files green on Chrome (78 s) and Firefox (86 s). Restored to the branch after.
- Controls (Chrome): a cut card title turns the gate red (`cut`); `nowrap` on the done banner does
  not (its title fits on one line, 146 px of 192); a 300 px done banner passes, excused by
  `CollapsingHeroLayout .wrapper { overflow: auto }` (scrollWidth 324 in a 240 view). Plan D4.

## Consults

### Codex r1 (gpt-6.1-sol, high, read-only; 2026-10-21)

- Verdict: request changes. F1 stale: #986 merged at 21:34Z (`dev` at `b88c20a39`); the gate and
  the backup files are unchanged from its head. The banner checks could pass on a banner hidden at
  both widths (visible waits added, D7); the hold's release must sit in `finally`; two controls
  cannot prove five call sites (one control per site, D8); the warning visit in
  `backup-imported-account` reaches the done state with a warning (added); D3, D6 and I1 overstated.
- D4: Codex asks to repair the shared gate here or depend on its repair. Rejected for this lane: the
  fix is gate-wide (every page #986 measures, a list of deliberate sideways scrollers, full suites on
  both browsers, possible owner pictures), the owner's rule leaves an out-of-scope clean fix out
  rather than patching it, and a backup-only assertion would be a second mechanism. Filed as its own
  issue and raised to the orchestrator.

### Opus 5.5 r1 (Plan agent, read-only; 2026-10-21)

- Verdict: conditional approve. Accepted: assert the card and the dialog are still mounted after the
  held check (the hold is one-shot; a missed hold could measure the ready state under the card's
  label) and release in `finally`; a control for each done-state check; F1 and I1 for #986's merge;
  D3's reason was wrong (`sealFullBackupText` runs in the page, so a test patch of `crypto.subtle`
  could hold it; the decision stands on proportion); D6 raised to the orchestrator (A3); a
  ready-state check, whose two stacked CTAs bound the `encrypting` bar (D9); the dialog named in the
  held check's label; the headless scrollbar gutter, added to #1023.
- Rejected: listing D4, the success toast and the gutter as `known-limit` issues. D4 is an open
  defect in the gate with a supported path (#1023, open); the toast is #986's settled D20; the
  gutter is part of #1023.
- Filed #1023 (the gate passes a page that scrolls sideways inside its own scroller), deduped first.
- Light tier: one Codex round and the Opus leg; no second Codex round. D4 stays disputed with Codex
  and goes to the orchestrator.
