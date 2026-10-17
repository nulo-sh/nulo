# Phase 5: the review loop

One loop over the arc's whole diff against `dev`. Codex runs at `gpt-6.1-sol`, high, read-only, and is resumed each round. One Opus review (general-purpose) runs beside round 1. The prompt carries the adversarial ask and the two verbatim rules.

## Round 1 (Codex session `01a14a15-67c6-70b1-9e80-11d85d8cce67`; Opus)

Codex: "VERDICT: changes ; Fix the reproducible guard and layout-helper bugs before relying on the new gates." Opus: "VERDICT: changes ; disclose the approval window's three-line identifiers and the two wraps in UI impact and the PR body, and give clipping children their box in the layout gate before the PR opens."

Every claim below was checked against the tree before acting on it.

| # | Finding | Source | Disposition |
|---|---|---|---|
| 1 | `resultLiterals` misses `&&`'s right side and `as` / `satisfies` / `!` wrappers, and reports the empty left of `'' \|\| 'meta'` | Codex (minor), Opus (nit) | Fixed: `literalResults` / `operandResults`, split so each stays under the complexity cap. Two hard self-tests and one control |
| 2 | `passedToIdentifierRole` trusts every identifier role, but `SettingItem` renders only `meta` as mono | Codex (minor) | Fixed: the exemption needs `meta`; one self-test (`descriptionVariant="input-data"` is a finding) |
| 3 | A declared ellipsis on a flex or grid container draws none, yet the gate exempted it | Codex (minor), Opus (minor) | Fixed (D15): `drawsEllipsis` needs a block container, in both `pastBox` and `cutBy`; control `tr-flex-cut` |
| 4 | `paintedSpan` used a clipping box's whole width, so short text in a wide clipping box read as cut by a narrower ancestor | Codex (minor) | Fixed (D15): it uses the shorter of the text and the box; control `tr-wide-fits` |
| 5 | A clipping child that grew to its text (no `min-width: 0`) runs past its parent unseen: the parent's text excluded it | Opus (minor) | Fixed (D15): a field or clipping child counts toward its parent by what it paints; control `tr-grown-cell` |
| 6 | The execute window's full arguments now wrap to three lines beside "FROM:"; the plan's UI impact did not name it | Opus (material) | Disclosed: OA-8, UI impact, PR body; ships as signed (D16) |
| 7 | The fiat wrap's cause was misstated (the 160 px cap, not the row's amount), and Send's token-mode "≈" line wraps undisclosed | Opus (minor) | Corrected in phase-4.md; both are in OA-8 |
| 8 | Comments: "reads as before" (`PublishStrip.vue`), "today's" in three `why` strings, the contract test's group label restating its rows | Opus, Codex (nits) | Fixed |
| 9 | Skeleton bars at 9 px beside 13 px lines; 9 px glyphs beside the 13 px detail line | Opus (nit, outside the arc's surfaces) | An issue at close-out |
