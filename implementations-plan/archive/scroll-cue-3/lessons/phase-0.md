# Phase 0: planning consults

## Codex plan audit, round 1 (gpt-6.1-sol, high, read-only)

- Verdict: revise. Four material findings, all accepted; see plan.md § Audit verdicts.
- What it changed: explicit section marks instead of the content's children; Restore again gated behind an opt-in prop pending the owner; each press capped at one visible height so a tall section is never skipped; the button moved to `@nulo/design/ui`, since the design package already honours `.noanimations`.
- Recon claim corrected along the way: the reuse sweep said `unlock-method.vue` is off the layout; it is on it.

## Round 2 (resumed)

- Verdict: revise, one finding: a separate repeat-password stop. Rejected (plan D9): at 360 × 600 the section stop clamps to the end with the repeat field in view, and field marks would hide the section heading and spread into the shared `NewPasswordPair` (onboarding renders it too).

## Round 3 (resumed)

- Verdict: approve. Codex withdrew the round-2 finding on the page geometry; the capture run must measure it.
