---
plan: unicode-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 13bb2133c
trunk: dev
issues: "#1388, #1395 (arc 1 closes both)"
post_implementation_hardening: not scheduled
status: approved; arc 1 implementing
---

# unicode-1: invisible and direction characters in a typed address, an app alias and a settings search

One arc, one PR against `dev` (§ Delivery). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issues, checked

**#1388, Send recipient: demonstrated by code trace.**
- **Initial conditions:** Send is open. The person pastes an address followed by a zero-width space, as chat apps and web pages copy it.
- **Events:** nothing between the DOM input and `searchTerm` changes the text (recon § The three fields). `isValidAztecAddress` refuses it (`send.vue:232`), so Confirm stays off (`:339`).
- **Invariant broken:** the field holds what the person sees.
- **Consequence:** a stuck send. The field looks valid.
- **"No visible reason": does not hold on the code read.** The hint shows for any invalid text once the field loses focus, on the timer path and on the mouse-press path (recon § #1388's unexplained half). Phase 1 tries to reproduce it in jsdom and in Chrome before any fix.

**#1395, app alias and Settings search: demonstrated by code trace.** The alias is a bare `<input>` emitted raw to the session and to the dApp; the search `Input` keeps what is typed, and `fold` removes combining marks only. A direction override reorders what the field shows, so the field shows one string and the wallet stores, sends or searches another. The issue's own impact line holds: only the person's own typing reaches these fields.

## Outcome & Quality Bar

- **For whom:** a person who pastes an address or a name from a chat or a web page that adds direction or zero-width characters.
- **Excellent:** in all three fields, the text the field shows is the text the wallet keeps, sends and searches. A pasted address with a bidi control or a zero-width space works as the address; any address the field still refuses shows "Invalid address" once the field loses focus. Emoji sequences and joined scripts render as before; explicit bidi formatting (a mark that places punctuation in a mixed Arabic and Latin alias) is removed. Typing with an input method works mid-composition.
- **Good enough:** no new copy and no new field state. Stored aliases are not rewritten.

## Assumptions

**Facts** (verified at `13bb2133c`; citations in recon)
1. `stripWireControl` strips `\p{Cf}` (the joiners included), variation selectors and C0/DEL/C1. It is the display rule for a dApp's strings, where a joiner can glue two glyphs (`capability-meta.ts:105-127`).
2. The design `Input`'s `normalize` runs on every input event and on a capped paste, on the model ref (`Input.vue:189,278,347-348`). Vue 3.5.42's `vModelText` skips its listener and its DOM write while composing and dispatches an `input` event at `compositionend` (`@vue/runtime-dom` `runtime-dom.cjs.js:1505-1561`); its listener runs before a separate `@input`, which still fires mid-composition. `AddressInput` passes `normalize` through `$attrs`.
3. The contact form's address field passes `sanitize` (an allowlist that drops these characters). A default `normalize` inside `AddressInput` would replace it.
4. `matchRecipients` ignores invisible characters in a name query; its address branch lowercases both sides and compares (`recipient-search.ts:16,23`).
5. Only the capabilities window writes the alias; `buildAccountSelectionResult` falls back to the account name for an absent or `""` alias (`capabilities/index.vue:284`).
6. Only the field writes the settings query, apart from Escape and the clear button, which write `""` (`settings/index.vue:35`; `SettingsSearch.vue:41,78`).
7. dApp sessions are a sealed root: the migration engine cannot read them (CLAUDE.md § Persisted-storage shape changes).

**Inferences:** I1. On one line, the soft hyphen, word joiner, BOM and zero-width space draw nothing; the last two carry only line-break and word-boundary meaning. The bidi controls' visible effect is reordering: the defect #1395 reports, and also the legitimate placement of punctuation and numbers in mixed-direction text, which the brief's "bidi controls" covers. Every other invisible or format character can shape what a field draws: joiners (emoji sequences, Persian and Indic spelling), variation selectors (❤️), tag characters (subdivision flags), Arabic number signs. The alias is the one name field that holds emoji: account, profile and contact names drop them through `sanitize`. I2. jsdom's pointer and focus order can differ from Chrome's, so the hint claim needs a Chrome check too.

**Asks:** A1 ([OWNER-ASKS.md](OWNER-ASKS.md)), answered 2026-10-30 by the orchestrator under the owner's delegation for this wave: D1's narrowing is ratified as planned. The typed-text rule strips the twelve bidirectional controls, zero-width space, word joiner, the byte-order mark and the soft hyphen, and keeps the zero-width joiner and non-joiner, variation selectors and tag characters, so emoji sequences and scripts that need joiners render as typed.

## Decisions

- **D1. One new rule for typed text, `stripBidiAndZeroWidth` in `utils/string.ts`:** `/[\p{Bidi_Control}\u00AD\u200B\u2060\uFEFF]/gu`. It removes the bidi controls (embeddings, overrides, isolates and marks) and the characters that draw nothing on one line: the zero-width space, the word joiner, the BOM and the soft hyphen. Everything else stays. Rejected:
  - `stripWireControl` (round 1): it also removes joiners, variation selectors and tags, which would change emoji and scripts in an alias. That is a product decision nobody made, and neither issue needs it (I1).
  - All `\p{Cf}` but the two joiners (round 2): it still removes tags and Arabic number signs, so a subdivision flag in an alias would turn into a black flag.
  - The `sanitize` allowlist: it drops emoji and punctuation from an alias. Contact-name's `Default_Ignorable_Code_Point` class: it removes joiners and selectors too.
  The brief also lists "format characters"; D1 takes only those that draw nothing, so nothing a person sees changes beyond explicit bidi formatting (I1). Ratified: A1. The wire rule stays the display rule for a dApp's strings.
- **D2. Strip, never refuse.** A removed character draws nothing of its own, so the field shows what it keeps. A refusal needs new copy and leaves a field that looks valid. Anything the field still refuses shows its existing hint.
- **D3. Applied at each field:**
  - Send: `<AddressInput :normalize="stripBidiAndZeroWidth">` in `RecipientField.vue`. Not inside `AddressInput` (Fact 3).
  - Settings search: `<Input :normalize="stripBidiAndZeroWidth">` in `SettingsSearch.vue`. `fold` stays as it is (Fact 6).
  - Alias: the bare `<input>` takes `v-model` on a local ref, set to `alias ?? account.name` when the field opens. An `@input` handler returns while `(e as InputEvent).isComposing`, then strips the ref and emits it. This is `Input`'s mechanism (Fact 2): Vue writes the DOM back and repeats the event at `compositionend`. The handler strips the ref, not `$event.target.value`, as `Input`'s `handleInput` does. Rejected: keeping `:value` and writing `el.value` by hand. The write itself works, but a handler that skips composing events must still clean the committed text, and browsers differ on whether an `input` follows `compositionend`; it would need its own `compositionend` listener, a copy of `vModelText`.
- **D4. Tests** (red on the base copy unless noted):
  - `utils/string.test.ts`: one `test.each` over the removed classes, each title the class name only (bidi embeddings and overrides; bidi isolates; directional marks; zero-width space, word joiner and BOM; soft hyphen). Success control: the joiners, variation selectors, tag characters, an Arabic number sign, controls, accented and combining letters, NBSP, digits, punctuation and emoji (joined, with a selector, a subdivision flag) stay unchanged.
  - `RecipientField.test.ts`, real `AddressInput` and `Input` (the `:304` pattern): an address followed by a zero-width space emits the bare address and shows it, and a blur shows no hint. Success control: an address with a visible wrong character shows the hint after a blur. A third case pastes a saved candidate's address with a zero-width space; the blur picks that candidate.
  - `RecipientField.test.ts`, press-hold describe: for invalid text, a mouse press outside the field and its release show the hint, and so does a Tab out (the 250 ms timer). Green on base means the claim does not hold in jsdom.
  - `AccountSelectRow.test.ts`: (a) a bidi override and a zero-width space typed into a new value are gone from the emit and the input; (b) a bidi override added to the unchanged alias leaves the input at the alias; (c) after `compositionstart`, an `InputEvent` with `isComposing: true` whose value holds a bidi override leaves the field and the emits unchanged; `compositionend` then shows and emits the stripped value. Success controls: the existing "typing sends the account's caip with the value", and an alias with a joined emoji emitted unchanged.
  - `SettingsSearch.test.ts`: a direction override before "theme" finds Theme, and the field shows "theme".
  - No e2e scenario is added. Phase 1's Chrome probe decides whether the hint needs one.
- **D5. Out of scope, each filed at close-out after deduping:**
  - Aliases stored before the fix keep their characters, in Connected Apps and toward the dApp. dApp sessions are a sealed root (Fact 7), and a rewrite at unlock is a new lifecycle for a cosmetic consequence. Closed `known-limit` issue; reopen on a user report.
  - An address followed by a character the rule keeps (a space, NBSP, a tab, a joiner, a Hangul filler) still shows "Invalid address" with the cause unseen. The field doubles as a name query, so it cannot trim while typing. One open `ux` issue.
  - An alias or a search can still hold an invisible character D1 keeps (a joiner between letters, a tag outside a flag), so it can read the same as another and differ. Removing those changes what some emoji and scripts show. Closed `known-limit` issue; reopen on a user report or an owner decision to strip more.
  - Holdings' token search offers "Add token" only when `isValidAztecAddress(q.trim())` holds, so a pasted address with a zero-width space finds nothing and says nothing (`TokenList.vue:93-96`). The developer account-state searches take raw text too. One open `bug` issue: the same rule at those fields.
  - Contact names drop these characters already (`contact-name.ts`): no issue. The dApp side: lane brief.

## Architecture & Implementation

| File | Change |
|---|---|
| `apps/extension/src/utils/string.ts` (+ `.test.ts`) | `stripBidiAndZeroWidth`, its TSDoc (what it keeps and why), D4's cases |
| `apps/extension/src/popup/components/modules/send/RecipientField.vue` (+ `.test.ts`) | `:normalize` on `AddressInput`; D4's cases |
| `apps/extension/src/popup/components/modules/settings/SettingsSearch.vue` (+ `.test.ts`) | `:normalize` on `Input`; D4's case |
| `apps/extension/src/popup/windows/capabilities/AccountSelectRow.vue` (+ `.test.ts`) | D3's local `v-model` and `@input`; D4's cases |
| `apps/extension/src/components/composite/general/AddressInput.vue` | comment only: its own code never rewrites the value; a caller's `normalize` may |
| `implementations-plan/unicode-1/screenshots/` | before/after PNGs, Chrome (§ UI impact) |

Simpler alternative: strip where each value is read (Confirm gate, alias projection, `fold`). Rejected: the field would still show one string and keep another.

## Security & Adversarial Considerations

- **Trust boundary: the clipboard.** Text with bidi controls can show an address in one order and hold another. Today that paste is refused. After D2 the field shows the held order, which is what is sent, and the review sheet repeats it. So the acceptance boundary moves: a paste refused today can be accepted.
- **Attack paths.** Any accepted value matches `^0x[a-fA-F0-9]{64}$` (`string.ts:31-33`), so the field, the review sheet and the sent value are one string.
  - A deceptive source (a page, or a chat message its sender wrote) chooses both the X it shows and the Y it holds, and the person trusts the source. It could show Y in plain text with the same effect, and the wallet shows Y either way.
  - Spoofing a fixed target X needs a key for Y, a bidi rearrangement of X. No work-factor analysis exists, so exploitability is unknown. Spoofing only the ends costs what a plain look-alike costs, and the field shows Y's real ends.
- The alias reaches the dApp and now carries no bidi control or zero-width space. The rule is one character class with no quantifier, so it adds no ReDoS surface. No permission, storage shape, message, log line, dependency or CSP changes. Known limits: D5's first and third items.

## Phase 1: reproduce and capture the base ✓

Assumptions: Facts 2-6, I2. In this phase, change no file under `src/` except tests.
1. Write D4's tests. Run them. Require red for the strip cases, and record the result of the hint case.
2. Write `~/.cache/nulo-backlog/unicode-1/capture/zz-unicode1-cap.test.ts`, a network-harness spec, from the lab's steps:
   - The spec reads `SHOTS_OUT` and `SHOTS_TAG` itself (nothing in `tests/` does), as wrap-2's did.
   - (a) Send from PUBLIC. Set the recipient to an address plus a zero-width space. Click the amount with the mouse and type "0.001". Wait until the hint shows or Confirm enables, at most 20 s. Record the hint, Confirm, the focused element and a screenshot, also on a timeout; only the after run requires Confirm. Repeat, leaving the field with Tab.
   - (b) Request capabilities from the playground. Press "Rename for this app" and type the lab's alias sequence. Take a screenshot of the field, approve, and record what `getAccounts` returns. Repeat with an alias holding a joined emoji (a family), a red heart with its selector and a subdivision flag.
   - (c) Type a direction override and "nekot" into Settings search. Take a screenshot.
3. Copy the spec into `apps/extension/tests/e2e/network/`. Run gate 4 with `SHOTS_TAG=before`. Delete the copy.
4. Record in `lessons/phase-1.md` whether Chrome showed the hint in (a), after a Tab out and after a mouse press. If it did not, find the cause before Phase 2. A cause inside `RecipientField.vue` is fixed there, and its test becomes the reproduction; any other cause is a plan change, so stop.

## Phase 2: the rule at the three fields ✓

1. Make D1 and D3's changes. Run D4's tests and require green.
2. Copy the capture spec in again. Run gate 4 with `SHOTS_TAG=after`, then delete the copy. Copy the pairs into `screenshots/` as `1388-<state>.png` and `1395-<field>-<state>.png`.

**Gate** (from the repository root, each command in its own subshell):
1. `(cd apps/extension && bun --bun vitest run src/utils/string.test.ts src/popup/components/modules/send src/popup/windows/capabilities src/popup/components/modules/settings)`; `bun run audit:vue`; `bun run test:all`.
2. For each browser `b` in `chrome`, `firefox`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:$b`, then `(cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_BROWSER=$b bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-picker-add.test.ts tests/e2e/type-roles.test.ts tests/e2e/settings-routes.test.ts --retry=0)`. The smoke suite runs the last armed build, so the build comes first; the two runtime flags arm the checks the build carries, as CI does.
3. `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cap-window.test.ts tests/e2e/network/cap-widening.test.ts tests/e2e/network/meta-getAccounts.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`. It builds its own wallet.
4. Capture only: `SHOTS_OUT=~/.cache/nulo-backlog/unicode-1/shots SHOTS_TAG=<tag> NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/zz-unicode1-cap.test.ts`.

Pass criteria:
- Every command exits 0.
- D4's strip cases are red on base and green after.
- In the after capture, (a) shows no hint and Confirm enabled.
- In (b), the field and `getAccounts` hold the same alias: no direction control or zero-width space, and the three emoji aliases unchanged from before.
- In (c), the field reads "nekot".
- No smoke file opens the capabilities window, so gate 3 stands in for it.

## UI impact

- **Send recipient, the capabilities window's alias field, Settings search:** a typed or pasted direction control, zero-width space, word joiner, BOM or soft hyphen is removed as it arrives, so the field shows what it keeps. Every other character stays: emoji shaping is preserved, explicit bidi formatting is removed. No copy, row, layout or control changes; the existing "Invalid address" hint is unchanged. Pictures: `screenshots/` (Phase 2).
- **Sign-off:** the owner, 2026-10-30: "#1381–#1395 => yes, if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed on Monday." The PR body names D1's contract and A1's answer for that review.

## Delivery

- Single arc. Branch `unicode-1-a1` off this plan's commit on `worktree-unicode-1`. The close-out commits come after the Codex loop, then one ready PR, base `dev`: `gh pr create --base dev --title "fix(ui): typed addresses, app aliases and settings searches drop invisible characters"` (85 characters). No label at creation.
- Body: what changed and why; the hint claim's result; D1-D3, with D1's departure; the owner's words and the pictures (`?raw=true` links at the head SHA); the runs and their outcomes; `Closes #1388`, `Closes #1395`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `13bb2133c`. Specific here:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff origin/dev...HEAD` after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus 5.5 diff review (`general-purpose`) runs beside round 1. Prompts go under `~/.cache/nulo-backlog/unicode-1/`. Hard stop at three rounds; each round goes in `lessons/phase-2.md` and the table below.
- Approval boundary (a plan change; stop): new copy, a refusal state, a stored-alias rewrite, widening D1's class, a change to `stripWireControl`, `fold`, `matchRecipients` or `@nulo/design`, any `AddressInput` change beyond its comment, a new e2e scenario.
- Close-out, before the PR opens: the Outcome; D5's four issues, deduped; a comment on #1388 with the hint claim's result; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, with the index line moved. Teardown after the merge: `agent-worktree done unicode-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/unicode-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a18ee9) | reject | the alias's emoji and script joiners are a visible change (D1 narrowed); the security bullet overclaimed; D3's reason and the composition guard; `stripWireControl` keeps some default-ignorables (D5 `ux` issue); tests for a same-value insert, a composition and the blur pick; D5's sealed-root reason; smoke rebuilds first | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | Holdings' token search and the account-state searches (D5 `bug` issue); a composition test; D3's reason; the security bullet; three Fact citations; the `AddressInput` comment; the probe by Tab and mouse, its `SHOTS_*` reads, a cap on its fix; NBSP and Hangul fillers in the `ux` issue | its finding 6 (an ask with stripping as default): D1 keeps the joiners instead |
| plan 2 | Codex, resumed | reject | all `\p{Cf}` but the joiners still changes flags and Arabic number signs (D1 narrowed again); fixed-target spoofing has no work-factor analysis (exploitability unknown); the `InputEvent` guard; smoke's runtime flags; the base capture records on a timeout | none |
| plan 3 | Codex, resumed | **conditional approve**: implementation settled; the narrowed contract needs ratification by the owner or an authorized scope decision-maker (A1) | bidi marks have a legitimate role in mixed-direction text, covered by the brief's "bidi controls"; wording made exact | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a18f1d) | findings | the alias restores its caret after a strip; the `AddressInput` comment names what holds (the pinning never changes the value) | the caret at Send and Settings search: the fix is in `@nulo/design`'s `Input`, past the approval boundary; a closed known limit |
| arc 1 r1 | Opus 5.5 (general-purpose) | findings, no functional bug | the same two; the TSDoc overclaim; the `hint` helper hoisted and the press and Tab cases split | none |
| arc 1 r2 | Codex, resumed | **clean** | the fixes verified (caret after Vue's write-back, a null selection, composition untouched) | none |

Over the 150-line target by the audit rows and D5's four filings.

## Seeds

```
/goal Phases 1 and 2 of implementations-plan/unicode-1/plan.md marked ✓ with their gates passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1388 and #1395 with its before/after pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/unicode-1 per its plan.md and the README § Post-implementation standard at 13bb2133c: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change copy; stop once its checks are green and report.
```
