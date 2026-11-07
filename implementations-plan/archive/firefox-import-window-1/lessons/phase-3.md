# Phase 3: Change unlock method hands back

- The base moved under the plan: `origin/dev` gained #1703 (36551502f), which reordered the unlock-method page's passkey steps; `attempt`'s success branch was unchanged, so the plan held. The arc branch is cut from 36551502f.
- The hand-back branch inside `attempt` took its cognitive complexity to 16 (Biome's cap is 15). Fixed by extracting the success ending into `leaveChanged(outcome)`; no suppression.
- `scripts/e2e/profile-chaos-model.test.ts` cites 13 lines of `unlock-method.vue` (`tests/e2e/helpers/profile-chaos/model.ts`), which the edit moved. Re-cited by a line diff from the base copy (difflib over the base and new file); `METHOD_LEAVES` now cites the `leaveFor` line inside `leaveChanged`.
