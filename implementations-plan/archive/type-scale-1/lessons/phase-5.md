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
| 5 | A clipping child that keeps its width (`flex-shrink: 0`) runs past its parent unseen: the parent's text excluded it. A clipping flex item with the automatic minimum shrinks instead (round 2) | Opus (minor) | Fixed (D15): a clipping child counts toward its parent by what it paints; control `tr-grown-cell` |
| 6 | The execute window's full arguments now wrap to three lines beside "FROM:"; the plan's UI impact did not name it | Opus (material) | Disclosed: OA-8, UI impact, PR body; ships as signed (D16) |
| 7 | The fiat wrap's cause was misstated (the 160 px cap, not the row's amount), and Send's token-mode "≈" line wraps undisclosed | Opus (minor) | Corrected in phase-4.md; both are in OA-8 |
| 8 | Comments: "reads as before" (`PublishStrip.vue`), "today's" in three `why` strings, the contract test's group label restating its rows | Opus, Codex (nits) | Fixed |
| 9 | Skeleton bars at 9 px beside 13 px lines; 9 px glyphs beside the 13 px detail line | Opus (nit, outside the arc's surfaces) | An issue at close-out |

Verification of round 1's tree (r1fix pair): network Firefox green (`type-roles-windows`, `send-amount-exact`). Smoke Chrome red on one control: `tr-grown-cell` was not reported, as Codex round 2 then found. The pair was stopped there, since the tree had moved on to round 2's fixes.

## Round 2 (Codex, resumed)

"VERDICT: changes ; Correct the grown-child control, field false positive, and remaining ellipsis exemption before accepting the layout gate." On D16: "a reasonable disclosed tradeoff … I found no new evidence requiring a mandatory layout change before shipping."

| # | Finding | Disposition |
|---|---|---|
| 1 | `tr-grown` shrinks to its cell: a flex item that clips has no automatic minimum width, so the control proved nothing (the r1fix smoke run shows it) | Fixed: `flexShrink: "0"`, the real way such a clip keeps its width |
| 2 | A field's whole box in its parent's text extent: a padded field offset past its parent reports text past the box although its value fits | Fixed: a field adds nothing to its parent's text; it is judged on its own reading. Control `tr-field-cell` |
| 3 | A block's ellipsis still exempted text in a block inside it, which it cannot shorten | Fixed: an ancestor's ellipsis counts only when the text sits in that box's own lines (`lineOf`). Controls `tr-block-cut` (reported) and `tr-ellipsized` (not reported) |
| 4 | `textSpan`'s comment still said descendants laid out apart are excluded | Fixed |

Verification of round 2's tree (r2fix pair, retry 0): smoke `type-roles.test.ts` 12 + 1 skipped on Chrome, 13 on Firefox; network `type-roles-windows.test.ts` and `send-amount-exact.test.ts` 5/5 on each browser. Every swept state stays clean under the stricter gate.

## Round 3 (Codex, resumed): converged

"All four round-2 findings are resolved … No new material findings. D16's disclosed wrapping remains acceptable." "VERDICT: approve ; The fixes resolve round 2 without a material regression."

Wall-clock on the converged tree (the r2fix pair, retry 0, no shots): smoke `type-roles.test.ts` 72.8 s Chrome, 99.5 s Firefox; network `type-roles-windows.test.ts` 112.0 s / 172.4 s, `send-amount-exact.test.ts` 39.1 s / 41.4 s. Beside Phase 4's after figures, the spread is up to 19 s on one suite, so host load dominates.
