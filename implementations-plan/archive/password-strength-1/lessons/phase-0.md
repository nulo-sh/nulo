# Phase 0: planning consults

## Codex plan audit, round 1 (gpt-6.1-sol, high, read-only)

Verdict: conditional approve. Six findings; the planner verified each in the scratch probe or the tree:

1. Supply chain checked only core. Verified the four shipped packages: no network, storage, messaging, DOM or `eval`; one `console.info` in core's `addMatcher` (a matcher name, unreachable: no custom matcher). Adopted: Phase 1 compares the resolved lockfile versions with the reviewed ones.
2. 128-unit latency unmeasured. Measured (Bun, common dictionary): 29-76 ms per check at 128 units, factory 17 ms. Adopted as a fact; no debounce, since the check runs only once the pair matches (D4 order), so typing either field does not run it per key.
3. `language-en` dismissed on size alone. Measured: +1.2 MB of ESM, factory 57 ms, 225-320 ms per 128-unit check, and no band change on 15 realistic word and name passwords (only `longenough` 2 to 1, weak either way). Rejected with this evidence. Adopted: no famous phrase as the strong fixture; the quality bar bounded to the estimator.
4. A marker grep cannot prove lazy loading. Adopted: Phase 2 traces static imports from each entry over the emitted chunks.
5. Tests at the owners. Adopted: scoring through the helper and the composable; weak matching pairs still enable submit; weak pins keep weak values.
5b. Full local smoke run. Rejected: the common brief sets the local gate at the touched files; the required CI smoke lanes run the full suite on both browsers before merge.
6. A popup capture. Adopted: the longest line also captured on Change password (popup width).

## Opus Plan leg (opus, Plan, read-only)

Verdict: conditional approve. Ten findings; verified and adopted unless noted:

1. `unlock-method.vue`'s import split shifts 11 line citations in `tests/e2e/helpers/profile-chaos/model.ts`; `profile-chaos-model.test.ts` would red. Verified (11 `cite(UNLOCK_METHOD` entries). Plan: F9, gate.
2. Core retains the last checked password (`scoring/index.mjs:161`, verified); a cached factory keeps it. Adopted: a factory per check (6-23 ms measured), no singleton.
3. Attacker time per band. Adopted: F8, D3 now recommends 10^10 / 10^12 (OA-1 B1), with zxcvbn's own bands as option A1.
4. Non-English passwords over-score. Probed: `йцукенгшщзх` 10^11.0, `contraseña` 10^8.2. Adopted as known limit I3.
5. Grapheme table moved to the hint test, the 13/25 case retired with its line.
6. No `NewProfileCredentials` case (prop echo); weak/good/strong rows on `FilePasswordSection`; strings appear once, in the set pin.
7. Bundle walk over every entry and both builds.
8. Auto-import globals: exports cut to `newPasswordHint` and `NEW_PASSWORD_HINTS`; no new lint rule.
9. Lockfile resolves the reviewed versions; each bump repeats the code scan.
10. 49 233 entries; decompress at chunk load; `src/types/` paths.

## Codex final fresh pass (gpt-6.1-sol, high, new session)

Verdict: conditional approve. Five findings, all verified in the scratch probe and adopted:

1. No English words: `congratulations` 10^15.0, `constitution2026!` 10^15.5, strong. Probed subsets: `commonWords-en` alone fixes both (10^3.1, 10^8.1) at no measurable factory cost; Wikipedia and names cost 100 ms per factory and 350-510 ms per 128-unit check for no band change. Adopted `commonWords-en`; its ODC-BY data licence goes to the owner (OA-3).
2. Core returns no warning above its own score 2, so custom bands lost the reason. Fixed with the documented `timeEstimationValues.scoring` option; Codex's `getFeedback` route rejected (declared private in the types).
3. OA-1's known-limit examples contradicted B. Regenerated under the final configuration.
4. B is a heuristic: stated as such, with its assumed rate.
5. Latency text contradicted the probe. Corrected; browser timing with a budget in Phase 2.

## Codex final pass, round 2 (resumed, verifying)

Verdict: approve. The five fixes reproduced independently; no new material defect.
