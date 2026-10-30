---
plan: inputs-1
tier: light
status: approved by the final Codex pass; arc 1 in progress
issues: "#1389, #1390, #1391, #1393 (arc 1 closes all four)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex (gpt-6.1-sol, high, read-only) audit round-trip and a final fresh pass; one Opus Plan leg
base: origin/dev at 9ce6bb0bd
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 9ce6bb0bd
post_implementation_hardening: not scheduled
---

# inputs-1: four fields that take what they should refuse

Four issues, one arc, one PR against `dev`. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Over the 150-line `light` target: four issues each carry a fact set, a change map and a test list.

## Outcome & Quality Bar

- **For whom**: a person who types an amount, an auto-lock timeout or a new password, or imports a token, and trusts what the screen says about it.
- **Excellent**: (1) no field turns a key it refused into a different number without a sign at that moment, and the caret stays where the person typed; (2) "At least 8 characters" means eight characters as the person sees them, and the strength line uses the same count; (3) every message under Import token is about the address in the field.
- **Good enough**: the refusal sign ends at the next key the field takes (D3), so the lab's typed `1e-3` still ends at `13`, now with a sign at `e` and `-` (D9); the strength thresholds, the decimals rule, the 13-digit cap and the lookup stay as they are.

## Assumptions

**Facts** (at `9ce6bb0bd`; traces in [recon.md](recon.md)):
- F1 Send: a keystroke keeps only `[\d.,]` (`amount-field.ts:33,41`), and `placePoint` drops a second point or comma (`:60`); `settle` shows a read hint after a keystroke only while one already shows (`:82`). The caret is already kept (`caretAfter`, `AmountCard.vue:95-100`).
- F2 Lock: the design Input's `int` branch keeps the digits of the raw value (`Input.vue:220`); v-model has written the raw text before `handleInput` runs, so the re-render moves the caret to the end. 300 ms after an edit the page saves a whole number from 1 to 1440 with a success toast, and asks first for 0 unless 0 is stored (`lock.vue:169-190, 69-105`). `lock.vue` is the only `int` caller. The field shows digits except for a fractional stored minute (`90_000` shows `1.5`), which the config schema accepts and `settings-labels.ts:7` treats as storage written outside the wallet.
- F3 At the end of the text the `int` branch already refuses a non-digit per keystroke, so the lab's steps reach `13` with today's code and would reach it under the brief's rule unless the field signs the refusal. A paste of `1.5` saves `15`.
- F4 The new-password rule is `password.length` in `utils/password.ts:2,7,9`; it also guards `profile/service.ts:1389` (a new unlock password) and `account/service.ts:110` (a passkey profile's file password). No read path applies it.
- F5 `Intl.Segmenter` ships in Chrome (87+) and Firefox (125+; the manifest's minimum is 153) and in the Bun 1.4.2 test runtime.
- F6 Import token's `error` is cleared only by a submit, show or hide (`NewTokenPopup.vue:181,282,293`); the green check is `isAvailableToCreateToken` (`:56-64,329`), a format gate that ignores that error.
- F7 Component tests drive both real handlers: `AmountCard.test.ts:797-1050` triggers `input` on the card's input, `Input.test.ts:222-250` on the Input's; `lock.test.ts:70` stubs `Input`, so the page tests see only emits. No smoke spec types into `send-amount-input` (the smoke wallet is unfunded).

**Inferences**:
- I1 The Default story of `AmountCard.stories.ts` (funded, 6 decimals) renders the card as the Send page does; a capture from it shows the line as the page would.
- I2 Writing the input's value first and its range second, outside a composition and before the v-model write, keeps them, as `showText` does in the card (the render finds the value in place). A range cannot be inferred from the text before and after an edit (select `30`, paste `3e0`: prefix and suffix give `[1,1]`), so the field records it at `beforeinput`, which Chrome and Firefox fire before every edit a person makes; Phase 6's browser check confirms it on both.

**Asks**: none for this arc. Two product questions outside the lane's rule are recorded on their issues, as the lane brief says, and filed `owner-decision` at close-out: the strength wording (D7, on #1391) and whether a numeric field should keep the typed text and refuse the value instead (D9, on #1389 and #1390).

## Architecture & Implementation

**The field rule** (the lane brief's, applied once): a numeric field refuses a character it cannot take, keeps the caret where it was, and shows its existing error. A validation message belongs to the value it judged and clears when the value changes.

**#1389 Send amount** (`amount-field.ts`, `AmountCard.vue`):
- `typedText` also reports `refused`: true when the keystroke's inserted text lost a character, one outside digits, points and commas (`clean`), or a point or comma `placePoint` dropped. `placePoint` returns that flag; nothing else in the reading changes.
- `nextAmountText` returns `hint: "unreadable"` for a refused keystroke, even when the text is empty, ahead of the clamp. Pastes and kept text are untouched.
- Leaving the field clears a read hint when its text reads or is empty (and `readHint`'s comment says so), in both blur handlers (`handleAmountBlur`, before its empty-text return, and `handleFiatBlur`); a text that does not read keeps its hint, as a paste's does today. The USD field shares the keystroke rule through `handleFiatInput`.

**#1390 Lock** (`packages/design/src/ui/Input.vue`):
- A `beforeinput` listener (the `int` subtype only, skipped while `isComposing`) records the edit's own start: the input's text and its selection. The `input` handler consumes it, so a record never outlives its edit.
- The `int` subtype refuses an edit whose own characters (the slice of the raw text the record's range places) hold a non-digit, as a whole, so a loaded `1.5` (F2) still takes a digit; without a record it judges the whole raw text: it writes back the recorded text and selection, sets `text` to that text, and emits nothing, so the refused edit schedules no save of its own. With no record (an `input` no person's edit raised), it writes back `String(modelValue ?? "")` with the caret at its end.
- While `isComposing` it judges nothing and writes nothing; Vue re-fires a plain `input` at `compositionend`, and that edit is judged whole. So a full-width digit no longer emits 0 mid-composition (#1154's transient case).
- It then shows its error state (the `.error` underline, `aria-invalid` unless the caller passes one) until the next accepted edit, a `modelValue` write or blur. Digit-only edits behave as today: parse, clamp to `max`, empty shows and emits 0.
- Residual, accepted: an accepted key's 300 ms save still lands if a refused key follows within it (`1` then `e` saves 1 with its toast under the underline); cancelling it would couple the Input to the page's timer.

**#1391 password** (`utils/password.ts`): a module-level `Intl.Segmenter(undefined, { granularity: "grapheme" })` counts graphemes; `isNewPasswordValid` and `newPasswordHint` use it for both the 8 and the 24 thresholds. Callers and copy unchanged.

**#1393 Import token** (`NewTokenPopup.vue`): `watch(contractTerm, () => { error.value = null })`; the green check renders on `isAvailableToCreateToken && !error`, so it also hides beside "Account is still loading" and "Something went wrong", which no check should sit beside either.

**File-level change map**:

| File | Change |
|---|---|
| `apps/extension/src/components/composite/send/amount-field.ts` (+ `.test.ts`) | `refused` from `placePoint`/`typedText`; the hint in `nextAmountText` |
| `apps/extension/src/components/composite/send/AmountCard.vue` (+ `.test.ts`) | both blur handlers clear a read hint when the text reads or is empty |
| `packages/design/src/ui/Input.vue` (+ `Input.test.ts`) | `beforeinput` record; the `int` refusal, its restore and error state |
| `apps/extension/src/popup/pages/settings/lock.test.ts` | with the real Input: a pasted `1.5` saves and toasts nothing; the residual pinned |
| `apps/extension/src/utils/password.ts` (+ `.test.ts`) | grapheme count |
| `apps/extension/src/popup/components/popups/NewTokenPopup.vue` (+ `.test.ts`) | clear on edit; check hidden beside a refusal |

**Trade-offs** (detail in the ledger): keep-the-typed-text-and-refuse-the-value (C) is the sturdier rule for a person typing without looking, and is not the brief's; Lock drops-and-joins like Send (rejected: a paste would save with a success toast under an error state, and a key over a selection empties the field into the never-lock question); a new error line for Lock (rejected: new copy where an existing error state says it).

## Decision ledger

| ID | Question | Chosen | Rejected and why |
|---|---|---|---|
| D1 | Send's sign for a refused key | the existing "Not an amount. Type it like 1234.56" line | new copy: the brief names the existing error |
| D2 | What a refused key is in Send | a character outside digits, points and commas, or a separator `placePoint` drops | letters and signs only: a dropped second point turns `1.000.000` into `1` as silently |
| D3 | How long the sign lasts | until the value changes (next key that reads, a page write) or the field is left, on both blur paths | until blur: the line would judge a value it did not judge (the brief's rule) |
| D4 | Lock's refusal | the whole edit, judged by its own characters: the text and selection recorded at `beforeinput` restored, nothing emitted | drop-and-join: see Trade-offs; a range inferred from prefix and suffix: wrong for overlapping text (Codex r1); `beforeinput` cancel alone: misses edits it cannot see, and the `input` path stays anyway |
| D5 | Lock's sign | the Input's own error underline and `aria-invalid` (the ARIA part an accessibility call under the owner's 2026-10-19 delegation); a 1 px line, close to the focus colour for some colour vision, so the PR presents it as the cheapest existing sign, not an accessibility fix, captured focused in the light theme | none (the brief's "if it has one"): leaves the lab's steps unchanged; a text line: new copy |
| D6 | Import token's check beside a refusal | hidden while the refusal shows | kept: it reads as "valid" beside "no token here" (the issue's step 2) |
| D7 | "Strong password" for a repeated symbol | out of scope (lane brief); a comment on #1391 asks the owner, and the close-out files it `owner-decision` | changing the meter: out of scope |
| D8 | Where the grapheme count lives | private in `utils/password.ts` | a shared `utils/graphemes.ts`: one caller |
| D9 | The residual: a sign one key long | accept under the brief's rule; the PR body says the lab's typed steps still end at `13` with a sign at each refused key, and that Lock no longer saves a refused paste; the question of keeping the typed text (C) is asked on #1389 and #1390 and filed `owner-decision` at close-out | an OWNER-ASKS entry (Opus): the arc does not depend on the answer, which would be a new rule; no record at all (Codex): the issues close, and the question would go with them |

## Security & Adversarial Considerations

- **Threat model**: the person is the only actor on these fields; no dApp or stored row reaches them. The worker re-checks a new password with the same function only in `changeUnlockMethod` and for a passkey profile's file password; `createProfile`, `changeProfilePassword` and `importMnemonic` trust the extension page that calls them, as before. No new trust boundary; widening the worker's checks is outside the lane.
- **Password rule**: counting graphemes refuses short emoji passwords that passed before; it never refuses an unlock or opening a file or backup (F4), so no profile or export becomes unopenable. The KDF still hashes the password's bytes; nothing cryptographic changes.
- **Auto-lock**: the change only removes saves (a refused edit schedules none), so the timeout can never be set to a value the field did not show. The field still cannot write a negative or fractional timeout (#1144's parse-from-digits is kept for accepted edits).
- **Supply chain / privilege / logging**: no dependency, permission or log line changes.

## UI impact

The owner's sign-off, 2026-10-30: "#1381–#1395 => yes, if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed on Monday."

- **Send, amount card**: a key the field refuses shows "Not an amount. Type it like 1234.56" until the next key that reads or the field is left, so the line can sit under a field that reads `1`. Before: no line.
- **Settings → Lock, Auto-lock Timeout**: a refused edit leaves the field as it was, caret in place, and draws the red error underline until the next accepted edit or blur; the refused edit schedules no save of its own. Before: the digits joined, the caret jumped, the joined number saved with a toast.
- **New password hint** (create profile, change password, unlock method, the import forms, file passwords): four emoji read "At least 8 characters". Before: "Strong password".
- **Import token**: the line under the button goes when the address changes; the green check is hidden while that line shows.

## Phases

### Phase 1: Before captures
1. Build the base armed for smoke (`ARMED` below: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1`): `cd apps/extension && ARMED bun run build:chrome`, then `bun run build-storybook`.
2. Copy the scratch spec `~/.cache/nulo-backlog/inputs-1/zz-inputs-captures.test.ts` into `apps/extension/tests/e2e/`, run it once on Chrome (`NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 INPUTS_SHOT_DIR=~/.cache/nulo-backlog/inputs-1/captures/before bun run test:e2e -- zz-inputs-captures.test.ts --retry=0`), then delete it. It clips Lock after `1e` and after a paste of `1.5`, Create profile and Change password with four emoji in both fields, and Import token after a refusal and a new address.
3. Clip the AmountCard Default story after typing `1e` with a scratch Puppeteer script in the same scratch folder.
- **Gate**: six PNGs exist under `captures/before/`; `git status` shows no change.

### Phase 2: #1391 password rule
- **Tests**: `password.test.ts`: four `😀` refused with "At least 8 characters"; seven `é` written as `e` + U+0301 and seven ZWJ families refused (a code-point count passes them); eight of each pass; 25 graphemes read "Long enough. Don't forget it."; thirteen decomposed `é` (26 code points) read "Strong password", so strength uses the same unit; the ASCII cases stay as the success control.
- **Gate**: `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun --bun vitest run src/utils/password.test.ts --retry=0` exit 0, and the four `😀` case fails at the base copy of `password.ts`.

### Phase 3: #1393 Import token
- **Tests** in `NewTokenPopup.test.ts`, with an `Icon` stub that renders its `name` (today's is `<i />`): a refused lookup, then a listed token's address (the issue's step 3): "Already exist" and no `new-token-error`; a refused lookup, then a valid unlisted address: the check back; a refused lookup with the address unchanged: the line stays and the check is hidden (control).
- **Gate**: lint, typecheck, `bun --bun vitest run src/popup/components/popups/NewTokenPopup.test.ts --retry=0` exit 0; the first case fails at base.

### Phase 4: #1389 Send amount
- **Tests**: `amount-field.test.ts`: `e`, `-` and `+` typed after `1` keep `1` with `unreadable`; `e` typed into empty keeps `` with `unreadable`; `e` typed while the clamp hint shows gives `unreadable`; a digit after the refusal reads with no hint (control); the existing rows that drop a key (`"a" typed after 12`, the three dropped points and the dropped comma) change their expected hint to `unreadable`, and the comma re-read as grouping stays `null` (D2's control). `AmountCard.test.ts`: `1e-3` typed shows `["1","1","1","13"]` with the line after `e` and `-` and none after `3`; `e` typed between `1` and `2` keeps the caret at 1 with the line; a blur after a refusal clears the line; the USD field shows it for `e`.
- **Blur tests** (`AmountCard.test.ts`): a refused `e` in the USD field, then blur: no line; `e` typed into empty, then blur: no line; a pasted `1e5`, then blur: the line stays (control).
- **Gate**: lint, typecheck, `bun --bun vitest run src/components/composite/send --retry=0` exit 0; the `1e-3` case fails at base.

### Phase 5: #1390 Lock
- **Tests** in `Input.test.ts` (`int`), each edit raised as a browser raises it (`beforeinput`, then the value, then `trigger("input", { inputType })`): `e` typed between `1` and `5` keeps `15`, caret at 1, emits nothing, error state on; a digit after it emits and clears the state (control); `3e0` pasted over a selected `30` keeps `30` with `[0,2]` selected; an `input` with no `beforeinput` restores the bound value; a page write, then `e`, restores the page's value and the write cleared the state; a `2` typed at the end of a loaded `1.5` is accepted and parsed as today; an `input` while `composing` emits nothing, and the one Vue re-fires at `compositionend` is judged; blur clears the state; the existing strip-and-join cases become refusals. `lock.test.ts`, in one `describe` that mounts the real `Input` (the file stubs it): a pasted `1.5` and the 300 ms after it call no `setValue` and open no toast; `1` then `e` within 300 ms saves 1 with its toast (the residual pinned, and the control that an accepted key still saves).
- **Gate**: lint, typecheck, `cd packages/design && bun --bun vitest run src/ui/Input.test.ts --retry=0`, `cd apps/extension && bun --bun vitest run src/popup/pages/settings/lock.test.ts --retry=0` exit 0; the `1.5` paste case fails at base.

### Phase 6: Full gates and after captures
1. `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue`: exit 0.
2. After `audit:vue` (its build disarms `dist`), `ARMED bun run build:chrome` and `ARMED bun run build:firefox`, then the smoke files that reach the four surfaces, retry 0, on Chrome and then with `NULO_E2E_BROWSER=firefox`: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- security.test.ts settings-crud.test.ts send-keyboard.test.ts auth-flows.test.ts --retry=0`. Record each browser's wall-clock.
3. Phase 1's capture steps again on the head build into `captures/after/`; commit the twelve PNGs to `implementations-plan/inputs-1/screenshots/`.
4. The scratch spec also asserts (with `INPUTS_ASSERT=1`, head build only), on Chrome and on Firefox: `e` typed between the digits of Auto-lock keeps the text and the caret; `3e0` pasted over a selected `30` keeps `30` selected; a typed `45` saves (control). Delete it after the runs.
- **Gate**: every command exit 0 on both browsers, the scratch assertions included; every after capture shows the UI impact above. The network lanes run in CI (required); no network file changes.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-6 | `worktree-inputs-1` | `dev` | `fix(inputs): sign refused keys, count password characters, clear a stale token refusal` (86) | #1389, #1390, #1391, #1393 |

`code_review: off`. Merge `origin/dev` before the PR; `bun run check:plans` after. Open ready, without labels. Body: what changed and why, the owner's words, the D5 accessibility call, the D9 residual in one sentence, the captures (`raw/<sha>` links), every gate with its outcome, each browser's smoke wall-clock (no e2e scenario added), the four `Closes`. No lanes: one reviewer reads one diff.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `9ce6bb0bd`. Plan-specific values:

- **Review loop** (once, after Phase 6): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff 9ce6bb0bd...HEAD` (the merge base once `dev` is merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim; resume with `resume-codex.sh`. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Log rounds in `lessons/phase-6.md` and under Audit verdicts.
- **Approval boundary**: new copy, a saved value the field did not show, or a visible change beyond UI impact is a plan change and stops for the orchestrator.
- **Close-out**, the PR's final commits: merge `origin/dev`, read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter; the D7 and D9 `owner-decision` issues filed (deduped) and named on `Open items:`; `STATUS.md` deleted; `git mv implementations-plan/inputs-1 implementations-plan/archive/inputs-1` in its own commit, the index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/inputs-1/plan.md` succeeds, `agent-worktree done inputs-1 --merged`. The orchestrator's next session notices the merge.

## Audit verdicts

**Codex, round 1** (gpt-6.1-sol, high): `conditional approve`. All six findings verified against the tree and adopted:
1. A range inferred from prefix and suffix is wrong for overlapping text (select `30`, paste `3e0` → `[1,1]`): the field records the range at `beforeinput` (D4, I2).
2. Neither blur path cleared a refusal line (USD blur; token blur's empty-text return): both clear it when the text reads or is empty (D3).
3. The worker re-checks only `changeUnlockMethod` and the passkey file password, not `createProfile` or `changeProfilePassword`: the security claim is narrowed; widening the checks is outside the lane.
4. The password tests passed a code-point count, and `lock.test.ts` stubs `Input`: seven decomposed `é` and seven ZWJ families must fail, thirteen decomposed `é` read Strong; the Lock page test mounts the real Input.
5. An accepted key's pending save survives a refused key that follows it: worded as "schedules no save of its own" and pinned as the residual.
6. D7 was not yet on #1391: asked there on 2026-10-30.
Codex agreed with D2, D5, D6, the residual of D3 (no owner ask), the asymmetry of D4 and the Storybook capture, and asked for the browser check that Phase 6 step 4 adds.

**Opus Plan leg** (opus, Plan): `conditional approve`. Findings 2, 3 and 7 matched Codex's (blur paths, composition, worker checks); the rest, verified and adopted unless said:
1. `lock.test.ts` stubs `Input`, so a page test there proves nothing: adopted as Codex's form (one `describe` with the real Input) rather than dropping the page test, since the page's no-save is the issue's consequence; the `45` control is dropped (`lock.test.ts:193` has it), the residual pin is the control.
4. The residual: adopted as D9, recorded on the issues and filed `owner-decision` at close-out, not as an OWNER-ASKS entry (Codex: no ask; the arc does not depend on the answer).
5. The shown-text local is gone (Codex's `beforeinput` record replaced it); its conditions kept: a string record, the state cleared on a `modelValue` write, a page-write test. Judging only the inserted slice: adopted after Codex's verifying round showed a fractional stored minute (F2).
6. D5's sign is thin: kept, presented as the cheapest existing sign and captured focused in the light theme.
8. Test list: the five existing rows flip instead of new duplicates; a refusal under the clamp hint; an `Icon` stub that renders `name`; the issue's step 3 as the new-address case.
F2's 0 case and F7's stub corrected; D6's other two lines named.

**Codex, round 2** (resumed, verifying): `conditional approve`. Both findings verified and adopted: (1) F2 was false, a stored `90_000` shows `1.5` (`settings-labels.ts:7`), so a whole-text check would refuse a digit typed after it: the refusal judges the edit's own characters; (2) UI impact still said "nothing is saved": now "the refused edit schedules no save of its own". Every other adopted fix verified as correct.

**Codex, round 3** (resumed, verifying): `approve`. Both round-2 conditions resolved; no regression found.

**Implementation review, round 1** (Codex gpt-6.1-sol high: `reject`; Opus general-purpose: `conditional approve`). Verified and fixed: a `beforeinput` with no `input` (a no-op Delete) left a record that misjudged the next composition or unannounced insertion (Codex F1), and a drop away from the recorded caret was judged on the wrong slice (Opus O1): the record now counts only when the new text keeps its untouched head and tail, and a blur or a caller's write ends it (O3); the overclaiming and narrating comments are rewritten (F2, O1). Kept under D2: a `$` or a space typed in USD mode shows the unreadable line, since the keystroke path drops it (O2).

**Implementation review, round 2** (Codex, resumed): `conditional approve`. Round 1's fixes verified; F3, a Backspace after a caller's `1.5` refused by the head/tail frame, fixed: the edit is judged by what the new text adds against the text before it (common head and tail removed), the record giving only that text and the selection to restore.

**Implementation review, round 3** (Codex, resumed): `conditional approve`. F3's fix verified; F4, a point retyped over the selected point of a caller's `1.5` (an unchanged text, an empty diff) emitting 15, fixed: the recorded selection's slice is judged when the new text keeps the text around it, the diff otherwise. Round 3 is the hard stop: F4's fix is proven by its red-then-green case, the full gates and the browser assertions, with no verifying Codex round.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-6 of implementations-plan/inputs-1/plan.md marked ✓, each gate passing in the transcript with LESSONS_FILE=implementations-plan/inputs-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1389 #1390 #1391 #1393 and the close-out's archive move (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/inputs-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
