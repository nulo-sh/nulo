# Phase 4 (arc 2): focus after a grant

- 2026-10-16: OA-1 answered B on page 20 (P20-07), quoted in #156's `## Decision`. Branch `worktree-home-onboarding-2-arc2` off `origin/dev` at `5c273865` (#534's squash).
- Design panel: Codex (gpt-6.1-sol, high, session `01a144fa-1177-71f1-915a-823944c9a953`) and an Opus Plan lens agreed on the rule (move focus only when the row held it), the pre-flush timing (Vue 3.5's scheduler puts a pre job ahead of a normal job of the same id, and the slot that renders the row belongs to a child with a higher uid) and the `focusTitle()` chain. Opus's fold: focus in the callback itself, no `nextTick`; the record in plan.md § Audit verdicts.
- The test layer answers every CSS-module name with a class, so a component test cannot see a `:focus { outline: none }` rule: the base test pins it in the source, the e2e reads the computed outline.
- Red checks (component): the watcher removed, both "from Allow" cases fail and both controls pass; the containment check removed (`if (!missing)`), both controls fail and both "from Allow" cases pass.
