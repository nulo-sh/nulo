# notice-overflow-1: planning log

## Recon and measurement (2026-10-27)

- One Sonnet explorer ran the reuse sweep (recon.md). The planner verified each cited line.
- The scratch capture spec raises the notice through the page's own Pinia store (`#app.__vue_app__.config.globalProperties.$pinia._s.get("notification")`), as the notice-width capture did, and sets `overflow-wrap` on the card element for option (a), or cuts the name before `restoreNoticeText` for option (b). It ran three times on the armed base build (Chrome, smoke harness, retry 0), each about 20 s, all green.
- A 64-character name fit the 480 px onboarding card, so the pictures use a 90-character name: the popup's threshold is about 50 characters, onboarding's about 80.
- `overflow-wrap: break-word` measured no better than today (429 / 324 popup, 507 / 480 onboarding): the description is a flex item centred in a column, sized to its min-content width, which `break-word` leaves at the whole word. `anywhere` lowers it.
- Vertical edge: 80 short unrestored names already bring the popup card to 579 of 600 px; with (a), a 1,500-character name puts OK at 769 px in a 600 px popup, focus still on OK. Recorded as a known limit (plan § Security).

## Consults (2026-10-27)

- **Codex plan audit r1** (gpt-6.1-sol, high, read-only; session 01a17f6f): conditional approve. Four findings, all accepted: I1 overclaimed (25 `W`s wrap in the popup under `anywhere`, 188 → 205 px); Fact 4 confused inheritance with applicability (Button wraps below 359 px); the gate rebuilt armed before `audit:vue`, whose plain build the smoke setup refuses; the known limit's numbers were the popup's, not onboarding's. Answered with one more capture run: both `createFailedNotice` notices render identically with and without the rule at five widths.
- **Opus 5.5 Plan leg r1**: conditional approve. Accepted: the same gate order; the name's other places (D5), which (b) would bound and (a) does not; the known limit leaves no pointer target at all; line numbers; "widest name" was wrong; the pictures raise the notice directly. Rejected: an extra computed-style assertion in `import-errors-scroll.test.ts` (optional in the finding), and dropping the Opus diff review the implementer brief requires.
- **Codex final pass r2** (resumed): conditional approve. U+FDFD cannot be typed (the field's sanitizer keeps `\p{L}`, digits, space, `-._`), so it is a backup-origin example; OA-1 must not say every notice renders unchanged. Both applied.
- **Codex r3** (resumed): approve.
