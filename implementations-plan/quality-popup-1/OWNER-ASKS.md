# quality-popup-1 owner asks

## OA-1. Onboarding's Create profile password fields (not blocking)

**Surface.** Onboarding, Create profile, the password method: the "Password" and "Confirm password" fields (`onboarding/pages/create.vue`).

**Today.** Two password fields with their own headings, no eye button to show what was typed, and the strength hint as plain grey text under the second field. Every other new-password pair in the wallet (New profile, Import, Change password, Unlock method, file passwords) shows one eye button that reveals both fields, and the hint under the first field beside a small lock icon.

**Options.**
- **A. Keep it as it is.** Onboarding's form keeps its two headings and its plain hint; it stays outside the shared component this lane builds.
- **B. Use the shared pair.** The first field gains the eye button and the lock-icon hint under it, as on New profile; the two headings stay.

**Recommendation.** B: a person creating a first password can check what they typed, as everywhere else in the wallet. It is a visible change, so it waits for your word.

**What ships now.** A. Arc 2 changes only `create.vue`'s cap constant; the fields look and behave as today.
