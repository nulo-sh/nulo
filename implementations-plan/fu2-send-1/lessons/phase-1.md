# Arc 1 (phases 1-2)

- Phase 1: `openingSendSide` plus the `initSendType` hook; the two page cases failed with the base `send.vue` and passed after; the both-sides control passed in both. Gate: lint, typecheck:all, vitest `src/popup/pages/send` + `modules/send` (722 passed).
- Phase 2, attempt 1: the reset at `nextTick` did not hold. A real paste (type, Ctrl+A, Ctrl+C, Backspace, Ctrl+V) on the branch build read `scrollLeft` 242 after two frames on Chrome and Firefox 158.
- Phase 2, attempt 2: the reset at `requestAnimationFrame` held on both (0 after the paste, 250 after a typed character).
- E2E red proof against the base dists: the paste check failed on both browsers; the hover check failed on Firefox and passed on Chrome, because a wait on settled transitions alone read Chrome before `:hover` applied. Waiting for `matches(":hover")` first made it fail on Chrome at the base too, and pass on the branch.
- `send-keyboard.test.ts` per-file duration, base file on base dist, then the branch file on the branch dist: Chrome 50.8 s → 52.7 s; Firefox 70.0 s → 78.3 s (an earlier branch run took 115.4 s on the same host under load from other lanes; the base file was not rerun beside it).
- Gate: smoke `send-keyboard`, `send-fee-privacy`, `send-outcome-rows`, `send-picker-add`, `contacts` on Chrome and Firefox at retry 0: 15/15 each. `audit:vue` and `test:all`: exit 0.
