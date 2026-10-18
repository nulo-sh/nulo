# Phase 3: the recovery phrase

- Gate: green on the first run. `F` (826 test files); smoke at retry 0 on Chrome (7 passed, 1 skipped, 332 s) and Firefox (7 passed, 1 skipped, 498 s); network `frozen-account-canary` prover-ON at retry 0 on Chrome (2/2, 366 s) and Firefox (2/2, 518 s). STATUS.md, 16:02Z and 16:38Z.
- `SecretRevealCard` had one user, `seed.vue`: the account export popup does not render it. It is deleted with its test and story rather than kept for a caller that does not exist.
- "Do it later" reuses the `OnboardingSkipLink` deleted in phase 1, restored with renamed test ids: the drawn text action is that component.
- E2E runtime, measured against the phase 1 and 2 logs: the `onboarding-tab` run-through 6.7 s → 10.0 s on Chrome (+3.3 s), 19.2 s → 17.4 s on Firefox (load noise); `keyboard-guards` "Enter in the confirm field" 6.5 s → 6.9 s on Chrome, 10.6 s → 15.3 s on Firefox (host load 140 to 149 on both runs).
- Network runs wait for load1 < 150: the canary waited about 25 minutes on a host other sessions held near 190.
