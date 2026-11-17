# Phase 1: build, gates, review

- 2026-11-17, `fa16cac69`: `bun run test` red in `src/popup/pages/send.test.ts` ("the publish line carries the facts on an unfinished form…"), a second pin of the page's long warning words the plan's recon missed (it grepped `tests/e2e` and the render lane's test list). Rewritten to the short sentence, whole and exact (`7a29add73`); the gate reran green.
- 2026-11-17: a zsh array, not a space-joined string, for a list of paths in one Bash call: `$SRC` stayed one word and the base-copy step failed safely before writing anything (the known agent-shell lesson).
- 2026-11-17, Codex round 1 (session `01a1eb68`), gpt-6.1-sol high read-only, over the plan and `33906a052...02259c22f`: approve with fixes; three findings, dispositions in `plan.md` § Audit verdicts.
- 2026-11-17: a mutation check (the `nextTick` in `onWarningFix` removed) turns the real-radio focus test red: focus taken before the pick lands on Public Fee Juice.
- 2026-11-17, Codex round 2 (resumed, same session) over `02259c22f..7c03aece9`: approve.
- 2026-11-17, measured with CDP `Accessibility.getPartialAXTree` in the capture run: the Send page's `role="status"` region stays in Chrome's accessibility tree (`ignored: false`) while the Fee sheet's `role="dialog" aria-modal="true"` is open, so `aria-modal` does not silence a live region behind a popup; and a region under `display: none` is `ignored` (`notRendered`). Not promoted: `lessons.md` holds 8148 of 8192 bytes.
