---
plan: notice-overflow-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at 17f35c504
trunk: dev
issues: "#1232 (arc 1 closes)"
post_implementation_hardening: not scheduled
status: delivered (draft #1277, owner sign-off pending)
---

## Outcome

- **Date:** 2026-10-27.
- **Status:** delivered as one draft PR against `dev`, #1277, which carries this close-out. It leaves draft when the owner signs OA-1's option (a); its merge closes the plan. If the owner picks (b) or (c), the lane resumes and this Outcome is rewritten.
- **Shipped:** #1277: `overflow-wrap: anywhere` on `NotificationManager.vue`'s `.card`, with its source-scan case. Closes #1232.
- **Dispositions:** option (b) not built (D4); the name's other places (D5) filed as #1276; an e2e computed-style assertion and a guard against a `@media`-wrapped rule rejected (audit table).
- **Known limits:** #1275 (the card does not scroll).
- **Open items:** #1276.
- **Lessons:** none promoted: `lessons.md` is at 8183 of 8192 B and nothing in it is superseded. The `break-word` finding stays in [lessons/phase-0.md](lessons/phase-0.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# notice-overflow-1: a notice's text stays inside its card

One arc, one draft PR against `dev` (§ Delivery). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issue, checked (#1232)

**Demonstrated** (recon § Measured). Initial conditions: a full backup whose network row carries a name longer than about 50 characters with no space (the add and rename fields cap at 25; the row schema has no maximum, `network/spec.ts:75`). Events: onboarding → Import → Full Backup; that network does not finish restoring; View Errors. `import.vue:105-116` raises the notice with `restoreNoticeText(unrestored)`. The description, a centred flex item, sizes to the unbroken name and runs past `.card` (`NotificationManager.vue:152-159`), which has no wrapping rule. Invariant broken: a notice's text stays inside its card. Consequence: in the popup at 360 px both ends of the name fall outside the viewport and cannot be read (card `scrollWidth` 429 against `clientWidth` 324); in the onboarding tab the text spills over the dimmed page (507 / 480). OK stays focused and reachable.

Claims that held only in part: (1) the popup overflow is real for any notice, but no popup caller passes a data string today (`createFailedNotice` is fixed copy); only onboarding's restore notice carries one. (2) "Roughly 40 characters" is the popup's threshold (about 50, by glyph); onboarding's 480 px card holds about 80, so the issue's 70-character `n…n` overflowed there only because `n` is wide. Every other claim held at `17f35c504`.

## Outcome & Quality Bar

- **For whom**: a person restoring a backup in the onboarding tab (or reading any notice in the popup) whose text holds one string wider than the card.
- **Excellent**: (1) every character of the string is inside the card and readable, in both shells and both themes; (2) every notice with ordinary text renders exactly as today (same line breaks, same height).
- **Good enough**: the string breaks at the card's edge, not at a pretty place; the texts' wording is untouched.

## Assumptions

**Facts** (verified at `17f35c504`; recon has the citations)
1. `.card` is `width: 90%; max-width: 480px; padding: 24px` in a fixed column flex with `align-items: center`; the description is a centred `Text` span, `body` 12 px.
2. The notice mounts in `popup/app.vue:621` and `onboarding/app.vue:84`; its three callers are onboarding's restore notice (data) and the two `createFailedNotice` sites (fixed copy).
3. Measured in Chrome: `overflow-wrap: anywhere` on the card contains the 90-character name in both shells; `break-word` does not (the centred item sizes to its min-content width, which `break-word` leaves at the whole word); ordinary text keeps its height to the pixel.
4. Every element in the card inherits the rule. Button labels cannot wrap at 359 px and wider (`Button.vue:167`, `white-space: nowrap`) and wrap below it (`:371-373`). Measured: both existing notices (`createFailedNotice`, with its note and without) render to the pixel the same with and without the rule at popup widths 360, 300 and 240 and onboarding widths 1280 and 320; their only labels are OK and Cancel.
5. `NotificationManager.test.ts` pins `.card` and `.layer` declarations from the SFC source with `declarationsOf(parseSource(FILE), …)`; jsdom applies no module CSS, so layout cannot be measured there.
6. `overflow-wrap: anywhere` is the repo's rule for data-length text (`ToastManagerBase.vue:260`, `TokenCard.vue:195`; 20 files in all); the extension requires Firefox 153 and Chrome supports it since 80.

**Inferences**: I1. The rule changes a line only where a run between break opportunities (a whole name, or its part between spaces or hyphens) is wider than the space it sits in: the card's text box, its width less 48 px of padding. Such a run already spills into the padding or past the card today; with (a) it breaks at the padding's edge. So (a) changes only text that is broken today. Example: 25 `W`s, which the name field accepts, run 13 px into the popup card's padding today and wrap with (a) (card 188 → 205 px); a backup can carry far wider characters (U+FDFD is several em; the name field's sanitizer drops it), and (a) contains them too.

**Asks**: A1 (owner, OA-1): (a), (b) or (c). Working assumption: (a), the issue's and this plan's recommendation; arc 1 builds it as a draft that leaves draft only on the owner's signed picture.

## Decisions

- **D1. The rule sits on `.card`**, not on the description: the invariant is the card's ("a notice's text stays inside its card"), one declaration covers the description, the note and the title, and the `.card` rule is already where the card's box lives. Rejected: on the `Text` only (a second text in the card would need its own copy of the rule).
- **D2. `anywhere`, not `break-word`** (Fact 3, measured). The one-line comment above it states that why.
- **D3. Test**: one case in `NotificationManager.test.ts`, a new `describe("a notice's text stays inside its card")`: `declarationsOf(parseSource(FILE), ".card")` has `"overflow-wrap": "anywhere"`. It is red on the base copy. The existing "the read is not empty" case is its success control. No e2e scenario is added: the rule's effect is defined by CSS and the scratch capture measures it in the built extension for the PR (before/after `scrollWidth`). Wall-clock per browser is unchanged. Blind spot: a descendant that turns wrapping back off (`noWrap` on the description) passes the scan.
- **D4. Option (b) is not built**: it changes copy, cuts the name a person needs to tell networks apart, and bounds characters, not width (I1: 25 characters from a backup can be wider than either card).
- **D5. The other places the name shows stay out**: the import warning (`ImportFullBackupForm.vue:113-115`, a `Text` in a row `Flex` with no wrapping rule), the failed-Retry line (`onboarding/pages/import.vue:226-232`), Home's reminder (`RestoreOutcomeBanner.vue`) and Restore again's intro (`restore-again.vue:134`). Plausible but unverified (code trace, not measured); the lane brief puts other cards out of scope. Filed as one `ux` issue at close-out; OA-1 tells the owner (b) would bound them and (a) does not.

## Architecture & Implementation

| File | Change |
|---|---|
| `apps/extension/src/components/NotificationManager.vue` | `.card` gains `overflow-wrap: anywhere;` with a one-line comment (D2) |
| `apps/extension/src/components/NotificationManager.test.ts` | D3's case |
| `implementations-plan/notice-overflow-1/screenshots/` | the PR's before/after pictures (8 PNG) |

Flow unchanged: the store's `active` notice renders in the card; only line breaking inside the card changes. Simpler alternative considered: (c), no change; rejected in OA-1's recommendation, since the popup cuts the name off unreadably.

## Security & Adversarial Considerations

- Trust boundary: a backup file is hostile input. Its network name reaches the notice as text through Vue interpolation (no `v-html`); nothing here changes that path, a permission, a log line, storage or a dependency.
- Attacker capability: write any network name into a backup the person restores. Today it can push text off the card and, in the popup, off-screen; after (a) every character shows inside the card. It never covers or moves OK sideways.
- **Known limit (to file at close-out, closed `known-limit`)**: the card does not scroll. Path: in the onboarding tab (the one shell whose notice carries names), a crafted backup with many unrestored networks, or, newly with (a), one very long name, makes the card taller than the window. The close areas above and below shrink to nothing and the strips beside the card answer no press, so OK and every close target leave the pointer's reach. Focus starts on OK, so Enter and Escape still close it (measured). Measured: 80 short names bring the popup card to 579 of 600 px; with (a), 1,500 characters leave OK in view in the onboarding tab at 800 px (651 px) and put it at 769 px in a 600 px popup; a shorter window needs fewer. Consequence: a person using only a pointer must use the keyboard or close the tab. Labelled: needs a crafted backup; pre-existing for long lists; the notice's layout is outside this lane. Reopen on a user report, or on a caller that passes unbounded text from a source that is not crafted.

## Phase 1: the rule and its test ✓

Warning: take the before measurement from the base build first (it is already in recon § Measured).
1. Add the case (D3); run it on the base copy and see it red.
2. Add the rule and its comment (D1, D2); see it green.
3. Run the gate below in its order.
4. Copy today's pictures and the after pictures into `screenshots/`. Run `git status` before each commit.

**Gate**, from the repository root, each command in its own subshell, in this order (warning: `audit:vue` leaves an unarmed build in `dist/chrome`, which the smoke setup refuses, so the armed rebuild comes after it):
1. `(cd apps/extension && bun --bun vitest run src/components/NotificationManager)`; `bun run audit:vue` (it runs `lint`, `typecheck:all` and `test`, then the build); `bun run test:all`.
2. `(cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome)`.
3. `(cd apps/extension && env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/import-errors-scroll.test.ts --retry=0)`.
4. The scratch capture (`~/.cache/nulo-backlog/notice-overflow-1/capture/`, copied into `apps/extension/tests/e2e/` for the run only and removed after it, no style injection), the same command with `SHOTS_OUT` set.

Pass: exit 0 on each; the new case red at step 1 and green at step 2; in the capture, card `scrollWidth` equals `clientWidth` in both shells for the 90-character name, and the two `createFailedNotice` notices keep their heights. Layers: lint, typecheck, unit, component, build, smoke, real layout (scratch). No Firefox twin: no fixture, focus, window, activation or WebAuthn change.

## UI impact

- **The notice card, popup and onboarding tab** (`NotificationManager.vue`): a string wider than the card breaks at the card's edge and stays inside it (OA-1 (a), pictures `1232-today-*` → `1232-a-*`). Every notice with ordinary text renders as today. **Owner sign-off: pending** (OA-1); the PR stays a draft until the orchestrator quotes the owner's words in its body.

## Delivery

- Single arc. Branch `notice-overflow-1-a1` off this plan's commit on `worktree-notice-overflow-1`; one PR, base `dev`, opened as a **draft** after the Codex loop converges: `gh pr create --draft --base dev --title "fix(ui): a string wider than the notice card breaks inside it"` (61 characters). No label at creation; the path filter trips both e2e lanes.
- Body: what and why; OA-1's options and "Owner sign-off: pending"; the before/after pictures (`?raw=true` links to `screenshots/` on the branch) and the measured widths; the runs with outcomes; no e2e scenario added, wall-clock unchanged; `Closes #1232`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `17f35c504`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff origin/dev...HEAD` after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1; prompts under `~/.cache/nulo-backlog/notice-overflow-1/`; hard stop at three rounds; rounds in `lessons/phase-1.md` and the table below.
- Approval boundary (a plan change; stop): any copy change, a cut name, a scrolling card, a rule outside `.card`.
- Close-out in the PR's final commits, after the Codex loop: Outcome (status "draft until OA-1 is signed"); the known limit above filed and closed; D5's issue filed (`ux`; dedupe first); lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. If the owner picks (b) or (c), the orchestrator resumes the lane and the Outcome is rewritten. Teardown after the merge: `agent-worktree done notice-overflow-1 --merged`; trunk `dev`; `implementations-plan/archive/notice-overflow-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a17f6f) | conditional approve | I1 restated to what (a) changes (25 `W`s wrap in the popup); Fact 4: Button inherits and wraps below 359 px, and both existing notices measured unchanged at five widths; the armed rebuild after `audit:vue`, subshells; the known limit's numbers per shell, (a) newly enabling the one-name case, kept in OA-1 | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the gate order (as Codex); D5 and OA-1's uneven comparison (the name's other places, which (b) bounds); the known limit's consequence (no pointer target at all) and shell; line numbers (`joinNames` 102-105, `.card` 152-159, `spec.ts` 212-217, 20 files); "widest name" corrected (U+FDFD); the pictures' captions say the notice was raised directly; `lint` and `typecheck:all` folded into `audit:vue` | an e2e assertion of the computed `overflow-wrap` in `import-errors-scroll.test.ts` (optional in the finding): the scan pins the rule and the capture measures the real layout; it would mix a second concern into a test about scrolling. Dropping the Opus diff review: the implementer brief requires it |
| plan 2 (final) | Codex, resumed | conditional approve | U+FDFD recast as a backup-origin example (the field's sanitizer drops it); OA-1 says the "Profile creation failed" notices render unchanged and an overflowing restore notice wraps; all ten fixed-copy measurement pairs, the gate order, the known limit and D5 verified | none |
| plan 3 | Codex, resumed | **approve** | both wording fixes verified; no regression | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a17f84) | **clean** | none | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | findings | the `.card` comment's claim corrected (a centred item sizes to fit-content; min-content is its floor) and the caller dropped from both comments; the test's comment states D3's blind spot | a guard against a `@media`-wrapped `.card` rule passing the scan: nothing realistic leads there |
| arc 1 r2 | Codex, resumed | **clean** | the comment fixes verified; no regression | none |

Plan status: **approved** by the final Codex pass; OA-1 open with the owner (the arc ships it as a draft).

## Seeds

```
/goal Phase 1 of implementations-plan/notice-overflow-1/plan.md marked ✓ with its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one draft PR against dev closing #1232 with its before/after pictures and "Owner sign-off: pending"; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/notice-overflow-1 per its plan.md and the README § Post-implementation standard at 17f35c504: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the PR as a draft, never merge, never change copy; stop once its checks are green and report.
```
