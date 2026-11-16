# scroll-cue-build-2: phase 1 (the gate, tests, captures)

- **Codex pass** (gpt-6.1-sol, high, read-only, routed by headroom) over the plan and `git diff origin/dev...HEAD` at `40bffec3e`: `VERDICT: approve`. Findings, all accepted after checking the files:
  - `tests/e2e/onboarding-tab.test.ts`: the page-height check omitted `scrollTop`, so a resize that moved the scroll could let the end room, not the width, hide the button. Now `scrollHeight − clientHeight − scrollTop`.
  - `src/composables/useMoreBelow.test.ts`: the observer test checked subscriptions only. It now starts with no scrollbar (client width 1280), grows the content and delivers the callback: `remaining` 280, `gutter` 15, `width` 1265.
  - `src/onboarding/app.test.ts`: `mountShell`'s doc comment restated its fixture. Removed.
- **Slip:** `-t "create + password happy path"` matched nothing (vitest reads `-t` as a regex, and `+` is a quantifier), so the run skipped all eight tests and exited 0. Rerun with `-t "password happy path"`: green on both browsers. Read the pass count, not only the exit code.
- **Captures** (Chrome, armed build, scratch spec from scroll-cue-6's kit, never committed): five frames, light and dark. Geometry: the corner at x 1228–1264 at 1280 wide on the Terms gate, the phrase step and Import profile, nothing under it; x 724–760 at 776 wide beside a column ending at x 708; nothing drawn at 775 or 720.
