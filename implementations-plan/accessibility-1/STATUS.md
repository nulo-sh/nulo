# Status: accessibility-1

## Arc 1 (Send keyboard reach)

- 2026-10-09: page 1 answered (A, A, C, Yes, A, A); recorded in OWNER-ASKS.md; Arc 1 implementation started on `worktree-accessibility-1`.
- 2026-10-09: Phase 1.0 gate pass: lint, typecheck:all, test, test:all; smoke `send-keyboard.test.ts` (the Enter test) on chrome and firefox, retry 0, after a fresh build. Red on the base build on both browsers first.
- 2026-10-09: Phase 1.1 gate pass: fast layers; smoke `send-keyboard.test.ts` (Enter, unit switch) on chrome and firefox, retry 0, fresh builds; network `send-amount-exact.test.ts` on chrome and firefox at `NULO_E2E_RETRY=0`; at-rest shots differ only in the header's account address.
- 2026-10-09: Phase 1.2 gate pass: fast layers; smoke `send-keyboard.test.ts` (Enter, unit switch, token card) on chrome and firefox, retry 0, fresh builds.
- 2026-10-09: Phase 1.3 gate pass (option C): reproduction red on Chrome first; fast layers; smoke `send-keyboard.test.ts` on chrome and firefox; network `send-amount-exact.test.ts` on chrome and firefox at `NULO_E2E_RETRY=0`.
- 2026-10-09: Phase 1.4 gate pass: fast layers; network `fee-sponsor-funding.test.ts` on chrome at `NULO_E2E_RETRY=0` (red on today's card first); shots identical outside the header address.
- 2026-10-09: Phase 1.5 gate pass: fast layers; smoke `send-keyboard.test.ts` (all five) on chrome and firefox, retry 0, fresh builds; network `popup-escape-layered.test.ts` on chrome at `NULO_E2E_RETRY=0`; at-rest trigger shots identical outside the header address.
- 2026-10-09: Arc 1 review: Codex round 1 approve with fixes (four accepted, one rejected), Opus six findings (four accepted); fixes committed; smoke `send-keyboard.test.ts` on chrome and firefox, retry 0, fresh builds; Codex round 2 clean.
- 2026-10-09: merged `origin/dev`; CLAUDE.md § Keyboard & focus order gains call 1's exception.

## Planning

- 2026-10-09: adopted the worktree (`worktree-accessibility-1`, from `origin/dev` at `c42033e`); dependencies installed; registered.
- 2026-10-09: recon done (two Explore agents on sonnet, then direct reads); every follow-up claim checked, four stale line numbers noted.
- 2026-10-09: drafted plan.md, options.md, OWNER-ASKS.md; competing outline B (primitives first) prepared for the audit.
- 2026-10-09: round 1 audit: Codex reject (three High), Opus conditional approve (six conditions); every finding dispositioned in plan.md; plan, options, asks and recon revised (two new page 1 calls, an Arc 3 layer for the PR-dependent phases).
- 2026-10-09: final fresh Codex pass: reject (three blocking, four Med); all seven accepted and fixed in place; resumed the same session to confirm.
- 2026-10-09: final Codex verdict: approve (after one conditional approve, three conditions met in place). Plan at the approval gate; waiting on the orchestrator and the owner's two pages.

## Arc 2 (Home and shared chrome)

- 2026-10-09: arc 2 started on the owner's page 2 picks (calls 1 A, 2 A, 5 A, 6 A); branch `accessibility-1-home-chrome` from the plan commit; `agent-worktree register` refused (branch name), no manifest row.
- 2026-10-09: phase 2.1 gate pass: lint, typecheck:all, test, test:all; smoke home-links.test.ts on chrome and firefox (retry 0).
- 2026-10-09: phase 2.2 gate pass: lint, typecheck:all, test, test:all, build-storybook; smoke tooltips-glossary.test.ts onboarding-tab.test.ts on chrome and firefox (retry 0).
- 2026-10-09: phase 2.3 gate pass: lint, typecheck:all, test, test:all; network connect-one-window.test.ts on chrome and firefox (retry 0).
- 2026-10-09: phase 2.4 gate pass: lint, typecheck:all, test, test:all, build-storybook; dark story shots cmp-identical before and after on chrome and firefox.
- 2026-10-09: arc 2 review round 1: codex conditional approve, opus approve after one Med; six findings accepted (plan.md § Arc 2 audit verdicts); smoke home-links.test.ts and network home-cap.test.ts green on chrome and firefox (retry 0).
- 2026-10-09: arc 2 review round 2: codex conditional approve, one Med (token-page wait) fixed; smoke home-links.test.ts green on chrome and firefox (retry 0).
- 2026-10-09: arc 2 exit gate pass on the final head: audit:vue, test:all, check:plans; smoke home-links, tooltips-glossary, onboarding-tab (15/15) and network home-cap, connect-one-window (2/2) on chrome and firefox, retry 0; codex loop converged (round 3 approve).
- 2026-10-09: merged origin/dev (index.md conflict blocked PR CI); gates re-run green on the merged head: audit:vue, test:all; smoke 15/15 and network 2/2 on chrome and firefox, retry 0.
