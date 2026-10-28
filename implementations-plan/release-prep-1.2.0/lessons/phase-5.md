# Phase 5: delivery, 2026-10-28

## Review loop, round 1 (over Phase 4's diff, `1af2ac6f7`)

- **Codex** (gpt-6.1-sol, high, read-only): two findings.
  - P2: Chrome's unlock was waived without proof that no credential survives the update. Populate closed the credential's page itself, before the update. Codex suggested a test: park that tab on a neutral page across the reinstall, then bring the same tab back. **Accepted** and verified (below).
  - P3: two comments. One said the update closed the page, but populate had. A doc-comment restated its helper. **Accepted**: both are gone with the rewrite.
- **Opus** (`general-purpose`, beside round 1): five findings.
  - The profile-chaos `pre-update` start models the release's passkey profile as retired whatever the tag (`helpers/profile-chaos/model.ts:420`, checked by `checkers.ts` `startBound`, described in `tests/e2e/README.md` § Start states). The same pre-1.1 assumption as case 3. **Filed** as an issue (outside this lane: the PR changes no chaos file).
  - Two comments to tighten: populate's, and the unit check's URL comment. **Accepted.**
  - `tests/e2e/README.md` § In-place update lists two traits. **Accepted**: the bullet names the third.
  - The release skill's post-release step lists two traits in its parenthetical (`.claude/skills/release/SKILL.md` § Stable release, step 1). **Accepted**: a release that pins only those two is refused, so the step's wording was incomplete.

## Chrome keeps the credential in a parked tab

- Case 3 alone, Chrome, the candidate at `1af2ac6f7`, the tab that made the credential parked on `about:blank` across the update: **passed**, 8.4 s. The unlock was pressed and Home reached.
- Control: that tab closed and a fresh popup parked instead. **Failed** at the unlock: `TimeoutError: Waiting failed: 60000ms exceeded`, in the `#/popup/general` wait after the press, 68.3 s. So the parked tab itself keeps the credential. The update closes extension pages only (`fixtures/update/in-place.ts:148`).
- Case 3 alone, Firefox, same edit: **passed**, 16.5 s.
- The retired branch, as a regression: the replay from `v1.0.0` on Chrome, all four cases, **passed**. Durations: 29.3 s, 13.9 s, case 3 10.6 s, 11.5 s; vitest 65.3 s.
- D6 now presses on both browsers. The `credentialOutlivesPage` branch is gone.

## Review loop, round 2 (over `1af2ac6f7..fe2048f1c`)

- **Codex** (resumed session): `clean`. The parked tab keeps the credential under `updateInPlace` on both drivers, and the update's own checks (candidate version, live background, the `update` event) still hold. Under `unlocks` the unlock, Home and the row check now run on both browsers with no capability branch. The `retired` check is verbatim. The comments are exact. The loop converged at round 2.
