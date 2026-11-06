# Phase 0: planning consults

Every consult of the planning panel, its verdict and what changed, in order.

## Recon (2026-11-06)

- Two Sonnet explorers: a reuse sweep (helpers, call sites and their surfaces, pinned strings, the census, complexity, locale) and an e2e mapper (asserted strings, seeding, captures, commands). The planner re-read each cited line. The sweep assumed each split side keeps its own precision; the pick (P116-13 B) sets them at the total's decimals, so `0.0005` under `999.999` reads `<0.01`, not `0.0005`. The mapper corrected the lane brief's premise that smoke runs through `agent.sh`: it runs the network config only.

## Round 1 (2026-11-06)

- **Codex, gpt-6.1-sol at high, read-only, fresh session:** reject. D3 and D5 settle visible strings without the owner; gates not runnable (`test:components` only in `apps/extension`, a capture spec outside `tests/e2e/` undiscovered, no `audit:vue`); Fact 3 misdescribed today's split; the bound claim false for uncapped journal and incoming strings; I1's coverage overstated; census controls; compatibility rows.
- **Opus 5.5, Plan:** conditional approve. D3, D4, D5 as owner asks; the gate; stale comments; census red between phases; `auto-imports.d.ts`; drop D6's column (rejected); 12 calls; two network split reads; mono role for I1; de-DE floor and negative rows; drop the extra `TokenCard` case; the cut's own trailing zero.
- **Probe:** a vitest config under `~/.cache` with `root` at `apps/extension` and `include`/`dir` on a scratch folder discovers and runs a spec there (a config there cannot import `vitest/config`: export a plain object, or import the repo's config by absolute path).
- **Codex, resumed with the revision and the D3-D5 argument:** approve. Withdrew D3 and D5 (high confidence), D4 is no product policy; two lows (stale counts, a redundant `test:components` run). Counts fixed; `test:components` kept because the lane brief names it.
- **Opus, resumed with the same argument:** withdrew the D3-D5 condition; its remaining conditions were already folded.

## Final fresh Codex pass (2026-11-06)

- **Codex, gpt-6.1-sol at high, new session:** approve. No misstated fact; no new adversarial finding; representative strings re-checked against the real formatter; I1 waits on the browser gate, as planned.
