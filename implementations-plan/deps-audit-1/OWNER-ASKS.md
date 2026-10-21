# deps-audit-1: owner asks

## OA-1: may arc 1 carry the one-line test fix for #987?

- **Surface:** none a person sees. The ask concerns scope: one test file outside the lane's dependency files.
- **Why:** the soak matrix (CLAUDE.md's bar for a test-runtime change, which vite 8.2.4 is) cannot pass `infra/token-list` at any commit. `test/live-check.test.ts:263` spawns `process.execPath`, which is `node` under the soak's Node reference, on a TypeScript script Node refuses. The failure is pre-existing (same red on `ef5336bbc`) and filed as #987. Every other gate is green at candidate `57c35cec5`: the bumps, builds, artifact checks, smoke on both browsers, 12 of 13 compares, `test:all` ×5 and the `pr-quick` dispatch.
- **Options:**
  - **A (recommended):** arc 1 adds `test(token-list): spawn the live-check script with bun, as ci runs it` (`spawn("bun", …)`, closing #987 in the same PR). Then Phases 2-3 rerun in full at the new candidate (about 5 h of host time), and the PR opens when every compare exits 0.
  - **B:** fix #987 first in its own PR. Arc 1 then merges `dev` and reruns Phases 2-3 at the new candidate.
  - **C:** an owner exception: open arc 1's PR now with the red stated in its body, and fix #987 later.
- **What ships now:** nothing. The arc is committed and pushed (`deps-audit-1-a1`), with no PR. #980 stays open, and the audit gate keeps failing dependency PRs until one of the options lands.
