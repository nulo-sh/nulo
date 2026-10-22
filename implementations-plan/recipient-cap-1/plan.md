---
plan: recipient-cap-1
tier: light
status: planned, Codex approve (r3), Opus conditional approve (r1, all conditions folded in); awaiting the owner's pick (OWNER-ASKS.md) and the orchestrator's approval
issues: "#1037 (arc 1, the owner's pick)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one bounded probe run per candidate plus one floor control (Chrome, smoke build); one Codex audit round-trip (gpt-6.1-sol, high) and one Opus Plan critique
base: origin/dev at 5c35ca934
trunk: dev
post_implementation_hardening: not scheduled
---

# recipient-cap-1: the recipient field renders a row for every match

One arc, one PR against `dev`, `Closes #1037`, built only after the owner picks in [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Consults and runs: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1037 held, and its inferred share is now demonstrated.** `RecipientField.vue:259-278` renders every match (unchanged at `5c35ca934`). Every candidate below still matches all contacts; drawing at most 50 or 7 rows takes one keystroke from 251 to 61-69 ms at 1,000 contacts and from 1,169 to 68-77 ms at 5,000 (medians). Rendering is the cost.
- **The figures differ from the issue's, not its shape**: the probe runs the smoke build (no local network) at load1 55-97; the issue measured 394 ms and 1.42 s on the network suite at load1 104-177.
- **#1037 is an `enhancement`**: it enters work only on the owner's recorded pick.

## Outcome & Quality Bar

- **For whom**: a person with hundreds or thousands of contacts who types a name in Send.
- **Excellent**: a keystroke at 5,000 contacts costs what it costs at a few dozen; a contact or own account stays reachable by typing its full name unless 50 or more candidates share that exact name; nothing on screen suggests a contact is missing.
- **Good enough**: rows look as today; the contacts page and other lists stay list-perf-1's (#1036).

## The candidates (measured)

Chrome, armed smoke build at `5c35ca934` plus one scratch patch per arm; contacts seeded as rows ("Contact NNNNN"), type "c" (every contact and "Account 1" match), timed in the page from the keydown to two frames with no mutation in the field. Five keystrokes per count: the first is the issue's method, the median is of the five. Every sample's total checked (rows, the line's count, or `aria-setsize`). Pictures: `~/.cache/nulo-backlog/recipient-cap-1/shots/` with `manifest.json`.

| Arm (rows drawn) | 1,000: first / median / range | 5,000: first / median / range | load1 |
|---|---|---|---|
| Today (every match) | 289 / 251 / 232-289 ms | 1,205 / 1,169 / 1,125-1,269 ms | 65-89 |
| A: first 50 + a closing line | 86 / 61 / 60-86 ms | 74 / 74 / 62-80 ms | 55-61 |
| B: window (7 rows at the top) | 79 / 65 / 57-111 ms | 83 / 68 / 58-83 ms | 77-97 |
| C: first 50, no line | 75 / 69 / 63-75 ms | 82 / 77 / 64-88 ms | 59-84 |
| Floor control, today: 10 / 50 contacts | 71 / 67 / 56-83 ms (10) | 74 / 65 / 58-88 ms (50) | 161-174 |

Five samples per cell at different loads do not prove the arms equal; this probe resolves no practically meaningful speed difference between them or from today's build at 10 or 50 contacts, and each removes the growth. Scrolling in B was not measured.

## UI impact

- **Send → recipient field, the suggestion list.** A: at most N rows (recommended 50) in today's order, or exact whole-name matches first (O5, which reorders at any count); a line under the list, "Keep typing to narrow 951 more matches.", only when more than N match. B: no visible change. C: at most N rows, nothing more. The lane brief's record is the whole budget: "What a person sees changes, so the owner decides from pictures" and "Copy, if any: one sentence, no em dash, no new dotted term unless the owner is asked". Arc 1 quotes the owner's words by page item id.

## Assumptions

**Facts** (recon.md has the lines): F1 candidates are contacts, then the profile's accounts (`send.vue:225`); `matchRecipients` keeps order and identity, one caller. F2 contacts arrive in storage-key order, and contact ids are random, so today's order is no set order (`contact/service.ts:79-83`); they land after Send mounts (`send.vue:686-700`). F3 the listbox is also the positioned, bordered, fading box (`RecipientField.vue:246-258,307-319`). F4 arrows wrap over their rows and reveal with `scrollIntoView({ block: "nearest" })`; Enter with no highlight picks row 0; the highlight follows its row by identity (`:35-37,147-170`). F5 no windowing code exists; list-perf-1's committed plan (`worktree-list-perf-1` at `1a4231073`, Phase 2) windows this list with `Closes #1037`. F6 every unit and smoke case uses at most four rows; `send-keyboard.test.ts:131-136` waits for the listbox's own fade before its shot. F7 `Input.vue` passes no `aria-describedby`. F8 the house live region is mounted empty with its card (`FeeSettingsCard.vue:397,423`); `send/fee-shared.module.css` holds `visually_hidden`.

**Inferences**: I1 (demonstrated by Codex r1) with a cap and today's order, a name contained in 50 or more other matching names cannot be reached by typing: 50 contacts "Account 1 01"…"Account 1 50" listed before the account "Account 1" hide it at every prefix, its full name included; only its pasted address finds it. Exact whole-name matches first (O5) restores it unless 50 or more candidates share the exact name, which only an imported list can arrange (I3); initials stay out of the promoted group, since distinct contacts share them (Codex r2: 50 "Alice LongNN", initials "AL", hide a contact named "Al"). I2 the cap alone changes nothing for a search with 50 matches or fewer; O5 reorders at any count, so Enter with no highlight can pick another first row than today. I3 an imported list of contacts named like an own account already puts decoys above it today; the cap adds hiding, O4 removes both.

**Asks**: O1-O5 to the owner (OWNER-ASKS.md). Z1 (orchestrator): #1037 stays in this lane only; list-perf-1 removes its Phase 2, D9 scenario, `Closes #1037` and seed text before either arc starts. If B is picked, arc 1 builds list-perf-1's audited Phase 2 design here, unless the orchestrator assigns it back.

## Architecture & Implementation (A, the recommendation)

- `RecipientField.vue`: `MAX_SHOWN` (the owner's N) beside `filteredContacts`; `shownContacts = filteredContacts.slice(0, MAX_SHOWN)`, `moreCount`. `activeIndex`, the reset watcher, `moveHighlight` and `pickHighlighted` read `shownContacts`; `showSuggestions` reads the full matches. A highlighted row pushed past the cap (late contacts, a new term) loses the highlight, as a filtered-out row does today; Enter then picks row 0.
- The `<Transition>`'s `v-if` moves to a new wrapper `div` (testid `send-destination-popover`) with the position, border and background; the listbox keeps the scroller (`max-height: 156px`: 160 less its old 2 × 2 px border, `border-box`), id, role, testid, `tabindex="-1"`, and only options. After it, the line: `<Text variant="caption" color="tertiary" aria-hidden="true">`, testid `send-destination-more`.
- One computed `moreSentence` (count `toLocaleString("en-US")`, "match"/"matches" by a ternary) feeds the line and a visually hidden `role="status" aria-live="polite" aria-atomic="true"` span mounted empty beside the input, outside the `<Transition>`, holding the sentence only while the list shows and more match.
- With O5: `matchRecipients` returns whole-name matches (`contactNameKey(name) === key`) first, then the rest (initials and address matches included), each group in the given order; its doc comment says so.
- **Not taken**: a shared cap helper (`capTokenRows` and `rawRows` have other shapes); stopping the match at N (the count needs the total).
- **Deltas**: C drops the wrapper, the line and the status. B is list-perf-1's audited Phase 2 (`send/suggestion-window.ts`, spacer pseudo-elements, `aria-setsize`/`aria-posinset`, its D9 smoke scenario, its fade known limit), never the scratch patch.

## Security & Adversarial Considerations

- **The invariant**: the row a person sees and the address picked stay one destination. Rows, Enter and a click all read `shownContacts`; no key reaches a row the list does not show.
- **Threat model**: names are the profile's own rows, rendered by interpolation as today. A person persuaded to import a crafted list can crowd a name or an own account out of the cap (I1, I3); diversion still needs the person to pick and send to a decoy. The picked card shows a trimmed address, so it is a partial check only. O4 and O5 close the crowding; B never hides a row.
- **Supply chain**: no dependency. Least privilege, cryptography, storage and logging are untouched.

## Phases

### Phase 0 — Start on the pick (0.3 h)

1. Read the orchestrator's decision record. With no pick recorded, stop and report waiting.
2. Confirm Z1: the orchestrator's record names this lane for #1037, and `git show worktree-list-perf-1:implementations-plan/list-perf-1/plan.md` (or its merged copy) no longer plans #1037. Both, or stop.
3. Run `git merge origin/dev && bun install --frozen-lockfile`. Write the base SHA to `STATUS.md`.

**Gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0. Layers: lint, typecheck, unit.

### Phase 1 — Build the pick (3 h)

1. Edit `RecipientField.vue` (and `recipient-search.ts` with O5) as in Architecture, with the owner's N and words.
2. `RecipientField.test.ts`, one block over N + 1,001 candidates that one term all matches: N options and only options in the listbox; the line and the status read "…1,001 more matches."; the status is empty before typing and again at N matches or fewer, with no line (the success control); Up from no highlight goes to `optionId(N - 1)` and scrolls it into view, then Enter picks candidate N - 1; Down from there wraps to row 0; at N + 1 matches "1 more match"; a highlighted last row that a prop change pushes past the cap clears `aria-activedescendant`, and Enter picks row 0. With O5, `recipient-search.test.ts` gains two cases: the I1 list puts "Account 1" first for the term "Account 1", and 50 "Alice LongNN" (initials "AL") stay after a contact named "Al" for the term "Al".
3. `send-keyboard.test.ts`: point the fade wait at `send-destination-popover`. In the same scenario, seed N + 1 more contacts that "Acc" does not match and add one segment (D7): type their shared letter, then assert the line is visible below the listbox and inside the popup, Up shows row N - 1 inside the scroller, and Enter sets that row's address.
4. Rerun the probe in one session: today's build at 50 and 5,000 contacts, then the built pick at 1,000 and 5,000 (Chrome). Before each timed keystroke, type once, wait for the full total, and clear. Assert each total. Write the table and both shots to `lessons/phase-1.md`.

**Gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0 (the copy-dash, red-text and type-role bans run in it); the pick's 5,000-contact median sits within the range of today's build at 50 contacts from the same session. Layers: lint, typecheck, unit, component.

### Phase 2 — Full gates (1.5 h)

1. Run `bun run audit:vue` and `bun run test:all`.
2. Build the armed smoke build. Run `cd apps/extension && bun run test:e2e -- --retry=0`, then `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/type-roles.test.ts --retry=0`. Write the per-file and per-browser durations, before and after, to `lessons/phase-2.md`.

**Gate.** All exit 0; both browsers green at retry 0. Layers: all of the above plus smoke e2e on both browsers.

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Recommend A with exact whole-name matches first (O5) | no speed difference from B resolved here; tells the person more match; with O5 a name is reachable by typing it unless 50 or more candidates share it exactly; about 25 lines | B (Codex r1's pick: no visible change and full reachability, at a window, a scroll sync, a smoke scenario and a fade known limit; the owner's alternative if nothing may change); A in today's order (I1); C (hides that more exist, and I1) |
| D2 | Recommend N = 50 | the cap alone changes no search with 50 matches or fewer; 50 rows cost what 10 do here (floor control) | 10 or 20 (shorter lists, no measured gain) |
| D3 | Cap after the full match, in the component | the count needs the total; the match is not the cost | an early stop; a helper for one caller |
| D4 | The line sits after the listbox in a new wrapper, pinned under the rows | a listbox owns only options; a line at the end of the scroll shows only after N rows | a non-option child; a line outside the box |
| D5 | The wrapper gets testid `send-destination-popover`; fade waits read it | the fade moves to the wrapper; a wait on the listbox would pass at once and shoot mid-fade (Opus F1) | waiting on the listbox |
| D6 | Grouped digits, a ternary plural | no plural helper exists; one string | a helper |
| D7 | One segment added to the existing keyboard smoke scenario, both browsers | the line and the scroller share the box; a layout change that clips the revealed row N - 1 is invisible to jsdom; est. +4 s per browser, measured in Phase 2 | no smoke (Opus: the PR picture shows it once, but guards nothing later); a new scenario (more setup) |
| D8 | Accessibility (delegated): a visually hidden polite status mounted empty beside the input; the visible line `aria-hidden` | a region created with its text may go unannounced (W3C ARIA22, the house rule at F8); one sentence, read once | `role="status"` on the line (created with its text); `aria-describedby` (a new `Input.vue` prop, and read on focus while the list is closed) |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high; session `01a1643e`): *conditional approve*. Accepted: the status mounted empty (D8); a real-engine overflow check in the existing scenario (D7) and the fade wait (D5); I1 demonstrated (its reproduction) and surfaced (O1, O5); unsupported population and equality claims removed; probe readiness and total assertions (Phase 1); the full smoke gate (Phase 2); the cap-boundary identity test; Z1 kept here with list-perf-1 trimmed; the card's trimmed address. Disputed: the recommendation (Codex B, Opus A); decided A with O5 (D1), B named as the alternative.
- **Codex r2** (resumed `01a1643e`, verification): *conditional approve*. Accepted all three: promote whole names only, never initials (its reproduction, I1); qualify the below-cap and speed claims (I2, D1, D2, O1, O2, O5); Phase 0 requires both the record and the trimmed sibling plan. It no longer requires B as the recommendation.
- **Codex r3** (resumed `01a1643e`): *approve*; the r2 conditions met, no regression.
- **Opus r1** (Plan agent): *conditional approve*. Accepted: the fade wait (F1, D5); the status pattern (F2, D8); Enter after Up, a 1,051 fixture, a status test (F3); late contacts past the cap pinned (F4); the substring limit and O5 (F5); "no set order" (F2 above); the floor control (F7). Not taken: no smoke change (D7).

## Delivery

One arc, one branch (`worktree-recipient-cap-1`), one PR against `dev`, opened only after Phase 2 and the fix loop: `gh pr create --base dev --title "perf(send): recipient suggestions show the first 50 matches and how many more match"` (83 characters; retitle under 93 for B or C). The body states what changed and why, the probe table, the shots, the owner's words by page item id and text, D7 and D8 as calls under the owner's 2026-10-19 delegation, the per-browser smoke durations before and after, and `Closes #1037`. Open it without labels; add `e2e:extension-smoke` only if the path filter skips smoke. The close-out lands as the PR's final commits. No stack (the orchestrator's D-orch-1).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `5c35ca934` is the contract; plan-specific values:

- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff <base SHA>...HEAD` after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the plan, this ledger, the adversarial ask and the standard's two rules verbatim. Hard stop at three rounds, then report. Log each round in `lessons/phase-3.md`.
- Step 3: `gh pr checks <n> --watch`; one rerun for a known flake. Do not merge: the orchestrator merges. Teardown: slug `recipient-cap-1`, trunk `dev`.

## Seeds

```
/goal Phases 0-2 of implementations-plan/recipient-cap-1/plan.md marked ✓, each backed by its gate reported passing in the transcript with `LESSONS_FILE=implementations-plan/recipient-cap-1/lessons/phase-N.md` printed; /code-review NOT run (code_review: off); the Codex fix loop converged on the whole diff (a resumed pass with no new material finding, quoted); one PR against dev with `Closes #1037` and the owner's words quoted, opened only after the loop, carrying the close-out (`git show --stat` of the archive move); `bun run test` and `bun run lint` exit 0.
```

Recommended: `/goal` (one arc, transcript-observable). Fallback: `/loop 15m Drive implementations-plan/recipient-cap-1 per its plan.md from Phase 0; never merge.`
