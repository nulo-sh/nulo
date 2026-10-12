# Arc 2 — implementation log

## Phase 2.1 (#134)

- 2026-10-12 — built as Architecture § Phase 2.1 says. The row is the local `Button` (`secondary`,
  `wide`); `trimAddress(q, 4, 2, "…")` gives the proposal's "0x12…ab" form, so no new formatter. The
  popup's prefill path (`preselectedTokenAddressToAdd`, read in `onShow`) needed no change.
- The smoke dist must be the armed build: a plain `bun run build` is refused by
  `global-setup-smoke.ts` ("not the armed smoke build"). Build with
  `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1`
  and run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. `bun run test:e2e -- <file>` passes the
  `--` through to vitest and finds no file; drop it.
- `importToken`'s popup tail (wait for the enabled button, click, wait for the toast) moved into
  `submitNewTokenPopup` so the Holdings add and the Home menu import share it; `waitForNewTokenAddress`
  reads the field the way `replaceInputValue` finds it (the testid names the Input's root).
- #169 is closed (2026-10-10), so gate G1 (one network run on the host) no longer holds; `agent.sh`
  claims its ports from the registry and runs beside another worktree's run.

## Phase 2.2 (#136)

- 2026-10-12 — built as Architecture § Phase 2.2 says after page 8 (D-arc2-1): the `catch` shows the generic
  line and logs `{ reason: err }` at debug; no `packages/aztec-runtime` change. Base-copy run (the base popup with
  only the new testid added): both refusal tests red on their text assertion (`expected 'contract instance not
  found' to be 'Something went wrong. Try again.'`, and the same for the store refusal).
- The network step pastes a valid address that holds no contract: the PXE answers "contract instance not found",
  a realistic refusal that crosses the real RPC hops, and gives the generic-line shots.
- First network run red on my own edit: a scripted import change missed a block biome had reflowed, so
  `waitForToastGone` was undefined. `typecheck:all` covers `tests/e2e` (`tsconfig.e2e.json`); run it before a
  network run, not after.
- A success toast lives six seconds (`SUCCESS_TOAST_MS`); a shot taken right after an add catches it over the
  next popup's field. The test waits for it to close (`waitForToastGone`) before the refusal step.
- The popup chunk search needs a minified-aware walker: `}from"./x.js"` has no space before `from`. A first
  walker reached 4 offscreen chunks and missed the one holding the string; the control caught it.
