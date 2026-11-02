---
plan: password-strength-1
tier: light
status: delivered (one PR against dev with this close-out, merge pending on the orchestrator's word)
issues: "#1401 (arc 1 closes it)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex (gpt-6.1-sol, high, read-only) audit round-trip and a final fresh pass; one Opus Plan leg
base: origin/dev at 3af5f7840
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 3af5f7840
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-02.
- **Status:** delivered. One PR (#1503) against `dev`; its final commits are this close-out; it merges on the orchestrator's word.
- **Owner sign-off:** P94-08, option C (2026-11-01), for the rule; OA-1 = A1 and OA-2 = A (2026-11-02) for the lines, the bands and the surfaces (UI impact); OA-3 = B decided by the orchestrator with Codex on the owner's delegation (D10).
- **Shipped:** the hint under all seven new-password fields estimates guessability with `@zxcvbn-ts/core` 4.2.0 and `@zxcvbn-ts/language-common` 4.1.3 under zxcvbn's own bands, and names a weak password's reason (repeated characters, characters in order, a keyboard pattern, a common password, or make it longer); "Long enough. Don't forget it." retired. A UI-only module the worker never loads, a new estimator per check; what the form accepts is unchanged. Closes #1401.
- **Dispositions:** the stricter bands (B1) declined by the owner (D3); the English word list left out (D10); a cached estimator declined, since it keeps the password (D9).
- **Known limits:** #1562 (non-English words and non-Latin keyboard rows over-score).
- **Open items:** #1561 (the English common-word list, once its data licence and attribution are settled).
- **Lessons:** none promoted. `lessons.md` is at its 8 KiB budget, and this plan's gotchas are its own: zxcvbn warns only up to score 2 (D3); `bun remove` re-sorts a manifest's dependencies ([lessons/phase-3.md](lessons/phase-3.md)).
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# password-strength-1: the new-password hint measures more than length

One issue, one arc, one PR against `dev`. At 162 lines this plan runs over the light target: the Outcome and the owner's answers (Phase 3) were added to a plan written at it. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person who sets a password that guards a wallet on this device or an exported file, and reads the line under the field to judge it.
- **Excellent**: (1) within what the estimator knows, the line never calls a password good or strong that a guesser finds early: repeats, runs, keyboard rows and common passwords read as easy to guess, with the reason; (2) the line appears with no visible delay, and the value never leaves the page, outlives the check in the meter, or reaches a log.
- **Good enough**: the estimate and its bands are the library's (D3); it reads short random strings as easy to guess (`q8Rt!vP3`), and with no language word list it is blind to English words (`congratulations` reads strong, #1561) and to non-English words and non-Latin keyboards (I3). The form accepts what it accepts today.

## Assumptions

**Facts** (at `3af5f7840`; traces in [recon.md](recon.md)):
- F1 `newPasswordHint` (`apps/extension/src/utils/password.ts:14-20`) measures grapheme length only: under 8 "At least 8 characters", a mismatch "Passwords don't match", over 24 "Long enough. Don't forget it.", else "Strong password".
- F2 Seven surfaces render it, not the two the issue and the lane brief name: first-run and later Create profile, Change password, Unlock method (passkey to password), Import secret, Import full backup, File password (account and full-backup export). All show it as body text in the field's hint place, never red.
- F3 `password.ts` is also imported by `wallet/services/profile/service.ts:4` and `wallet/services/account/service.ts:22` (for `isNewPasswordValid`), so whatever that module imports reaches the worker runtime.
- F4 `@zxcvbn-ts/core` 4.2.0, `@zxcvbn-ts/language-common` 4.1.3, `@zxcvbn-ts/language-en` 4.1.1 and their two dependencies are MIT with a licence file each, all older than 7 days. `language-en`'s `commonWords` list is OpenSubtitles data under ODC-BY (attribution), stated in its `NOTICE.md`, which the notices generator ships (`NOTICE_FILE`, `packages.ts:27`). The shipped code of all four has no network, storage, messaging, DOM, `eval` or dynamic import; its one `console.info` (core `addMatcher`, a matcher name) is unreachable without a custom matcher. Probe results, sizes and speed: recon § Library probe. OA-3 = B left `language-en` out (D10): the shipped set is `core`, `language-common` and their two dependencies.
- F5 The profile key is PBKDF2-SHA256 at 600 000 iterations (`packages/wallet-crypto/src/encryption-key.ts:7`): a stolen vault or exported file meets an offline slow-hash guesser, the case zxcvbn's scores 3 and 4 are calibrated for.
- F6 Every new-password field caps input at 128 UTF-16 units. In Bun on a loaded host a check takes 1-12 ms up to 64 characters and 29-194 ms at 128; a new factory, 17-31 ms. Browser numbers are measured in Phase 2.
- F7 Core keeps the last checked password in its scoring object (`scoring/index.mjs:161`, `this.password`) and slices of it in `optimal`: a factory that outlives the check keeps the chosen password in the page heap.
- F8 zxcvbn prices its slow-hash case at 10^4 guesses a second; one current GPU against PBKDF2-SHA256 at 600 000 iterations is 1-2×10^4 (moderate confidence: a published RTX 5090 hashcat mode 10900 rate of 11.16 MH/s at 999 iterations, scaled). At 10^4: 10^8 guesses is about 3 GPU-hours, 10^10 about 12 GPU-days, 10^12 about 3 GPU-years. An illustration, not a measured cracking rate.
- F9 `tests/e2e/helpers/profile-chaos/model.ts` cites 11 lines of `unlock-method.vue` by number; `scripts/e2e/profile-chaos-model.test.ts` fails when they move.

**Inferences**:
- I1 Lazy page chunks (`vite-plugin-pages`) keep the dictionary out of the popup's first load when only page-level modules import it; the build check in Phase 2 confirms it.
- I2 The default `translations` are the warning keys, so `feedback.warning` names the reason (`simpleRepeat`, `sequences`, …); the unit tests pin one value per reason, so a library bump that moves a key reds them.
- I3 The password list (49 233 entries) is ASCII, the word list English and the graphs Latin layouts: `йцукенгшщзх` scores 10^11.0 and `contraseña123` 10^10.4, both strong under the library's bands, as both read "Strong password" before. Known limit #1562.

**Asks**, answered 2026-11-02 ([OWNER-ASKS.md](OWNER-ASKS.md)): OA-1 = A1 (the nine lines, zxcvbn's bands), OA-2 = A (all seven surfaces), OA-3 = B (the English list left out, D10).

## Architecture & Implementation

- **Split by consumer.** `utils/password.ts` keeps what the worker shares: `characterCount` (now exported) and `isNewPasswordValid`, unchanged. A new UI-only `utils/password-hint.ts` holds the meter, the hint set and `newPasswordHint`; the seven surfaces import from it. Nothing under `wallet/` imports it (F3).
- **The meter.** A private `strengthHint(password): string` returns the line for a matching pair's tier and reason; `WeakReason` is `"repeat" | "sequence" | "keyboard" | "common"`, and a weak result with no mapped warning reads `guessable`. Module scope holds only the options: `language-common`'s dictionary and graphs, which the package decompresses when the chunk loads; the bands are the library's defaults (D3). Each call builds a `ZxcvbnFactory`, runs `check(password)` with no user inputs and returns only the line, so nothing that holds the password outlives the call (F7). The module exports `newPasswordHint` and `NEW_PASSWORD_HINTS` only: `src/utils/` is an auto-import dir, and an export there is a global everywhere.
- **Bands** (D3, OA-1 = A1): zxcvbn's `score`, 0-2 weak, 3 good, 4 strong (its thresholds, 10^8 and 10^10 guesses). The library warns only up to score 2, so every warning lands on a weak line. **Reason**: `feedback.warning` mapped by a typed table: `simpleRepeat`, `extendedRepeat` → repeat; `sequences` → sequence; `straightRow`, `keyPattern` → keyboard; `topTen`, `topHundred`, `common`, `similarToCommon` → common; any other key or none → guessable. The table `satisfies` the library's warning-key type, so a renamed key fails the typecheck.
- **Hint order** (D4, unchanged): under 8 graphemes, then a mismatch, then the strength tier. Each tier maps to one string in an exported `NEW_PASSWORD_HINTS`; `newPasswordHint` returns one of its values.
- **Files**: add `utils/password-hint.ts` and `utils/password-hint.test.ts`; edit `utils/password.ts` (export `characterCount`, drop `newPasswordHint`), `utils/password.test.ts` (acceptance cases only), the seven import sites (`useProfileCreateFlow.ts`, `change-password.vue`, `unlock-method.vue`, `ImportSecretForm.vue`, `ImportFullBackupForm.vue`, `FilePasswordSection.vue`; `NewProfileCredentials.vue` takes a prop), `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json` (regenerated), `tests/e2e/helpers/profile-chaos/model.ts` (the 11 `UNLOCK_METHOD` lines, F9), `apps/extension/package.json` and `bun.lock` (`core` and `language-common`, caret ranges as the file's other npm entries), and the hint pins listed in recon.
- **Alternative not taken**: a local rule (D1).

## Decision ledger

- **D1 Estimator: the library.** A local rule (repeats, runs, rows, a short list, class entropy) is about 120 lines with no dependency, but without a dictionary and its variants it reads `Password1!`, `Summer2024!` and `iloveyou2024` as good: the top real-world guesses, the dishonesty the owner chose C to remove. zxcvbn is the reference estimator, already models repeats, sequences, keyboard graphs, dates, l33t and 49 233 common passwords, and passes every gate the brief sets (F4). The plan passed `language-en`'s `commonWords-en` list: without it `congratulations` scores 10^15.0 and `constitution2026!` 10^15.5 (strong), with it 10^3.1 and 10^8.1 (the final Codex pass, reproduced); OA-3 = B left it out (D10, #1561). Wikipedia and name lists add a factory of 100 ms and 350-510 ms per 128-unit check for no band change on the probe set (recon). The package entry imports all its lists; a deep import of one generated file is rejected as reliance on its internal layout, and Phase 2 records the chunk size. The original `zxcvbn` 4.4.2 (2017, unmaintained) is out.
- **D2 Static import, a factory per check.** A dynamic `import()` would make the hint async and need a loading state for a ~430 kB chunk read from disk; lazy page chunks already keep it off the popup's first load (I1). A cached factory keeps the password (F7); one per check costs 6-23 ms and runs only when the pair matches (D4), never per key while the fields differ.
- **D3 Bands: zxcvbn's own (OA-1 = A1, the owner, 2026-11-02).** The plan recommended 10^10 and 10^12 (B1), a conservative heuristic: the library's strong starts after about 12 GPU-days at its own slow-hash rate (F8), carried by its documented `timeEstimationValues.scoring` option. The owner chose the tested default: "I'd go with something utterly tested already." No override, so `score` and the warning are the library's. Cost: 10^8 to 10^10 guesses reads good (`kettle-violet`, `TestPassword123!`); short random strings still under-score (`q8Rt!vP3` is 10^8.0).
- **D4 Order kept.** Showing the weak line before the mismatch line would leave a disabled button with an advisory reason under it; the existing resolution order stays.
- **D5 One hint for every surface** (OA-2 = A, the owner: "Yes, all seven."): the seven fields set passwords guarding the same kind of encrypted data; a second length-only hint would keep "Strong password" for `aaaaaaaa` on five of them.
- **D6 The acceptance rule and the worker's re-checks stay** (brief: out of scope). The meter never disables a button.
- **D7 Tests**: `password-hint.test.ts` pins `NEW_PASSWORD_HINTS` to the OWNER-ASKS list (the one place the words appear; signed as drafted, OA-1 = A1), one value per reason and band, the under-8 line on 7 versus 8 emoji, `é` and ZWJ families (moved from `password.test.ts`; the 13/25 case retires with the over-24 line). Create profile: the brief's values (`aaaaaaaa`, `12345678`, `qwertyuiop`, 12 of one emoji, 12 different emoji, a passphrase) in `useProfileCreateFlow.test.ts`, which both Create screens render; Change password: the same in `change-password.test.ts`; each proves a weak matching pair still enables submit. Export: weak, good and strong rows join `FilePasswordSection.test.ts`'s table; the broken pins keep their weak values (`password123`, `12345678`, `pass1234`). `NewProfileCredentials` only echoes its prop: no case there. No e2e scenario: the meter is pure, runs in jsdom, and no browser can change a returned string. Phase 3 re-pinned the vectors: `congratulations` weak → strong (no English list); `kettle-violet` and `TestPassword123!` weak → good, `blue7Kettle!` good → strong and eight ZWJ families repeat → good (10^8.9), all by the library's bands; `xK9#mQ2vxK9#mQ2v` (it pinned the warning under raised bands) and `Nulo-wallet-7` retired; `q8Rt!vP3` added; the export's good row is `kettle-violet`.
- **D9 Latency budget, revised after measuring** (deviation). Phase 2 measured a matching pair's input-to-hint time: Chrome 13-36 ms realistic, 65-108 ms at 128 units; Firefox 36-66 ms realistic, 94-120 ms at 128. Firefox exceeds the 50 ms realistic budget this plan set. The realistic budget moves to the 100 ms input-response bound (RAIL), which both browsers meet, and the 128-unit budget stays at 300 ms; a cached factory would be faster but keep the chosen password (F7), and the public API offers no prepared configuration to reuse; the meter runs once per matching edit, never per key while the fields differ (D4). Without the English list (Phase 3, Chrome): realistic 6-12 ms, 128 units 38-85 ms.
- **D10 The English word list left out (OA-3 = B, decided by the orchestrator with a Codex consult on the owner's delegation, "decide you + Codex please", 2026-11-02).** The package's `NOTICE.md` names ODC-BY for its OpenSubtitles-derived word list but carries neither the licence text nor its URI, which ODC-BY 1.0 § 4.2(b) asks for (checked: its `THIRD_PARTY_LICENSES.md` names ODC-BY with the OPUS URL only); the exact upstream input's grant (OPUS's OpenSubtitles 2024 frequency list) is plausible but not verified; and the notices gate reads the package's MIT and cannot see a data licence, which a shipped record would have to name explicitly. `core` and `language-common` stay (MIT, no data notice). Open issue #1561 holds the fix: the dependency plus an explicit data-licence record in `packages/third-party-notices`. The hint chunk falls from 1.66 MB to 461 kB.
- **D8 Captures**: a scratch spec outside the commit drives first-run Create profile on Chrome, light theme, and writes one PNG per string; the PNGs live in `screenshots/` and the PR links them by commit (`raw/<sha>`).

## Security & Adversarial Considerations

- **Threat**: the typed password now enters third-party modules in the extension page, whose CSP allows `connect-src https:`. A malicious release could send it out. Controls: the 7-day age gate, the frozen lockfile, the notices gate, and the reviewed code at the locked versions (F4); `bun pm diff` lists versions, not code, so every bump of these four repeats the F4 scan. It runs at the same trust level as the page's other bundled code.
- **No leak**: the meter returns one of the fixed lines only; it logs nothing, sends nothing, and keeps nothing past the call (F7, D2) (CLAUDE.md § Logging policy: the value is never passed to a log call, not even under a named key). The worker never loads the library (F3).
- **Hostile input**: a paste is capped at 128 units by the field (F6); Phase 2 measures the worst case in both browsers. The meter is advisory, so a wrong estimate changes words, not what is accepted.
- **Crypto**: untouched; no KDF, salt or storage change.

## UI impact

The owner, #1401 under `## Decision` (page 94, P94-08, signed 2026-11-01), option C: "The hint measures more than length (repeats, sequences, an estimator). A lane plans the rule, the dependency if one is used (under the 7-day minimum age), and brings the new hint wording for sign-off before it ships."

- **Before**: an 8+ matching pair reads "Strong password", over 24 graphemes "Long enough. Don't forget it.", `aaaaaaaa` included.
- **After**: the same place and style show one of OA-1's nine lines by zxcvbn's score; under-8 and mismatch lines are unchanged; "Long enough. Don't forget it." is retired; no colour, layout or button change. On the seven surfaces of F2.
- **Sign-off** (2026-11-02, in chat): OA-1 = A1, the owner: "Sounds like zxcvbn's are the best? is that a well-used package / standard? I'd go with something utterly tested already." OA-2 = A, the owner: "Yes, all seven." OA-3 = B adds no copy or layout; one long English word reads strong, as option B stated (D10).

## Phases

### Phase 1: The meter and the hint ✓
1. Add the three packages to `apps/extension/package.json`; run `bun install`. Confirm `bun.lock` resolves the five reviewed versions (F4); a different one is re-scanned first.
2. Write `utils/password-hint.ts` and its tests; export `characterCount`; move `newPasswordHint`; point the seven sites at the new module; shift the 11 citations (F9).
3. Update the broken pins and add the cases of D7.

**Gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/utils/password src/composables/useProfileCreateFlow src/popup/pages/settings/security src/components/composite src/utils/copy-dash-ban src/utils/red-text-ban scripts/e2e/profile-chaos-model --retry=0`. Pass: exit 0; each new hint case fails against the base `newPasswordHint`. Layers: lint, typecheck, unit, component.

### Phase 2: Build, e2e, captures ✓
1. The armed smoke builds, Chrome and Firefox (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`). Pass: exit 0; `THIRD-PARTY-NOTICES.txt` lists each package that renders and carries `language-en`'s NOTICE; the marker `ApasswordA` exists in the build, and a scratch walk of static `import` edges from every entry (the four HTML entries and the service worker loader) never reaches its chunk; record that chunk's size.
2. Smoke e2e at retry 0, Chrome then Firefox (`NULO_E2E_BROWSER=firefox`): `cd apps/extension && bun run test:e2e -- tests/e2e/registration.test.ts tests/e2e/onboarding-tab.test.ts tests/e2e/security.test.ts --retry=0`. Pass: all green; record each browser's wall-clock.
3. Take the captures (D8), plus the longest line on Change password at popup width; commit them under `screenshots/`. In the same scratch spec, time a matching pair's hint in both browsers: a realistic pair (16 characters) and a 128-unit pair, cold and warm. Budget: under 100 ms realistic (50 ms before D9), under 300 ms at 128 units; over it, stop for a plan change.
4. `bun run test:all`; `bun run check:plans`. Pass: exit 0.

### Phase 3: The owner's answers ✓
1. Remove `@zxcvbn-ts/language-en` from `apps/extension/package.json`, `bun.lock` and the hint module (D10); drop the `timeEstimationValues` override (D3).
2. Re-pin the vectors (D7) and retake the captures (D8); file #1561 and #1562.

**Gate**: lint; typecheck:all; `cd apps/extension && bun --bun vitest run src/utils/password src/composables/useProfileCreateFlow src/onboarding/pages/create src/onboarding/pages/import src/popup/pages/settings/security src/components/composite src/popup/components/modules/settings/new-profile src/utils/copy-dash-ban src/utils/red-text-ban --retry=0`; `bun run --cwd apps/extension build` emits the notices with no refusal and no `language-en`; the armed builds and the static walk (Phase 2); smoke `registration`, `onboarding-tab`, `onboarding-import`, `security`, `settings-routes` on Chrome and Firefox at retry 0; `bun run check:plans`.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-3 | `worktree-password-strength-1` | `dev` | `feat(password): the new-password hint measures guessability, not only length` (79) | #1401 |

Merge `origin/dev` before the PR; `bun run check:plans` after. Open ready, without labels. Body: the owner's decision quoted; the set with its bands (OA-1), surfaces (OA-2) and data licence (OA-3), with the owner's answers quoted; the captures; every gate with its outcome; each browser's smoke wall-clock (no scenario added); `Closes #1401`. Arc 1 posted the set on #1401 under `## Proposed wording`.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `3af5f7840`. Plan-specific values:

- **Review loop** (once, after Phase 2): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff <merge-base>...HEAD`, with this plan, the ledger, the adversarial ask and the standard's two rules verbatim; resume with `resume-codex.sh`; hard stop at three rounds. Log rounds in `lessons/phase-2.md` and under Audit verdicts.
- **Approval boundary**: a string, band or surface outside OA-1/OA-2 is a plan change; the owner's edits land as a commit that updates `NEW_PASSWORD_HINTS`, the bands and their pins.
- **Close-out**, the PR's final commits, after the owner signs: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome block; I3 filed as closed `known-limit` #1562 and the English list as open #1561 (both deduped); `STATUS.md` deleted; `git mv implementations-plan/password-strength-1 implementations-plan/archive/password-strength-1` in its own commit, the index line moved; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/password-strength-1/plan.md` succeeds, `agent-worktree done password-strength-1 --merged`. The orchestrator's next session notices the merge.

## Audit verdicts

**Codex, round 1** (gpt-6.1-sol, high): `conditional approve`. Verified and adopted: the whole dependency set scanned and the locked versions checked (F4, Phase 1); 128-unit latency measured (F6); a marker grep replaced by a static-import walk (Phase 2); tests at the owners, weak matching pairs still enable submit, weak pins keep weak values (D7); a popup-width capture (Phase 2); no famous phrase as the strong example, the quality bar bounded. Rejected with evidence: adding `language-en` (+1.2 MB, 225-320 ms per 128-unit check, no band change on 15 realistic word and name passwords); a full local smoke run (the common brief sets the touched files; the required CI lanes run the full suite on both browsers).

**Opus Plan leg** (opus, Plan): `conditional approve`. Verified and adopted: the chaos model's line citations (F9, gate); the cached factory keeps the password (F7, D2: a factory per check); attacker time per band (F8, D3, OA-1), which moved the recommended bands to 10^10 and 10^12; the non-English blind spot as a known limit (I3); the grapheme table moved, not dropped (D7); no `NewProfileCredentials` case (D7); every entry and both builds in the bundle walk (Phase 2); exports cut to two (auto-import); the lock checked against the reviewed versions (F4); the entry count and import-time decompress (I3, Architecture).

**Codex, final fresh pass** (gpt-6.1-sol, high, new session): `conditional approve`. All five verified and adopted: single English words scored strong without an English list (`congratulations` 10^15.0; reproduced): `commonWords-en` added (D1, OA-3); the library suppresses its warning above its own score 2, so custom bands lost the reason (`xK9#mQ2vxK9#mQ2v`): the bands move into `timeEstimationValues.scoring` (D3); OA-1's examples regenerated under the final configuration; B stated as a heuristic with its assumed rate (F8); the latency text corrected and browser timing added to Phase 2 with a budget.

**Codex, final pass round 2** (resumed, verifying): `approve`. The A/B classifications, the English-word fixes and the aligned warning reproduced independently; no new material defect.

**Implementation review, round 1** (Codex gpt-6.1-sol high: `conditional approve`; Opus general-purpose: `conditional approve`, D9 accepted). Verified and fixed: the accented rows had lost their combining mark (`e\u0301` restored, both tests); D9 claimed both browsers met 100 ms at 128 units (now: 100 ms realistic, 300 ms at 128); the warning table `satisfies` the library's warning-key type (a misspelled key now fails the typecheck, proven); comments cut to the invariants (the bands, the English subset, the factory lifetime, the one run per matching pair); the Architecture bullet matched to the private `strengthHint`. Kept under D7: the six-row tables on both forms (the brief asks per-tier values on each).

**Implementation review, round 2** (Codex, resumed, verifying): `approve`. The fixes verified (combining-mark rows, the 100/300 ms budgets, the typed table with its TS2561 on a typo, the comments); no regression.

**Phase 3 review** (Codex gpt-6.1-sol high, one round: `conditional approve`; Opus general-purpose: `conditional approve`). Both verified the library's default bands (1e3/1e6/1e8/1e10, DELTA 5), a line for every weak score, no retained password, no reachable `language-en` import (the Bun store still holds the package until a fresh install; nothing imports it), the one-line manifest removal and every re-pinned vector. Fixed: the stale front-matter status (both); `Ships now` read as current in OWNER-ASKS (now `Built when posed`); "OA-3 changes no screen" (now: no copy or layout, one long English word reads strong); the Delivery step's tense; a forward-looking comment; `q8Rt!vP3`'s edge stated (10^8 + 1 guesses against the good band's 10^8 + 5). No material finding, so no second round.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-2 of implementations-plan/password-strength-1/plan.md marked ✓, each gate passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1401, the proposed wording and the captures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/password-strength-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
