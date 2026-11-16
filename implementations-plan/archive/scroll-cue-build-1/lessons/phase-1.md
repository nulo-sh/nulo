# Phases 1–3: build, e2e, captures, review

## Attempts

- The cherry-picks of `ff0a10655` and `119a45227` applied clean on `1f94c0938`; #1817's fee-row change did not meet the prototype's marks.
- The first focused e2e run reported two reds, each read:
  - S13's `coveredAt(legal-continue)` returned the actions `DIV`. Continue was disabled, and its `pointer-events: none` makes hit-testing return the parent, so the probe cannot speak for a disabled control. The assertion was dropped; Continue's whole box and the gone button carry the case.
  - The execute case with the steps shut found "Leaves your account" under the button's bottom 5 px. Owner ask A1 (D11).
- The Chrome gate's one red was `execute-steps.test.ts`'s Tab-count helper counting the new `tabindex="-1"` button (26 read 27). The same test's Tab walk passed. Fixed at the helper (D13).
- A Firefox rebuild run from `apps/extension` with `--cwd apps/extension` failed to chdir, so the next run tested the earlier build. It was caught from the build log, rebuilt from the root, and rerun; the evidence in `STATUS.md` is the second run.

## Consults

- **Codex round 1** (gpt-6.1-sol, high, read-only; plan and `origin/dev...HEAD` at `1a6de01d6`): `changes`, four findings, each verified against the tree and fixed in `96b3ef5be`:
  1. Onboarding showed the button for the last 16 px of its 64 px end room (demonstrated). The shell now gates on `remaining > 64`.
  2. The composable's document tests left their scopes running across tests (demonstrated). The scopes are now stopped in `afterEach`.
  3. The steps-shut exemption accepted any text. It is narrowed to the measured label.
  4. A narrating comment in the scan test was removed.

  It approved D1, D5 and the five brief questions. Its attacker note: a dApp's payload decides which line lands under the corner. That is folded into A1.
- **Codex round 2** (resumed, the fix commit): `approve`. It confirmed in memory: shown at 65 px, hidden at 64, no window listener after cleanup.
