# Phase 6: #767, the landing's early-days notice (arc 2)

- 2026-10-18: OA-1 answered on decision page 47 (P47-03 B, "and tell us what you find", with "their"); OA-2 read by the orchestrator as A (footer `early days`, screen-reader name "Early days notice"). `apps/landing/index.html` and `README.md` only.
- Gate: `bun run lint` 0; `apps/landing` `test` 0, `typecheck` 0, `build` 0. Pictures `screenshots/arc2/` (one theme, the landing has no other): the notice and the footer at 1280 px and 390 px, before (`origin/dev`) and after; the rendered strings read back from the page match the answers.
- The phone notice squeezes its sentence into a narrow column beside the tag before and after (no narrow-screen rule for `.notice` in `page.css`, which another lane holds); unchanged here.
- Review: Codex (gpt-6.1-sol, high) round 1 `approve`, no findings; it noted the root `README.md` banner ("DEMO / PREVIEW BUILD") names the repository, not the landing, so it is out of this arc.
- Arc 2 records its gates here rather than in `plan.md`/`STATUS.md`: those files changed on arc 1's branch, and a second edit would turn the post-merge add/add on the plan files into a hand union. The close-out folds them into `plan.md`.
- Review: Opus (general-purpose) round 1: the copy matches the answers; it asks that the PR say OA-2 is the orchestrator's reading and carry `Closes #767`. Both are in the PR body; no code change.
